import { Controller, Get, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, UserStatus } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@GetUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Get('citizens')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'List all citizens with search and status filter (Admin/Official only)' })
  async listCitizens(
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.listCitizens(search, status);
  }

  @Patch(':id/status')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Update user account status (e.g. suspend citizen) (Admin/Official only)' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: UserStatus,
  ) {
    return this.usersService.updateUserStatus(id, status);
  }
}
