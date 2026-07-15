import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  verifyPassword,
  hashPassword,
  generateToken,
  hashToken,
} from '../common/utils/crypto.util';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async register(registerDto: RegisterDto) {
    // Public registration is restricted to creating CITIZENs
    return this.usersService.createCitizen(registerDto.email, registerDto.password);
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This account has been suspended.');
    }

    const isPasswordValid = await verifyPassword(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Generate token pair
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Save refresh token hash to db
    const rawRefreshToken = tokens.refreshToken;
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date();
    expiresAt.setSeconds(
      expiresAt.getSeconds() + parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800'),
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    await this.auditService.log(
      user.id,
      'USER_LOGIN',
      ipAddress,
      userAgent,
      { email: user.email },
    );

    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken: tokens.accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async refresh(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    const incomingHash = hashToken(rawRefreshToken);

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: incomingHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // Reuse detection
    if (tokenRecord.revoked) {
      // Security warning: this token has been reused. Revoke all active refresh sessions for this user!
      await this.prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId },
        data: { revoked: true },
      });

      await this.auditService.log(
        tokenRecord.userId,
        'SECURITY_ALERT_TOKEN_REUSE',
        ipAddress,
        userAgent,
        {
          warning: 'Replayed refresh token detected. Revoking all sessions.',
          tokenId: tokenRecord.id,
        },
      );

      this.logger.warn(
        `Token reuse detected for user ${tokenRecord.userId}. All user sessions revoked.`,
      );
      throw new UnauthorizedException('Security breach: Token has been reused.');
    }

    // Expiry check
    if (new Date() > tokenRecord.expiresAt) {
      // Mark as revoked to keep DB consistent
      await this.prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token expired.');
    }

    // Generate new token pair
    const tokens = await this.generateTokens(
      tokenRecord.user.id,
      tokenRecord.user.email,
      tokenRecord.user.role,
    );

    const newRawRefreshToken = tokens.refreshToken;
    const newHash = hashToken(newRawRefreshToken);
    const expiresAt = new Date();
    expiresAt.setSeconds(
      expiresAt.getSeconds() + parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800'),
    );

    // Save new refresh token in Postgres
    const newRecord = await this.prisma.refreshToken.create({
      data: {
        tokenHash: newHash,
        userId: tokenRecord.user.id,
        expiresAt,
      },
    });

    // Revoke old refresh token, linking to the new one
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        revoked: true,
        replacedById: newRecord.id,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  async logout(rawRefreshToken: string) {
    const incomingHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: incomingHash },
      data: { revoked: true },
    });
  }

  async verifyEmail(rawToken: string) {
    const incomingHash = hashToken(rawToken);
    const user = await this.prisma.user.findUnique({
      where: { verificationTokenHash: incomingHash },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token.');
    }

    if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
      throw new BadRequestException('Verification token expired.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: UserStatus.ACTIVE,
        verificationTokenHash: null,
        verificationTokenExpires: null,
      },
    });

    await this.auditService.log(
      user.id,
      'USER_EMAIL_VERIFIED',
      undefined,
      undefined,
      { email: user.email },
    );

    return { success: true, message: 'Email successfully verified.' };
  }

  async requestPasswordReset(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Soft return to prevent user enumeration
      return { success: true, message: 'If the email exists, a reset link has been sent.' };
    }

    const rawResetToken = generateToken();
    const passwordResetTokenHash = hashToken(rawResetToken);
    
    // Expires in 1 hour
    const passwordResetExpires = new Date();
    passwordResetExpires.setHours(passwordResetExpires.getHours() + 1);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash,
        passwordResetExpires,
      },
    });

    // Simulated email dispatch
    console.log(`\n==================================================`);
    console.log(`[EMAIL SIMULATION] Password Reset Email sent to ${email}`);
    console.log(`Reset Link: http://localhost:3000/reset-password?token=${rawResetToken}`);
    console.log(`==================================================\n`);

    return { success: true, message: 'If the email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPasswordPlain: string) {
    const incomingHash = hashToken(token);
    const user = await this.prisma.user.findUnique({
      where: { passwordResetTokenHash: incomingHash },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    if (user.passwordResetExpires && new Date() > user.passwordResetExpires) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    const newPasswordHash = await hashPassword(newPasswordPlain);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        passwordResetTokenHash: null,
        passwordResetExpires: null,
      },
    });

    // Revoke all existing sessions on password reset for security
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revoked: true },
    });

    await this.auditService.log(
      user.id,
      'USER_PASSWORD_RESET',
      undefined,
      undefined,
      { email: user.email },
    );

    return { success: true, message: 'Password has been reset successfully.' };
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: `${process.env.JWT_ACCESS_EXPIRES_IN || 900}s`,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: `${process.env.JWT_REFRESH_EXPIRES_IN || 604800}s`,
    });

    return { accessToken, refreshToken };
  }
}
