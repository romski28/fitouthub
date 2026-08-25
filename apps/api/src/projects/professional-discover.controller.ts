import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

/**
 * Pro-facing tender discovery endpoints (pull side of open tenders).
 * Lives in AppModule so it can inject ProjectsService directly.
 */
@Controller('professional/discover')
export class ProfessionalDiscoverController {
  constructor(private readonly projectsService: ProjectsService) {}

  private resolveProfessionalId(req: any): string {
    const professionalId = req.user?.isProfessional ? req.user?.id : null;
    if (!professionalId) {
      throw new ForbiddenException('Professional authentication required');
    }
    return professionalId;
  }

  @Get('projects')
  @UseGuards(CombinedAuthGuard)
  async discoverOpenProjects(@Request() req: any) {
    return this.projectsService.discoverOpenProjects(this.resolveProfessionalId(req));
  }

  @Post('projects/:projectId/apply')
  @UseGuards(CombinedAuthGuard)
  async applyToOpenTender(
    @Param('projectId') projectId: string,
    @Request() req: any,
  ) {
    return this.projectsService.applyToOpenTender(
      projectId,
      this.resolveProfessionalId(req),
    );
  }
}
