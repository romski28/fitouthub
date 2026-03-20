import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { TradesService } from './trades.service';

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get()
  async findAll(@Query('locale') locale?: string) {
    return this.tradesService.findAllByLocale(locale);
  }

  @Get('match')
  async matchService(@Query('keyword') keyword: string) {
    if (!keyword) {
      return { match: null };
    }
    const match = await this.tradesService.matchService(keyword);
    return { keyword, match };
  }

  @Get('legacy-mappings')
  async getLegacyMappings() {
    return this.tradesService.getLegacyMappings();
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Query('locale') locale?: string,
    @Query('includeTranslations') includeTranslations?: string,
  ) {
    return this.tradesService.findByIdWithLocale(
      id,
      locale,
      includeTranslations === 'true',
    );
  }

  @Get(':id/translations')
  async listTranslations(@Param('id') id: string) {
    return this.tradesService.listTranslations(id);
  }

  @Put(':id/translations/:locale')
  async upsertTranslation(
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      aliases?: string[];
      jobs?: string[];
    },
  ) {
    return this.tradesService.upsertTranslation(id, locale, {
      name: body.name,
      description: body.description,
      aliases: body.aliases,
      jobs: body.jobs,
    });
  }

  @Post('seed-translations')
  async seedTranslations(
    @Body()
    body: {
      locale?: string;
      overwrite?: boolean;
    },
  ) {
    return this.tradesService.seedDraftTranslations(
      body.locale,
      Boolean(body.overwrite),
    );
  }

  @Post()
  async create(
    @Body()
    body: {
      name: string;
      category: string;
      professionType?: string;
      aliases?: string[];
      jobs?: string[];
      description?: string;
      featured?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.tradesService.create(body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      category: string;
      professionType: string;
      aliases: string[];
      jobs: string[];
      description: string;
      enabled: boolean;
      featured: boolean;
      sortOrder: number;
    }>,
  ) {
    return this.tradesService.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.tradesService.delete(id);
  }

  // Service mappings endpoints
  @Post(':tradeId/mappings')
  async createMapping(
    @Param('tradeId') tradeId: string,
    @Body()
    body: {
      keyword: string;
      confidence?: number;
    },
  ) {
    return this.tradesService.createMapping({
      ...body,
      tradeId,
    });
  }

  @Put('mappings/:id')
  async updateMapping(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      keyword: string;
      tradeId: string;
      confidence: number;
      enabled: boolean;
    }>,
  ) {
    return this.tradesService.updateMapping(id, body);
  }

  @Delete('mappings/:id')
  async deleteMapping(@Param('id') id: string) {
    return this.tradesService.deleteMapping(id);
  }
}
