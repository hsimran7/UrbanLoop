import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, generateToken, hashToken } from '../common/utils/crypto.util';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async createCitizen(email: string, passwordPlain: string) {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await hashPassword(passwordPlain);
    const rawVerificationToken = generateToken();
    const verificationTokenHash = hashToken(rawVerificationToken);
    
    // Expires in 24 hours
    const verificationTokenExpires = new Date();
    verificationTokenExpires.setHours(verificationTokenExpires.getHours() + 24);

    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        role: UserRole.CITIZEN,
        status: UserStatus.PENDING,
        emailVerified: false,
        verificationTokenHash,
        verificationTokenExpires,
      },
    });

    // Simulated email dispatch - logged to console
    console.log(`\n==================================================`);
    console.log(`[EMAIL SIMULATION] Verification Email sent to ${email}`);
    console.log(`Token Link: http://localhost:3000/verify-email?token=${rawVerificationToken}`);
    console.log(`==================================================\n`);

    const { passwordHash: _, ...result } = user;
    return result;
  }

  async createAdminOrWorker(email: string, passwordPlain: string, role: UserRole) {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await hashPassword(passwordPlain);

    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });

    const { passwordHash: _, ...result } = user;
    return result;
  }
}
