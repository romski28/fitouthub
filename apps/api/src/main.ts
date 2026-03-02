import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import * as express from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global API prefix
  app.setGlobalPrefix('api');

  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    'https://fitouthub-web.vercel.app',
    'https://fitouthub-web-git-main-romski28s-projects.vercel.app',
  ]);

  const isAllowedOrigin = (origin?: string) => {
    if (!origin) {
      return true;
    }
    if (allowedOrigins.has(origin)) {
      return true;
    }
    return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  };

  // Enable CORS
  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 204,
  });

  try {
    const prisma = app.get(PrismaService);
    const count = await prisma.project.count();
    console.log('✓ Database connected - Project rows:', count);
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
