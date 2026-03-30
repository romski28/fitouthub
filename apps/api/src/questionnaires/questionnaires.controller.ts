import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { QuestionnairesService } from './questionnaires.service';
import { CreateQuestionnaireDto } from './dto/create-questionnaire.dto';
import { CreateQuestionnaireInviteDto } from './dto/create-questionnaire-invite.dto';
import { SaveQuestionnaireAnswerDto } from './dto/save-questionnaire-answer.dto';

@Controller('questionnaires')
export class QuestionnairesController {
  constructor(private readonly questionnairesService: QuestionnairesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  list(@Req() req: any) {
    this.requireAdmin(req);
    return this.questionnairesService.listQuestionnaires();
  }

  @Get('templates')
  @UseGuards(AuthGuard('jwt'))
  listTemplates(@Req() req: any) {
    this.requireAdmin(req);
    return this.questionnairesService.listTemplates();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req: any, @Body() dto: CreateQuestionnaireDto) {
    this.requireAdmin(req);
    return this.questionnairesService.createQuestionnaire(dto, req.user.id);
  }

  @Post('starter')
  @UseGuards(AuthGuard('jwt'))
  createStarter(@Req() req: any) {
    this.requireAdmin(req);
    return this.questionnairesService.ensureStarterQuestionnaire(req.user.id);
  }

  @Get('public/:token')
  getPublicQuestionnaire(@Param('token') token: string) {
    return this.questionnairesService.getPublicQuestionnaire(token);
  }

  @Post('public/:token/start')
  startPublicQuestionnaire(@Param('token') token: string) {
    return this.questionnairesService.startPublicQuestionnaire(token);
  }

  @Post('public/:token/answer')
  savePublicAnswer(
    @Param('token') token: string,
    @Body() dto: SaveQuestionnaireAnswerDto,
  ) {
    return this.questionnairesService.savePublicAnswer(token, dto);
  }

  @Post('public/:token/complete')
  completePublicQuestionnaire(
    @Param('token') token: string,
    @Body() body: { respondentName?: string },
  ) {
    return this.questionnairesService.completePublicQuestionnaire(
      token,
      body?.respondentName,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  getOne(@Req() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.questionnairesService.getQuestionnaire(id);
  }

  @Post(':id/invites')
  @UseGuards(AuthGuard('jwt'))
  createInvite(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateQuestionnaireInviteDto,
  ) {
    this.requireAdmin(req);
    return this.questionnairesService.createInvite(id, dto, req.user.id);
  }

  @Get(':id/responses')
  @UseGuards(AuthGuard('jwt'))
  listResponses(@Req() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.questionnairesService.listResponses(id);
  }

  private requireAdmin(req: any) {
    if (req.user?.role !== 'admin') {
      throw new UnauthorizedException('Admin access required');
    }
  }
}
