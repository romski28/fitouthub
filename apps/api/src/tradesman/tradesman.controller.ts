import { Controller, Get } from '@nestjs/common';
import { TradesmService } from './tradesman.service';

@Controller('tradesmen')
export class TradesmController {
  constructor(private readonly tradesmService: TradesmService) {}

  @Get()
  async findAll() {
    return this.tradesmService.findAll();
  }
}
