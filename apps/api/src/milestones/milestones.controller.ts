import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { MilestonesService } from './milestones.service';
import {
  CreateMilestoneDto,
  UpdateMilestoneDto,
  CreateMultipleMilestonesDto,
  DeclineMilestoneAccessDto,
  MilestoneCompletionFeedbackDto,
} from './dtos';
import { AuthGuard } from '@nestjs/passport';

@Controller('milestones')
export class MilestonesController {
  constructor(private milestonesService: MilestonesService) {}

  @Get('templates/trade/:tradeId')
  async getTemplatesByTrade(@Param('tradeId') tradeId: string) {
    return this.milestonesService.getTemplatesByTrade(tradeId);
  }

  @Get('templates')
  async getAllTemplates() {
    return this.milestonesService.getAllTemplates();
  }

  @Get('project/:projectId')
  async getMilestonesByProject(@Param('projectId') projectId: string) {
    return this.milestonesService.getMilestonesByProject(projectId);
  }

  @Get('project-professional/:projectProfessionalId')
  async getMilestonesByProjectProfessional(
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    return this.milestonesService.getMilestonesByProjectProfessional(
      projectProfessionalId,
    );
  }

  @Post('project-professional/:projectProfessionalId/reset-default')
  @UseGuards(AuthGuard('jwt-professional'))
  async resetProjectMilestonesToDefault(
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Req() req: any,
  ) {
    const professionalId = req.user?.id || req.user?.sub;
    if (!professionalId) {
      throw new BadRequestException('Professional authentication required');
    }

    return this.milestonesService.resetProjectMilestonesToDefault(
      projectProfessionalId,
      professionalId,
    );
  }

  @Get('calendar/:professionalId')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProfessionalCalendar(
    @Param('professionalId') professionalId: string,
    @Req() req: any,
  ) {
    return this.milestonesService.getProfessionalCalendar(professionalId);
  }

  @Get(':id')
  async getMilestoneById(@Param('id') id: string) {
    return this.milestonesService.getMilestoneById(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt-professional'))
  async createMilestone(
    @Body() createMilestoneDto: CreateMilestoneDto,
    @Req() req: any,
  ) {
    try {
      console.log(`[MilestonesController] POST /milestones received:`, {
        projectId: createMilestoneDto.projectId,
        projectProfessionalId: createMilestoneDto.projectProfessionalId,
        title: createMilestoneDto.title,
        sequence: createMilestoneDto.sequence,
        plannedStartDate: createMilestoneDto.plannedStartDate,
        plannedEndDate: createMilestoneDto.plannedEndDate,
      });
      const result = await this.milestonesService.createMilestone(createMilestoneDto);
      console.log(`[MilestonesController] Milestone created successfully`);
      return result;
    } catch (error) {
      console.error(`[MilestonesController] POST /milestones error:`, error);
      throw error;
    }
  }

  @Post('batch')
  @UseGuards(AuthGuard('jwt-professional'))
  async createMultipleMilestones(
    @Body() data: CreateMultipleMilestonesDto,
    @Req() req: any,
  ) {
    try {
      console.log(`[MilestonesController] Batch POST received:`, {
        projectId: data.projectId,
        projectProfessionalId: data.projectProfessionalId,
        milestonesCount: data.milestones?.length,
        sampleMilestone: data.milestones?.[0],
      });
      return await this.milestonesService.createMultipleMilestones(data);
    } catch (error) {
      console.error(`[MilestonesController] Batch POST error:`, error);
      throw error;
    }
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateMilestone(
    @Param('id') id: string,
    @Body() updateMilestoneDto: UpdateMilestoneDto,
    @Req() req: any,
  ) {
    try {
      console.log(`[MilestonesController] PUT /milestones/${id} received:`, JSON.stringify(updateMilestoneDto, null, 2));
      const result = await this.milestonesService.updateMilestone(id, updateMilestoneDto);
      console.log(`[MilestonesController] Milestone ${id} updated successfully`);
      return result;
    } catch (error) {
      console.error(`[MilestonesController] PUT /milestones/${id} error:`, error);
      throw error;
    }
  }

  @Post(':id/decline-access')
  @UseGuards(AuthGuard('jwt'))
  async declineMilestoneAccess(
    @Param('id') id: string,
    @Body() body: DeclineMilestoneAccessDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new BadRequestException('Client authentication required');
    }

    if (!body?.reason || body.reason.trim().length < 3) {
      throw new BadRequestException('Please provide a reason for declining access');
    }

    return this.milestonesService.declineMilestoneAccess(id, userId, body.reason.trim());
  }

  @Post(':id/completion-feedback')
  @UseGuards(AuthGuard('jwt'))
  async submitMilestoneCompletionFeedback(
    @Param('id') id: string,
    @Body() body: MilestoneCompletionFeedbackDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new BadRequestException('Client authentication required');
    }

    if (!body?.action || !['agreed', 'questioned'].includes(body.action)) {
      throw new BadRequestException('action must be either "agreed" or "questioned"');
    }

    if (body.action === 'questioned' && (!body.reason || body.reason.trim().length < 3)) {
      throw new BadRequestException('Please provide a short reason when raising a query');
    }

    return this.milestonesService.submitMilestoneCompletionFeedback(
      id,
      userId,
      body.action,
      body.reason?.trim(),
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt-professional'))
  async deleteMilestone(@Param('id') id: string, @Req() req: any) {
    return this.milestonesService.deleteMilestone(id);
  }

  @Post(':id/photos')
  @UseGuards(AuthGuard('jwt-professional'))
  async addPhotoToMilestone(
    @Param('id') id: string,
    @Body() body: { photoUrls: string[] },
    @Req() req: any,
  ) {
    if (!body.photoUrls || !Array.isArray(body.photoUrls)) {
      throw new BadRequestException('photoUrls must be an array');
    }
    return this.milestonesService.addPhotoToMilestone(id, body.photoUrls);
  }

  @Delete(':id/photos/:photoUrl')
  @UseGuards(AuthGuard('jwt-professional'))
  async removePhotoFromMilestone(
    @Param('id') id: string,
    @Param('photoUrl') photoUrl: string,
    @Req() req: any,
  ) {
    // Decode the URL since it comes as a parameter
    const decodedUrl = decodeURIComponent(photoUrl);
    return this.milestonesService.removePhotoFromMilestone(id, decodedUrl);
  }
}
