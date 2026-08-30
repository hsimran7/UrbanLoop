import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, Matches, MinLength, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'citizen@urbanloop.gov' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @IsNotEmpty({ message: 'Email is required.' })
  email: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsNotEmpty({ message: 'Password is required.' })
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.',
    },
  )
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  name: string;

  @ApiProperty({ example: '+919999999999' })
  @IsString()
  @IsNotEmpty({ message: 'Phone is required.' })
  phone: string;

  @ApiProperty({ example: 'CITIZEN' })
  @IsEnum(UserRole, { message: 'Role must be CITIZEN or WORKER.' })
  @IsNotEmpty({ message: 'Role is required.' })
  role: UserRole;

  @ApiProperty({ example: 'EMP-123', required: false })
  @IsString()
  @IsOptional()
  employeeCode?: string;
}
