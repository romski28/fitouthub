// HELPER ONLY: Local diagnostic script. Do not commit or deploy.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    // HELPER ONLY: Try to query the SupportRequest table
    const count = await prisma.supportRequest.count();
    console.log(`Success! SupportRequest table has ${count} rows`);
  } catch (error) {
    console.error('Error querying SupportRequest:');
    console.error(error.code, error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
