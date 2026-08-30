const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

// Global refresh promise to prevent multiple parallel refresh calls
let refreshPromise: Promise<Response> | null = null;

export async function apiRequest(path: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${path}`;
  
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  headers.set('X-Requested-With', 'XMLHttpRequest');

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Send HttpOnly cookies
  };

  let response = await fetch(url, config);

  // If unauthorized, attempt to rotate tokens silently and retry
  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh' && path !== '/auth/register' && path !== '/auth/logout') {
    try {
      if (!refreshPromise) {
        refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
        });
      }

      const refreshRes = await refreshPromise;

      if (refreshRes.ok) {
        // Retry the original request
        response = await fetch(url, config);
      } else {
        // If refresh fails with 401, clear credentials by redirecting to login or just let it fail
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    } catch (err) {
      console.error('Token refresh interception failed:', err);
    } finally {
      refreshPromise = null;
    }
  }

  return response;
}
