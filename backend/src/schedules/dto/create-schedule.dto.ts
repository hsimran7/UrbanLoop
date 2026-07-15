import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { BinType, DayOfWeek } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateScheduleDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-g7h8...' })
  @IsUUID(undefined, { message: 'Area ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Area ID is required.' })
  areaId: string;

  @ApiProperty({ enum: BinType, example: BinType.DRY })
  @IsEnum(BinType, { message: 'Waste type must be a valid BinType.' })
  @IsNotEmpty({ message: 'Waste type is required.' })
  wasteType: BinType;

  @ApiProperty({ enum: DayOfWeek, example: DayOfWeek.TUESDAY })
  @IsEnum(DayOfWeek, { message: 'Day of week must be a valid DayOfWeek.' })
  @IsNotEmpty({ message: 'Day of week is required.' })
  dayOfWeek: DayOfWeek;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: 'Start time must be in HH:MM format.' })
  startTime: string;

  @ApiProperty({ example: '11:00' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: 'End time must be in HH:MM format.' })
  endTime: string;

  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsNotEmpty()
  effectiveFrom: Date;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @Type(() => Date)
  @IsOptional()
  effectiveUntil?: Date;
}
