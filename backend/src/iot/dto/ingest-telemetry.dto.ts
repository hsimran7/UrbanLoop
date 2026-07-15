import { IsInt, IsOptional, IsString, Min, Max, IsISO8601, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IngestTelemetryDto {
  @ApiProperty({ description: 'Fill level percentage [0-100]', example: 72 })
  @IsInt()
  @Min(0)
  @Max(100)
  fillLevel: number;

  @ApiPropertyOptional({ description: 'Battery level percentage [0-100]', example: 85 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional({ description: 'Temperature in Celsius', example: 32.5 })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ description: 'Signal strength in dBm', example: -65 })
  @IsOptional()
  @IsInt()
  signalStrength?: number;

  @ApiProperty({ description: 'ISO 8601 UTC timestamp when the reading was taken', example: '2025-01-15T10:30:00Z' })
  @IsISO8601()
  recordedAt: string;

  @ApiPropertyOptional({ description: 'Unique event ID for idempotency (recommended)', example: 'evt_abc123' })
  @IsOptional()
  @IsString()
  eventId?: string;
}
