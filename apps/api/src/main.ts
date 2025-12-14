
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: true, // Allow all origins for now - restrict later in production
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

  const port = process.env.PORT || 3001;
  // Serve static uploads without wildcard patterns to avoid Express v5 path-to-regexp issues
  app.use('/uploads', express.static(join(__dirname, '..', '..', 'uploads')));
  await app.listen(port, '0.0.0.0');
  console.log(`✓ API listening on port ${port}`);
}
bootstrap();
