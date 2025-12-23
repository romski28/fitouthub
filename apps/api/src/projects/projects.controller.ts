import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll() {
    return this.projectsService.findAll();
  }

  @Get('canonical')
  async findCanonical(@Query('clientId') clientId?: string) {
    return this.projectsService.findCanonical(clientId);
  }

  @Get('respond')
  async respond(
    @Query('token') token: string,
    @Query('action') action: 'accept' | 'decline',
  ) {
    if (!token || !action) {
      throw new HttpException(
        'Token and action are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const webBaseUrl =
        process.env.WEB_BASE_URL ||
        process.env.FRONTEND_BASE_URL ||
        process.env.APP_WEB_URL ||
        'https://fitouthub-web.vercel.app';

      const result = await this.projectsService.respondToInvitation(
        token,
        action,
      );
      // Return HTML for user-friendly response
      const professionalId = result.professionalId;
      const buttonHtml =
        action === 'accept'
          ? `<a href="${webBaseUrl}/professional-projects/${result.projectId}?pro=${professionalId}">View Project & Submit Quote</a>`
          : `<p style="color: #6b7280; margin-top: 20px; font-weight: 500;">You may now close this window or return to your dashboard.</p><a href="${webBaseUrl}/" style="margin-top: 10px;">Return to Dashboard</a>`;

      return `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Response Recorded</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f3f4f6; }
              .card { background: white; border-radius: 12px; padding: 40px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              h1 { color: ${action === 'accept' ? '#10b981' : '#6b7280'}; margin: 0 0 15px 0; }
              p { color: #6b7280; line-height: 1.6; }
              a { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
              a:hover { background: #4338ca; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>${action === 'accept' ? '✅ Project Accepted!' : '❌ Project Declined'}</h1>
              <p>${result.message}</p>
              ${buttonHtml}
            </div>
          </body>
        </html>
      `;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to process response',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/tokens')
  async getEmailTokens(@Param('id') projectId: string) {
    return this.projectsService.getEmailTokens(projectId);
  }

  @Get(':id/professionals')
  async getProjectProfessionals(@Param('id') projectId: string) {
    return this.projectsService.getProjectProfessionals(projectId);
  }

  @Post()
  async create(@Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(createProjectDto);
  }

  @Post(':id/quote')
  async submitQuote(
    @Param('id') projectId: string,
    @Body() quoteDto: { professionalId: string; quoteAmount: number; quoteNotes?: string },
  ) {
    return this.projectsService.submitQuote(
      projectId,
      quoteDto.professionalId,
      quoteDto.quoteAmount,
      quoteDto.quoteNotes,
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, updateProjectDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
