import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateWardDto {
  @ApiProperty({ example: 5 })
  @IsInt({ message: 'Ward number must be an integer.' })
  @Min(1, { message: 'Ward number must be at least 1.' })
  @IsNotEmpty({ message: 'Ward number is required.' })
  number: number;

  @ApiProperty({ example: 'Downtown District' })
  @IsString({ message: 'Ward name must be a string.' })
  @IsNotEmpty({ message: 'Ward name is required.' })
  name: string;
}
