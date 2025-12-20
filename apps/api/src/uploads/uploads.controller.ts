import { Controller, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomBytes } from 'crypto';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { Express } from 'express';

function filenameGenerator(req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
  const id = randomBytes(8).toString('hex');
  const ext = extname(file.originalname).toLowerCase();
  cb(null, `${Date.now()}_${id}${ext}`);
}

// Keep uploads in a predictable location regardless of build output path
const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

@Controller('uploads')
export class UploadsController {
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: uploadsDir,
        filename: filenameGenerator,
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(null, false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async upload(@UploadedFiles() files: Express.Multer.File[]) {
    const urls = (files || []).map((f) => `/uploads/${f.filename}`);
    return { urls };
  }
}
