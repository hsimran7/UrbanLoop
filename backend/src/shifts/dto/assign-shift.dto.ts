import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { WorkerShiftStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class AssignShiftDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsUUID(undefined, { message: 'Worker Profile ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Worker Profile ID is required.' })
  workerId: string;

  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsNotEmpty({ message: 'Work date is required.' })
  workDate: Date;

  @ApiProperty({ enum: WorkerShiftStatus, example: WorkerShiftStatus.ASSIGNED })
  @IsEnum(WorkerShiftStatus, { message: 'Status must be a valid WorkerShiftStatus.' })
  @IsNotEmpty({ message: 'Status is required.' })
  status: WorkerShiftStatus;
}
