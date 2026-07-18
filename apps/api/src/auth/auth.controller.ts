import { Controller, Post, Body, Get, Query, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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

  @Post('oauth/google/start')
  @HttpCode(HttpStatus.OK)
  async googleStart(@Body() body: { idToken: string }) {
    return this.authService.googleStart(body.idToken);
  }

  @Post('oauth/google/complete')
  @HttpCode(HttpStatus.OK)
  async googleComplete(
    @Body()
    body: {
      onboardingToken: string;
      nickname: string;
      preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
      preferredLanguage?: string;
      mobile?: string;
      allowPartnerOffers?: boolean;
      allowPlatformUpdates?: boolean;
      firstName?: string;
      surname?: string;
    },
  ) {
    return this.authService.googleComplete(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Request() req: any) {
    return this.authService.logoutAll(req.user.sub);
  }

  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    return this.authService.checkEmail(email);
  }

  @Get('check-mobile')
  async checkMobile(@Query('mobile') mobile: string) {
    return this.authService.checkMobile(mobile);
  }
}
