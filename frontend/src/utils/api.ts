const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

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
  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh' && path !== '/auth/register') {
    try {
      const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
      });

      if (refreshRes.ok) {
        // Retry the original request
        response = await fetch(url, config);
      }
    } catch (err) {
      console.error('Token refresh interception failed:', err);
    }
  }

  return response;
}
