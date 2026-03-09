import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test')
  getTest(): object {
    return this.appService.getHealth();
  }

  @Get('healthz')
  getHealthz(): object {
    return this.appService.getHealth();
  }

  @Get('readyz')
  async getReadyz(): Promise<object> {
    try {
      return await this.appService.getReadiness();
    } catch (error) {
      throw new HttpException(
        {
          status: 'not_ready',
          db: 'error',
          message: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
