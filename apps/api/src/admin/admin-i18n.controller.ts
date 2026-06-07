import { Controller, Get, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
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
  private readonly messagesDir = resolve(process.cwd(), 'apps/web/src/i18n/messages');

  @Get()
  async getTranslations() {
    const locales = ['en', 'zh-HK', 'zh-CN'];
    const result: Record<string, Record<string, unknown>> = {};

    for (const locale of locales) {
      const path = resolve(this.messagesDir, `${locale}.json`);
      if (!existsSync(path)) {
        result[locale] = {};
        continue;
      }
      try {
        result[locale] = JSON.parse(readFileSync(path, 'utf-8'));
      } catch {
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

    const path = resolve(this.messagesDir, `${body.locale}.json`);
    
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
