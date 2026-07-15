import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { BinType, ExceptionType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateExceptionDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-g7h8...' })
  @IsUUID(undefined, { message: 'Area ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Area ID is required.' })
  areaId: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-g7h8...' })
  @IsUUID(undefined, { message: 'Schedule ID must be a valid UUID.' })
  @IsOptional()
  scheduleId?: string;

  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsNotEmpty()
  originalDate: Date;

  @ApiPropertyOptional({ example: '2026-07-16T00:00:00.000Z' })
  @Type(() => Date)
  @IsOptional()
  replacementDate?: Date;

  @ApiPropertyOptional({ example: '14:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: 'Replacement start time must be in HH:MM format.' })
  replacementStartTime?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: 'Replacement end time must be in HH:MM format.' })
  replacementEndTime?: string;

  @ApiProperty({ example: 'Municipal Holiday' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ enum: ExceptionType, example: ExceptionType.CANCELLED })
  @IsEnum(ExceptionType)
  @IsNotEmpty()
  type: ExceptionType;

  @ApiPropertyOptional({ enum: BinType })
  @IsEnum(BinType)
  @IsOptional()
  wasteType?: BinType;
}
