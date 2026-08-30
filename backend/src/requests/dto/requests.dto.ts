import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, Min, Max, IsBoolean } from 'class-validator';
import { ServiceRequestPriority, CommentVisibility, ServiceRequestSource } from '@prisma/client';

export class CreateServiceRequestDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  areaId: string;

  @IsString()
  @IsOptional()
  propertyId?: string;

  @IsString()
  @IsOptional()
  collectionPointId?: string;

  @IsString()
  @IsOptional()
  binId?: string;

  @IsString()
  @IsOptional()
  collectionEventId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  addressText?: string;

  @IsString()
  @IsOptional()
  evidenceId?: string;

  @IsBoolean()
  @IsOptional()
  ignoreDuplicateWarning?: boolean;

  @IsEnum(ServiceRequestSource)
  @IsOptional()
  source?: ServiceRequestSource;

  @IsString()
  @IsOptional()
  deduplicationKey?: string;
}

export class TriageRequestDto {
  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsEnum(ServiceRequestPriority)
  @IsOptional()
  priority?: ServiceRequestPriority;
}

export class AssignRequestDto {
  @IsString()
  @IsOptional()
  assignedDepartmentId?: string;

  @IsString()
  @IsOptional()
  assignedTeamId?: string;

  @IsString()
  @IsOptional()
  assignedUserId?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class RequestInformationDto {
  @IsString()
  @IsNotEmpty()
  notes: string;
}

export class ProvideInformationDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  evidenceId?: string;
}

export class ResolveRequestDto {
  @IsString()
  @IsNotEmpty()
  resolutionCode: string;

  @IsString()
  @IsNotEmpty()
  resolutionSummary: string;

  @IsString()
  @IsOptional()
  evidenceId?: string;
}

export class ReopenRequestDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class SubmitFeedbackDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsOptional()
  comment?: string;
}

export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(CommentVisibility)
  @IsNotEmpty()
  visibility: CommentVisibility;
}
