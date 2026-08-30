import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsArray, IsDateString } from 'class-validator';
import { FacilityType, BinType } from '@prisma/client';

export class CreateFacilityDto {
  @IsString()
  @IsNotEmpty()
  facilityCode: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(FacilityType)
  @IsNotEmpty()
  facilityType: FacilityType;

  @IsNumber()
  @IsNotEmpty()
  latitude: number;

  @IsNumber()
  @IsNotEmpty()
  longitude: number;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsNumber()
  @IsOptional()
  dailyCapacityKg?: number;

  @IsArray()
  @IsEnum(BinType, { each: true })
  @IsNotEmpty()
  acceptedWasteTypes: BinType[];
}

export class AssignStaffDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  role: string; // e.g. "MANAGER", "STAFF"

  @IsDateString()
  @IsNotEmpty()
  effectiveFrom: string;

  @IsDateString()
  @IsOptional()
  effectiveUntil?: string;
}
