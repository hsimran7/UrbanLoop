import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('citizen-schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('citizen/schedules')
export class CitizenScheduleController {
  constructor(private schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'Get waste collection schedule occurrences for verified citizen properties' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date string, e.g. YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date string, e.g. YYYY-MM-DD' })
  async getSchedules(
    @GetUser('id') userId: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ) {
    const start = startDateStr ? new Date(startDateStr) : new Date();
    const end = endDateStr ? new Date(endDateStr) : new Date();
    
    if (!startDateStr && !endDateStr) {
      end.setDate(end.getDate() + 7);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date parameters.');
    }

    return this.schedulesService.getCitizenSchedules(userId, start, end);
  }
}
