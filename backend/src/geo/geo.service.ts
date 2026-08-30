import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateWardDto } from './dto/create-ward.dto';
import { CreateAreaDto } from './dto/create-area.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class GeoService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async createCity(dto: CreateCityDto, userId: string, ip?: string, ua?: string) {
    const existing = await this.prisma.city.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException(`City with name "${dto.name}" already exists.`);
    }

    const city = await this.prisma.city.create({
      data: {
        name: dto.name.trim(),
        districtId: dto.districtId,
      },
    });

    await this.auditService.log(userId, 'CREATE_CITY', ip, ua, { cityId: city.id, name: city.name });
    return city;
  }

  async getStates() {
    return this.prisma.state.findMany({ orderBy: { name: 'asc' } });
  }

  async getDistrictsByState(stateId: string) {
    return this.prisma.district.findMany({ where: { stateId }, orderBy: { name: 'asc' } });
  }

  async getCitiesByDistrict(districtId: string) {
    return this.prisma.city.findMany({ where: { districtId }, orderBy: { name: 'asc' } });
  }

  async getCities() {
    return this.prisma.city.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createWard(cityId: string, dto: CreateWardDto, userId: string, ip?: string, ua?: string) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new NotFoundException('City not found.');
    }

    const existing = await this.prisma.ward.findUnique({
      where: {
        cityId_number: {
          cityId,
          number: dto.number,
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Ward number ${dto.number} already exists in this city.`);
    }

    const ward = await this.prisma.ward.create({
      data: {
        number: dto.number,
        name: dto.name.trim(),
        cityId,
      },
    });

    await this.auditService.log(userId, 'CREATE_WARD', ip, ua, {
      wardId: ward.id,
      cityId,
      name: ward.name,
      number: ward.number,
    });
    return ward;
  }

  async getWardsByCity(cityId: string) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new NotFoundException('City not found.');
    }
    return this.prisma.ward.findMany({
      where: { cityId },
      orderBy: { number: 'asc' },
    });
  }

  async createArea(wardId: string, dto: CreateAreaDto, userId: string, ip?: string, ua?: string) {
    const ward = await this.prisma.ward.findUnique({ where: { id: wardId } });
    if (!ward) {
      throw new NotFoundException('Ward not found.');
    }

    const existing = await this.prisma.area.findUnique({
      where: {
        wardId_name: {
          wardId,
          name: dto.name.trim(),
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Area with name "${dto.name}" already exists in this ward.`);
    }

    const area = await this.prisma.area.create({
      data: {
        name: dto.name.trim(),
        wardId,
      },
    });

    await this.auditService.log(userId, 'CREATE_AREA', ip, ua, {
      areaId: area.id,
      wardId,
      name: area.name,
    });
    return area;
  }

  async getAreasByWard(wardId: string) {
    const ward = await this.prisma.ward.findUnique({ where: { id: wardId } });
    if (!ward) {
      throw new NotFoundException('Ward not found.');
    }
    return this.prisma.area.findMany({
      where: { wardId },
      orderBy: { name: 'asc' },
    });
  }

  async getZonesByArea(areaId: string) {
    return this.prisma.serviceZone.findMany({
      where: { areaId },
      orderBy: { name: 'asc' },
    });
  }

  async getStreetsByZone(serviceZoneId: string) {
    return this.prisma.street.findMany({
      where: { serviceZoneId },
      orderBy: { name: 'asc' },
    });
  }

  async deleteCity(id: string, userId: string, ip?: string, ua?: string) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) {
      throw new NotFoundException('City not found.');
    }
    await this.prisma.city.delete({ where: { id } });
    await this.auditService.log(userId, 'DELETE_CITY', ip, ua, { cityId: id, name: city.name });
    return { success: true, message: 'City deleted successfully.' };
  }

  async deleteWard(id: string, userId: string, ip?: string, ua?: string) {
    const ward = await this.prisma.ward.findUnique({ where: { id } });
    if (!ward) {
      throw new NotFoundException('Ward not found.');
    }
    await this.prisma.ward.delete({ where: { id } });
    await this.auditService.log(userId, 'DELETE_WARD', ip, ua, {
      wardId: id,
      name: ward.name,
      number: ward.number,
    });
    return { success: true, message: 'Ward deleted successfully.' };
  }

  async deleteArea(id: string, userId: string, ip?: string, ua?: string) {
    const area = await this.prisma.area.findUnique({ where: { id } });
    if (!area) {
      throw new NotFoundException('Area not found.');
    }
    await this.prisma.area.delete({ where: { id } });
    await this.auditService.log(userId, 'DELETE_AREA', ip, ua, { areaId: id, name: area.name });
    return { success: true, message: 'Area deleted successfully.' };
  }
}
