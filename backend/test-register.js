const fetch = require('node-fetch'); // wait, built-in fetch is available in modern Node.js

async function test() {
  const res = await fetch('http://127.0.0.1:3001/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'testworker2@urbanloop.gov',
      password: 'Password123!',
      name: 'Test Worker',
      phone: '+919999999998',
      role: 'WORKER',
      employeeCode: 'EMP-998'
    })
  });
  const data = await res.json();
  console.log(res.status, data);
}

test();
