const { expect } = require('chai');
const { checkMockServers, waitForMockServers } = require('../utils/server-check');
const {
	verifyPairingFlow,
	resetMockServerPairingState,
	waitForPairingStep,
} = require('../utils/mock-server-client');
const http = require('http');

// Helper function to fetch generated PIN from mock server status API
async function fetchGeneratedPin() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3001/status', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          if (status.generatedPin) {
            console.log(`📋 Fetched generated PIN from server: ${status.generatedPin}`);
            resolve(status.generatedPin);
          } else {
            console.log('⚠️  No PIN generated yet, using fallback AB1234');
            resolve('AB1234');
          }
        } catch (error) {
          console.error('Error parsing server status:', error);
          resolve('AB1234');
        }
      });
    });
    req.on('error', (error) => {
      console.error('Error fetching PIN from server:', error);
      resolve('AB1234');
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve('AB1234');
    });
  });
}

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

		// Reset pairing state for clean test
		try {
			await resetMockServerPairingState();
			console.log('🔄 Reset mock server pairing state');
		} catch (error) {
			console.log('⚠️  Could not reset pairing state (server might not have status endpoint yet)');
		}

		// Ensure app is launched and ready
		try {
			// Check if app is running by looking for a basic element
			const appElement = await driver.$('//XCUIElementTypeApplication[@name="TestAndroidTVRemoteApp"]');
			if (await appElement.isDisplayed()) {
				console.log('📱 App is already running');
			}
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

		console.log(
			'✅ Mock servers confirmed running on 192.168.2.150:6467 (pairing) and 192.168.2.150:6466 (remote)',
		);

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

			// Check for mock device and devices list without page source dump
			let hasMockDevice = false;
			let hasDevices = false;
			
			try {
				const mockDeviceElement = await driver.$('//XCUIElementTypeStaticText[contains(@name, "Mock TV")]');
				hasMockDevice = await mockDeviceElement.isDisplayed();
			} catch (error) {
				// Element not found
			}
			
			try {
				const noDevicesElement = await driver.$('//XCUIElementTypeStaticText[@name="No devices found"]');
				hasDevices = !(await noDevicesElement.isDisplayed());
			} catch (error) {
				hasDevices = true; // Assume devices exist if "No devices" text not found
			}

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
					let beforeStatus = 'Unknown';
					try {
						const statusElement = await driver.$('//XCUIElementTypeStaticText[contains(@name, "Status")]');
						const statusText = await statusElement.getText();
						beforeStatus = statusText.match(/Status: (\w+)/)?.[1] || 'Unknown';
					} catch (error) {
						// Status element not found or couldn't get text
					}
					console.log('📱 Status before click:', beforeStatus);

					await connectButton.click();

					// CRITICAL: Extended wait for React Native bridge timing
					// The JS->Native bridge needs time to invoke the native TCP socket code
					console.log('⏳ Waiting for React Native bridge and native TCP socket initialization...');
					await driver.pause(8000); // Increased to 8 seconds for bridge timing
					
					// Additional check: Verify app status changed (indicates native code started)
					let afterStatus = 'Unknown';
					try {
						const statusElement = await driver.$('//XCUIElementTypeStaticText[contains(@name, "Status")]');
						const statusText = await statusElement.getText();
						afterStatus = statusText.match(/Status: (\w+)/)?.[1] || 'Unknown';
					} catch (error) {
						// Status element not found or couldn't get text
					}
					console.log('📱 Status after bridge wait:', afterStatus);
					
					if (beforeStatus === afterStatus) {
						console.log('⚠️  App status unchanged - bridge might need more time');
						await driver.pause(3000); // Additional bridge wait
					}

					// Check if pairing protocol steps occurred with retry logic
					let pairingRequestReceived = await waitForPairingStep('pairingRequest', 8000); // Increased timeout
					console.log('📋 Pairing request received by mock server:', pairingRequestReceived);

					// If no pairing request yet, wait a bit more and try again
					if (!pairingRequestReceived) {
						console.log('⏳ No pairing request yet, waiting additional 3 seconds...');
						await driver.pause(3000);
						pairingRequestReceived = await waitForPairingStep('pairingRequest', 5000);
						console.log('📋 Pairing request received after retry:', pairingRequestReceived);
					}

					if (pairingRequestReceived) {
						// Wait for configuration step which should trigger pairing dialog
						const pairingConfigReceived = await waitForPairingStep('pairingConfiguration', 5000);
						console.log(
							'📋 Pairing configuration received (should show dialog):',
							pairingConfigReceived,
						);
					}

					// Give additional time for UI to update
					await driver.pause(3000);

					// Check status after clicking
					let finalStatus = 'Unknown';
					try {
						const statusElement = await driver.$('//XCUIElementTypeStaticText[contains(@name, "Status")]');
						const statusText = await statusElement.getText();
						finalStatus = statusText.match(/Status: (\w+)/)?.[1] || 'Unknown';
					} catch (error) {
						// Status element not found or couldn't get text
					}
					console.log('📱 Status after click:', finalStatus);
					console.log('📱 Status changed:', beforeStatus !== finalStatus);
					console.log('📱 Connection attempt completed');
				} else {
					console.log('⚠️  Connect button is disabled - no device selected properly');

					// Let's try to check what device is currently selected
					let deviceSelected = false;
					try {
						const localhostElement = await driver.$('//XCUIElementTypeStaticText[contains(@name, "localhost")]');
						deviceSelected = await localhostElement.isDisplayed();
					} catch (error) {
						// localhost element not found
					}
					console.log(
						'📱 Current selected device in status:',
						deviceSelected ? 'localhost selected' : 'no device selected',
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

		// Step 4: Check results - verify actual TCP protocol communication occurred
		console.log('📊 Checking if TCP protocol communication was successful...');

		// Verify the actual pairing protocol flow with mock server
		const pairingFlowResult = await verifyPairingFlow();
		console.log('📋 Pairing flow verification:', pairingFlowResult);

		// Check for key UI elements without dumping full page source
		console.log('📱 Checking app state for pairing dialog...');
		let hasPairingDialog = false;
		let hasConnectedStatus = false;
		let hasPairingStatus = false;
		let hasUnpairedStatus = false;
		let hasErrorStatus = false;

		try {
			// Check for pairing dialog elements directly
			const pairingElements = await driver.$$('//XCUIElementTypeStaticText[contains(@name, "Pairing") or contains(@name, "Enter code")]');
			hasPairingDialog = pairingElements.length > 0;
			
			// Check for status elements
			const statusElements = await driver.$$('//XCUIElementTypeStaticText[contains(@name, "Connected") or contains(@name, "Status") or contains(@name, "Unpaired") or contains(@name, "Error")]');
			for (const element of statusElements) {
				try {
					const text = await element.getText();
					if (text.includes('Connected')) hasConnectedStatus = true;
					if (text.includes('Pairing Needed')) hasPairingStatus = true;
					if (text.includes('Unpaired')) hasUnpairedStatus = true;
					if (text.includes('Error')) hasErrorStatus = true;
				} catch (error) {
					// Skip if can't get text
				}
			}
		} catch (error) {
			console.log('⚠️  Could not check UI elements directly');
		}

		console.log('📱 App shows pairing dialog:', hasPairingDialog);
		console.log('📱 App shows connected status:', hasConnectedStatus);
		console.log('📱 App shows pairing needed status:', hasPairingStatus);
		console.log('📱 App shows unpaired status:', hasUnpairedStatus);
		console.log('📱 App shows error status:', hasErrorStatus);

		// If pairing dialog appeared, fetch generated PIN and enter it
		if (hasPairingDialog) {
			console.log('🔢 PIN dialog detected! Fetching generated PIN from server...');
			
			// Fetch the cryptographically valid PIN from mock server
			const generatedPin = await fetchGeneratedPin();
			console.log(`🔢 Using PIN: ${generatedPin}`);
			
			try {
				// Look for PIN input field using testID first, then fallback to other selectors
				let pinInput;
				try {
					pinInput = await driver.$('~pinInput'); // testID selector
				} catch (error) {
					pinInput = await driver.$('//XCUIElementTypeTextField[@value="Enter code" or @name="Enter code"]');
				}
				
				if (await pinInput.isDisplayed()) {
					await pinInput.setValue(generatedPin);
					console.log(`✅ PIN ${generatedPin} entered into input field`);
					
					// Try Submit button with testID first, then fallback selectors
					let submitClicked = false;
					
					// Try different selectors for Submit button (testID first)
					const submitSelectors = [
						'~submitButton',                                           // testID selector
						'//XCUIElementTypeOther[contains(@name, "Submit")]',       // Working XPath selector 
						'//XCUIElementTypeStaticText[@name="Submit"]/parent::*',   // Text "Submit" inside TouchableOpacity
						'//XCUIElementTypeButton[contains(@name, "Submit")]',      // Button element
						'//XCUIElementTypeStaticText[@name="Submit"]'              // Text element directly
					];
					
					for (const selector of submitSelectors) {
						try {
							const submitButton = await driver.$(selector);
							if (await submitButton.isDisplayed()) {
								await submitButton.click();
								console.log(`✅ Submit button clicked using selector: ${selector}`);
								submitClicked = true;
								break;
							}
						} catch (error) {
							console.log(`⚠️  Selector ${selector} failed: ${error.message}`);
						}
					}
					
					if (submitClicked) {
						// Wait for pairing completion and check app logs
						await driver.pause(5000); // Extended wait for server communication
						
						// Check console logs for pairing errors
						console.log('📱 Checking app console logs after PIN submission...');
						const logs = await driver.getLogs('syslog');
						const pairingLogs = logs.filter(log => 
							log.message.includes('sendPairingCode') || 
							log.message.includes('Code validation') ||
							log.message.includes('pairing')
						);
						if (pairingLogs.length > 0) {
							console.log('📱 Relevant pairing logs:');
							pairingLogs.forEach(log => console.log(`   ${log.message}`));
						}
						
						// Check if pairing completed successfully without verbose page source
						try {
							const connectedElement = await driver.$('//XCUIElementTypeStaticText[contains(@name, "Connected")]');
							const pairingCompleted = await connectedElement.isDisplayed();
							console.log('📱 Pairing completed after PIN entry:', pairingCompleted);
						} catch (error) {
							console.log('📱 Could not determine pairing status - may still be processing');
						}
					} else {
						console.log('❌ Could not find or click Submit button with any selector');
					}
				} else {
					console.log('⚠️  PIN input field not found, trying alternative selectors...');
					// Try alternative selector for text input
					const altPinInput = await driver.$('//XCUIElementTypeTextField');
					if (await altPinInput.isDisplayed()) {
						await altPinInput.setValue(generatedPin);
						console.log(`✅ PIN ${generatedPin} entered using alternative selector`);
					}
				}
			} catch (error) {
				console.log('❌ Error handling PIN dialog:', error.message);
			}
		}

		// Debug: Print relevant parts of the page source
		if (finalPageSource.includes('192.168.2.150')) {
			console.log('📱 App shows mock server IP in UI');
		}
		if (finalPageSource.includes('Mock TV')) {
			console.log('📱 App shows mock device name in UI');
		}

		// Success criteria: TCP protocol communication started (at least pairingRequest)
		const tcpProtocolSuccess =
			pairingFlowResult.pairingState && pairingFlowResult.pairingState.pairingRequestReceived;

		// App UI success: Must show pairing dialog specifically (not just any status)
		const appUISuccess = hasPairingDialog || hasPairingStatus;

		// Combined success: BOTH TCP protocol AND app UI response required
		const connectionSuccess = tcpProtocolSuccess && appUISuccess;

		// Result for our test
		const connectionResult = {
			success: connectionSuccess,
			tcpProtocolSuccess,
			appUISuccess,
			pairingFlow: pairingFlowResult,
			appShowsPairing: hasPairingDialog,
			appShowsPairingNeeded: hasPairingStatus,
			appShowsConnected: hasConnectedStatus,
			appShowsUnpaired: hasUnpairedStatus,
			appShowsError: hasErrorStatus,
			message: connectionSuccess
				? 'SUCCESS: TCP protocol communication and pairing dialog verified!'
				: tcpProtocolSuccess && !appUISuccess
				? 'PARTIAL: TCP protocol worked but pairing dialog did not appear'
				: !tcpProtocolSuccess && appUISuccess
				? 'PARTIAL: Pairing dialog appeared but no TCP protocol communication'
				: 'FAILED: No TCP protocol communication and no pairing dialog',
		};

		console.log('📱 Connection result:', connectionResult);

		if (connectionSuccess) {
			console.log(
				'✅ SUCCESS: AndroidRemote library successfully established TCP protocol communication AND pairing dialog appeared!',
			);
			console.log(
				'📋 TCP protocol steps completed:',
				Object.keys(pairingFlowResult.details || {}).filter(
					k => pairingFlowResult.details[k] === true,
				),
			);
			console.log('📱 App shows pairing dialog or pairing needed status');
			console.log(
				'🔍 Check your Xcode breakpoints in TcpSocketClient.m - they should have been hit!',
			);
			console.log('🖥️  Check mock server logs for detailed protocol messages');
		} else if (tcpProtocolSuccess && !appUISuccess) {
			console.log(
				'❌ PARTIAL FAILURE: TCP protocol communication worked but PAIRING DIALOG DID NOT APPEAR',
			);
			console.log(
				'📋 TCP protocol steps completed:',
				Object.keys(pairingFlowResult.details || {}).filter(
					k => pairingFlowResult.details[k] === true,
				),
			);
			console.log(
				'❓ App should show pairing dialog - check TLS readiness validation or AndroidRemote event handling',
			);
			console.log('🔧 This might be due to our new TLS readiness check timing out or failing');
		} else if (!tcpProtocolSuccess && appUISuccess) {
			console.log(
				'❌ PARTIAL FAILURE: Pairing dialog appeared but NO TCP protocol communication detected',
			);
			console.log('🔍 Check if AndroidRemote library is actually calling TcpSocket.connectTLS()');
			console.log('🔍 Check network connectivity between iPhone and Mac (192.168.2.150:6467)');
		} else {
			console.log('❌ COMPLETE FAILURE: No TCP protocol communication AND no pairing dialog');
			console.log('🔍 Check if AndroidRemote library is actually calling TcpSocket.connectTLS()');
			console.log('🔍 Check network connectivity between iPhone and Mac (192.168.2.150:6467)');
			console.log('🔧 Check TLS readiness validation implementation');
		}

		// Test succeeds only if BOTH TCP protocol AND app response work
		expect(
			connectionSuccess,
			`AndroidRemote library should complete TCP protocol communication AND show app response. TCP: ${tcpProtocolSuccess}, UI: ${appUISuccess}`,
		).to.be.true;

		console.log('✅ TCP socket connection test completed');
	});

	// 	console.log('✅ Mock server connection test completed');
	// });
});
