import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType } from '@prisma/client';

export class CreateDepotDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsNotEmpty()
  latitude: number;

  @IsNumber()
  @IsNotEmpty()
  longitude: number;

  @IsNumber()
  @IsNotEmpty()
  vehicleCapacity: number;
}

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  vehicleCode: string;

  @IsString()
  @IsNotEmpty()
  registrationNumber: string;

  @IsEnum(VehicleType)
  @IsNotEmpty()
  vehicleType: VehicleType;

  @IsString()
  @IsNotEmpty()
  manufacturer: string;

  @IsString()
  @IsNotEmpty()
  model: string;

  @IsNumber()
  @IsNotEmpty()
  year: number;

  @IsNumber()
  @IsNotEmpty()
  capacityKg: number;

  @IsString()
  @IsNotEmpty()
  compartmentType: string;

  @IsString()
  @IsNotEmpty()
  fuelType: string;

  @IsString()
  @IsNotEmpty()
  depotId: string;
}

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @IsString()
  @IsNotEmpty()
  licenseExpiry: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  assignedDepotId?: string;
}

export class RouteStopDto {
  @IsNumber()
  stopOrder: number;

  @IsString()
  @IsOptional()
  propertyId?: string;

  @IsString()
  @IsOptional()
  collectionPointId?: string;
}

export class CreateRouteDto {
  @IsString()
  @IsNotEmpty()
  routeCode: string;

  @IsString()
  @IsNotEmpty()
  areaId: string;

  @IsNumber()
  expectedDistance: number;

  @IsNumber()
  estimatedDuration: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  stops: RouteStopDto[];
}

export class CreateDailyRouteAssignmentDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  routeId: string;

  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @IsString()
  @IsNotEmpty()
  driverId: string;

  @IsString()
  @IsNotEmpty()
  teamId: string;
}

export class SubmitInspectionDto {
  @IsBoolean()
  brakesPassed: boolean;

  @IsBoolean()
  tiresPassed: boolean;

  @IsBoolean()
  lightsPassed: boolean;

  @IsBoolean()
  hydraulicsPassed: boolean;

  @IsBoolean()
  fuelPassed: boolean;

  @IsBoolean()
  batteryPassed: boolean;

  @IsBoolean()
  cleanPassed: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SubmitTelemetryDto {
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  speed: number;

  @IsNumber()
  heading: number;

  @IsNumber()
  @IsOptional()
  altitude?: number;

  @IsNumber()
  @IsOptional()
  accuracy?: number;

  @IsBoolean()
  ignitionStatus: boolean;

  @IsString()
  @IsOptional()
  gpsSource?: string;
}

export class LogBreakdownDto {
  @IsString()
  @IsNotEmpty()
  issueType: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class LogFuelDto {
  @IsNumber()
  amountLitres: number;

  @IsNumber()
  cost: number;

  @IsNumber()
  odometerKm: number;
}

export class ScheduleMaintenanceDto {
  @IsString()
  @IsNotEmpty()
  serviceType: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  nextServiceDate: string;

  @IsNumber()
  @IsOptional()
  cost?: number;
}
