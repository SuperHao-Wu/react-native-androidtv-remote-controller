const net = require('net');

/**
 * Check if a port is open/reachable
 */
function checkPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    
    socket.setTimeout(timeout);
    socket.once('error', onError);
    socket.once('timeout', onError);
    
    socket.connect(port, host, () => {
      socket.destroy();
      resolve(true);
    });
  });
}

/**
 * Check if mock servers are running
 */
async function checkMockServers(host = '192.168.2.150') {
  console.log(`🔍 Checking mock servers on ${host}...`);
  
  const pairingStatus = await checkPort(host, 6467);
  const remoteStatus = await checkPort(host, 6466);
  
  const status = {
    host,
    pairing: { port: 6467, running: pairingStatus },
    remote: { port: 6466, running: remoteStatus },
    allRunning: pairingStatus && remoteStatus
  };
  
  console.log('📊 Mock server status:');
  console.log(`   🔐 Pairing (6467): ${pairingStatus ? '✅ Running' : '❌ Not running'}`);
  console.log(`   📱 Remote (6466): ${remoteStatus ? '✅ Running' : '❌ Not running'}`);
  
  return status;
}

/**
 * Wait for mock servers to be ready
 */
async function waitForMockServers(host = '192.168.2.150', maxAttempts = 10, delayMs = 1000) {
  console.log(`⏳ Waiting for mock servers on ${host}...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await checkMockServers(host);
    
    if (status.allRunning) {
      console.log('✅ All mock servers are ready!');
      return status;
    }
    
    if (attempt < maxAttempts) {
      console.log(`🔄 Attempt ${attempt}/${maxAttempts} - waiting ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new Error(`❌ Mock servers not ready after ${maxAttempts} attempts`);
}

module.exports = {
  checkPort,
  checkMockServers,
  waitForMockServers
};