import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { PropertiesService } from './properties.service';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  private requireAuth(req: any): string {
    const actorId: string | undefined = req?.user?.id ?? req?.user?.userId ?? req?.user?.sub;
    if (!actorId) throw new ForbiddenException('Authentication required');
    return actorId;
  }

  private requireAdmin(req: any): string {
    const actorId = this.requireAuth(req);
    if (req?.user?.role !== 'admin') throw new ForbiddenException('Admin access required');
    return actorId;
  }

  @Post()
  @UseGuards(CombinedAuthGuard)
  async upsert(@Body() body: any, @Request() req: any) {
    this.requireAuth(req);
    return this.propertiesService.upsertProperty(body);
  }

  @Get('search')
  @UseGuards(CombinedAuthGuard)
  async search(
    @Query('q') q?: string,
    @Query('districtAreaId') districtAreaId?: string,
    @Request() req?: any,
  ) {
    this.requireAuth(req);
    return this.propertiesService.searchProperties(q ?? '', districtAreaId);
  }

  @Get('admin/matches')
  @UseGuards(CombinedAuthGuard)
  async listMatches(@Query('status') status?: string, @Request() req?: any) {
    this.requireAdmin(req);
    return this.propertiesService.listMatchCandidates(status);
  }

  @Post('admin/matches/:id/resolve')
  @UseGuards(CombinedAuthGuard)
  async resolveMatch(
    @Param('id') id: string,
    @Body() body: { action: 'merge' | 'dismiss' },
    @Request() req: any,
  ) {
    const actorId = this.requireAdmin(req);
    return this.propertiesService.resolveMatchCandidate(id, body.action, actorId);
  }

  @Get(':id')
  @UseGuards(CombinedAuthGuard)
  async get(@Param('id') id: string, @Request() req: any) {
    this.requireAuth(req);
    return this.propertiesService.getProperty(id);
  }

  @Post(':id/link')
  @UseGuards(CombinedAuthGuard)
  async link(@Param('id') id: string, @Body() body: { personaId: string; role?: string }, @Request() req: any) {
    this.requireAuth(req);
    return this.propertiesService.linkAccount(id, body.personaId, body.role);
  }
}
