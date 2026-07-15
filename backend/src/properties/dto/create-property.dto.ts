import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsUUID } from 'class-validator';

export class CreatePropertyDto {
  @ApiProperty({ example: '123 Oak Street' })
  @IsString({ message: 'Address must be a string.' })
  @IsNotEmpty({ message: 'Address is required.' })
  address: string;

  @ApiProperty({ example: 37.7749 })
  @IsNumber({}, { message: 'Latitude must be a number.' })
  @IsNotEmpty({ message: 'Latitude is required.' })
  latitude: number;

  @ApiProperty({ example: -122.4194 })
  @IsNumber({}, { message: 'Longitude must be a number.' })
  @IsNotEmpty({ message: 'Longitude is required.' })
  longitude: number;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-g7h8...' })
  @IsUUID(undefined, { message: 'Area ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Area ID is required.' })
  areaId: string;
}
