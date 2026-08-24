import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { ContactsService } from './contacts.service';

@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  private professionalId(req: any): string {
    const id: string | undefined = req?.user?.id;
    if (!id || req?.user?.role !== 'professional') {
      throw new ForbiddenException('Professional access required');
    }
    return id;
  }

  @Get('professional/contacts')
  @UseGuards(CombinedAuthGuard)
  async list(@Request() req: any) {
    return this.contactsService.list(this.professionalId(req));
  }

  @Post('professional/contacts')
  @UseGuards(CombinedAuthGuard)
  async create(@Body() body: any, @Request() req: any) {
    return this.contactsService.create(this.professionalId(req), body);
  }

  @Put('professional/contacts/:id')
  @UseGuards(CombinedAuthGuard)
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.contactsService.update(this.professionalId(req), id, body);
  }

  @Delete('professional/contacts/:id')
  @UseGuards(CombinedAuthGuard)
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.contactsService.remove(this.professionalId(req), id);
  }

  @Post('professional/contacts/:id/invite')
  @UseGuards(CombinedAuthGuard)
  async invite(@Param('id') id: string, @Request() req: any) {
    return this.contactsService.invite(this.professionalId(req), id);
  }
}
