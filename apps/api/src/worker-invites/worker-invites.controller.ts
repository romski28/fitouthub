import { Body, Controller, ForbiddenException, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { WorkerInvitesService } from './worker-invites.service';

@Controller()
export class WorkerInvitesController {
  constructor(private readonly workerInvitesService: WorkerInvitesService) {}

  private professionalId(req: any): string {
    const id: string | undefined = req?.user?.id;
    if (!id || req?.user?.role !== 'professional') {
      throw new ForbiddenException('Professional access required');
    }
    return id;
  }

  @Post('professional/worker-invites')
  @UseGuards(CombinedAuthGuard)
  async create(
    @Body() body: { email: string; name?: string; phone?: string; trades?: string[]; notes?: string },
    @Request() req: any,
  ) {
    const proId = this.professionalId(req);
    return this.workerInvitesService.createInvite(proId, body);
  }

  @Get('professional/worker-invites')
  @UseGuards(CombinedAuthGuard)
  async list(@Request() req: any) {
    const proId = this.professionalId(req);
    return this.workerInvitesService.listInvites(proId);
  }

  @Get('professional/workers')
  @UseGuards(CombinedAuthGuard)
  async workers(@Request() req: any) {
    const proId = this.professionalId(req);
    return this.workerInvitesService.listWorkers(proId);
  }

  @Post('professional/worker-invites/:id/revoke')
  @UseGuards(CombinedAuthGuard)
  async revoke(@Param('id') id: string, @Request() req: any) {
    const proId = this.professionalId(req);
    return this.workerInvitesService.revokeInvite(proId, id);
  }

  @Get('worker-invites/:token')
  async resolve(@Param('token') token: string) {
    return this.workerInvitesService.resolveInvite(token);
  }

  @Post('worker-invites/:token/accept')
  async accept(@Param('token') token: string, @Body() body: { email: string }) {
    return this.workerInvitesService.acceptInvite(token, body.email);
  }
}
