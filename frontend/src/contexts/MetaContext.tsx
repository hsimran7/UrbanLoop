import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

export interface UrbanLoopEnums {
  UserRole: string[];
  UserStatus: string[];
  PropertyStatus: string[];
  CollectionPointStatus: string[];
  BinType: string[];
  BinStatus: string[];
  BinCondition: string[];
  DayOfWeek: string[];
  ScheduleStatus: string[];
  ExceptionType: string[];
  TelemetrySource: string[];
  TelemetryStatus: string[];
  BinAlertType: string[];
  AlertSeverity: string[];
  AlertStatus: string[];
  IoTDeviceStatus: string[];
  WorkerEmploymentStatus: string[];
  TeamStatus: string[];
  TeamMemberRole: string[];
  ShiftStatus: string[];
  WorkerShiftStatus: string[];
  ServiceZoneStatus: string[];
  TeamServiceAssignmentStatus: string[];
  AssignmentStatus: string[];
  AssignmentPriority: string[];
  GenerationSource: string[];
  TargetStatus: string[];
  AddedReason: string[];
  CollectionEventType: string[];
  CollectionVerification: string[];
  WasteLoadStatus: string[];
  FacilityType: string[];
  FacilityStatus: string[];
  TransferStatus: string[];
  WeighingMethod: string[];
  ReceiptStatus: string[];
  ProcessType: string[];
  MassBalanceStatus: string[];
  CustodyEventType: string[];
  ServiceRequestPriority: string[];
  ServiceRequestStatus: string[];
  ServiceRequestSource: string[];
  CommentVisibility: string[];
  VehicleStatus: string[];
  VehicleType: string[];
}

interface MetaContextType {
  enums: UrbanLoopEnums | null;
  loading: boolean;
}

const MetaContext = createContext<MetaContextType>({ enums: null, loading: true });

export const MetaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enums, setEnums] = useState<UrbanLoopEnums | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEnums() {
      try {
        const res = await apiRequest('/meta/enums');
        if (res.ok) {
          setEnums(await res.json());
        }
      } catch (err) {
        console.error('Failed to load metadata enums:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchEnums();
  }, []);

  return (
    <MetaContext.Provider value={{ enums, loading }}>
      {children}
    </MetaContext.Provider>
  );
};

export const useMeta = () => useContext(MetaContext);
