import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Ip,
  Headers,
} from '@nestjs/common';
import { BinsService } from './bins.service';
import { CreateBinDto } from './dto/create-bin.dto';
import { UpdateBinDto } from './dto/update-bin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ResourceOwnershipService } from '../auth/services/resource-ownership.service';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('bins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bins')
export class BinsController {
  constructor(
    private binsService: BinsService,
    private ownershipService: ResourceOwnershipService,
  ) {}

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Register a new waste bin (Admin/Official only)' })
  async create(
    @Body() dto: CreateBinDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.binsService.create(dto, adminId, ip, ua);
  }

  @Get()
  @ApiOperation({ summary: 'Get list of bins (filtered by role)' })
  async findAll(@GetUser() user: any) {
    return this.binsService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a bin' })
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    await this.ownershipService.checkBinOwnership(id, user);
    return this.binsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bin capacity status or physical condition' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBinDto,
    @GetUser() user: any,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    await this.ownershipService.checkBinOwnership(id, user);
    return this.binsService.update(id, dto, user.id, user.role, ip, ua);
  }

  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Delete a bin (Admin/Official only)' })
  async delete(
    @Param('id') id: string,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.binsService.delete(id, adminId, ip, ua);
  }
}
