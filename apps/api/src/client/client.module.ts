import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ClientController],
  providers: [PrismaService],
})
export class ClientModule {}