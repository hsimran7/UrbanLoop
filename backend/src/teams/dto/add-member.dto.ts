import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { TeamMemberRole } from '@prisma/client';
import { Type } from 'class-transformer';

export class AddMemberDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsUUID(undefined, { message: 'Worker Profile ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Worker Profile ID is required.' })
  workerId: string;

  @ApiProperty({ enum: TeamMemberRole, example: TeamMemberRole.COLLECTOR })
  @IsEnum(TeamMemberRole, { message: 'Role must be a valid TeamMemberRole.' })
  @IsNotEmpty({ message: 'Role is required.' })
  role: TeamMemberRole;

  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsNotEmpty({ message: 'Effective from date is required.' })
  effectiveFrom: Date;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @Type(() => Date)
  @IsOptional()
  effectiveUntil?: Date;
}
