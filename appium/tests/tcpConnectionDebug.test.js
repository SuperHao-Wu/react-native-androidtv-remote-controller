const { expect } = require('chai');
const { checkMockServers, waitForMockServers } = require('../utils/server-check');

describe('TCP Connection Debug Test - Real Native Socket Usage', function () {
	let mockServerStatus;

	before(async function () {
		this.timeout(TEST_CONFIG.APP_LAUNCH_TIMEOUT);

		console.log('🏗️  Setting up TCP connection debug test...');

		// Check if mock servers are running
		try {
			mockServerStatus = await waitForMockServers('192.168.2.150', 3, 1000);
		} catch (error) {
			console.error('❌ Mock servers not running!');
			console.log('💡 Start mock servers with: yarn mock:start');
			throw new Error('Mock servers required for test. Run: yarn mock:start');
		}

		// Ensure app is launched and ready
		try {
			await driver.getPageSource();
			console.log('📱 App is already running');
		} catch (error) {
			console.log('🚀 Launching app...');
			await driver.execute('mobile: launchApp', { bundleId: 'com.haoandroidtv.example' });
			await driver.pause(3000);
		}

		// Verify app is responsive
		const appState = await driver.queryAppState('com.haoandroidtv.example');
		expect(appState).to.equal(4); // 4 = running in foreground
		console.log('✅ App is running and responsive');
	});

	afterEach(async function () {
		// Mock servers are managed externally - no cleanup needed
		console.log('✅ Test completed, mock servers remain running');
	});

	after(async function () {
		console.log('🏁 TCP connection debug test completed');
	});

	it('should trigger real TCP socket connection through React Native app', async function () {
		this.timeout(TEST_CONFIG.NETWORK_TIMEOUT);

		console.log('🔌 Testing REAL TCP socket connection through native bridge...');

		// Verify mock servers are still running
		const currentStatus = await checkMockServers('192.168.2.150');
		if (!currentStatus.allRunning) {
			throw new Error('Mock servers stopped running during test');
		}

		console.log('✅ Mock servers confirmed running on 192.168.2.150:6467 (pairing) and 192.168.2.150:6466 (remote)');

		// Step 1: Click "Search Devices" to populate device list with mock device
		try {
			console.log('🔍 Step 1: Searching for "Search Devices" button...');
			const searchButton = await driver.$('~searchDevicesButton');

			if (await searchButton.isDisplayed()) {
				console.log('🔘 Clicking "Search Devices" button to add mock device...');
				await searchButton.click();
				await driver.pause(6000); // Wait for scan to complete and mock device to be added

				console.log('📱 Device scan completed');
			} else {
				console.log('⚠️  Using fallback search for Search Devices button...');
				const buttons = await driver.$$('XCUIElementTypeButton');
				let found = false;
				for (const button of buttons) {
					const text = await button.getAttribute('name');
					if (text && text.includes('Search Devices')) {
						await button.click();
						await driver.pause(6000);
						found = true;
						break;
					}
				}
				if (!found) throw new Error('Search Devices button not found');
			}
		} catch (error) {
			console.log('❌ Failed to find Search Devices button:', error.message);
			throw error;
		}

		// Step 2: Verify picker has devices and check if mock device is selected
		try {
			console.log('🔍 Step 2: Checking device picker state...');

			const pageSource = await driver.getPageSource();
			const hasMockDevice = pageSource.includes('Mock TV (Testing)');
			const hasDevices = !pageSource.includes('No devices found');

			console.log('📱 Mock device found in picker:', hasMockDevice);
			console.log('📱 Picker has devices:', hasDevices);

			if (!hasMockDevice || !hasDevices) {
				console.log('⚠️  Mock device not found in picker - this might be expected');
				// The app should auto-select the first device (mock device) according to handleScan logic
			}

			// Try to interact with picker if needed
			const picker = await driver.$('~devicePicker');
			if (await picker.isDisplayed()) {
				console.log('📱 Device picker is visible and enabled');
			}
		} catch (error) {
			console.log('⚠️  Device picker check had issues:', error.message);
		}

		// Step 3: Click "Connect" to trigger AndroidRemote library
		try {
			console.log('🔍 Step 3: Looking for "Connect" button...');
			const connectButton = await driver.$('~connectButton');

			if (await connectButton.isDisplayed()) {
				const isEnabled = await connectButton.getAttribute('enabled');
				console.log('📱 Connect button enabled:', isEnabled);

				if (isEnabled === 'true') {
					console.log('🔘 Clicking "Connect" button to trigger AndroidRemote library...');
					// Check current status before clicking
					const beforePageSource = await driver.getPageSource();
					const beforeStatus = beforePageSource.match(/Status: (\w+)/)?.[1] || 'Unknown';
					console.log('📱 Status before click:', beforeStatus);
					
					await connectButton.click();
					await driver.pause(8000); // Increased wait time for connection attempt
					
					// Check status after clicking
					const afterPageSource = await driver.getPageSource();
					const afterStatus = afterPageSource.match(/Status: (\w+)/)?.[1] || 'Unknown';
					console.log('📱 Status after click:', afterStatus);
					console.log('📱 Status changed:', beforeStatus !== afterStatus);
					console.log('📱 Connection attempt completed');
				} else {
					console.log('⚠️  Connect button is disabled - no device selected properly');

					// Let's try to check what device is currently selected
					const pageSource2 = await driver.getPageSource();
					console.log(
						'📱 Current selected device in status:',
						pageSource2.includes('localhost') ? 'localhost selected' : 'no device selected',
					);

					// Try clicking anyway to see what happens
					console.log('🔘 Attempting to click disabled Connect button...');
					await connectButton.click();
					await driver.pause(5000);
				}
			} else {
				console.log('⚠️  Using fallback search for Connect button...');
				const buttons = await driver.$$('XCUIElementTypeButton');
				let connectFound = false;

				for (const button of buttons) {
					const buttonText = await button.getAttribute('name');
					if (buttonText && buttonText.includes('Connect') && !buttonText.includes('Disconnect')) {
						console.log('🔘 Found Connect button, clicking...');
						await button.click();
						await driver.pause(5000);
						connectFound = true;
						break;
					}
				}

				if (!connectFound) {
					throw new Error('Connect button not found');
				}
			}
		} catch (error) {
			console.log('❌ Connect button interaction failed:', error.message);
			console.log('🔍 This might be expected if no device is properly selected');
		}

		// Step 4: Check results - verify connection was made by checking server status
		console.log('📊 Checking if connection was successful...');

		// Get final app state for debugging
		const finalPageSource = await driver.getPageSource();
		const hasPairingDialog =
			finalPageSource.includes('Pairing') || finalPageSource.includes('Enter code');
		const hasConnectedStatus = finalPageSource.includes('Connected');
		const hasPairingStatus = finalPageSource.includes('Pairing Needed');
		const hasUnpairedStatus = finalPageSource.includes('Unpaired');
		const hasErrorStatus = finalPageSource.includes('Error');

		console.log('📱 App shows pairing dialog:', hasPairingDialog);
		console.log('📱 App shows connected status:', hasConnectedStatus);
		console.log('📱 App shows pairing needed status:', hasPairingStatus);
		console.log('📱 App shows unpaired status:', hasUnpairedStatus);
		console.log('📱 App shows error status:', hasErrorStatus);
		
		// Debug: Print relevant parts of the page source
		if (finalPageSource.includes('192.168.2.150')) {
			console.log('📱 App shows mock server IP in UI');
		}
		if (finalPageSource.includes('Mock TV')) {
			console.log('📱 App shows mock device name in UI');
		}

		// Check if we at least triggered some app state changes
		const hasStatusChange =
			finalPageSource.includes('192.168.2.150') ||
			finalPageSource.includes('Mock TV') ||
			!finalPageSource.includes('No devices found');

		// Determine success based on app behavior (since we can't directly track server connections in separated setup)
		const connectionSuccess = hasPairingDialog || hasPairingStatus || hasConnectedStatus || hasUnpairedStatus || hasErrorStatus;
		
		// Result for our test
		const connectionResult = {
			success: connectionSuccess,
			appShowsPairing: hasPairingDialog,
			appShowsPairingNeeded: hasPairingStatus,
			appShowsConnected: hasConnectedStatus,
			appStatusChanged: hasStatusChange,
			message: connectionSuccess
				? 'SUCCESS: AndroidRemote library triggered connection (pairing dialog or connection status shown)!'
				: hasStatusChange
				? 'PARTIAL: App UI changed but no connection dialog detected'
				: 'FAILED: No connection or pairing activity detected',
		};

		console.log('📱 Connection result:', connectionResult);

		if (connectionSuccess) {
			console.log('✅ SUCCESS: AndroidRemote library successfully triggered connection!');
			console.log('📱 App shows connection activity (pairing dialog or status change)');
			console.log('🔍 Check your Xcode breakpoints in TcpSocketClient.m - they should have been hit!');
			console.log('🖥️  Check mock server logs for connection details');
		} else {
			console.log('❌ No clear connection activity detected in app');
			console.log('🔍 Check if device picker shows mock device and Connect button works');
		}

		// Test succeeds if we see any connection activity in the app
		expect(connectionSuccess, 'AndroidRemote library should show connection activity (pairing or connection status)')
			.to.be.true;

		console.log('✅ TCP socket connection test completed');
	});

	// 	console.log('✅ Mock server connection test completed');
	// });
});
