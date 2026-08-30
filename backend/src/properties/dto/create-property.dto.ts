import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsUUID, IsOptional } from 'class-validator';

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

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-g7h8...' })
  @IsUUID(undefined, { message: 'Area ID must be a valid UUID.' })
  @IsOptional()
  areaId?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsString()
  @IsOptional()
  stateName?: string;

  @ApiPropertyOptional({ example: 'Mumbai' })
  @IsString()
  @IsOptional()
  cityName?: string;

  @ApiPropertyOptional({ example: 'Colaba Central' })
  @IsString()
  @IsOptional()
  areaName?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  wardNumber?: number;

  @ApiPropertyOptional({ example: 'Colaba Ward' })
  @IsString()
  @IsOptional()
  wardName?: string;
}
