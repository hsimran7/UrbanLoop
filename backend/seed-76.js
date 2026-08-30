const fetch = require('node-fetch');

async function seed() {
  console.log('Seeding 76 new accounts via registration API...');
  let successCount = 0;
  
  for (let i = 1; i <= 76; i++) {
    const id = String(i).padStart(3, '0');
    try {
      const res = await fetch('http://127.0.0.1:3001/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `worker${id}@urbanloop.gov`,
          password: 'Password123!',
          name: `Test Worker ${id}`,
          phone: `+919999999${id.slice(-3)}`, // Just an arbitrary fake phone number pattern
          role: 'WORKER',
          employeeCode: `EMP-200${id}`
        })
      });

      if (res.ok) {
        successCount++;
        console.log(`[${i}/76] Registered: worker${id}@urbanloop.gov`);
      } else {
        const error = await res.json();
        console.error(`[${i}/76] Failed: ${error.message}`);
      }
    } catch (e) {
      console.error(`[${i}/76] Request failed: ${e.message}`);
    }
    
    // Slight delay to avoid hammering the local server too hard
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log(`\nFinished! Successfully registered ${successCount} out of 76 accounts.`);
}

seed();
