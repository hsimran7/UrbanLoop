import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProvisionDeviceDto {
  @ApiProperty({ description: 'UUID of the bin to attach this device to' })
  @IsUUID()
  binId: string;

  @ApiProperty({ description: 'Unique human-readable device identifier (e.g. serial number)' })
  @IsString()
  @IsNotEmpty()
  deviceIdentifier: string;
}
