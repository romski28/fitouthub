
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for development
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3002', 'http://192.168.31.90:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  try {
    const prisma = new PrismaClient();
    const count = await prisma.project.count();
    console.log('✓ Database connected - Project rows:', count);
    await prisma.$disconnect();
  } catch (error) {
    console.log('⚠ Database connection failed, but API is running');
    console.log('  Error:', (error as Error).message);
  }

  await app.listen(3001);
  console.log('✓ API listening on http://localhost:3001');
}
bootstrap();
