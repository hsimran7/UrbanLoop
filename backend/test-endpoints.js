const fetch = require('node-fetch');

async function testAuthAndEndpoints() {
  const loginRes = await fetch('http://127.0.0.1:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@urbanloop.gov', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Login:', loginRes.status);

  const endpoints = [
    '/analytics/dashboard',
    '/analytics/wards',
    '/analytics/reports',
    '/analytics/area-highlights',
    '/analytics/command-center-data?filter=All%20Critical'
  ];

  for (const ep of endpoints) {
    const res = await fetch(`http://127.0.0.1:3001/api/v1${ep}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(ep, res.status);
    if (res.status === 400) {
      console.log('400 Response:', await res.json());
    }
  }
}

testAuthAndEndpoints();
