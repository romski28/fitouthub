import { Controller, Get, Header } from '@nestjs/common';
import { TradesmService } from './tradesman.service';

// Legacy endpoint retained for backward compatibility.
// Preferred endpoint: GET /trades
// TODO: remove /tradesmen after all clients migrate.
@Controller('tradesmen')
export class TradesmController {
  constructor(private readonly tradesmService: TradesmService) {}

  @Get()
  @Header('Deprecation', 'true')
  @Header('Sunset', 'Tue, 30 Jun 2026 23:59:59 GMT')
  @Header('Link', '</api/trades>; rel="successor-version"')
  @Header('X-Deprecated-Endpoint', 'Use /trades instead of /tradesmen')
  async findAll() {
    return this.tradesmService.findAll();
  }
}
