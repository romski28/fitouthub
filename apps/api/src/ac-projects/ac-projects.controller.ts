import {
  Body,
  Controller,
  Delete,
  Get,
  Query,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { AcProjectsService } from './ac-projects.service';

@Controller('ac-projects')
@UseGuards(CombinedAuthGuard)
export class AcProjectsController {
  constructor(private readonly acProjectsService: AcProjectsService) {}

  @Get()
  list(@Req() req: any, @Query('linkedProjectId') linkedProjectId?: string) {
    return this.acProjectsService.listForActor(
      this.getActor(req),
      linkedProjectId,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.acProjectsService.getOne(id, this.getActor(req));
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.acProjectsService.create(body, this.getActor(req));
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.acProjectsService.update(id, body, this.getActor(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.acProjectsService.remove(id, this.getActor(req));
  }

  private getActor(req: any) {
    const actorId = req.user?.id || req.user?.sub;
    const isProfessional = Boolean(
      req.user?.isProfessional || req.user?.role === 'professional',
    );
    return {
      actorId,
      isProfessional,
      role: isProfessional ? 'professional' : req.user?.role || 'client',
    };
  }
}
