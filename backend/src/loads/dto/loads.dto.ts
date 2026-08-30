import { IsString, IsNotEmpty, IsEnum, IsArray, IsNumber, IsOptional, Min } from 'class-validator';
import { BinType, WeighingMethod, ReceiptStatus, ProcessType } from '@prisma/client';

export class CreateLoadDto {
  @IsString()
  @IsNotEmpty()
  assignmentId: string;

  @IsEnum(BinType)
  @IsNotEmpty()
  wasteType: BinType;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  collectionEventIds: string[];
}

export class SealLoadDto {
  @IsString()
  @IsOptional()
  sealCode?: string;
}

export class DispatchLoadDto {
  @IsString()
  @IsNotEmpty()
  destinationFacilityId: string;
}

export class RecordWeighingDto {
  @IsNumber()
  @Min(0)
  grossWeightKg: number;

  @IsNumber()
  @Min(0)
  tareWeightKg: number;

  @IsEnum(WeighingMethod)
  @IsNotEmpty()
  weighingMethod: WeighingMethod;

  @IsString()
  @IsOptional()
  evidenceId?: string;
}

export class CreateReceiptDto {
  @IsEnum(ReceiptStatus)
  @IsNotEmpty()
  status: ReceiptStatus;

  @IsNumber()
  @Min(0)
  acceptedWeightKg: number;

  @IsNumber()
  @Min(0)
  rejectedWeightKg: number;

  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateProcessingDto {
  @IsEnum(ProcessType)
  @IsNotEmpty()
  processType: ProcessType;

  @IsNumber()
  @Min(0)
  inputWeightKg: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  outputWeightKg?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  residueWeightKg?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
