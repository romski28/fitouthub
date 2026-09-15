import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DelegateProjectAccessService } from './delegate-project-access.service';

@Controller()
export class DelegateProjectAccessController {
  constructor(private readonly delegateProjectAccessService: DelegateProjectAccessService) {}

  private userId(req: any): string {
    const id: string | undefined = req?.user?.id;
    if (!id) throw new ForbiddenException('Authentication required');
    return id;
  }

  @Post('projects/:projectId/delegate-access')
  @UseGuards(AuthGuard('jwt'))
  async grant(
    @Param('projectId') projectId: string,
    @Body() body: { delegateUserId?: string; email?: string; task?: string },
    @Request() req: any,
  ) {
    return this.delegateProjectAccessService.grant(projectId, this.userId(req), body);
  }

  @Get('projects/:projectId/delegate-access')
  @UseGuards(AuthGuard('jwt'))
  async list(@Param('projectId') projectId: string, @Request() req: any) {
    return this.delegateProjectAccessService.list(projectId, this.userId(req));
  }

  @Post('projects/:projectId/delegate-access/:grantId/revoke')
  @UseGuards(AuthGuard('jwt'))
  async revoke(
    @Param('projectId') projectId: string,
    @Param('grantId') grantId: string,
    @Request() req: any,
  ) {
    return this.delegateProjectAccessService.revoke(projectId, this.userId(req), grantId);
  }

  @Get('auth/delegate-project-magic')
  async resolveMagic(@Query('token') token: string) {
    return this.delegateProjectAccessService.resolveMagic(token);
  }

  @Get('client/delegate-projects')
  @UseGuards(AuthGuard('jwt'))
  async delegateProjects(@Request() req: any) {
    return this.delegateProjectAccessService.listDelegateProjects(this.userId(req));
  }

  @Get('client/delegate-project/:projectId')
  @UseGuards(AuthGuard('jwt'))
  async delegateProject(@Param('projectId') projectId: string, @Request() req: any) {
    return this.delegateProjectAccessService.getDelegateProject(projectId, this.userId(req));
  }
}
