import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';
import * as express from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global API prefix
  app.setGlobalPrefix('api');

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
  // Serve static uploads under both root and global /api prefix so frontend links resolve
  const uploadsPath = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsPath));
  app.use('/api/uploads', express.static(uploadsPath));
  await app.listen(port, '0.0.0.0');
  console.log(`✓ API listening on port ${port}`);
}
bootstrap();
