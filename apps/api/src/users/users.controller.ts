import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async findMe(@Request() req: any) {
    return this.usersService.findOne(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('me')
  async updateMe(@Request() req: any, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.id, updateUserDto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('me/password')
  async updateMyPassword(@Request() req: any, @Body() body: { password?: string }) {
    if (!body?.password || body.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    return this.usersService.updatePassword(req.user.id, body.password);
  }

  @Put(':id/password')
  async updatePassword(@Param('id') id: string, @Body() body: { password?: string }) {
    if (!body?.password || body.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    return this.usersService.updatePassword(id, body.password);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me/notification-preferences')
  async updateMyNotificationPreferences(
    @Request() req: any,
    @Body()
    body: {
      allowPartnerOffers?: boolean;
      allowPlatformUpdates?: boolean;
      preferredLanguage?: string;
      preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    },
  ) {
    return this.usersService.updateNotificationPreferences(req.user.id, body);
  }

  @Patch(':id/notification-preferences')
  async updateNotificationPreferences(
    @Param('id') id: string,
    @Body()
    body: {
      allowPartnerOffers?: boolean;
      allowPlatformUpdates?: boolean;
      preferredLanguage?: string;
      preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    },
  ) {
    return this.usersService.updateNotificationPreferences(id, body);
  }
}
