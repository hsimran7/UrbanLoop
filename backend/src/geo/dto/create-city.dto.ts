import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCityDto {
  @ApiProperty({ example: 'Metroville' })
  @IsString({ message: 'City name must be a string.' })
  @IsNotEmpty({ message: 'City name is required.' })
  name: string;

  @ApiProperty({ example: 'California' })
  @IsString({ message: 'State name must be a string.' })
  @IsNotEmpty({ message: 'State name is required.' })
  state: string;
}
