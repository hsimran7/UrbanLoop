import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { BinType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateResponsibilityDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsUUID(undefined, { message: 'Team ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Team ID is required.' })
  teamId: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsUUID(undefined, { message: 'Service Zone ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Service Zone ID is required.' })
  serviceZoneId: string;

  @ApiPropertyOptional({ enum: BinType, example: BinType.DRY })
  @IsEnum(BinType, { message: 'Waste type must be a valid BinType.' })
  @IsOptional()
  wasteType?: BinType;

  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsNotEmpty({ message: 'Effective from date is required.' })
  effectiveFrom: Date;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @Type(() => Date)
  @IsOptional()
  effectiveUntil?: Date;
}
