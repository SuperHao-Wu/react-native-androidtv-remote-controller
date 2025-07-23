const { expect } = require('chai');

// Global test setup
global.expect = expect;

// Test configuration
global.TEST_CONFIG = {
  // Mock server settings - same as your existing tests
  MOCK_SERVER_PORT: 16467,
  MOCK_SERVER_HOST: 'localhost',
  
  // Test timeouts
  APP_LAUNCH_TIMEOUT: 30000,
  NETWORK_TIMEOUT: 15000,
  UI_INTERACTION_TIMEOUT: 10000,
  
  // Sony TV simulation settings
  SONY_TV_PAIRING_DELAY: 100, // Quick response for testing
  SONY_TV_SLOW_RESPONSE_DELAY: 2000, // Simulate slow TV
  
  // Mock certificates (same as your existing tests)
  MOCK_CERTS: {
    key: 'fake-key',
    cert: 'fake-cert'
  },
  
  // Mock device info
  MOCK_DEVICE_INFO: {
    system: 'test-device',
    name: 'iOS Test Device'
  }
};

console.log('📋 Test setup completed');
console.log('🔧 Mock server will run on:', `${global.TEST_CONFIG.MOCK_SERVER_HOST}:${global.TEST_CONFIG.MOCK_SERVER_PORT}`);
