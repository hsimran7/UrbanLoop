// src/lib/api.ts

const API_BASE_URL = 'http://localhost:3001/api/v1';

// Authentication API functions
export async function loginUser(email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error('Login failed');
  return response.json();
}

export async function registerUser(userData: any) {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error('Registration failed');
  return response.json();
}

// User management API functions
export async function fetchUsers(token: string) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch users');
  return response.json();
}

export async function createUser(userData: any, token: string) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error('Failed to create user');
  return response.json();
}

export async function deleteUser(userId: string, token: string) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to delete user');
  return response.json();
}

// Collections API
export async function fetchCollections(token: string) {
  const response = await fetch(`${API_BASE_URL}/collections`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch collections');
  return response.json();
}

// Complaints API (replacing Reports)
export async function updateUserRole(userId: string, newRole: string, token: string) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ role: newRole })
  });
  if (!response.ok) throw new Error('Failed to update user role');
  return response.json();
}

// Dashboard API
export async function fetchDashboardStats(token: string) {
  const response = await fetch(`${API_BASE_URL}/dashboard/stats`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

// Bins API
export async function fetchBins(token: string) {
  const response = await fetch(`${API_BASE_URL}/bins`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch bins');
  return response.json();
}

// Analytics API
export async function fetchAnalytics(token: string) {
  const response = await fetch(`${API_BASE_URL}/analytics`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch analytics');
  return response.json();
}

// Vehicles API
export async function fetchVehicles(token: string) {
  const response = await fetch(`${API_BASE_URL}/vehicles`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch vehicles');
  return response.json();
}

// Routes API
export async function fetchRoutes(token: string) {
  const response = await fetch(`${API_BASE_URL}/routes`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch routes');
  return response.json();
}

export async function createRoute(routeData: any, token: string) {
  const response = await fetch(`${API_BASE_URL}/routes`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(routeData)
  });
  if (!response.ok) throw new Error('Failed to create route');
  return response.json();
}

export async function deleteRoute(routeId: string, token: string) {
  const response = await fetch(`${API_BASE_URL}/routes/${routeId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to delete route');
  return response.json();
}

// Complaints API
export async function fetchComplaints(token: string) {
  const response = await fetch(`${API_BASE_URL}/complaints`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch complaints');
  return response.json();
}

// Reports API
export async function fetchReports(token: string) {
  const response = await fetch(`${API_BASE_URL}/reports`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch reports');
  return response.json();
}
