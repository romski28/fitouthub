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
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get('active')
  getActive() {
    return this.announcementsService.getActive();
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  listAll(@Req() req: any) {
    this.requireAdmin(req);
    return this.announcementsService.listAll();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req: any, @Body() dto: CreateAnnouncementDto) {
    this.requireAdmin(req);
    return this.announcementsService.create(dto, req.user.id);
  }

  @Post(':id/activate')
  @UseGuards(AuthGuard('jwt'))
  activate(@Req() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.announcementsService.activate(id);
  }

  private requireAdmin(req: any) {
    if (req.user?.role !== 'admin') {
      throw new UnauthorizedException('Admin access required');
    }
  }
}
