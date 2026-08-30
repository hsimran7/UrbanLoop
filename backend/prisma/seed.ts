import { PrismaClient, UserRole, UserStatus, BinType, BinStatus, BinCondition, DayOfWeek, ScheduleStatus, CollectionPointStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PUNJAB_DISTRICTS = [
  'Amritsar', 'Ludhiana', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali (SAS Nagar)', 'Hoshiarpur', 
  'Gurdaspur', 'Pathankot', 'Kapurthala', 'Tarn Taran', 'Moga', 'Firozpur', 'Fazilka', 'Faridkot', 
  'Muktsar', 'Barnala', 'Sangrur', 'Malerkotla', 'Fatehgarh Sahib', 'Rupnagar', 'Nawanshahr (SBS Nagar)', 'Mansa'
];

async function main() {
  console.log('Seeding database with robust Punjab data...');

  // --- 1. SEED STATE AND DISTRICTS ---
  const state = await prisma.state.upsert({
    where: { name: 'Punjab' },
    update: {},
    create: { name: 'Punjab' }
  });

  const districtRecords = [];
  for (const districtName of PUNJAB_DISTRICTS) {
    const d = await prisma.district.upsert({
      where: { stateId_name: { stateId: state.id, name: districtName } },
      update: {},
      create: { name: districtName, stateId: state.id }
    });
    districtRecords.push(d);
  }

  // --- 2. SEED USERS (Admins, Officials, Supervisors, Workers, Drivers) ---
  const passwordHash = await bcrypt.hash('Password123!', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@urbanloop.gov' },
    update: {},
    create: {
      email: 'admin@urbanloop.gov', name: 'Super Admin', phone: '+919999999900',
      passwordHash, role: UserRole.SYSTEM_ADMIN, status: UserStatus.ACTIVE, emailVerified: true
    }
  });

  const official = await prisma.user.upsert({
    where: { email: 'official@urbanloop.gov' },
    update: {},
    create: {
      email: 'official@urbanloop.gov', name: 'Gov Official', phone: '+919999999901',
      passwordHash, role: UserRole.GOVERNMENT_OFFICIAL, status: UserStatus.ACTIVE, emailVerified: true
    }
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@urbanloop.gov' },
    update: {},
    create: {
      email: 'supervisor@urbanloop.gov', name: 'Rajesh Supervisor', phone: '+919999999902',
      passwordHash, role: UserRole.SUPERVISOR, status: UserStatus.ACTIVE, emailVerified: true
    }
  });

  // Workers
  const workers = [];
  for (let i = 1; i <= 20; i++) {
    const email = `worker${i}@urbanloop.gov`;
    const w = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email, name: `Worker ${i}`, phone: `+9177777777${i.toString().padStart(2, '0')}`,
        passwordHash, role: UserRole.WORKER, status: UserStatus.ACTIVE, emailVerified: true
      }
    });
    await prisma.workerProfile.upsert({
      where: { userId: w.id },
      update: {},
      create: { userId: w.id, employeeCode: `EMP-${i.toString().padStart(3, '0')}`, phone: w.phone, employmentStatus: 'ACTIVE' }
    });
    workers.push(w);
  }

  // Drivers
  const drivers = [];
  for (let i = 1; i <= 10; i++) {
    const email = `driver${i}@urbanloop.gov`;
    const d = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email, name: `Driver ${i}`, phone: `+9188888888${i.toString().padStart(2, '0')}`,
        passwordHash, role: UserRole.WORKER, status: UserStatus.ACTIVE, emailVerified: true
      }
    });
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 5);
    await prisma.driverProfile.upsert({
      where: { userId: d.id },
      update: {},
      create: { userId: d.id, licenseNumber: `DL-PB-${i}`, licenseExpiry: expiry, phone: d.phone, status: 'ACTIVE' }
    });
    drivers.push(d);
  }

  // Citizens
  const citizen = await prisma.user.upsert({
    where: { email: 'citizen@urbanloop.gov' },
    update: {},
    create: {
      email: 'citizen@urbanloop.gov', name: 'Citizen Jane', phone: '+916666666666',
      passwordHash, role: UserRole.CITIZEN, status: UserStatus.ACTIVE, emailVerified: true
    }
  });


  // --- 3. SEED DEPOT & VEHICLES ---
  const depot = await prisma.depot.upsert({
    where: { code: 'DPT-01' },
    update: {},
    create: {
      code: 'DPT-01',
      name: 'Central Fleet Depot',
      latitude: 30.9000,
      longitude: 75.8500,
      vehicleCapacity: 50
    }
  });

  const vehicles = [];
  for (let i = 1; i <= 15; i++) {
    const v = await prisma.vehicle.upsert({
      where: { registrationNumber: `PB10AB${i.toString().padStart(4, '0')}` },
      update: {},
      create: {
        registrationNumber: `PB10AB${i.toString().padStart(4, '0')}`,
        vehicleType: i % 2 === 0 ? 'DUMP_TRUCK' : 'COMPACTOR',
        manufacturer: 'Tata Motors',
        model: 'Signa',
        year: 2023,
        compartmentType: 'SINGLE',
        fuelType: 'DIESEL',
        capacityKg: 5000, 
        status: 'AVAILABLE', 
        vehicleCode: `V-${i}`,
        depotId: depot.id
      }
    });
    vehicles.push(v);
  }

  // --- 4. SEED SHIFTS ---
  const shiftTypes = [
    { name: 'Morning Shift', start: '06:00', end: '14:00' },
    { name: 'Afternoon Shift', start: '14:00', end: '22:00' },
    { name: 'Night Shift', start: '22:00', end: '06:00' }
  ];
  const shifts = [];
  for (const sh of shiftTypes) {
    let shift = await prisma.shift.findFirst({ where: { name: sh.name } });
    if (!shift) {
      shift = await prisma.shift.create({
        data: { name: sh.name, startTime: sh.start, endTime: sh.end, status: 'ACTIVE' }
      });
    }
    shifts.push(shift);
  }

  // --- 5. SEED CATEGORIES & DEPARTMENTS ---
  const reqCategories = [
    { code: 'OVERFLOWING_BIN', name: 'Overflowing Bin', description: 'Smart bin fill level exceeded' },
    { code: 'MISSED_COLLECTION', name: 'Missed Collection', description: 'Scheduled waste pickup missed' },
    { code: 'BROKEN_SMART_BIN', name: 'Broken Smart Bin', description: 'IoT sensor offline/lid broken' }
  ];
  for (const cat of reqCategories) {
    await prisma.serviceRequestCategory.upsert({
      where: { code: cat.code },
      update: {},
      create: { code: cat.code, name: cat.name, description: cat.description, status: 'ACTIVE', defaultPriority: 'NORMAL' }
    });
  }

  const departments = [
    { code: 'WASTE_OPS', name: 'Waste Collection Operations' },
    { code: 'FLEET_MGMT', name: 'Fleet Management' },
    { code: 'ENV_COMPLIANCE', name: 'Environmental Compliance' }
  ];
  for (const dept of departments) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: { code: dept.code, name: dept.name, status: 'ACTIVE' }
    });
  }

  // --- 6. GEOGRAPHIC & OPERATIONAL HIERARCHY ---
  console.log('Seeding deep Geographic hierarchy (City -> Ward -> Area -> Zone -> Street) and assets...');
  
  for (const district of districtRecords) {
    const cityName = `${district.name} City`;
    const city = await prisma.city.upsert({
      where: { name: cityName },
      update: {},
      create: { name: cityName, districtId: district.id, timezone: 'Asia/Kolkata' }
    });

    for (let w = 1; w <= 2; w++) {
      const ward = await prisma.ward.upsert({
        where: { cityId_number: { cityId: city.id, number: w } },
        update: {},
        create: { number: w, name: `${cityName} Ward ${w}`, cityId: city.id }
      });

      for (let a = 1; a <= 2; a++) {
        const areaName = `${ward.name} - Area ${String.fromCharCode(64 + a)}`;
        const area = await prisma.area.upsert({
          where: { wardId_name: { wardId: ward.id, name: areaName } },
          update: {},
          create: { name: areaName, wardId: ward.id }
        });

        for (let z = 1; z <= 2; z++) {
          const zoneName = `${area.name} - Zone ${z}`;
          const zone = await prisma.serviceZone.upsert({
            where: { code: `Z-${city.id.substring(0,3)}-${w}-${a}-${z}` },
            update: {},
            create: { name: zoneName, code: `Z-${city.id.substring(0,3)}-${w}-${a}-${z}`, areaId: area.id, status: 'ACTIVE' }
          });

          // Streets
          for (let s = 1; s <= 3; s++) {
            const streetName = `${zoneName} Street ${s}`;
            const street = await prisma.street.upsert({
              where: { serviceZoneId_name: { serviceZoneId: zone.id, name: streetName } },
              update: {},
              create: { name: streetName, serviceZoneId: zone.id }
            });

            // Create 1 Collection Point per street
            const cp = await prisma.collectionPoint.create({
              data: {
                name: `${streetName} CP`,
                latitude: 30.9000 + (Math.random() * 0.1),
                longitude: 75.8500 + (Math.random() * 0.1),
                areaId: area.id,
                serviceZoneId: zone.id,
                streetId: street.id,
                status: CollectionPointStatus.ACTIVE
              }
            });

            // Create Bins for the Collection Point
            const binTypes = [BinType.WET, BinType.DRY];
            for (const bType of binTypes) {
              await prisma.bin.create({
                data: {
                  qrCodeId: `BIN-${zone.code}-${street.id.substring(0,4)}-${bType}`,
                  type: bType,
                  status: BinStatus.EMPTY,
                  condition: BinCondition.GOOD,
                  collectionPointId: cp.id,
                  currentFillLevel: Math.floor(Math.random() * 100)
                }
              });
            }
          }

          // Create a Route for the Area
          let route = await prisma.route.findUnique({ where: { routeCode: `RT-${area.id.substring(0,8)}` } });
          if (!route) {
            route = await prisma.route.create({
              data: {
                routeCode: `RT-${area.id.substring(0,8)}`,
                areaId: area.id,
                status: 'ACTIVE',
                estimatedDuration: 120,
                expectedDistance: 5000,
              }
            });
          }

          // Create Weekly Schedules for the Zone
          await prisma.weeklyCollectionSchedule.create({
            data: {
              wardId: ward.id,
              zoneId: zone.id,
              dayOfWeek: DayOfWeek.MONDAY,
              wasteType: BinType.WET,
              shiftId: shifts[0].id
            }
          });
        }
      }
    }
  }

  console.log('Database seeded successfully with massive geographic and operational data!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
