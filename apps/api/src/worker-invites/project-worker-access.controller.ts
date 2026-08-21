import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { ProjectWorkerAccessService } from './project-worker-access.service';

@Controller()
export class ProjectWorkerAccessController {
  constructor(private readonly projectWorkerAccessService: ProjectWorkerAccessService) {}

  private professionalId(req: any): string {
    const id: string | undefined = req?.user?.id;
    if (!id || req?.user?.role !== 'professional') {
      throw new ForbiddenException('Professional access required');
    }
    return id;
  }

  @Post('projects/:projectId/worker-access')
  @UseGuards(CombinedAuthGuard)
  async grant(
    @Param('projectId') projectId: string,
    @Body() body: { workerId?: string; email?: string },
    @Request() req: any,
  ) {
    const proId = this.professionalId(req);
    return this.projectWorkerAccessService.grant(projectId, proId, body);
  }

  @Get('projects/:projectId/worker-access')
  @UseGuards(CombinedAuthGuard)
  async list(@Param('projectId') projectId: string, @Request() req: any) {
    const proId = this.professionalId(req);
    return this.projectWorkerAccessService.list(projectId, proId);
  }

  @Post('projects/:projectId/worker-access/:grantId/revoke')
  @UseGuards(CombinedAuthGuard)
  async revoke(
    @Param('projectId') projectId: string,
    @Param('grantId') grantId: string,
    @Request() req: any,
  ) {
    const proId = this.professionalId(req);
    return this.projectWorkerAccessService.revoke(projectId, proId, grantId);
  }

  @Get('auth/worker-project-magic')
  async resolveMagic(@Query('token') token: string) {
    return this.projectWorkerAccessService.resolveMagic(token);
  }
}
