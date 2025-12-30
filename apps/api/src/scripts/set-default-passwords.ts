import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const defaultPassword = 'password'; // Simple test password
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  try {
    // Find all professionals without passwords
    const professionalsWithoutPassword = await prisma.professional.findMany({
      where: {
        passwordHash: null,
      },
    });

    console.log(
      `Found ${professionalsWithoutPassword.length} professionals without passwords`,
    );

    if (professionalsWithoutPassword.length === 0) {
      console.log('All professionals already have passwords!');
      return;
    }

    // Update them with the default password
    const updated = await prisma.professional.updateMany({
      where: {
        passwordHash: null,
      },
      data: {
        passwordHash: hashedPassword,
      },
    });

    console.log(
      `✓ Updated ${updated.count} professionals with default password`,
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
