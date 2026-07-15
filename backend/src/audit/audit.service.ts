import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    userId: string | null,
    action: string,
    ipAddress?: string,
    userAgent?: string,
    details?: any,
  ) {
    try {
      const detailsStr = details ? JSON.stringify(details) : null;
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          ipAddress,
          userAgent,
          details: detailsStr,
        },
      });
    } catch (err) {
      console.error('Failed to create audit log:', err);
    }
  }
}
