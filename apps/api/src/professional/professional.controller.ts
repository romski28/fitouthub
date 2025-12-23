import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';

@Controller('professional')
export class ProfessionalController {
  constructor(private prisma: PrismaService) {}

  @Get('projects')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProfessionalProjects(@Request() req: any) {
    try {
      const professionalId = req.user.id || req.user.sub;

      const projectProfessionals = await (
        this.prisma as any
      ).projectProfessional.findMany({
        where: { professionalId },
        include: {
          project: {
            select: {
              id: true,
              projectName: true,
              clientName: true,
              region: true,
              budget: true,
              notes: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return projectProfessionals;
    } catch (error) {
      console.error('Error fetching professional projects:', error);
      throw error;
    }
  }

  @Get('projects/:projectProfessionalId')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProjectDetail(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
        },
        include: {
          project: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      return projectProfessional;
    } catch (error) {
      console.error('Error fetching project detail:', error);
      throw error;
    }
  }

  @Post('projects/:projectProfessionalId/quote')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async submitQuote(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: { quoteAmount: number | string; quoteNotes?: string },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const quoteAmount = parseFloat(String(body.quoteAmount));
      if (isNaN(quoteAmount) || quoteAmount < 0) {
        throw new BadRequestException('Invalid quote amount');
      }

      const updated = await (this.prisma as any).projectProfessional.update({
        where: { id: projectProfessionalId },
        data: {
          quoteAmount: quoteAmount,
          quoteNotes: body.quoteNotes || '',
          quotedAt: new Date(),
          status: 'quoted',
        },
        include: {
          project: true,
        },
      });

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error submitting quote:', error);
      throw error;
    }
  }

  @Post('projects/:projectProfessionalId/accept')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async acceptProject(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const updated = await (this.prisma as any).projectProfessional.update({
        where: { id: projectProfessionalId },
        data: {
          status: 'accepted',
          respondedAt: new Date(),
        },
        include: {
          project: true,
        },
      });

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error accepting project:', error);
      throw error;
    }
  }

  @Post('projects/:projectProfessionalId/reject')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async rejectProject(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const updated = await (this.prisma as any).projectProfessional.update({
        where: { id: projectProfessionalId },
        data: {
          status: 'rejected',
          respondedAt: new Date(),
        },
      });

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error rejecting project:', error);
      throw error;
    }
  }
}
