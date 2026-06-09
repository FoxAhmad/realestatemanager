const https = require('https');

function makeRequest(method, url, data, token) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testApi() {
  try {
    console.log('Logging in to live API...');
    const loginRes = await makeRequest('POST', 'https://uh-crm-server.onrender.com/api/auth/login', {
      email: 'admin@uhcrm.com',
      password: 'admin123'
    });
    
    if (loginRes.status !== 200) {
       console.log('Login failed', loginRes.data);
       return;
    }
    
    const token = loginRes.data.token;
    console.log('Got token, fetching balance-transactions...');
    
    const transRes = await makeRequest('GET', 'https://uh-crm-server.onrender.com/api/balance-transactions/3', null, token);
    
    if (transRes.status === 404) {
       console.log('ENDPOINT DOES NOT EXIST ON LIVE SERVER! (404 Not Found)');
    } else if (transRes.status === 500) {
       console.log('API CRASHED!', transRes.data);
    } else {
       console.log(`Live API returned status ${transRes.status}`);
       if (Array.isArray(transRes.data)) {
           console.log(`Live API returned ${transRes.data.length} transactions.`);
       } else {
           console.log('Returned data:', transRes.data);
       }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}
testApi();
