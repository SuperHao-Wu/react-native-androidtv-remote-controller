const { expect } = require('chai');

describe('iPhone Device Connection Test', function () {
	it('should connect to the iPhone and verify app is running', async function () {
		this.timeout(30000);

		console.log('📱 Testing connection to iPhone device...');

		// Check if we can connect to the device
		const bundleId = 'com.haoandroidtv.example';
		const appState = await driver.queryAppState(bundleId);
		console.log('📱 App state:', appState);

		// If app is not running (state 1), try to activate it
		if (appState === 1) {
			console.log('📱 App not running, attempting to activate...');
			await driver.activateApp(bundleId);

			// Wait a moment for the app to start
			await driver.pause(2000);

			// Check state again
			const newAppState = await driver.queryAppState(bundleId);
			console.log('📱 New app state after activation:', newAppState);
			expect(newAppState).to.be.oneOf([3, 4]); // 3 = background, 4 = foreground
		} else {
			// App state 4 = running in foreground, 3 = background
			expect(appState).to.be.oneOf([3, 4]); // 3 = background, 4 = foreground
		}

		// Take a screenshot to verify connectivity
		const screenshot = await driver.takeScreenshot();
		expect(screenshot).to.be.a('string');
		expect(screenshot.length).to.be.greaterThan(1000); // Should be base64 encoded image

		console.log('✅ Successfully connected to iPhone and verified app');
	});

	it('should verify device capabilities', async function () {
		this.timeout(15000);

		console.log('🔍 Testing device capabilities...');

		// Get device info using browser capabilities
		const capabilities = driver.capabilities;
		console.log('📱 Platform name:', capabilities.platformName);
		expect(capabilities.platformName.toLowerCase()).to.equal('ios');

		// Get device name and version
		console.log('📱 Device name:', capabilities['appium:deviceName']);
		console.log('📱 Platform version:', capabilities['appium:platformVersion']);

		// Test basic device interaction
		const deviceInfo = await driver.getDeviceTime();
		console.log('📱 Device time:', deviceInfo);
		expect(deviceInfo).to.be.a('string');

		// Test if we can interact with the device
		const isKeyboardShown = await driver.isKeyboardShown();
		console.log('📱 Keyboard shown:', isKeyboardShown);
		expect(isKeyboardShown).to.be.a('boolean');

		console.log('✅ Device capabilities verified');
	});
});
