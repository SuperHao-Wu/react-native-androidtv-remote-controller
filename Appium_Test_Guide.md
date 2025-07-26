# React Native Android TV Remote - iOS Testing Guide

## Overview

This React Native library enables Android TV remote control functionality through TLS-secured TCP socket communication. This guide focuses on iOS testing using Appium to debug connection stability issues and simulate real-world scenarios with mock servers.

## Problem Statement

When testing with real Sony TV hardware, several stability issues occur:

- iPhone sends pairing request but `secureConnect` callback isn't triggered
- Multiple failed connections cause the TV to block the iPhone for hours
- Connection leaks: multiple TCP connections from same IP remain open
- TV server logs show multiple established connections that aren't properly closed

## Testing Strategy

We use **Appium + Mock Servers** to:

- Test on real iPhone hardware (avoiding simulator limitations)
- Simulate problematic TV behaviors without hardware blocking
- Debug connection lifecycle and cleanup issues
- Validate TLS socket implementation stability

## Prerequisites

### 1. Hardware Requirements

- **iPhone Device**: Physical iPhone (not simulator)
- **Mac with Xcode**: For iOS development and device connection
- **USB Cable**: To connect iPhone to Mac

### 2. Software Requirements

- **Node.js**: Version 14.18.1 or higher
- **Xcode**: Latest version with Command Line Tools
- **iOS Development Certificate**: To sign the test app

### 3. Device Setup

