import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCityDto {
  @ApiProperty({ example: 'Metroville' })
  @IsString({ message: 'City name must be a string.' })
  @IsNotEmpty({ message: 'City name is required.' })
  name: string;

  @ApiProperty({ example: 'dist-uuid-123' })
  @IsString({ message: 'District ID must be a string.' })
  @IsNotEmpty({ message: 'District ID is required.' })
  districtId: string;
}
