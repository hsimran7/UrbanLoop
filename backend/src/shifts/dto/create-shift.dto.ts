import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

export class CreateShiftDto {
  @ApiProperty({ example: 'Morning Shift' })
  @IsString()
  @IsNotEmpty({ message: 'Shift name is required.' })
  name: string;

  @ApiProperty({ example: '06:00' })
  @IsString()
  @IsNotEmpty({ message: 'Start time is required.' })
  @Matches(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: 'Start time must be in HH:MM format.' })
  startTime: string;

  @ApiProperty({ example: '14:00' })
  @IsString()
  @IsNotEmpty({ message: 'End time is required.' })
  @Matches(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: 'End time must be in HH:MM format.' })
  endTime: string;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(0)
  @IsNotEmpty({ message: 'Cutoff minutes is required.' })
  cutoffMinutes: number;
}
