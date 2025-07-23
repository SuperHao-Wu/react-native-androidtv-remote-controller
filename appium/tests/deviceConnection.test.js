const { expect } = require('chai');

describe('iPhone Device Connection Test', function() {
  
  it('should connect to the iPhone and verify app is running', async function() {
    this.timeout(30000);
    
    console.log('📱 Testing connection to iPhone device...');
    
    // Check if we can connect to the device
    const appState = await driver.queryAppState('org.reactjs.native.example.TestAndroidTVRemoteApp');
    console.log('📱 App state:', appState);
    
    // App state 4 = running in foreground
    expect(appState).to.be.oneOf([3, 4]); // 3 = background, 4 = foreground
    
    // Try to get page source
    const pageSource = await driver.getPageSource();
    expect(pageSource).to.include('TestAndroidTVRemoteApp');
    
    // Take a screenshot to verify connectivity
    const screenshot = await driver.takeScreenshot();
    expect(screenshot).to.be.a('string');
    expect(screenshot.length).to.be.greaterThan(1000); // Should be base64 encoded image
    
    console.log('✅ Successfully connected to iPhone and verified app');
  });

  it('should verify device capabilities', async function() {
    this.timeout(15000);
    
    console.log('🔍 Testing device capabilities...');
    
    // Get device info
    const platformName = await driver.getPlatform();
    expect(platformName.toLowerCase()).to.equal('ios');
    
    // Check network connectivity
    const networkConnection = await driver.getNetworkConnection();
    expect(networkConnection).to.be.greaterThan(0);
    
    console.log('✅ Device capabilities verified');
  });
});
