import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';
import { AuthGuard } from '@nestjs/passport';
import { SupportRequestsService } from './support-requests.service';
import { WhatsAppInboundDto } from './dto/whatsapp-inbound.dto';
import {
  CreateCallbackDto,
  LinkProjectDto,
  ReplyDto,
  UpdateNotesDto,
} from './dto/support-request.dto';

@Controller('support-requests')
export class SupportRequestsController {
  private readonly logger = new Logger(SupportRequestsController.name);

  constructor(
    private readonly service: SupportRequestsService,
    private readonly configService: ConfigService,
  ) {}

  private validateTwilioSignature(req: any): void {
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    if (!authToken) return;
    const signature = req.headers['x-twilio-signature'] as string;
    if (!signature) {
      this.logger.warn(`Rejected webhook - missing X-Twilio-Signature from ${req.ip}`);
      throw new ForbiddenException('Invalid request origin');
    }
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers['host'];
    const url = `${protocol}://${host}${req.originalUrl}`;
    const valid = twilio.validateRequest(authToken, signature, url, req.body as Record<string, string>);
    if (!valid) {
      this.logger.warn(`Rejected webhook - invalid Twilio signature from ${req.ip}`);
      throw new ForbiddenException('Invalid request origin');
    }
  }

  @Post('webhook/whatsapp')
  @HttpCode(200)
  async handleWhatsAppInbound(@Req() req: any, @Body() payload: WhatsAppInboundDto) {
    this.validateTwilioSignature(req);
    await this.service.createFromWhatsapp(payload);
    return '';
  }

  @Post('callback')
  async createCallback(@Body() dto: CreateCallbackDto) {
    const req = await this.service.createCallback(dto);
    return { success: true, id: req.id };
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getPool(@Req() req: any) {
    this.requireAdmin(req);
    return this.service.getPool();
  }

  @Get('resolved')
  @UseGuards(AuthGuard('jwt'))
  async getResolved(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.requireAdmin(req);
    return this.service.getResolved(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async getOne(@Req() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.service.getOne(id);
  }

  @Patch(':id/claim')
  @UseGuards(AuthGuard('jwt'))
  async claim(@Req() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.service.claim(id, req.user.id);
  }

  @Patch(':id/release')
  @UseGuards(AuthGuard('jwt'))
  async release(@Req() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.service.release(id, req.user.id);
  }

  @Patch(':id/in-progress')
  @UseGuards(AuthGuard('jwt'))
  async markInProgress(@Req() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.service.markInProgress(id, req.user.id);
  }

  @Patch(':id/resolve')
  @UseGuards(AuthGuard('jwt'))
  async resolve(@Req() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.service.resolve(id, req.user.id);
  }

  @Post(':id/reply')
  @UseGuards(AuthGuard('jwt'))
  async reply(@Req() req: any, @Param('id') id: string, @Body() dto: ReplyDto) {
    this.requireAdmin(req);
    return this.service.sendReply(id, req.user.id, dto.message);
  }

  @Patch(':id/notes')
  @UseGuards(AuthGuard('jwt'))
  async updateNotes(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateNotesDto,
  ) {
    this.requireAdmin(req);
    return this.service.updateNotes(id, req.user.id, dto.notes);
  }

  @Patch(':id/link-project')
  @UseGuards(AuthGuard('jwt'))
  async linkProject(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: LinkProjectDto,
  ) {
    this.requireAdmin(req);
    return this.service.linkProject(id, dto.projectId);
  }

  private requireAdmin(req: any) {
    if (req.user?.role !== 'admin') {
      throw new UnauthorizedException('Admin access required');
    }
  }
}
