import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { PrismaService } from '../prisma.service';
import { UpdatesModule } from '../updates/updates.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [UpdatesModule, EmailModule],
  controllers: [ClientController],
  providers: [PrismaService],
})
export class ClientModule {}
