import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MetaService } from './meta.service';

@ApiTags('Metadata & Enums')
@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('enums')
  @ApiOperation({ summary: 'Get all database ENUM values dynamically' })
  getEnums() {
    return this.metaService.getAllEnums();
  }
}
