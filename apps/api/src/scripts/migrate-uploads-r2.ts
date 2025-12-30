import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Migration script to upload files from local /uploads/ directory to Cloudflare R2
 * Run with: pnpm migrate:uploads:r2
 */
async function migrateToR2() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.PUBLIC_ASSETS_BASE_URL;

  if (
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBaseUrl
  ) {
    console.error('❌ Missing environment variables:');
    console.error('  STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID,');
    console.error('  STORAGE_SECRET_ACCESS_KEY, PUBLIC_ASSETS_BASE_URL');
    process.exit(1);
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const uploadsDir = join(process.cwd(), 'uploads');

  try {
    const files = readdirSync(uploadsDir).filter((f) => {
      const lower = f.toLowerCase();
      return (
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif')
      );
    });

    if (files.length === 0) {
      console.log('✓ No files found in uploads/ directory.');
      return;
    }

    console.log(`📦 Found ${files.length} file(s) to migrate...`);

    let uploaded = 0;
    let failed = 0;

    for (const filename of files) {
      const filePath = join(uploadsDir, filename);

      try {
        const fileBuffer = readFileSync(filePath);
        const mimeType = getMimeType(filename);

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: filename,
            Body: fileBuffer,
            ContentType: mimeType,
          }),
        );

        const publicUrl = `${publicBaseUrl}/${filename}`;
        console.log(`✓ ${filename} → ${publicUrl}`);
        uploaded++;
      } catch (error) {
        console.error(
          `✗ Failed to upload ${filename}:`,
          error instanceof Error ? error.message : error,
        );
        failed++;
      }
    }

    console.log('');
    console.log('✅ Migration complete!');
    console.log(`  Uploaded: ${uploaded}`);
    console.log(`  Failed: ${failed}`);
    console.log('');
    console.log('📝 Next steps:');
    console.log('  1. Verify files are accessible at PUBLIC_ASSETS_BASE_URL');
    console.log(
      '  2. Update any hardcoded /uploads/ paths in database (if needed)',
    );
    console.log('  3. Delete local uploads/ folder when confident');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

function getMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

migrateToR2();
