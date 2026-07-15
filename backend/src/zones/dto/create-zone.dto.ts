import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateZoneDto {
  @ApiProperty({ example: 'Zone A1' })
  @IsString()
  @IsNotEmpty({ message: 'Zone name is required.' })
  name: string;

  @ApiProperty({ example: 'ZONE-A1' })
  @IsString()
  @IsNotEmpty({ message: 'Zone code is required.' })
  code: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsUUID(undefined, { message: 'Area ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Area ID is required.' })
  areaId: string;
}
