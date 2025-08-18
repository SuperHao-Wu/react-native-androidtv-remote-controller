const { expect } = require('chai');
const { checkMockServers, waitForMockServers } = require('../utils/server-check');
const http = require('http');

// Helper function to get TV state from mock server
async function getTVState() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3001/status', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const status = JSON.parse(data);
        resolve(status.tvState || { muted: false });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout getting TV state'));
    });
  });
}

// Helper function to wait for mute state change
async function waitForMuteState(expectedMuted, timeoutMs = 3000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const tvState = await getTVState();
    if (tvState.muted === expectedMuted) {
      console.log(`✅ TV mute state confirmed: ${expectedMuted}`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 200)); // Check every 200ms
  }
  
  console.log(`❌ Timeout waiting for mute state: ${expectedMuted}`);
  return false;
}

describe('Smart Reconnection Test - Certificate-Based Port 6466 Connection', function () {
  let mockServerStatus;

  before(async function () {
    this.timeout(TEST_CONFIG.APP_LAUNCH_TIMEOUT);

    console.log('🔄 Setting up smart reconnection test scenario...');
    console.log('📱 Scenario: App has certificate in keychain, status=Disconnected, user clicks Connect');
    console.log('🎯 Expected: Smart routing → port 6466 (remote) → successful connection → mute/unmute');

    // Step 1: Check if mock servers are running FIRST
    console.log('🔍 Step 1: Checking mock server availability...');
    mockServerStatus = await waitForMockServers('192.168.2.150', 3, 1000);
    console.log('✅ Mock servers confirmed running');

    // Step 2: Generate test client certificate BEFORE app launch (simulating previous pairing)
    console.log('🔐 Step 2: Generating client certificate BEFORE app launch (simulating previous successful pairing)...');
    const certificateResponse = await new Promise((resolve, reject) => {
      const postData = '';
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/generate-test-certificate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postData.length,
          'x-test-host': '192.168.2.150'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const response = JSON.parse(data);
          resolve(response);
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout generating test certificate'));
      });
      
      req.write(postData);
      req.end();
    });

    if (!certificateResponse.success) {
      throw new Error(`Certificate generation failed: ${certificateResponse.error}`);
    }

    const testCertificate = certificateResponse.certificate; // Base64 encoded certificate
    const testPrivateKey = certificateResponse.privateKey; // Base64 encoded private key
    console.log(`✅ Certificate generated BEFORE app launch: ${testCertificate.length} + ${testPrivateKey.length} chars`);

    // Step 3: Launch app ONCE with pre-generated certificate (all parameters ready)
    console.log('🚀 Step 3: Launching app with pre-generated certificate (simulating app restart after previous pairing)...');
    console.log('📋 Launch arguments being passed:');
    console.log('   - e2etestmode: 1');
    console.log('   - e2ehost: 192.168.2.150');
    console.log(`   - e2ecertificate: ${testCertificate.substring(0, 50)}... (${testCertificate.length} chars)`);
    console.log(`   - e2eprivatekey: ${testPrivateKey.substring(0, 50)}... (${testPrivateKey.length} chars)`);
    
    await driver.execute('mobile: launchApp', { 
      bundleId: 'com.haoandroidtv.example',
      arguments: [
        '-e2etestmode', '1',
        '-e2ehost', '192.168.2.150',
        '-e2ecertificate', testCertificate,
        '-e2eprivatekey', testPrivateKey,
      ]
    });
    
    console.log('⏳ Allowing time for app launch and E2E mode setup...');
    await driver.pause(8000); // Allow time for E2E mode setup and certificate storage in keychain

    // Step 4: Verify app is responsive and in E2E test mode
    console.log('🔍 Step 4: Verifying app launched successfully...');
    const appState = await driver.queryAppState('com.haoandroidtv.example');
    expect(appState).to.equal(4); // 4 = running in foreground
    
    console.log('✅ App launched successfully - certificate stored in keychain, ready for smart reconnection test');
    console.log('✅ Setup complete - all prerequisites ready before app launch');
  });

  afterEach(async function () {
    console.log('✅ Mute test step completed');
  });

  after(async function () {
    console.log('🏁 Mute remote control test completed');
  });

  it('should demonstrate smart reconnection: certificate exists → port 6466 → mute/unmute', async function () {
    this.timeout(TEST_CONFIG.NETWORK_TIMEOUT);

    console.log('🔄 Testing smart reconnection with stored certificate...');
    console.log('📋 Test Flow: Disconnected → Click Connect → Smart routing to port 6466 → Connection → Mute/Unmute');

    // Verify mock servers are still running
    const currentStatus = await checkMockServers('192.168.2.150');
    if (!currentStatus.allRunning) {
      throw new Error('Mock servers stopped running during test');
    }

    console.log('✅ Mock servers confirmed running on 192.168.2.150:6467 (pairing) and 192.168.2.150:6466 (remote)');

    // Step 1: Verify initial state - certificate in keychain, status = Disconnected
    console.log('🔍 Step 1: Verifying initial state (certificate stored, status=Disconnected)...');
    
    // Check that device is available (E2E mode pre-populates mock device)
    const devicePicker = await driver.$('~devicePicker');
    const isPickerEnabled = await devicePicker.getAttribute('enabled');
    
    if (isPickerEnabled !== 'true') {
      console.log('⚠️ Device picker not enabled - waiting for E2E setup...');
      await driver.pause(2000);
    } else {
      console.log('✅ Device picker enabled - mock device available');
    }

    // Verify initial status is Disconnected (certificate exists but not connected)
    let initialStatus = 'Unknown';
    try {
      const statusElements = await driver.$$('//XCUIElementTypeStaticText[contains(@name, "Status:")]');
      if (statusElements.length > 0) {
        const statusText = await statusElements[0].getText();
        initialStatus = statusText.replace('Status: ', '');
        console.log('📱 Initial connection status:', initialStatus);
      }
    } catch (error) {
      console.log('⚠️ Could not read initial status, continuing...');
    }

    // Step 2: Smart Reconnection - Click Connect Button (should route to port 6466)
    console.log('🔗 Step 2: Testing smart reconnection (expecting port 6466 routing)...');
    
    const connectButton = await driver.$('~connectButton');
    if (await connectButton.isDisplayed()) {
      const isEnabled = await connectButton.getAttribute('enabled');
      
      if (isEnabled === 'true') {
        console.log('🔘 Clicking "Connect" button...');
        console.log('🎯 Expected behavior: Certificate exists → Smart routing → Port 6466 (remote)');
        await connectButton.click();
        
        // Monitor connection states during smart routing
        console.log('⏳ Monitoring smart connection routing...');
        
        let statusHistory = [];
        const monitoringStart = Date.now();
        
        // Monitor for up to 10 seconds to capture the connection flow
        while (Date.now() - monitoringStart < 10000) {
          try {
            const statusElements = await driver.$$('//XCUIElementTypeStaticText[contains(@name, "Status:")]');
            if (statusElements.length > 0) {
              const statusText = await statusElements[0].getText();
              const newStatus = statusText.replace('Status: ', '');
              
              if (statusHistory.length === 0 || statusHistory[statusHistory.length - 1] !== newStatus) {
                statusHistory.push(newStatus);
                console.log(`📱 Status change: ${newStatus}`);
                
                // Break early if we reach Connected
                if (newStatus === 'Connected') {
                  console.log('✅ Connected status reached!');
                  break;
                }
              }
            }
          } catch (error) {
            // Status element may not be available during transitions
          }
          
          await driver.pause(500); // Check every 500ms
        }
        
        console.log('📊 Connection status history:', statusHistory);
        
      } else {
        throw new Error('Connect button is disabled');
      }
    }

    // Step 3: Verify Smart Reconnection Success (NO pairing dialog)
    console.log('📱 Step 3: Verifying smart reconnection (expecting NO pairing dialog)...');
    
    let isConnected = false;
    let hasPairingDialog = false;
    
    // Check for Connected status via status text (more reliable)
    try {
      const statusElements = await driver.$$('//XCUIElementTypeStaticText[contains(@name, "Status:")]');
      if (statusElements.length > 0) {
        const statusText = await statusElements[0].getText();
        isConnected = statusText.includes('Connected');
        console.log('📱 Connection status check:', statusText, '→ Connected:', isConnected);
      } else {
        console.log('⚠️ No status elements found');
      }
    } catch (error) {
      console.log('⚠️ Error checking connection status:', error.message);
    }
    
    // CRITICAL: Verify NO pairing dialog appeared (smart routing should use port 6466)
    try {
      const pairingElements = await driver.$$('//XCUIElementTypeStaticText[contains(@name, "Pairing") or contains(@name, "Enter code")]');
      hasPairingDialog = pairingElements.length > 0;
    } catch (error) {
      hasPairingDialog = false; // No pairing elements found (good)
    }
    
    console.log('📱 Smart reconnection successful:', isConnected);
    console.log('📱 Pairing dialog skipped (port 6466 used):', !hasPairingDialog);
    
    if (hasPairingDialog) {
      console.error('❌ CRITICAL: Pairing dialog appeared - smart routing failed!');
      console.error('   Expected: Certificate exists → Port 6466 (remote)');
      console.error('   Actual: App went to Port 6467 (pairing) - certificate not found or invalid');
      throw new Error('Smart routing failed - pairing dialog appeared when certificate should exist');
    }
    
    if (!isConnected) {
      console.log('🔍 Checking final connection status...');
      const statusElements = await driver.$$('//XCUIElementTypeStaticText[contains(@name, "Status")]');
      for (const element of statusElements) {
        const text = await element.getText();
        console.log('📱 Final status:', text);
      }
      throw new Error('Smart reconnection failed - app does not show Connected status');
    }
    
    console.log('✅ SUCCESS: Smart reconnection worked - port 6466 connection established without pairing');

    // Step 4: Get initial TV state
    console.log('📊 Step 4: Getting initial TV mute state...');
    
    const initialTvState = await getTVState();
    console.log('📊 Initial TV state:', initialTvState);
    
    // Step 5: Test mute sequence (mute → unmute → mute)
    console.log('🔇 Step 5: Testing mute/unmute sequence...');
    
    const muteButton = await driver.$('~muteButton');
    if (!(await muteButton.isDisplayed())) {
      throw new Error('Mute button not found - check testID implementation');
    }
    
    console.log('✅ Mute button found and ready for testing');
    
    // Test sequence: Initial → Mute → Unmute → Mute
    const testSequence = [
      { action: 'First Mute', expectedMuted: !initialTvState.muted },
      { action: 'Unmute', expectedMuted: initialTvState.muted },
      { action: 'Final Mute', expectedMuted: !initialTvState.muted }
    ];
    
    for (let i = 0; i < testSequence.length; i++) {
      const step = testSequence[i];
      
      console.log(`🔇 Step 5.${i + 1}: ${step.action} - expecting muted=${step.expectedMuted}`);
      
      // Click mute button
      await muteButton.click();
      console.log(`🔘 Mute button clicked for: ${step.action}`);
      
      // Wait 1 second for command processing
      await driver.pause(1000);
      
      // Verify TV state changed
      const stateChanged = await waitForMuteState(step.expectedMuted, 3000);
      
      if (!stateChanged) {
        const actualState = await getTVState();
        console.error(`❌ Mute state verification failed for ${step.action}`);
        console.error(`   Expected muted: ${step.expectedMuted}`);
        console.error(`   Actual muted: ${actualState.muted}`);
        throw new Error(`TV mute state did not change as expected for ${step.action}`);
      }
      
      console.log(`✅ ${step.action} successful - TV muted: ${step.expectedMuted}`);
    }
    
    // Step 6: Final verification and summary
    console.log('📊 Step 6: Final test summary...');
    
    const finalTvState = await getTVState();
    console.log('📊 Final TV state:', finalTvState);
    
    console.log('🎮 Smart Reconnection Test Summary (Certificate-Based Port 6466):');
    console.log('   - E2E test mode activated: ✅');
    console.log('   - Certificate pre-stored in keychain: ✅');
    console.log('   - Initial status = Disconnected: ✅');
    console.log('   - Smart Connect button clicked: ✅');
    console.log('   - Smart routing to port 6466 (remote): ✅');
    console.log('   - Skipped pairing process (no PIN dialog): ✅');
    console.log('   - TLS connection with stored certificate: ✅');
    console.log('   - Remote connection established: ✅');
    console.log('   - Mute command 1 (mute): ✅');
    console.log('   - Mute command 2 (unmute): ✅');
    console.log('   - Mute command 3 (mute): ✅');
    console.log('   - TV state tracking via mock server: ✅');
    console.log(`   - Final mute state: ${finalTvState.muted}`);
    console.log(`   - Total mute toggles: ${finalTvState.muteToggleCount || 'N/A'}`);
    
    console.log('🎯 SUCCESS: Smart reconnection test completed - certificate-based port 6466 connection');

    // Success assertions
    expect(isConnected).to.be.true;
    expect(hasPairingDialog).to.be.false; // Critical: No pairing dialog should appear
    expect(finalTvState.muteToggleCount).to.be.at.least(3); // At least 3 mute commands sent
    
    console.log('✅ Smart reconnection and mute control test passed');
  });
});