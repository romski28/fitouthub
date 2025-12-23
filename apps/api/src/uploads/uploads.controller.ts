import { Controller, Post, UploadedFiles, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import { extname } from 'path';
import type { Express } from 'express';

/**
 * Initialize S3 client for Cloudflare R2 (S3-compatible)
 * Uses environment variables:
 * - STORAGE_ENDPOINT: R2 endpoint (e.g., https://<account-id>.r2.cloudflarestorage.com)
 * - STORAGE_BUCKET: bucket name
 * - STORAGE_ACCESS_KEY_ID: R2 API token access key
 * - STORAGE_SECRET_ACCESS_KEY: R2 API token secret key
 * - PUBLIC_ASSETS_BASE_URL: public URL for accessing files (e.g., https://cdn.example.com or https://bucket.r2.example.com)
 */
const getS3Client = () => {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.warn('⚠️  R2 storage not configured - file upload will fail. Set STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY');
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};

function filenameGenerator(req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
  const id = randomBytes(8).toString('hex');
  const ext = extname(file.originalname).toLowerCase();
  cb(null, `${Date.now()}_${id}${ext}`);
}

@Controller('uploads')
export class UploadsController {
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
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
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const s3 = getS3Client();
    if (!s3) {
      throw new BadRequestException('Storage service not configured');
    }

    const bucket = process.env.STORAGE_BUCKET;
    if (!bucket) {
      throw new BadRequestException('STORAGE_BUCKET not configured');
    }

    const baseUrl = process.env.PUBLIC_ASSETS_BASE_URL || 'https://uploads.example.com';
    const urls: string[] = [];

    try {
      for (const file of files) {
        const filename = `${Date.now()}_${randomBytes(8).toString('hex')}${extname(file.originalname).toLowerCase()}`;

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: filename,
            Body: file.buffer,
            ContentType: file.mimetype,
          }),
        );

        urls.push(`${baseUrl}/${filename}`);
      }

      return { urls };
    } catch (error) {
      console.error('Failed to upload to R2:', error);
      throw new BadRequestException('Failed to upload files to storage');
    }
  }
}
