const http = require('http');

// Test GET /projects
console.log('\n📋 Testing GET /projects...');
const getReq = http.get('http://localhost:3001/projects', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('✓ Status:', res.statusCode);
    console.log('✓ Response:', data);
  });
});
getReq.on('error', e => console.error('✗ Error:', e.message));

// Test POST /projects (create a project)
setTimeout(() => {
  console.log('\n📝 Testing POST /projects...');
  const postData = JSON.stringify({
    title: 'Test Project',
    status: 'ACTIVE'
  });

  const postOptions = {
    hostname: 'localhost',
    port: 3001,
    path: '/projects',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const postReq = http.request(postOptions, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('✓ Status:', res.statusCode);
      console.log('✓ Response:', data);
    });
  });

  postReq.on('error', e => console.error('✗ Error:', e.message));
  postReq.write(postData);
  postReq.end();
}, 1000);

// Test GET /projects again
setTimeout(() => {
  console.log('\n📋 Testing GET /projects again...');
  const getReq2 = http.get('http://localhost:3001/projects', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('✓ Status:', res.statusCode);
      console.log('✓ Response:', data);
    });
  });
  getReq2.on('error', e => console.error('✗ Error:', e.message));
}, 2000);
