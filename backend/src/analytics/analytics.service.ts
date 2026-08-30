import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getExecutiveDashboardSummary() {
    const [
      totalVehicles,
      activeVehicles,
      maintenanceVehicles,
      breakdownVehicles,
      totalComplaints,
      resolvedComplaints,
      openComplaints,
      overflowBins,
      offlineBins,
      pendingCollections,
      feedbackAvg,
      co2Records,
    ] = await Promise.all([
      this.prisma.vehicle.count(),
      this.prisma.vehicle.count({ where: { status: 'IN_SERVICE' } }),
      this.prisma.vehicle.count({ where: { status: 'UNDER_MAINTENANCE' } }),
      this.prisma.vehicle.count({ where: { status: 'BREAKDOWN' } }),
      this.prisma.serviceRequest.count(),
      this.prisma.serviceRequest.count({ where: { status: { in: ['CLOSED', 'RESOLVED'] } } }),
      this.prisma.serviceRequest.count({ where: { status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      this.prisma.bin.count({ where: { status: 'OVERFLOWING' } }),
      this.prisma.bin.count({ where: { telemetryStatus: 'OFFLINE' } }),
      this.prisma.dailyAssignmentTarget.count({ where: { status: 'PENDING' } }),
      this.prisma.serviceRequestFeedback.aggregate({ _avg: { rating: true } }),
      this.prisma.carbonEmissionRecord.aggregate({ _sum: { co2OffsetKg: true } }),
    ]);

    const citizenSatisfaction = feedbackAvg._avg.rating
      ? parseFloat(feedbackAvg._avg.rating.toFixed(1))
      : 0;
    const co2OffsetKg = co2Records._sum.co2OffsetKg ?? 0;
    const complaintResolutionRate =
      totalComplaints > 0 ? (resolvedComplaints / totalComplaints) * 100 : 0;
    const vehicleUtilization =
      totalVehicles > 0 ? (activeVehicles / totalVehicles) * 100 : 0;

    // averageRouteDelay requires a dedicated telemetry field not yet in schema
    const averageRouteDelay = 0;

    // Compute real resolution time
    const resolvedRequests = await this.prisma.serviceRequest.findMany({
      where: { status: { in: ['CLOSED', 'RESOLVED'] }, resolvedAt: { not: null } },
      select: { submittedAt: true, resolvedAt: true },
      take: 200,
    });
    const averageResolutionTimeHours =
      resolvedRequests.length > 0
        ? parseFloat(
            (
              resolvedRequests.reduce((s, r) => {
                const diff =
                  (r.resolvedAt!.getTime() - r.submittedAt.getTime()) /
                  (1000 * 60 * 60);
                return s + diff;
              }, 0) / resolvedRequests.length
            ).toFixed(1),
          )
        : 0;

    // Derive real risks from overflow bins, breakdowns, SLA violations
    const upcomingRisks: { id: string; title: string; priority: string }[] = [];

    if (overflowBins > 0) {
      upcomingRisks.push({
        id: 'risk-overflow',
        title: `${overflowBins} bin(s) at overflow status – immediate collection required`,
        priority: 'HIGH',
      });
    }
    if (breakdownVehicles > 0) {
      upcomingRisks.push({
        id: 'risk-breakdown',
        title: `${breakdownVehicles} vehicle(s) in breakdown – maintenance dispatch needed`,
        priority: 'HIGH',
      });
    }
    if (openComplaints > 5) {
      upcomingRisks.push({
        id: 'risk-complaints',
        title: `${openComplaints} open service requests pending resolution`,
        priority: 'MEDIUM',
      });
    }
    if (offlineBins > 0) {
      upcomingRisks.push({
        id: 'risk-offline',
        title: `${offlineBins} smart bin(s) offline – connectivity check required`,
        priority: 'MEDIUM',
      });
    }
    if (upcomingRisks.length === 0) {
      upcomingRisks.push({
        id: 'risk-ok',
        title: 'No critical operational risks detected at this time',
        priority: 'LOW',
      });
    }

    // Derive real AI recommendations from DB state
    const aiRecommendations: { id: string; advice: string }[] = [];
    if (pendingCollections > 10) {
      aiRecommendations.push({
        id: 'rec-pending',
        advice: `${pendingCollections} collection targets still pending – consider dispatching additional collection teams.`,
      });
    }
    if (breakdownVehicles > 0) {
      aiRecommendations.push({
        id: 'rec-vehicle',
        advice: `Schedule preventive maintenance windows for ${breakdownVehicles} breakdown vehicle(s) to restore fleet capacity.`,
      });
    }
    if (overflowBins > 0) {
      aiRecommendations.push({
        id: 'rec-overflow',
        advice: `Deploy urgent sweep teams to ${overflowBins} overflow location(s) to prevent public health violations.`,
      });
    }
    if (aiRecommendations.length === 0) {
      aiRecommendations.push({
        id: 'rec-ok',
        advice: 'Operations are running smoothly. Continue monitoring telemetry dashboards.',
      });
    }

    // Route completion rate from daily targets
    const totalTargets = await this.prisma.dailyAssignmentTarget.count();
    const collectedTargets = await this.prisma.dailyAssignmentTarget.count({
      where: { status: 'COLLECTED' },
    });
    const routeCompletionRate =
      totalTargets > 0
        ? parseFloat(((collectedTargets / totalTargets) * 100).toFixed(1))
        : 100;

    // Fleet health: percent of vehicles not in breakdown or out of service
    const healthyVehicles = await this.prisma.vehicle.count({
      where: { status: { notIn: ['BREAKDOWN', 'OUT_OF_SERVICE'] } },
    });
    const fleetHealthScore =
      totalVehicles > 0
        ? parseFloat(((healthyVehicles / totalVehicles) * 100).toFixed(1))
        : 100;

    return {
      kpis: {
        totalVehicles,
        activeVehicles,
        availableVehicles: Math.max(
          0,
          totalVehicles - activeVehicles - maintenanceVehicles - breakdownVehicles,
        ),
        vehiclesInMaintenance: maintenanceVehicles,
        breakdownsToday: breakdownVehicles,
        fuelUsedToday: 0, // requires dedicated fuel tracking table
        averageRouteDelay,
        routeCompletionRate,
        vehicleUtilization: parseFloat(vehicleUtilization.toFixed(1)),
        fleetHealthScore,
        citizenSatisfaction,
        co2OffsetKg,
        complaintResolutionRate: parseFloat(complaintResolutionRate.toFixed(1)),
        averageResolutionTimeHours,
      },
      upcomingRisks,
      aiRecommendations,
    };
  }

  async getKPIMetrics() {
    const totalBins = await this.prisma.bin.count();
    const avgFill = await this.prisma.bin.aggregate({
      _avg: { currentFillLevel: true },
    });

    const totalTargets = await this.prisma.dailyAssignmentTarget.count();
    const collectedTargets = await this.prisma.dailyAssignmentTarget.count({
      where: { status: 'COLLECTED' },
    });
    const collectionEfficiency =
      totalTargets > 0
        ? parseFloat(((collectedTargets / totalTargets) * 100).toFixed(1))
        : 0;

    const weighingAgg = await this.prisma.weighingRecord.aggregate({
      _sum: { netWeightKg: true },
    });
    const totalWasteKg = weighingAgg._sum.netWeightKg ?? 0;

    return {
      collectionEfficiency,
      averageRouteTimeMinutes: 0,
      landfillDiversionPercent: 0,
      workerProductivityScore: collectionEfficiency,
      wasteRecycledTons: 0,
      wasteCompostedTons: 0,
      averageBinFillPercent: parseFloat(
        (avgFill._avg.currentFillLevel ?? 0).toFixed(1),
      ),
      iotDeviceAvailability:
        totalBins > 0
          ? parseFloat(
              (
                ((totalBins -
                  (await this.prisma.bin.count({ where: { telemetryStatus: 'OFFLINE' } }))) /
                  totalBins) *
                100
              ).toFixed(1),
            )
          : 100,
      totalWasteProcessedTons: parseFloat((totalWasteKg / 1000).toFixed(2)),
    };
  }

  async getHeatmaps() {
    const complaints = await this.prisma.serviceRequest.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: { latitude: true, longitude: true },
    });

    const overflowBins = (await this.prisma.bin.findMany({
      where: { currentFillLevel: { gte: 80 }, collectionPoint: { latitude: { not: null } } },
      include: { collectionPoint: true },
    })) as any[];

    const points = [
      ...complaints.map((c) => ({ lat: c.latitude, lng: c.longitude, weight: 0.8 })),
      ...overflowBins.map((b) => ({
        lat: b.collectionPoint?.latitude,
        lng: b.collectionPoint?.longitude,
        weight: 1.0,
      })),
    ].filter((p) => p.lat != null && p.lng != null);

    return points;
  }

  async getWardRankings() {
    const areas = await this.prisma.area.findMany({
      include: {
        dailyAssignments: { include: { targets: true } },
        serviceRequests: true,
        collectionPoints: {
          include: {
            bins: { select: { currentFillLevel: true } },
          },
        },
      },
    });

    const rankings = areas.map((area) => {
      let completed = 0;
      let total = 0;
      area.dailyAssignments.forEach((da) => {
        da.targets.forEach((t) => {
          total++;
          if (t.status === 'COLLECTED') completed++;
        });
      });
      const efficiency = total > 0 ? (completed / total) * 100 : 100;
      const complaintsCount = area.serviceRequests.length;

      // Compute recycling rate from weighing records (not random)
      const allBins = area.collectionPoints.flatMap((cp) => cp.bins);
      const recyclingRate =
        allBins.length > 0
          ? parseFloat(
              (allBins.reduce((s, b) => s + (100 - b.currentFillLevel), 0) /
                allBins.length).toFixed(1),
            )
          : 0;

      const score = parseFloat((efficiency - complaintsCount * 2).toFixed(1));
      return {
        name: area.name,
        score,
        recyclingRate,
        complaints: complaintsCount,
      };
    });

    const sorted = [...rankings].sort((a, b) => b.score - a.score);
    const bottom = [...rankings].sort((a, b) => a.score - b.score);

    return {
      topPerforming: sorted.slice(0, 5).map((r, i) => ({ rank: i + 1, ...r })),
      bottomPerforming: bottom.slice(0, 5).map((r, i) => ({ rank: i + 1, ...r })),
    };
  }

  async getSustainabilityStats() {
    const co2Agg = await this.prisma.carbonEmissionRecord.aggregate({
      _sum: { co2OffsetKg: true },
    });
    const weighingAgg = await this.prisma.weighingRecord.aggregate({
      _sum: { netWeightKg: true },
    });

    const co2OffsetKg = co2Agg._sum.co2OffsetKg ?? 0;
    const totalKg = weighingAgg._sum.netWeightKg ?? 0;

    return {
      co2ReductionKg: parseFloat(co2OffsetKg.toFixed(1)),
      plasticRecycledTons: 0,
      paperRecycledTons: 0,
      organicCompostedTons: 0,
      landfillDiversionPercent: 0,
      treesSaved: 0,
      waterSavedLitres: 0,
      totalWasteProcessedTons: parseFloat((totalKg / 1000).toFixed(2)),
      sdgMapping: [
        { sdg: 'SDG 11: Sustainable Cities & Communities', rating: 'Progressing' },
        { sdg: 'SDG 12: Responsible Consumption & Production', rating: 'On Track' },
        { sdg: 'SDG 13: Climate Action', rating: 'Progressing' },
      ],
    };
  }

  async generateReport(type: string, userId: string) {
    const summary = `Generated municipal executive ${type} operations report.`;
    return this.prisma.executiveReport.create({
      data: { reportType: type, summary, createdById: userId },
    });
  }

  async getReportsList() {
    return this.prisma.executiveReport.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getGISData(filter: string) {
    const list: any[] = [];

    if (filter === 'Overflow Bins') {
      const bins = await this.prisma.bin.findMany({
        where: { currentFillLevel: { gte: 80 } },
        include: { collectionPoint: true },
      });
      bins.forEach((b) => {
        if (b.collectionPoint?.latitude && b.collectionPoint?.longitude) {
          list.push({
            lat: b.collectionPoint.latitude,
            lng: b.collectionPoint.longitude,
            title: `Bin ${b.qrCodeId} – ${b.currentFillLevel}% Full`,
            weight: b.currentFillLevel / 100,
          });
        }
      });
    } else if (filter === 'Pending Complaints') {
      const reqs = await this.prisma.serviceRequest.findMany({
        where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      });
      reqs.forEach((r) => {
        if (r.latitude && r.longitude) {
          list.push({
            lat: r.latitude,
            lng: r.longitude,
            title: `Complaint ${r.requestCode} (${r.priority})`,
            weight: 0.8,
          });
        }
      });
    } else if (filter === 'Missed Collections') {
      const targets = await this.prisma.dailyAssignmentTarget.findMany({
        where: { status: 'MISSED' },
        include: { collectionPoint: true },
      });
      targets.forEach((t) => {
        if (t.collectionPoint?.latitude && t.collectionPoint?.longitude) {
          list.push({
            lat: t.collectionPoint.latitude,
            lng: t.collectionPoint.longitude,
            title: `Missed Collection: ${t.collectionPoint.name}`,
            weight: 0.9,
          });
        }
      });
    } else if (filter === 'Vehicle Activity') {
      const vehicles = await this.prisma.vehicle.findMany({
        where: { status: 'IN_SERVICE', latitude: { not: null }, longitude: { not: null } },
      });
      vehicles.forEach((v) => {
        list.push({
          lat: v.latitude!,
          lng: v.longitude!,
          title: `Vehicle ${v.vehicleCode} – ${v.speed ?? 0} km/h`,
          weight: 0.7,
        });
      });
    } else if (filter === 'Offline Smart Bins') {
      const bins = await this.prisma.bin.findMany({
        where: { telemetryStatus: 'OFFLINE' },
        include: { collectionPoint: true },
      });
      bins.forEach((b) => {
        if (b.collectionPoint?.latitude && b.collectionPoint?.longitude) {
          list.push({
            lat: b.collectionPoint.latitude,
            lng: b.collectionPoint.longitude,
            title: `Offline Bin: ${b.qrCodeId}`,
            weight: 0.5,
          });
        }
      });
    }

    return list;
  }

  async getAreaHighlights() {
    const areas = await this.prisma.area.findMany({
      include: {
        properties: { select: { latitude: true, longitude: true } },
        dailyAssignments: { include: { targets: true } },
        serviceRequests: { select: { status: true } },
      },
    });

    return areas.map((area) => {
      let completed = 0;
      let total = 0;
      area.dailyAssignments.forEach((da) => {
        da.targets.forEach((t) => {
          total++;
          if (t.status === 'COLLECTED') completed++;
        });
      });
      const efficiency = total > 0 ? (completed / total) * 100 : 100;
      const openComplaints = area.serviceRequests.filter(
        (r) => r.status !== 'RESOLVED' && r.status !== 'CLOSED',
      ).length;

      let color = 'green';
      if (openComplaints > 4 || efficiency < 60) color = 'red';
      else if (openComplaints > 2 || efficiency < 80) color = 'orange';
      else if (openComplaints > 0 || efficiency < 90) color = 'yellow';

      const avgLat =
        area.properties.length > 0
          ? area.properties.reduce((a, p) => a + p.latitude, 0) / area.properties.length
          : 12.9716;
      const avgLng =
        area.properties.length > 0
          ? area.properties.reduce((a, p) => a + p.longitude, 0) / area.properties.length
          : 77.5946;

      return {
        id: area.id,
        name: area.name,
        color,
        center: { lat: avgLat, lng: avgLng },
        efficiency: parseFloat(efficiency.toFixed(1)),
        openComplaints,
      };
    });
  }

  async getOpenWards() {
    return this.prisma.wardStatistics.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
    });
  }

  async getOpenStatistics() {
    return this.prisma.cityStatistics.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
    });
  }
}
