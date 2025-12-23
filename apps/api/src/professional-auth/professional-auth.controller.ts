import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProfessionalAuthService } from './professional-auth.service';
import {
  ProfessionalLoginDto,
  ProfessionalRegisterDto,
  SetPasswordDto,
} from './dto';

@Controller('professional/auth')
export class ProfessionalAuthController {
  constructor(private professionalAuthService: ProfessionalAuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: ProfessionalRegisterDto) {
    return this.professionalAuthService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: ProfessionalLoginDto) {
    return this.professionalAuthService.login(dto);
  }

  @Post('set-password')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Request() req: any,
    @Body() dto: SetPasswordDto,
  ) {
    return this.professionalAuthService.setPassword(
      req.user.sub,
      dto.password,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken: string }) {
    return this.professionalAuthService.refreshToken(body.refreshToken);
  }
}
