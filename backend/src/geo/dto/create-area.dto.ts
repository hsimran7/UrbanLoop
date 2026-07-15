import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAreaDto {
  @ApiProperty({ example: 'Market Plaza' })
  @IsString({ message: 'Area name must be a string.' })
  @IsNotEmpty({ message: 'Area name is required.' })
  name: string;
}
