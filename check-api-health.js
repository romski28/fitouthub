// Quick script to check if API endpoints are accessible
const API_BASE = 'https://fitouthub.onrender.com/api';

async function checkEndpoint(path, method = 'GET') {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' }
    });
    
    return {
      path,
      status: response.status,
      exists: response.status !== 404,
      statusText: response.statusText
    };
  } catch (error) {
    return {
      path,
      status: 'ERROR',
      exists: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('🔍 Checking API health...\n');
  
  const endpoints = [
    { path: '/milestones/templates', method: 'GET' },
    { path: '/milestones/batch', method: 'POST' },
    { path: '/milestones', method: 'POST' },
  ];
  
  for (const ep of endpoints) {
    const result = await checkEndpoint(ep.path, ep.method);
    const icon = result.exists ? '✅' : '❌';
    console.log(`${icon} ${ep.method} ${ep.path}`);
    console.log(`   Status: ${result.status} ${result.statusText || ''}`);
    if (result.error) console.log(`   Error: ${result.error}`);
    console.log('');
  }
  
  console.log('\n📝 Notes:');
  console.log('- 404 = Endpoint not found (need to deploy)');
  console.log('- 401 = Endpoint exists but needs auth (good!)');
  console.log('- 200/201 = Endpoint accessible');
}

main().catch(console.error);
