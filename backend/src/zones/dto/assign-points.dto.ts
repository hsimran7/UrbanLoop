import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsUUID } from 'class-validator';

export class AssignPointsDto {
  @ApiProperty({ example: ['a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'] })
  @IsArray()
  @IsUUID(undefined, { each: true, message: 'Each item must be a valid UUID.' })
  @IsNotEmpty({ message: 'Collection point IDs array is required.' })
  collectionPointIds: string[];
}
