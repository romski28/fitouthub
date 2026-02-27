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
import { CreateMilestoneDto, UpdateMilestoneDto, CreateMultipleMilestonesDto } from './dtos';
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
    return this.milestonesService.createMilestone(createMilestoneDto);
  }

  @Post('batch')
  @UseGuards(AuthGuard('jwt-professional'))
  async createMultipleMilestones(
    @Body() data: CreateMultipleMilestonesDto,
    @Req() req: any,
  ) {
    return this.milestonesService.createMultipleMilestones(data);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateMilestone(
    @Param('id') id: string,
    @Body() updateMilestoneDto: UpdateMilestoneDto,
    @Req() req: any,
  ) {
    return this.milestonesService.updateMilestone(id, updateMilestoneDto);
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
