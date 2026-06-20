import { Controller, Post, Logger } from '@nestjs/common';
import { NextStepService } from '../projects/next-step.service';

@Controller('admin/next-step-cache')
export class NextStepCacheController {
  private readonly logger = new Logger(NextStepCacheController.name);

  constructor(private readonly nextStepService: NextStepService) {}

  @Post('backfill')
  async backfill() {
    this.logger.log('Starting next-step cache backfill...');
    const result = await this.nextStepService.backfillNextStepCache();
    this.logger.log(`Backfill complete: ${result.processed} processed, ${result.errors} errors`);
    return result;
  }
}
