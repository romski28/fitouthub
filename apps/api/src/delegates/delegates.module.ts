import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ChatModule } from '../chat/chat.module';
import { DelegateInvitesController } from './delegate-invites.controller';
import { DelegateInvitesService } from './delegate-invites.service';
import { DelegateProjectAccessController } from './delegate-project-access.controller';
import { DelegateProjectAccessService } from './delegate-project-access.service';

@Module({
  imports: [ChatModule],
  controllers: [DelegateInvitesController, DelegateProjectAccessController],
  providers: [DelegateInvitesService, DelegateProjectAccessService, PrismaService],
})
export class DelegatesModule {}
