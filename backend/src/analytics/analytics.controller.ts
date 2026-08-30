import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('dashboard')
  getDashboardSummary() {
    return this.service.getExecutiveDashboardSummary();
  }

  @Get('command-center-data')
  getGISData(@Req() req: any) {
    const filter = req.query.filter || 'Overflow Bins';
    return this.service.getGISData(filter);
  }

  @Get('area-highlights')
  getAreaHighlights() {
    return this.service.getAreaHighlights();
  }

  @Get('kpis')
  getKPIs() {
    return this.service.getKPIMetrics();
  }

  @Get('heatmaps')
  getHeatmaps() {
    return this.service.getHeatmaps();
  }

  @Get('wards')
  getWardRankings() {
    return this.service.getWardRankings();
  }

  @Get('sustainability')
  getSustainability() {
    return this.service.getSustainabilityStats();
  }

  @Get('reports')
  getReports() {
    return this.service.getReportsList();
  }

  @Post('reports/generate')
  generateReport(@Body('reportType') type: string, @Req() req: any) {
    return this.service.generateReport(type ?? 'DAILY', req.user.id);
  }
}
