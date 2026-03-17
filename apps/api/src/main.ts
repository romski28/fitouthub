import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${String(reason)}`);
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${(error as Error).stack || (error as Error).message}`);
  });

  process.on('SIGTERM', () => {
    logger.warn('Received SIGTERM - shutting down process');
  });

  process.on('SIGINT', () => {
    logger.warn('Received SIGINT - shutting down process');
  });

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

  app.use((req, res, next) => {
    const startedAt = Date.now();
    const { method, originalUrl } = req;

    // Ensure UTF-8 charset on all JSON responses
    const originalJson = res.json;
    res.json = function(body: any) {
      res.set('Content-Type', 'application/json; charset=utf-8');
      return originalJson.call(this, body);
    };

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const message = `${method} ${originalUrl} -> ${res.statusCode} (${durationMs}ms)`;

      if (res.statusCode >= 500) {
        logger.error(message);
      } else if (durationMs >= 2000) {
        logger.warn(`Slow request: ${message}`);
      } else {
        logger.log(message);
      }
    });

    next();
  });

  const port = process.env.PORT || 3001;
  
  // Serve static uploads under both root and global /api prefix so frontend links resolve
  const uploadsPath = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsPath));
  app.use('/api/uploads', express.static(uploadsPath));
  
  // Start listening immediately to satisfy Render port detection
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`);

  // Health probe after port is open
  try {
    const prisma = app.get(PrismaService);
    const count = await prisma.project.count();
    logger.log(`Database connected - Project rows: ${count}`);
  } catch (error) {
    logger.warn('Database connection failed during startup health probe, but API is running');
    logger.warn(`Startup probe error: ${(error as Error).message}`);
  }
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error(`Fatal error during bootstrap: ${(error as Error).stack || (error as Error).message}`);
  process.exit(1);
});
