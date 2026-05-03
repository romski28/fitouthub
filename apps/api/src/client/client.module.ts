import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { PrismaService } from '../prisma.service';
import { UpdatesModule } from '../updates/updates.module';

@Module({
  imports: [UpdatesModule],
  controllers: [ClientController],
  providers: [PrismaService],
})
export class ClientModule {}
