exports.config = {
	port: 4723,
	path: '/',

	// Test specs and configuration
	specs: ['./appium/tests/sonyTvPairingNative.test.js'],
	maxInstances: 1,

	// iOS Capabilities for real device testing
	capabilities: [
		{
			platformName: 'iOS',
			'appium:deviceName': "吴昊's iPhone",
			'appium:udid': '00008101-0010299E1484001E',
			'appium:platformVersion': '18.5',
			'appium:automationName': 'XCUITest',
			'appium:bundleId': 'org.reactjs.native.example.TestAndroidTVRemoteApp',
			'appium:realDevice': true,
			'appium:noReset': false,
			'appium:newCommandTimeout': 300,
			'appium:waitForAppLaunch': true,

			// iOS specific settings
			'appium:usePrebuiltWDA': false,
			'appium:wdaLocalPort': 8100,
			'appium:showXcodeLog': true,

			// Network permissions for Sony TV communication
			'appium:permissions':
				'{"org.reactjs.native.example.TestAndroidTVRemoteApp": {"network-outgoing": "YES", "network-incoming": "YES"}}',

			// Performance settings
			'appium:skipLogCapture': false,
			'appium:skipAppiumLogs': false,
		},
	],

	// Test runner configuration
	logLevel: 'info',
	bail: 0,
	baseUrl: 'http://localhost',
	waitforTimeout: 10000,
	connectionRetryTimeout: 120000,
	connectionRetryCount: 3,

	framework: 'mocha',
	reporters: ['spec'],

	mochaOpts: {
		ui: 'bdd',
		timeout: 60000,
		require: ['./appium/tests/setup.js'],
	},

	// Services
	services: [],

	// Screenshots and logging
	outputDir: './appium/logs/',

	// Hooks
	before: async function (capabilities, specs) {
		console.log('🚀 Starting Appium test session...');
		console.log('📱 Device:', capabilities['appium:deviceName']);
		console.log('📦 Bundle ID:', capabilities['appium:bundleId']);

		// Wait for device to be ready
		await driver.pause(2000);
	},

	beforeTest: async function (test, context) {
		console.log(`\n🧪 Starting test: ${test.title}`);
	},

	afterTest: async function (test, context, { error, result, duration, passed, retries }) {
		if (error) {
			console.log(`❌ Test failed: ${test.title}`);
			// Take screenshot on failure
			const screenshot = await driver.takeScreenshot();
			require('fs').writeFileSync(
				`./appium/screenshots/failed-${test.title.replace(/\s+/g, '-')}-${Date.now()}.png`,
				screenshot,
				'base64',
			);
		} else {
			console.log(`✅ Test passed: ${test.title} (${duration}ms)`);
		}
	},

	after: async function (result, capabilities, specs) {
		console.log('🏁 Appium test session completed');
	},
};
