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
  async findAll() {
    return this.tradesService.findAll();
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
  async findOne(@Param('id') id: string) {
    return this.tradesService.findById(id);
  }

  @Post()
  async create(
    @Body()
    body: {
      name: string;
      category: string;
      professionType?: string;
      aliases?: string[];
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
