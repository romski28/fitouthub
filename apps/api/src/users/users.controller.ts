import { Controller, Get, Put, Delete, Body, Param, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Put(':id/password')
  async updatePassword(@Param('id') id: string, @Body() body: { password?: string }) {
    if (!body?.password || body.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    return this.usersService.updatePassword(id, body.password);
  }
}
