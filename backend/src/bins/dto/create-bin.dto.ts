import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { BinType } from '@prisma/client';

export class CreateBinDto {
  @ApiProperty({ enum: BinType, example: BinType.E_WASTE })
  @IsEnum(BinType, { message: 'Type must be a valid BinType value (DRY, WET, E_WASTE, OTHER).' })
  @IsNotEmpty({ message: 'Bin type is required.' })
  type: BinType;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-g7h8...' })
  @IsUUID(undefined, { message: 'Collection Point ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Collection Point ID is required.' })
  collectionPointId: string;
}
