/**
 * Mock Server Client - Utility to check mock server pairing state
 * This allows tests to verify that actual TCP protocol communication occurred
 */

const http = require('http');

/**
 * Check the current pairing state of the mock server
 * @param {string} host - Mock server host (default: 192.168.2.150)
 * @param {number} port - Mock server status port (default: 3001)
 * @returns {Promise<Object>} Pairing state information
 */
async function getMockServerPairingState(host = '192.168.2.150', port = 3001) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${host}:${port}/status`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          resolve(status.pairingState || {});
        } catch (error) {
          reject(new Error(`Failed to parse mock server response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Failed to connect to mock server status endpoint: ${error.message}`));
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Mock server status request timed out'));
    });
  });
}

/**
 * Reset the pairing state on the mock server
 * @param {string} host - Mock server host (default: 192.168.2.150)  
 * @param {number} port - Mock server status port (default: 3001)
 * @returns {Promise<boolean>} Success status
 */
async function resetMockServerPairingState(host = '192.168.2.150', port = 3001) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ action: 'reset' });
    
    const options = {
      hostname: host,
      port: port,
      path: '/reset',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          reject(new Error(`Mock server reset failed with status: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Failed to reset mock server: ${error.message}`));
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Mock server reset request timed out'));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * Wait for specific pairing protocol steps to complete
 * @param {string} step - The pairing step to wait for ('pairingRequest', 'pairingConfiguration', etc.)
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @param {string} host - Mock server host
 * @param {number} port - Mock server status port
 * @returns {Promise<boolean>} True if step completed within timeout
 */
async function waitForPairingStep(step, timeout = 10000, host = '192.168.2.150', port = 3001) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const pairingState = await getMockServerPairingState(host, port);
      
      if (pairingState[step + 'Received']) {
        return true;
      }
      
      // Wait 500ms before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      // Server might not be ready yet, continue waiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return false;
}

/**
 * Verify that the expected pairing flow occurred
 * @param {Object} expectedSteps - Object indicating which steps should have occurred
 * @returns {Promise<Object>} Verification result with details
 */
async function verifyPairingFlow(expectedSteps = {}) {
  try {
    const pairingState = await getMockServerPairingState();
    
    const result = {
      success: true,
      pairingState,
      missingSteps: [],
      unexpectedSteps: [],
      details: {}
    };
    
    // Check required steps
    const requiredSteps = ['pairingRequest', 'pairingOption', 'pairingConfiguration'];
    for (const step of requiredSteps) {
      const stepReceived = pairingState[step + 'Received'];
      result.details[step] = stepReceived;
      
      if (!stepReceived) {
        result.missingSteps.push(step);
        result.success = false;
      }
    }
    
    // Check if we got to the secret phase (indicates pairing dialog should show)
    result.details.shouldShowPairingDialog = pairingState.pairingConfigurationReceived;
    result.details.connected = pairingState.connected;
    result.details.lastActivity = pairingState.lastActivity;
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      pairingState: null
    };
  }
}

module.exports = {
  getMockServerPairingState,
  resetMockServerPairingState,
  waitForPairingStep,
  verifyPairingFlow
};