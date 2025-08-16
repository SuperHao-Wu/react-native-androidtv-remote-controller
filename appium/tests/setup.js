const { expect } = require('chai');

// Local timestamp utility function
function getLocalTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

// Override console methods to add local timestamps
console.log = function(...args) {
  originalConsole.log(`[${getLocalTimestamp()}]`, ...args);
};

console.error = function(...args) {
  originalConsole.error(`[${getLocalTimestamp()}]`, ...args);
};

console.warn = function(...args) {
  originalConsole.warn(`[${getLocalTimestamp()}]`, ...args);
};

console.info = function(...args) {
  originalConsole.info(`[${getLocalTimestamp()}]`, ...args);
};

// Global test setup
global.expect = expect;

// Test configuration
global.TEST_CONFIG = {
	// Mock server settings - must match AndroidRemote pairing_port (pairing happens first)
	MOCK_SERVER_PORT: 6467,
	MOCK_SERVER_HOST: '192.168.2.150',  // Mac's IP where server runs, not localhost

	// Test timeouts
	APP_LAUNCH_TIMEOUT: 3000000,
	NETWORK_TIMEOUT: 1500000,
	UI_INTERACTION_TIMEOUT: 1000000,

	// Sony TV simulation settings
	SONY_TV_PAIRING_DELAY: 10000, // Quick response for testing
	SONY_TV_SLOW_RESPONSE_DELAY: 200000, // Simulate slow TV

	// Mock certificates (same as your existing tests)
	MOCK_CERTS: {
		key: 'fake-key',
		cert: 'fake-cert',
	},

	// Mock device info
	MOCK_DEVICE_INFO: {
		system: 'test-device',
		name: 'iOS Test Device',
	},
};

console.log('📋 Test setup completed');
console.log(
	'🔧 Mock server will run on:',
	`${global.TEST_CONFIG.MOCK_SERVER_HOST}:${global.TEST_CONFIG.MOCK_SERVER_PORT}`,
);
