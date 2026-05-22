import { Module } from '@nestjs/common';
import { UpdatesController } from './updates.controller';
import { UpdatesService } from './updates.service';
import { PrismaService } from '../prisma.service';
import { ConversationModule } from '../conversation/conversation.module';
import { ActivityLogModule } from '../activity-log.module';

@Module({
  imports: [ConversationModule, ActivityLogModule],
  controllers: [UpdatesController],
  providers: [UpdatesService, PrismaService],
  exports: [UpdatesService],
})
export class UpdatesModule {}
