import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateAssignmentsDto {
  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsNotEmpty({ message: 'Date is required.' })
  date: Date;
}
