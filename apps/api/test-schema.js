const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSchema() {
  try {
    const users = await prisma.user.count();
    const tradesmen = await prisma.tradesman.count();
    const professionals = await prisma.professional.count();
    const projects = await prisma.project.count();
    const clients = await prisma.client.count();
    
    console.log('\n✓ Schema synced successfully!');
    console.log('\nTable counts:');
    console.log('  Users:', users);
    console.log('  Tradesmen:', tradesmen);
    console.log('  Professionals:', professionals);
    console.log('  Projects:', projects);
    console.log('  Clients (legacy):', clients);
    console.log('\n✓ All tables exist and are accessible');
  } catch (e) {
    console.error('✗ Error accessing tables:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

testSchema();
