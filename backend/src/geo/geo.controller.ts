import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Ip,
  Headers,
} from '@nestjs/common';
import { GeoService } from './geo.service';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateWardDto } from './dto/create-ward.dto';
import { CreateAreaDto } from './dto/create-area.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('geo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('geo')
export class GeoController {
  constructor(private geoService: GeoService) {}

  @Post('cities')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Create a new city (Admin/Official only)' })
  async createCity(
    @Body() dto: CreateCityDto,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.geoService.createCity(dto, userId, ip, ua);
  }

  @Get('cities')
  @ApiOperation({ summary: 'Get list of all cities' })
  async getCities() {
    return this.geoService.getCities();
  }

  @Post('cities/:cityId/wards')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Create a new ward in a city (Admin/Official only)' })
  async createWard(
    @Param('cityId') cityId: string,
    @Body() dto: CreateWardDto,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.geoService.createWard(cityId, dto, userId, ip, ua);
  }

  @Get('cities/:cityId/wards')
  @ApiOperation({ summary: 'Get wards in a city' })
  async getWards(@Param('cityId') cityId: string) {
    return this.geoService.getWardsByCity(cityId);
  }

  @Post('wards/:wardId/areas')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Create a new area in a ward (Admin/Official only)' })
  async createArea(
    @Param('wardId') wardId: string,
    @Body() dto: CreateAreaDto,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.geoService.createArea(wardId, dto, userId, ip, ua);
  }

  @Get('wards/:wardId/areas')
  @ApiOperation({ summary: 'Get areas in a ward' })
  async getAreas(@Param('wardId') wardId: string) {
    return this.geoService.getAreasByWard(wardId);
  }

  @Delete('cities/:id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Delete a city (Admin/Official only)' })
  async deleteCity(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.geoService.deleteCity(id, userId, ip, ua);
  }

  @Delete('wards/:id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Delete a ward (Admin/Official only)' })
  async deleteWard(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.geoService.deleteWard(id, userId, ip, ua);
  }

  @Delete('areas/:id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Delete an area (Admin/Official only)' })
  async deleteArea(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.geoService.deleteArea(id, userId, ip, ua);
  }
}
