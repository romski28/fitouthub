import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-registration-otp')
  @HttpCode(HttpStatus.OK)
  async verifyRegistrationOtp(
    @Body() body: { email: string; code: string },
  ) {
    return this.authService.verifyRegistrationOtp(body.email, body.code);
  }

  @Post('resend-registration-otp')
  @HttpCode(HttpStatus.OK)
  async resendRegistrationOtp(@Body() body: { email: string }) {
    return this.authService.resendRegistrationOtp(body.email);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }
}
