const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW()`;
    console.log('✓ Database connection successful!');
    console.log('Current time:', result);
  } catch (e) {
    console.error('✗ Connection failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
