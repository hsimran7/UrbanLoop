import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('status')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'API Root and health check status' })
  getSystemStatus() {
    return {
      status: 'online',
      service: 'UrbanLoop Smart Waste Grid API',
      version: '1.0.0',
      timestamp: new Date(),
      docs: '/api/docs',
    };
  }
}
