import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private getCookieOptions(isRefresh = false) {
    const maxAge = isRefresh
      ? parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800') * 1000
      : parseInt(process.env.JWT_ACCESS_EXPIRES_IN || '900') * 1000;

    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge,
    };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new citizen account' })
  @ApiResponse({ status: 201, description: 'Citizen registration successful. Verification link printed to backend logs.' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user and set secure cookies' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.authService.login(loginDto, ip, userAgent);

    // Set secure HttpOnly cookies
    res.cookie('accessToken', result.accessToken, this.getCookieOptions(false));
    res.cookie('refreshToken', result.refreshToken, this.getCookieOptions(true));

    return {
      user: result.user,
      accessToken: result.accessToken, // exposed for testing and Swagger compatibility
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh tokens using cookie or body' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const rawRefreshToken = req.cookies['refreshToken'] || req.body.refreshToken;
    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token provided.');
    }

    const result = await this.authService.refresh(rawRefreshToken, ip, userAgent);

    res.cookie('accessToken', result.accessToken, this.getCookieOptions(false));
    res.cookie('refreshToken', result.refreshToken, this.getCookieOptions(true));

    return {
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke current refresh token' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies['refreshToken'] || req.body.refreshToken;
    if (rawRefreshToken) {
      await this.authService.logout(rawRefreshToken);
    }

    const clearAccessOptions = { ...this.getCookieOptions(false), maxAge: 0 };
    const clearRefreshOptions = { ...this.getCookieOptions(true), maxAge: 0 };

    res.cookie('accessToken', '', clearAccessOptions);
    res.cookie('refreshToken', '', clearRefreshOptions);

    return { success: true, message: 'Logged out successfully.' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset token link' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(forgotPasswordDto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.password);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify citizen email link' })
  async verifyEmail(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required.');
    }
    return this.authService.verifyEmail(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@GetUser() user: any) {
    return user;
  }
}
