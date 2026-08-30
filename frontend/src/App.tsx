import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/auth-context';

// Layouts
import DashboardLayout from './pages/dashboard/layout';

// Public Pages
import LandingPage from './pages/page';
import LoginPage from './pages/login/page';
import RegisterPage from './pages/register/page';

// Dashboard Pages
import DashboardOverview from './pages/dashboard/page';

// Citizen
import CitizenHistory from './pages/dashboard/citizen/history/page';
import PropertiesPage from './pages/dashboard/properties/page';
import CitizenBinsPage from './pages/dashboard/bins/page';
import SchedulesPage from './pages/dashboard/schedules/page';
import ComplaintsPage from './pages/dashboard/complaints/page';

// Worker / Driver
import WorkerToday from './pages/dashboard/worker/page';
import DriverBoard from './pages/dashboard/worker/driver/page';

// Admin / Supervisor / Facility
import OperationsControl from './pages/dashboard/admin/operations/page';
import FacilityIntake from './pages/dashboard/admin/facility/page';

import AdminProperties from './pages/dashboard/admin/properties/page';
import MunicipalBinsGrid from './pages/dashboard/admin/bins/page';
import AdminSchedules from './pages/dashboard/admin/schedules/page';
import WorkforcePage from './pages/dashboard/admin/workforce/page';
import TeamsPage from './pages/dashboard/admin/teams/page';
import ShiftsPage from './pages/dashboard/admin/shifts/page';
import ZonesPage from './pages/dashboard/admin/zones/page';
import AssignmentsPage from './pages/dashboard/admin/assignments/page';
import TraceabilityPage from './pages/dashboard/admin/traceability/page';
import ServiceRequestsPage from './pages/dashboard/admin/service-requests/page';
import FleetPage from './pages/dashboard/admin/fleet/page';
import CommandCenter from './pages/dashboard/admin/command-center/page';
import AiIntelligence from './pages/dashboard/admin/ai-intelligence/page';


function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          
          {/* Protected Dashboard Routes */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardOverview />} />
            
            {/* Citizen */}
            <Route path="properties" element={<PropertiesPage />} />
            <Route path="bins" element={<CitizenBinsPage />} />
            <Route path="schedules" element={<SchedulesPage />} />
            <Route path="citizen/history" element={<CitizenHistory />} />
            <Route path="complaints" element={<ComplaintsPage />} />
            
            {/* Worker (Absorbs Driver) */}
            <Route path="worker" element={<WorkerToday />} />
            <Route path="worker/driver" element={<DriverBoard />} />
            
            {/* Admin (Absorbs Supervisor / Facility) */}
            <Route path="admin/operations" element={<OperationsControl />} />
            <Route path="admin/facility" element={<FacilityIntake />} />
            
            {/* Admin */}
            <Route path="admin/properties" element={<AdminProperties />} />
            <Route path="admin/bins" element={<MunicipalBinsGrid />} />
            <Route path="admin/schedules" element={<AdminSchedules />} />
            <Route path="admin/workforce" element={<WorkforcePage />} />
            <Route path="admin/teams" element={<TeamsPage />} />
            <Route path="admin/shifts" element={<ShiftsPage />} />
            <Route path="admin/zones" element={<ZonesPage />} />
            <Route path="admin/assignments" element={<AssignmentsPage />} />
            <Route path="admin/traceability" element={<TraceabilityPage />} />
            <Route path="admin/service-requests" element={<ServiceRequestsPage />} />
            <Route path="admin/fleet" element={<FleetPage />} />
            <Route path="admin/command-center" element={<CommandCenter />} />
            <Route path="admin/ai-intelligence" element={<AiIntelligence />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
