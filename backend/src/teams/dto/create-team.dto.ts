import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'Team Alpha' })
  @IsString()
  @IsNotEmpty({ message: 'Team name is required.' })
  name: string;

  @ApiProperty({ example: 'TEAM-A' })
  @IsString()
  @IsNotEmpty({ message: 'Team code is required.' })
  code: string;
}
