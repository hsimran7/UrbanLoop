import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { TargetStatus } from '@prisma/client';

export class VerifyBinDto {
  @ApiProperty({ example: 'UL-BIN-DRY-ABC123' })
  @IsNotEmpty()
  @IsString()
  qrCodeId: string;
}

export class CollectTargetDto {
  @ApiProperty({ example: 'UL-BIN-DRY-ABC123' })
  @IsNotEmpty()
  @IsString()
  qrCodeId: string;

  @ApiProperty({ example: 'evt-123456789' })
  @IsNotEmpty()
  @IsString()
  clientEventId: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  evidenceId?: string;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  locationAccuracy?: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MissTargetDto {
  @ApiProperty({ example: 'ACCESS_BLOCKED' })
  @IsNotEmpty()
  @IsString()
  reasonCode: string;

  @ApiProperty({ example: 'evt-123456789' })
  @IsNotEmpty()
  @IsString()
  clientEventId: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  evidenceId?: string;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  locationAccuracy?: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SkipTargetDto {
  @ApiProperty({ example: 'BIN_ALREADY_EMPTY' })
  @IsNotEmpty()
  @IsString()
  reasonCode: string;

  @ApiProperty({ example: 'evt-123456789' })
  @IsNotEmpty()
  @IsString()
  clientEventId: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  evidenceId?: string;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  locationAccuracy?: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CorrectTargetDto {
  @ApiProperty({ example: 'COLLECTED', enum: TargetStatus })
  @IsNotEmpty()
  @IsEnum(TargetStatus)
  correctedStatus: TargetStatus;

  @ApiProperty({ example: 'Worker missed this by mistake.' })
  @IsNotEmpty()
  @IsString()
  correctionReason: string;
}
