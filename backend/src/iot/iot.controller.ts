import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IoTService } from './iot.service';
import { IngestTelemetryDto } from './dto/ingest-telemetry.dto';
import { ProvisionDeviceDto } from './dto/provision-device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('iot')
@Controller('iot')
export class IoTController {
  constructor(private iotService: IoTService) {}

  // ─── Machine-to-Machine Telemetry Ingestion ──────────────────────────────────

  /**
   * POST /api/v1/iot/telemetry
   * Machine-authenticated endpoint. NOT publicly accessible.
   * Rate-limited to 60 readings per minute per device.
   */
  @Post('telemetry')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Ingest bin telemetry (machine-authenticated)',
    description:
      'M2M endpoint. Requires X-Device-Id (device identifier) and X-Device-Key headers. ' +
      'Do NOT expose or log X-Device-Key. HTTPS required in production.',
  })
  @ApiHeader({ name: 'X-Device-Id', description: 'Device identifier (deviceIdentifier field)', required: true })
  @ApiHeader({ name: 'X-Device-Key', description: 'Raw device secret key (returned once at provisioning)', required: true })
  async ingestTelemetry(
    @Headers('x-device-id') deviceId: string,
    @Headers('x-device-key') deviceKey: string,
    @Body() dto: IngestTelemetryDto,
  ) {
    return this.iotService.ingestTelemetry(deviceId, deviceKey, dto);
  }

  // ─── Admin Device Management ─────────────────────────────────────────────────

  @Post('devices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Provision a new IoT device for a bin (Admin/Official)' })
  async provisionDevice(@Body() dto: ProvisionDeviceDto) {
    return this.iotService.provisionDevice(dto);
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiQuery({ name: 'binId', required: false, description: 'Filter by bin ID' })
  @ApiOperation({ summary: 'List IoT devices (Admin/Official/Supervisor)' })
  async listDevices(@Query('binId') binId?: string) {
    return this.iotService.listDevices(binId);
  }

  @Patch('devices/:id/rotate-key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rotate device credentials (invalidates old key immediately)' })
  async rotateCredentials(@Param('id') id: string) {
    return this.iotService.rotateCredentials(id);
  }

  @Patch('devices/:id/disable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Temporarily disable a device (no telemetry accepted)' })
  async disableDevice(@Param('id') id: string) {
    return this.iotService.disableDevice(id);
  }

  @Patch('devices/:id/enable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Re-enable a disabled device' })
  async enableDevice(@Param('id') id: string) {
    return this.iotService.enableDevice(id);
  }

  @Delete('devices/:id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently revoke a device (SYSTEM_ADMIN only, irreversible)' })
  async revokeDevice(@Param('id') id: string) {
    return this.iotService.revokeDevice(id);
  }
}
