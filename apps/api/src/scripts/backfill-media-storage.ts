import { PrismaClient } from '@prisma/client';
import { buildPublicAssetUrl, extractObjectKeyFromValue } from '../storage/media-assets.util';

type BackfillStats = {
  scannedRows: number;
  changedRows: number;
  changedValues: number;
};

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const getArgValue = (name: string): string => {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
};

const toCanonicalObjectKey = (value?: string | null): string => {
  const extracted = extractObjectKeyFromValue(value);
  if (!extracted) return '';

  return extracted
    .replace(/^api\/uploads\//i, '')
    .replace(/^uploads\//i, '')
    .replace(/^\/+/, '')
    .trim();
};

const normalizeArrayToCanonicalUrls = (
  input?: string[] | null,
): { normalized: string[]; changedValues: number } => {
  const source = Array.isArray(input) ? input : [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  let changedValues = 0;

  for (const rawValue of source) {
    const raw = String(rawValue || '').trim();
    if (!raw) {
      changedValues += 1;
      continue;
    }

    const key = toCanonicalObjectKey(raw);
    if (!key) {
      changedValues += 1;
      continue;
    }

    const canonical = buildPublicAssetUrl(key);
    if (!canonical) {
      changedValues += 1;
      continue;
    }

    if (canonical !== raw) {
      changedValues += 1;
    }

    if (!seen.has(canonical)) {
      seen.add(canonical);
      normalized.push(canonical);
    } else {
      changedValues += 1;
    }
  }

  return { normalized, changedValues };
};

const normalizeSingleToCanonicalUrl = (
  input?: string | null,
): { normalized: string; changed: boolean } => {
  const raw = String(input || '').trim();
  if (!raw) {
    return { normalized: '', changed: raw !== '' };
  }

  const key = toCanonicalObjectKey(raw);
  const canonical = key ? buildPublicAssetUrl(key) : '';
  if (!canonical) {
    return { normalized: raw, changed: false };
  }

  return { normalized: canonical, changed: canonical !== raw };
};

async function backfillProfessionalProfileImages(): Promise<BackfillStats> {
  const rows = await prisma.professional.findMany({
    select: { id: true, profileImages: true },
  });

  let changedRows = 0;
  let changedValues = 0;

  for (const row of rows) {
    const { normalized, changedValues: rowChangedValues } = normalizeArrayToCanonicalUrls(
      row.profileImages,
    );
    if (rowChangedValues <= 0) continue;

    changedRows += 1;
    changedValues += rowChangedValues;

    if (APPLY) {
      await prisma.professional.update({
        where: { id: row.id },
        data: { profileImages: normalized },
      });
    }
  }

  return { scannedRows: rows.length, changedRows, changedValues };
}

async function backfillReferenceProjectImages(): Promise<BackfillStats> {
  const rows = await prisma.professionalReferenceProject.findMany({
    select: { id: true, imageUrls: true },
  });

  let changedRows = 0;
  let changedValues = 0;

  for (const row of rows) {
    const { normalized, changedValues: rowChangedValues } = normalizeArrayToCanonicalUrls(
      row.imageUrls,
    );
    if (rowChangedValues <= 0) continue;

    changedRows += 1;
    changedValues += rowChangedValues;

    if (APPLY) {
      await prisma.professionalReferenceProject.update({
        where: { id: row.id },
        data: { imageUrls: normalized },
      });
    }
  }

  return { scannedRows: rows.length, changedRows, changedValues };
}

async function backfillProjectMilestonePhotos(): Promise<BackfillStats> {
  const rows = await prisma.projectMilestone.findMany({
    select: { id: true, photoUrls: true },
  });

  let changedRows = 0;
  let changedValues = 0;

  for (const row of rows) {
    const { normalized, changedValues: rowChangedValues } = normalizeArrayToCanonicalUrls(
      row.photoUrls,
    );
    if (rowChangedValues <= 0) continue;

    changedRows += 1;
    changedValues += rowChangedValues;

    if (APPLY) {
      await prisma.projectMilestone.update({
        where: { id: row.id },
        data: { photoUrls: normalized },
      });
    }
  }

  return { scannedRows: rows.length, changedRows, changedValues };
}

async function backfillProjectLocationPhotos(): Promise<BackfillStats> {
  const rows = await prisma.projectLocationDetails.findMany({
    select: { id: true, photoUrls: true },
  });

  let changedRows = 0;
  let changedValues = 0;

  for (const row of rows) {
    const { normalized, changedValues: rowChangedValues } = normalizeArrayToCanonicalUrls(
      row.photoUrls,
    );
    if (rowChangedValues <= 0) continue;

    changedRows += 1;
    changedValues += rowChangedValues;

    if (APPLY) {
      await prisma.projectLocationDetails.update({
        where: { id: row.id },
        data: { photoUrls: normalized },
      });
    }
  }

  return { scannedRows: rows.length, changedRows, changedValues };
}

async function backfillProjectPhotoUrls(): Promise<BackfillStats> {
  const rows = await prisma.projectPhoto.findMany({
    select: { id: true, url: true },
  });

  let changedRows = 0;
  let changedValues = 0;

  for (const row of rows) {
    const { normalized, changed } = normalizeSingleToCanonicalUrl(row.url);
    if (!changed) continue;

    changedRows += 1;
    changedValues += 1;

    if (APPLY) {
      await prisma.projectPhoto.update({
        where: { id: row.id },
        data: { url: normalized },
      });
    }
  }

  return { scannedRows: rows.length, changedRows, changedValues };
}

async function main() {
  const argBaseUrl = getArgValue('--base-url');
  if (argBaseUrl) {
    process.env.PUBLIC_ASSETS_BASE_URL = argBaseUrl;
  }

  const publicAssetsBaseUrl = String(process.env.PUBLIC_ASSETS_BASE_URL || '').trim();
  if (!publicAssetsBaseUrl) {
    console.error('❌ PUBLIC_ASSETS_BASE_URL is required for media backfill.');
    console.error(
      '   Provide it via env or CLI: pnpm -C apps/api backfill:media:storage -- --base-url https://your-assets-domain',
    );
    process.exit(1);
  }

  console.log('🛠️  Media storage backfill starting...');
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`PUBLIC_ASSETS_BASE_URL: ${publicAssetsBaseUrl}`);
  console.log('');

  const tasks: Array<{ label: string; run: () => Promise<BackfillStats> }> = [
    { label: 'Professional.profileImages', run: backfillProfessionalProfileImages },
    {
      label: 'ProfessionalReferenceProject.imageUrls',
      run: backfillReferenceProjectImages,
    },
    { label: 'ProjectMilestone.photoUrls', run: backfillProjectMilestonePhotos },
    { label: 'ProjectLocationDetails.photoUrls', run: backfillProjectLocationPhotos },
    { label: 'ProjectPhoto.url', run: backfillProjectPhotoUrls },
  ];

  let totalScannedRows = 0;
  let totalChangedRows = 0;
  let totalChangedValues = 0;

  for (const task of tasks) {
    const stats = await task.run();
    totalScannedRows += stats.scannedRows;
    totalChangedRows += stats.changedRows;
    totalChangedValues += stats.changedValues;

    console.log(
      `${task.label}: scanned=${stats.scannedRows}, changedRows=${stats.changedRows}, changedValues=${stats.changedValues}`,
    );
  }

  console.log('');
  console.log('✅ Media storage backfill finished.');
  console.log(
    `Totals: scanned=${totalScannedRows}, changedRows=${totalChangedRows}, changedValues=${totalChangedValues}`,
  );
  if (!APPLY) {
    console.log('Dry-run only: no database writes were performed.');
    console.log('Run again with --apply to persist the changes.');
  }
}

main()
  .catch((error) => {
    console.error('❌ Media storage backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
