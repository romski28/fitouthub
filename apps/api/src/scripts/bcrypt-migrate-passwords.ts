/**
 * One-shot: bcrypt-hashes all existing plaintext passwords in Identity table.
 * Run BEFORE deploying the bcrypt auth code changes.
 *
 * Usage: npx ts-node src/scripts/bcrypt-migrate-passwords.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const identities = await (prisma as any).identity.findMany({
    select: { id: true, email: true, passwordHash: true },
  });

  console.log(`Found ${identities.length} identities`);

  let updated = 0;
  let skipped = 0;

  for (const row of identities) {
    if (!row.passwordHash) {
      console.log(`  SKIP ${row.email}: no password set`);
      skipped++;
      continue;
    }

    // Already bcrypt-hashed?
    if (row.passwordHash.startsWith('$2b$') || row.passwordHash.startsWith('$2a$')) {
      console.log(`  SKIP ${row.email}: already hashed`);
      skipped++;
      continue;
    }

    const hashed = await bcrypt.hash(row.passwordHash, 10);
    await (prisma as any).identity.update({
      where: { id: row.id },
      data: { passwordHash: hashed },
    });

    console.log(`  OK   ${row.email}: plaintext → bcrypt`);
    updated++;
  }

  console.log(`\nDone: ${updated} hashed, ${skipped} skipped, ${updated + skipped} total`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
