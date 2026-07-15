import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Ip,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ResourceOwnershipService } from '../auth/services/resource-ownership.service';
import { PropertyStatus, UserRole } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('properties')
export class PropertiesController {
  constructor(
    private propertiesService: PropertiesService,
    private ownershipService: ResourceOwnershipService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new property for verification' })
  async create(
    @Body() dto: CreatePropertyDto,
    @GetUser() user: any,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.propertiesService.create(dto, user.id, ip, ua);
  }

  @Get()
  @ApiOperation({ summary: 'List all properties (filtered by role)' })
  async findAll(@GetUser() user: any) {
    return this.propertiesService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a property (owner only)' })
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    await this.ownershipService.checkPropertyOwnership(id, user);
    return this.propertiesService.findOne(id);
  }

  @Patch(':id/verify')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Approve or reject property registration (Admin/Official only)' })
  async verify(
    @Param('id') id: string,
    @Body('status') status: PropertyStatus,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    if (!status || status === PropertyStatus.PENDING) {
      throw new BadRequestException('Please provide a valid review status: VERIFIED or REJECTED.');
    }
    return this.propertiesService.verifyProperty(id, status, adminId, ip, ua);
  }
}
