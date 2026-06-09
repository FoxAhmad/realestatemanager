const https = require('https');

https.get('https://realestatemanager-chi.vercel.app', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Find the JS files
    const match = data.match(/src="(\/static\/js\/main\.[^"]+\.js)"/);
    if (match) {
      console.log('Found main js:', match[1]);
      https.get('https://realestatemanager-chi.vercel.app' + match[1], (res2) => {
        let jsData = '';
        res2.on('data', chunk => jsData += chunk);
        res2.on('end', () => {
          // Extract the API URL
          // Looking for something like REACT_APP_API_URL or standard http string
          const apiMatch = jsData.match(/https?:\/\/[a-zA-Z0-9.-]+(?:\.onrender\.com|\.herokuapp\.com)/);
          if (apiMatch) {
            console.log('API URL in bundle:', apiMatch[0]);
          } else {
            console.log('Could not easily find API URL. Length of JS:', jsData.length);
            const urls = jsData.match(/https?:\/\/[^\s"']+/g);
            if (urls) {
               console.log('Other URLs found in JS:', [...new Set(urls)].filter(u => !u.includes('w3.org') && !u.includes('react')));
            }
          }
        });
      });
    } else {
      console.log('Could not find main JS bundle');
    }
  });
}).on('error', err => {
  console.log('Error:', err.message);
});
