import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateWorkerDto {
  @ApiProperty({ example: 'worker1@urbanloop.com' })
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty({ message: 'Email is required.' })
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  @Length(8, 100, { message: 'Password must be at least 8 characters long.' })
  password: string;

  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @IsNotEmpty({ message: 'Employee code is required.' })
  employeeCode: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsString()
  @IsOptional()
  phone?: string;
}
