import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

// Load environment variables from apps/api/.env
config({ path: resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

const BATCH = 500;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best-effort building name: the segment before the first comma. */
function extractName(address: string): string {
  const a = (address || '').trim();
  const comma = a.indexOf(',');
  return comma >= 0 ? a.slice(0, comma).trim() : a;
}

/** Split a CSV/TSV line, honouring double-quoted fields and "" escapes. */
function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

async function main() {
  const filePath = process.argv[2];
  const includeAll = process.argv.includes('--all');

  if (!filePath) {
    console.error(
      'Usage: ts-node src/scripts/import-csdi-buildings.ts <file.tsv|csv> [--all]',
    );
    console.error('  Default imports residential records only. --all imports everything (flagged).');
    process.exit(1);
  }

  // District areas for mapping SEARCH1_E -> RegionArea.id
  const areas = await prisma.regionArea.findMany({
    select: { id: true, code: true, name: true },
  });
  const byName = new Map<string, string>();
  const byCode = new Map<string, string>();
  for (const a of areas) {
    byName.set(norm(a.name), a.id);
    byCode.set(norm(a.code), a.id);
  }
  // Known name discrepancies between the dataset and our area names
  const overrides: Record<string, string> = {
    islands: 'ISLANDS',
    'islands district': 'ISLANDS',
  };

  const mapDistrict = (raw: string): string | null => {
    const n = norm(raw);
    if (!n) return null;
    if (byName.has(n)) return byName.get(n)!;
    const code = overrides[n];
    if (code && byCode.has(norm(code))) return byCode.get(norm(code))!;
    if (byCode.has(n)) return byCode.get(n)!;
    return null;
  };

  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    console.error('File is empty.');
    process.exit(1);
  }

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = parseDelimitedLine(lines[0], delimiter).map((h) => h.trim());
  const col: Record<string, number> = {};
  headers.forEach((h, i) => {
    col[h] = i;
  });

  const get = (cells: string[], name: string): string => {
    const i = col[name];
    return i === undefined ? '' : (cells[i] || '').trim();
  };

  const usageCounts = new Map<string, number>();
  let inserted = 0;
  let skipped = 0;
  let buffer: any[] = [];

  const flush = async () => {
    if (!buffer.length) return;
    const rows = buffer;
    buffer = [];
    await prisma.buildingGazetteer.createMany({ data: rows, skipDuplicates: true });
    inserted += rows.length;
  };

  for (const line of lines.slice(1)) {
    const cells = parseDelimitedLine(line, delimiter);
    const usage = get(cells, 'NSEARCH5_E') || '';
    const bucket = usage || 'UNKNOWN';
    usageCounts.set(bucket, (usageCounts.get(bucket) || 0) + 1);

    const isResidential = /residential/i.test(usage);
    if (!includeAll && !isResidential) {
      skipped++;
      continue;
    }

    const addressEn = get(cells, 'ADDRESS_E');
    const addressZh = get(cells, 'ADDRESS_C');
    const lat = Number(get(cells, 'LATITUDE'));
    const lng = Number(get(cells, 'LONGITUDE'));

    buffer.push({
      id: `csdi_${get(cells, 'OBJECTID') || buffer.length}`,
      sourceId: get(cells, 'OBJECTID') || null,
      nameEn: extractName(addressEn) || null,
      nameZh: extractName(addressZh) || null,
      usageDesc: usage || null,
      category: usage || null,
      addressFull: addressEn || null,
      districtName: get(cells, 'SEARCH1_E') || null,
      regionName: get(cells, 'SEARCH2_E') || null,
      buildingType: get(cells, 'NSEARCH4_E') || null,
      districtAreaId: mapDistrict(get(cells, 'SEARCH1_E')),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      isResidential,
    });

    if (buffer.length >= BATCH) await flush();
  }
  await flush();

  console.log(`Done. inserted=${inserted} skippedNonResidential=${skipped}`);
  console.log('Usage distribution (all rows):');
  const sorted = [...usageCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) {
    console.log(`  ${k}\t${v}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
