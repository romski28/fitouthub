import { join } from 'path';
import { existsSync, readdirSync, copyFileSync, mkdirSync } from 'fs';

/**
 * Migration script to copy uploaded images from old location (dist/uploads)
 * to new location (uploads at process.cwd())
 */
async function migrateUploads() {
  const oldPath = join(__dirname, '..', '..', '..', 'uploads');
  const newPath = join(process.cwd(), 'uploads');

  console.log('🔍 Checking for old uploads...');
  console.log(`  Old path: ${oldPath}`);
  console.log(`  New path: ${newPath}`);

  if (!existsSync(oldPath)) {
    console.log('❌ Old uploads folder not found. Nothing to migrate.');
    return;
  }

  if (!existsSync(newPath)) {
    console.log('📁 Creating new uploads directory...');
    mkdirSync(newPath, { recursive: true });
  }

  const files = readdirSync(oldPath).filter((f) => {
    // Only copy image files
    const ext = f.toLowerCase();
    return (
      ext.endsWith('.jpg') ||
      ext.endsWith('.jpeg') ||
      ext.endsWith('.png') ||
      ext.endsWith('.webp') ||
      ext.endsWith('.gif')
    );
  });

  if (files.length === 0) {
    console.log('✓ No image files found in old location.');
    return;
  }

  console.log(`📦 Found ${files.length} image(s) to migrate...`);

  let copied = 0;
  let skipped = 0;

  for (const file of files) {
    const oldFile = join(oldPath, file);
    const newFile = join(newPath, file);

    if (existsSync(newFile)) {
      console.log(`  ⏭  Skipping ${file} (already exists)`);
      skipped++;
      continue;
    }

    try {
      copyFileSync(oldFile, newFile);
      console.log(`  ✓ Copied ${file}`);
      copied++;
    } catch (error) {
      console.error(`  ❌ Failed to copy ${file}:`, error);
    }
  }

  console.log('');
  console.log('✅ Migration complete!');
  console.log(`  Copied: ${copied}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total: ${files.length}`);
}

migrateUploads().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
