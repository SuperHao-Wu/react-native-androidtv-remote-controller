exports.config = {
	runner: 'local',

	hostname: 'localhost',
	port: 4723,
	path: '/',

	specs: [
		'/Users/wuhao/my_projects/sony_tv_controller/react-native-androidtv-remote/appium/tests/deviceConnection.test.js',
		'/Users/wuhao/my_projects/sony_tv_controller/react-native-androidtv-remote/appium/tests/sonyTvPairingNative.test.js',
	],

	maxInstances: 1,

	capabilities: [
		{
			platformName: 'iOS',
			'appium:deviceName': "吴昊's iPhone",
			'appium:udid': '00008101-0010299E1484001E',
			'appium:platformVersion': '18.5',
			'appium:automationName': 'XCUITest',
			'appium:bundleId': 'com.haoandroidtv.example',
			'appium:noReset': false,
			'appium:newCommandTimeout': 300,
			'appium:showXcodeLog': true,
			'appium:xcodeOrgId': '8XK2WWZBQS',
			'appium:xcodeSigningId': 'iPhone Developer',
		},
	],

	logLevel: 'info',
	bail: 0,

	baseUrl: 'http://localhost',
	waitforTimeout: 10000,
	connectionRetryTimeout: 120000,
	connectionRetryCount: 3,

	services: [],

	framework: 'mocha',
	reporters: ['spec'],

	mochaOpts: {
		ui: 'bdd',
		timeout: 60000,
		require: ['/Users/wuhao/my_projects/sony_tv_controller/react-native-androidtv-remote/appium/tests/setup.js'],
	},

	before: function (capabilities, specs) {
		console.log('🚀 Starting test session...');
	},

	afterTest: function (test, context, { error, result, duration, passed, retries }) {
		if (error) {
			console.log(`❌ Test failed: ${test.title}`);
		} else {
			console.log(`✅ Test passed: ${test.title} (${duration}ms)`);
		}
	},
};
