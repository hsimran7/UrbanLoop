import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
export class AIController {
  constructor(private readonly service: AIService) {}

  @Post('predict')
  predictBin(@Body('binId') binId: string) {
    return this.service.predictBinOverflow(binId);
  }

  @Get('recommendations')
  getRecommendations() {
    return this.service.getRecommendations();
  }

  @Post('recommendations/:id/approve')
  approveRecommendation(@Param('id') id: string, @Req() req: any) {
    return this.service.approveRecommendation(id, req.user.id);
  }

  @Post('optimize')
  optimizeRoute(@Body('routeId') routeId: string, @Req() req: any) {
    return this.service.optimizeRoute(routeId, req.user.id);
  }

  @Get('models')
  getModels() {
    return this.service.getActiveModels();
  }

  @Get('forecast')
  getForecast() {
    return this.service.getForecastData();
  }

  @Get('risks')
  getRisks() {
    return this.service.getRisksList();
  }

  @Post('copilot')
  copilotPrompt(@Body('prompt') prompt: string, @Req() req: any) {
    return this.service.copilotPrompt(prompt, req.user.id);
  }

  @Get('history')
  getHistory() {
    return this.service.getAIHistory();
  }

  @Get('executive-report')
  getExecutiveReport() {
    return this.service.getExecutiveReport();
  }

  @Get('worker-performance')
  getWorkerPerformance() {
    return this.service.getWorkerPerformanceStats();
  }

  @Get('bin-analysis')
  getBinAnalysis() {
    return this.service.getBinAnalysisStats();
  }

  @Get('graphs')
  getGraphs() {
    return this.service.getGraphData();
  }
}
