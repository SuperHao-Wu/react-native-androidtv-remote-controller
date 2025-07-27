const { expect } = require('chai');

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
