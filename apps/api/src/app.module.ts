import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { ProfessionalsModule } from './professionals/professionals.module';

@Module({
  imports: [ProfessionalsModule],
  controllers: [AppController, ProjectsController],
  providers: [AppService, PrismaService, ProjectsService],
  exports: [PrismaService],
})
export class AppModule {}
