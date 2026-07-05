import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const defaultPassword = 'password';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  try {
    // Find all professionals without passwords via Identity
    const professionalsWithoutPassword = await prisma.professional.findMany({
      where: {
        identityId: { not: null },
      },
    });

    console.log(
      `Found ${professionalsWithoutPassword.length} professionals`,
    );

    if (professionalsWithoutPassword.length === 0) {
      console.log('No professionals to update!');
      return;
    }

    // Update Identity rows with default password
    let updated = 0;
    for (const pro of professionalsWithoutPassword) {
      if (!pro.identityId) continue;
      await prisma.identity.update({
        where: { id: pro.identityId },
        data: { passwordHash: hashedPassword },
      });
      updated++;
    }

    console.log(
      `✓ Updated ${updated} professionals with default password`,
    );
    console.log(`  Password for testing: "${defaultPassword}"`);

    // List the professionals that were updated
    const allProfessionals = await prisma.professional.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        businessName: true,
      },
    });

    console.log('\nProfessionals ready for testing:');
    allProfessionals.forEach((prof) => {
      console.log(
        `  • ${prof.email} (${prof.fullName || prof.businessName || 'N/A'})`,
      );
    });
  } catch (error) {
    console.error('Error setting default passwords:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
