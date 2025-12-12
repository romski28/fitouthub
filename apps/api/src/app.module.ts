import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { ProfessionalsModule } from './professionals/professionals.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ProfessionalsModule, AuthModule],
  controllers: [AppController, ProjectsController],
  providers: [AppService, PrismaService, ProjectsService],
  exports: [PrismaService],
})
export class AppModule {}
