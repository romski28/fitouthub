import { Body, Controller, ForbiddenException, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DelegateInvitesService } from './delegate-invites.service';

@Controller()
export class DelegateInvitesController {
  constructor(private readonly delegateInvitesService: DelegateInvitesService) {}

  private clientId(req: any): string {
    const id: string | undefined = req?.user?.id;
    if (!id) throw new ForbiddenException('Client access required');
    return id;
  }

  @Post('client/delegate-invites')
  @UseGuards(AuthGuard('jwt'))
  async create(
    @Body() body: { email: string; relationshipType?: string; name?: string; phone?: string; notes?: string },
    @Request() req: any,
  ) {
    const clientId = this.clientId(req);
    return this.delegateInvitesService.createInvite(clientId, body);
  }

  @Get('client/delegate-invites')
  @UseGuards(AuthGuard('jwt'))
  async listInvites(@Request() req: any) {
    return this.delegateInvitesService.listInvites(this.clientId(req));
  }

  @Get('client/delegates')
  @UseGuards(AuthGuard('jwt'))
  async listDelegates(@Request() req: any) {
    return this.delegateInvitesService.listDelegates(this.clientId(req));
  }

  @Post('client/delegate-invites/:id/revoke')
  @UseGuards(AuthGuard('jwt'))
  async revoke(@Param('id') id: string, @Request() req: any) {
    return this.delegateInvitesService.revokeInvite(this.clientId(req), id);
  }

  @Get('delegate-invites/:token')
  async resolve(@Param('token') token: string) {
    return this.delegateInvitesService.resolveInvite(token);
  }

  @Post('delegate-invites/:token/accept')
  async accept(@Param('token') token: string, @Body() body: { email: string }) {
    return this.delegateInvitesService.acceptInvite(token, body.email);
  }
}
