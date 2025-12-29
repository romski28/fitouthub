import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AssistRequestsService } from './assist-requests.service';

@Controller('assist-requests')
export class AssistRequestsController {
  constructor(private service: AssistRequestsService) {}

  @Post()
  async create(@Body() body: { projectId: string; notes?: string; userId?: string; clientName?: string; projectName?: string }) {
    try {
      return await this.service.createRequest({
        projectId: body.projectId,
        userId: body.userId,
        notes: body.notes,
        clientName: body.clientName,
        projectName: body.projectName,
      });
    } catch (error) {
      throw new HttpException(error.message || 'Failed to create assist request', HttpStatus.BAD_REQUEST);
    }
  }

  @Get()
  async list(@Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.list({
      status: status as any,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.getMessages(id, limit ? parseInt(limit, 10) : undefined, offset ? parseInt(offset, 10) : undefined);
  }

  @Post(':id/messages')
  async addMessage(@Param('id') id: string, @Body() body: { sender: 'client' | 'foh'; content: string; senderUserId?: string }) {
    try {
      return await this.service.addMessage(id, body.sender, body.content, body.senderUserId);
    } catch (error) {
      throw new HttpException(error.message || 'Failed to add message', HttpStatus.BAD_REQUEST);
    }
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: { status: 'open' | 'in_progress' | 'closed' }) {
    try {
      return await this.service.updateStatus(id, body.status);
    } catch (error) {
      throw new HttpException(error.message || 'Failed to update status', HttpStatus.BAD_REQUEST);
    }
  }

  @Get('by-project/:projectId')
  async getByProject(@Param('projectId') projectId: string) {
    try {
      const assist = await this.service.getLatestByProject(projectId);
      return { assist };
    } catch (error) {
      throw new HttpException(error.message || 'Failed to fetch assist request', HttpStatus.BAD_REQUEST);
    }
  }
}
