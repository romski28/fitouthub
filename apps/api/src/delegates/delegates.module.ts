import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DelegateInvitesController } from './delegate-invites.controller';
import { DelegateInvitesService } from './delegate-invites.service';

@Module({
  controllers: [DelegateInvitesController],
  providers: [DelegateInvitesService, PrismaService],
})
export class DelegatesModule {}
