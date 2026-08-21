import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
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

  private actorPersonaId(req: any, bodyPersonaId?: string): string {
    const personaId = req?.user?.personaId || bodyPersonaId;
    if (!personaId) throw new ForbiddenException('No persona associated with this account');
    return personaId;
  }

  @Post()
  @UseGuards(CombinedAuthGuard)
  async upsert(@Body() body: any, @Request() req: any) {
    this.requireAuth(req);
    return this.propertiesService.upsertProperty(body);
  }

  @Get()
  @UseGuards(CombinedAuthGuard)
  async list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('q') q?: string,
    @Request() req?: any,
  ) {
    this.requireAuth(req);
    return this.propertiesService.listProperties({
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 100,
      q,
    });
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

  @Get('districts')
  @UseGuards(CombinedAuthGuard)
  async districts(@Request() req?: any) {
    this.requireAuth(req);
    return this.propertiesService.listDistricts();
  }

  @Get('gazetteer/search')
  @UseGuards(CombinedAuthGuard)
  async gazetteerSearch(
    @Query('q') q?: string,
    @Query('districtAreaId') districtAreaId?: string,
    @Request() req?: any,
  ) {
    this.requireAuth(req);
    return this.propertiesService.searchGazetteer(q ?? '', districtAreaId);
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

  @Get('me')
  @UseGuards(CombinedAuthGuard)
  async myProperties(@Request() req: any) {
    this.requireAuth(req);
    return this.propertiesService.listMyProperties(this.actorPersonaId(req));
  }

  @Get(':id')
  @UseGuards(CombinedAuthGuard)
  async get(@Param('id') id: string, @Request() req: any) {
    this.requireAuth(req);
    return this.propertiesService.getProperty(id);
  }

  @Post(':id/link')
  @UseGuards(CombinedAuthGuard)
  async link(
    @Param('id') id: string,
    @Body() body: { personaId?: string; role?: string; setPrimary?: boolean },
    @Request() req: any,
  ) {
    this.requireAuth(req);
    const personaId = this.actorPersonaId(req, body.personaId);
    return this.propertiesService.linkAccount(id, personaId, { role: body.role, setPrimary: body.setPrimary });
  }

  @Delete(':id/link')
  @UseGuards(CombinedAuthGuard)
  async unlink(@Param('id') id: string, @Request() req: any) {
    this.requireAuth(req);
    return this.propertiesService.unlinkAccount(this.actorPersonaId(req), id);
  }

  @Post(':id/primary')
  @UseGuards(CombinedAuthGuard)
  async setPrimary(@Param('id') id: string, @Request() req: any) {
    this.requireAuth(req);
    return this.propertiesService.setPrimaryAccount(this.actorPersonaId(req), id);
  }
}
