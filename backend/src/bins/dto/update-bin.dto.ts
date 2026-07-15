import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BinStatus, BinCondition, BinType } from '@prisma/client';

export class UpdateBinDto {
  @ApiPropertyOptional({ enum: BinType })
  @IsEnum(BinType)
  @IsOptional()
  type?: BinType;

  @ApiPropertyOptional({ enum: BinStatus })
  @IsEnum(BinStatus)
  @IsOptional()
  status?: BinStatus;

  @ApiPropertyOptional({ enum: BinCondition })
  @IsEnum(BinCondition)
  @IsOptional()
  condition?: BinCondition;
}