- **iPhone UDID**: Currently configured for `00008101-0010299E1484001E` (吴昊's iPhone)
- **Bundle ID**: `com.haoandroidtv.example` (update in configs if different)
- **iOS Version**: 18.5 (update in configs if different)

## Quick Start

### 1. Install Dependencies

```bash
# Install all dependencies
yarn install

# Install Appium globally (if not already installed)
npm install -g appium@2.19.0

# Install iOS driver
appium driver install xcuitest

# install Carthage
brew install carthage
```

### 2. Verify Appium Setup

```bash
# Check Appium iOS setup
yarn appium:doctor

# Expected output should show:
✔ The Node.js binary was found at: /opt/homebrew/Cellar/node/24.4.1/bin/node
✔ Node version is 24.4.1
✔ Xcode is installed at: /Applications/Xcode.app/Contents/Developer
✔ Xcode Command Line Tools are installed in: /Applications/Xcode.app/Contents/Developer
✔ DevToolsSecurity is enabled.
✔ The Authorization DB is set up properly.
✔ Carthage was found at: /opt/homebrew/bin/carthage. Installed version is: 0.40.0
✔ HOME is set to: /Users/$user
Diagnostic for necessary dependencies completed, no fix needed.
```

### 3. Build and Install Test App

```bash
# Navigate to example app
cd example

# Install iOS dependencies
cd ios && pod install && cd ..

# [Optional] find out ios device id
# install libimobiledevice
brew install libimobiledevice
# show the id
idevice_id -l
# Build and install on device (replace with your device UDID if different)
npx react-native run-ios --device $(idevice_id -l)
```

### 4. Start Appium Server

```bash
# In project root directory
cd ..

yarn appium:start

# OR manually:
npx appium server --address localhost --port 4723 --relaxed-security --allow-cors
```

### 5. Run Tests

#### Basic Device Connection Test

```bash
# Test basic device connectivity
npx wdio run ./appium/wdio.simple.conf.js
```

#### Full Sony TV Simulation Tests

```bash
# Run comprehensive connection stability tests
npx wdio run ./appium/wdio.conf.js
```

## Test Configurations

### Main Configuration (`appium/wdio.conf.js`)

- **Purpose**: Full test suite for connection stability debugging
- **Tests**: TCP socket lifecycle, memory stability, rapid connections
- **Target**: Real device connection issues simulation

### Simple Configuration (`appium/wdio.simple.conf.js`)

- **Purpose**: Basic connectivity verification
- **Tests**: Device connection and app responsiveness
- **Target**: Quick setup validation

## Test Scenarios

### 1. Connection Lifecycle Tests

```javascript
// Tests TCP socket connection stability
it('should handle Sony TV connection through native TCP socket implementation');
```

- **Purpose**: Validate `react-native-tcp-socket` behavior
- **Mock Server**: Simulates normal Sony TV responses
- **Validation**: Connection establishment and cleanup

### 2. Pairing Flow Simulation

```javascript
// Tests end-to-end pairing with PIN validation
it('should handle mock Sony TV pairing flow end-to-end');
```

- **Purpose**: Debug pairing request → secureConnect flow
- **Mock Server**: Simulates complete Sony TV pairing protocol
- **Validation**: TLS handshake and certificate exchange

### 3. Slow Response Handling

```javascript
// Tests app stability with delayed TV responses
it('should handle slow Sony TV responses without freezing');
```

- **Purpose**: Simulate TV timeout scenarios
- **Mock Server**: Configurable response delays (2+ seconds)
- **Validation**: App remains responsive during slow connections

### 4. Connection Failure Graceful Handling

```javascript
// Tests connection refusal scenarios
it('should handle connection failures gracefully');
```

- **Purpose**: Simulate TV blocking/refusing connections
- **Mock Server**: No server (connection refused)
- **Validation**: Proper error handling and cleanup

### 5. Rapid Connection Attempts

```javascript
// Tests multiple rapid connection attempts
it('should handle rapid connection attempts without crashing');
```

- **Purpose**: Simulate user frustration (rapid retries)
- **Mock Server**: Quick responses with parallel connections
- **Validation**: No connection leaks or crashes

### 6. Memory Stability

```javascript
// Tests memory usage during multiple connections
it('should maintain stable memory usage during mock TV communication');
```

- **Purpose**: Detect memory leaks from unclosed connections
- **Mock Server**: Multiple connection cycles
- **Validation**: App memory remains stable

### 7. TLS Certificate Validation

```javascript
// Tests certificate handling with self-signed certs
it('should handle TLS certificate validation with mock server');
```

- **Purpose**: Debug certificate-related connection issues
- **Mock Server**: TLS-enabled with self-signed certificates
- **Validation**: Proper certificate handling and validation

## Mock Server Configuration

The tests use a sophisticated mock server (`__tests__/MockServer.js`) that simulates Sony TV behavior:

```javascript
// Mock server with configurable delays
mockServer = await startMockTLSServer({
	port: 16467, // Sony TV pairing port
	responseDelay: 100, // Configurable response time
	enablePairingFlow: true, // Full pairing protocol
	enableTLS: true, // TLS certificate handling
});
```

### Key Mock Server Features

- **TLS Support**: Self-signed certificates for testing
- **Configurable Delays**: Simulate slow TV responses (100ms - 2000ms)
- **Pairing Protocol**: Complete Sony TV pairing message flow
- **Connection Logging**: Detailed logs for debugging connection lifecycle

## Device Configuration

### Bundle ID Setup

Update the bundle ID in configurations if your app uses a different identifier:

**File**: `appium/wdio.conf.js` and `appium/wdio.simple.conf.js`

```javascript
capabilities: [
	{
		'appium:bundleId': 'com.haoandroidtv.example', // Update this
	},
];
```

### Device UDID Setup

To use a different iPhone device:

1. **Find your device UDID**:

```bash
# List connected devices
xcrun xctrace list devices

# OR use ios-deploy
ios-deploy -c
```

2. **Update configurations**:

```javascript
capabilities: [
	{
		'appium:deviceName': 'Your iPhone Name',
		'appium:udid': 'YOUR-DEVICE-UDID-HERE',
		'appium:platformVersion': 'YOUR-IOS-VERSION',
	},
];
```

## Debugging Connection Issues

### 1. Enable Detailed Logging

```javascript
// In test files, add console logging
console.log('🔍 Connection attempt started...');
console.log('📱 App state:', await driver.queryAppState(bundleId));
console.log('🌐 Network state:', await driver.getNetworkConnection());
```

### 2. Check Mock Server Logs

```bash
# Mock server outputs detailed connection logs
🖥️  Mock Sony TV server started on port 16467
📡 Client connected from: 127.0.0.1:54312
🤝 TLS handshake initiated
🔐 Certificate exchange completed
❌ Client disconnected without proper cleanup
```

### 3. Capture Screenshots on Failure

```javascript
// Automatic screenshot capture configured in wdio.conf.js
afterTest: async function(test, context, { error }) {
  if (error) {
    const screenshot = await driver.takeScreenshot();
    // Saved to ./appium/screenshots/
  }
}
```

### 4. Monitor App Performance

```javascript
// Check app responsiveness during tests
const appState = await driver.queryAppState(bundleId);
expect(appState).to.equal(4); // 4 = running in foreground
```

## Troubleshooting

### Common Issues

#### 1. App Bundle Not Found

```
Error: App with bundle identifier 'com.haoandroidtv.example' unknown
```

**Solution**: Build and install the React Native app on device first:

```bash
cd example && npx react-native run-ios --device "Your iPhone"
```

#### 2. Device Connection Timeout

```
Error: Could not connect to device
```

**Solutions**:

- Ensure iPhone is connected via USB
- Trust the computer on iPhone (if prompted)
- Check device is unlocked and in foreground
- Verify UDID matches your device

#### 3. Appium Server Connection Failed

```
Error: connect ECONNREFUSED 127.0.0.1:4723
```

**Solution**: Start Appium server first:

```bash
yarn appium:start
```

#### 4. XCUITest Driver Issues

```
Error: XCUITest driver not installed
```

**Solution**: Install the iOS driver:

```bash
appium driver install xcuitest
```

#### 5. Code Signing Issues

```
Error: Could not install app on device
```

**Solution**: Ensure valid iOS development certificate in Xcode:

- Open `example/ios/TestAndroidTVRemoteApp.xcworkspace`
- Select valid development team in signing settings
- Build in Xcode first to resolve signing issues

### Test Debugging Tips

1. **Run Simple Test First**: Always start with `wdio.simple.conf.js` to verify basic setup
2. **Check App State**: Use `driver.queryAppState()` to verify app is running
3. **Monitor Logs**: Watch both Appium logs and mock server logs
4. **Incremental Testing**: Start with basic connectivity, then add complexity
5. **Screenshot Analysis**: Review failure screenshots in `./appium/screenshots/`

## Next Steps

1. **Run Basic Test**: Start with simple device connectivity test
2. **Analyze Results**: Review connection logs and behavior patterns
3. **Iterate on Mock Server**: Adjust mock server behavior to match real TV issues
4. **Debug Connection Lifecycle**: Focus on connection cleanup and resource management
5. **Validate Fixes**: Test fixes against both mock server and real TV hardware

This testing framework provides a robust foundation for debugging Sony TV connection stability issues without the risk of device blocking from real hardware.
