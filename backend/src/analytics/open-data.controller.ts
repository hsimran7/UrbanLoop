import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('api/open')
export class OpenDataController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('wards')
  getWards() {
    return this.service.getOpenWards();
  }

  @Get('statistics')
  getStatistics() {
    return this.service.getOpenStatistics();
  }

  @Get('recycling')
  getRecycling() {
    return this.service.getSustainabilityStats();
  }

  @Get('heatmaps')
  getHeatmaps() {
    return this.service.getHeatmaps();
  }
}
