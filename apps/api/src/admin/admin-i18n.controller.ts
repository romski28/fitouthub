import { Controller, Get, Post, Body, UseGuards, BadRequestException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface TranslationPayload {
  locale: string;
  data: Record<string, unknown>;
}

@Controller('admin/i18n')
@UseGuards(AuthGuard('jwt'))
export class AdminI18nController {
  private readonly logger = new Logger(AdminI18nController.name);

  private resolveMessagesDir(): string {
    const candidates = [
      resolve(process.cwd(), 'apps/web/src/i18n/messages'),
      resolve(process.cwd(), '../../web/src/i18n/messages'),
      resolve(process.cwd(), '../web/src/i18n/messages'),
      resolve(__dirname, '../../../../web/src/i18n/messages'),
      resolve(__dirname, '../../../web/src/i18n/messages'),
    ];
    for (const candidate of candidates) {
      if (existsSync(resolve(candidate, 'en.json'))) {
        this.logger.log('Found messages at: ' + candidate);
        return candidate;
      }
    }
    this.logger.warn('Messages not found. cwd=' + process.cwd() + ' __dirname=' + __dirname);
    return candidates[0];
  }

  @Get()
  async getTranslations() {
    const messagesDir = this.resolveMessagesDir();
    const locales = ['en', 'zh-HK', 'zh-CN'];
    const result: Record<string, Record<string, unknown>> = {};

    for (const locale of locales) {
      const path = resolve(messagesDir, `${locale}.json`);
      this.logger.log('Checking: ' + path);
      if (!existsSync(path)) {
        result[locale] = {};
        continue;
      }
      try {
        result[locale] = JSON.parse(readFileSync(path, 'utf-8'));
        this.logger.log('Loaded ' + locale + ': ' + Object.keys(result[locale]).length + ' top-level keys');
      } catch (err) {
        this.logger.error('Failed to parse ' + locale + ': ' + (err as Error).message);
        result[locale] = {};
      }
    }

    return result;
  }

  @Post()
  async saveTranslations(@Body() body: TranslationPayload) {
    if (!body.locale || !body.data) {
      throw new BadRequestException('locale and data are required');
    }

    const allowedLocales = ['en', 'zh-HK', 'zh-CN'];
    if (!allowedLocales.includes(body.locale)) {
      throw new BadRequestException(`Invalid locale: ${body.locale}`);
    }

    const messagesDir = this.resolveMessagesDir();
    const path = resolve(messagesDir, `${body.locale}.json`);
    
    try {
      // Validate JSON by stringifying and parsing
      const jsonStr = JSON.stringify(body.data, null, 2);
      JSON.parse(jsonStr); // re-validate
      writeFileSync(path, jsonStr, 'utf-8');
      return { success: true, locale: body.locale };
    } catch (err) {
      throw new BadRequestException(`Failed to save: ${(err as Error).message}`);
    }
  }
}
