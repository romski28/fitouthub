import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PatternsService } from './patterns.service';

@Controller('patterns')
export class PatternsController {
  constructor(private readonly service: PatternsService) {}

  @Get()
  async list(@Query('includeCore') includeCore?: string) {
    return this.service.list(includeCore === 'true');
  }

  @Post()
  async create(@Body() body: any) {
    return this.service.create(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
