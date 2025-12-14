import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { ProfessionalsModule } from './professionals/professionals.module';
import { TradesmModule } from './tradesman/tradesman.module';
import { UploadsController } from './uploads/uploads.controller';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { UsersModule } from './users/users.module';
import { PatternsModule } from './patterns/patterns.module';

@Module({
  imports: [ProfessionalsModule, TradesmModule, AuthModule, EmailModule, UsersModule, PatternsModule],
  controllers: [AppController, ProjectsController, UploadsController],
  providers: [AppService, PrismaService, ProjectsService],
  exports: [PrismaService],
})
export class AppModule {}
