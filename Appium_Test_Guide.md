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
- **Appium**: Version 2.19.0 or higher
- **WebDriverAgent**: Built and installed automatically by Appium

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

# Install Carthage (required for WebDriverAgent)
brew install carthage
```

### 3. WebDriverAgent Setup

WebDriverAgent is automatically built and installed by Appium when running tests. However, you may need to configure it for your development team:

#### Automatic Setup (Recommended)

Appium will automatically:
- Download and build WebDriverAgent
- Install it on your connected iPhone
- Handle code signing using your development certificate

#### Manual Setup (If Automatic Fails)

If you encounter WebDriverAgent code signing issues:

1. **Open WebDriverAgent project in Xcode:**

```bash
# Find WebDriverAgent location (installed by Appium)
find ~/.appium -name "WebDriverAgent.xcodeproj" -type d

# Open in Xcode (replace path with actual location)
open ~/.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj
```

2. **Configure signing for WebDriverAgentLib and WebDriverAgentRunner:**
   - Select **WebDriverAgentLib** target
   - Go to **Signing & Capabilities**
   - Select your **Development Team**
   - Choose **Automatically manage signing**
   - Repeat for **WebDriverAgentRunner** target

3. **Build WebDriverAgent:**

```bash
# Build for your device (replace with your device UDID)
xcodebuild -project ~/.appium/.../WebDriverAgent.xcodeproj \
           -scheme WebDriverAgentRunner \
           -destination 'platform=iOS,id=YOUR-DEVICE-UDID' \
           test-without-building
```

#### WebDriverAgent Verification

After setup, verify WebDriverAgent is working:

```bash
# This should show WebDriverAgent successfully installed
yarn appium:doctor

# Expected output includes:
✔ WebDriverAgent is installed at: ~/.appium/...
✔ Carthage was found at: /opt/homebrew/bin/carthage
✔ The iOS Development certificate is installed
```

### 4. Verify Appium Setup

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

### 5. Build and Install Test App

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

### 6. Start Appium Server

```bash
# In project root directory
cd ..

yarn appium:start

# OR manually:
npx appium server --address localhost --port 4723 --relaxed-security --allow-cors
```

### 7. Run Tests

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

## Debugging Setup

This section covers how to debug both JavaScript code (VS Code) and native Objective-C code (Xcode) for the `react-native-tcp-socket` library that handles Sony TV connections.

### JavaScript Debugging with VS Code

The project includes VS Code debugging configurations that use **attach mode** rather than launching from the IDE. This approach is more flexible and realistic.

#### Available Debug Configurations

1. **Attach to Jest Tests** - Debug unit tests
2. **Attach to Appium/WDIO Tests** - Debug Appium test suite
3. **Attach to React Native Metro** - Debug Metro bundler
4. **Attach to Mock Server** - Debug mock TLS server

#### How to Debug JavaScript Code

**Similar to Python's `debugpy --wait-for-client` behavior - the process waits for debugger attachment before starting:**

1. **Start your process in debug wait mode:**

```bash
# Debug Jest tests (waits for debugger)
yarn test:debug

# Debug Appium tests (waits for debugger)  
yarn appium:debug

# Debug mock server (waits for debugger)
yarn mock:debug
```

The process will show:
```
Debugger listening on ws://127.0.0.1:9230/...
For help, see: https://nodejs.org/en/docs/inspector
Debugger attached.
```

And **wait** for you to attach the debugger before executing any code.

2. **Attach VS Code debugger to trigger execution:**

   - Open VS Code
   - Go to Run and Debug (Ctrl+Shift+D)
   - Select appropriate configuration:
     - "Attach to Jest Tests" (port 9229)
     - "Attach to Appium/WDIO Tests" (port 9230)
     - "Attach to Mock Server" (port 9231)
   - Press **F5** - This triggers the start of the debugging session (like Python)

3. **Execution flow:**
   - Process starts and waits for debugger
   - You set breakpoints in VS Code
   - Press F5 to attach debugger
   - **Code execution begins** only after debugger attachment
   - Breakpoints will be hit from the very beginning

3. **Set breakpoints:**
   - In your JavaScript source files (src/ directory)
   - In test files (**tests**/ or appium/tests/)
   - In mock server code (**tests**/MockServer.js)

#### Key Files to Debug

- **PairingManager.js** - TLS handshake and PIN validation logic
- **RemoteManager.js** - Connection lifecycle and cleanup
- **MockServer.js** - Mock Sony TV server responses
- **sonyTvPairingNative.test.js** - End-to-end test scenarios

### Native iOS Debugging with Xcode

Debug the `react-native-tcp-socket` Objective-C code that handles TLS connections, certificate validation, and socket management.

#### Setup Xcode for Debugging

1. **Open the iOS project:**

```bash
cd example/ios
open TestAndroidTVRemoteApp.xcworkspace
```

2. **Locate react-native-tcp-socket source:**
   - In Xcode project navigator
   - Expand "Pods" → "react-native-tcp-socket"
   - Key files to debug:
     - `TcpSocketClient.h/.m` - Main socket implementation
     - `TcpSockets.h/.m` - React Native bridge module

#### Key Native Code Areas

**TcpSocketClient.m contains:**

- TLS/SSL certificate handling (Security framework)
- Socket connection lifecycle
- Error handling and cleanup
- Certificate validation logic

**Common breakpoint locations:**

```objc
// Certificate handling
- (void)connectTLS:(NSDictionary *)options;

// Connection callbacks
- (void)socket:(GCDAsyncSocket *)sock didConnectToHost:(NSString *)host port:(uint16_t)port;

// TLS handshake
- (void)socket:(GCDAsyncSocket *)sock didReceiveTrust:(SecTrustRef)trust;

// Error handling
- (void)socket:(GCDAsyncSocket *)sock didDisconnectWithError:(NSError *)err;
```

#### Debug Process for Connection Issues

1. **Start Appium test normally:**

```bash
yarn appium:start  # Terminal 1
yarn appium:test   # Terminal 2
```

2. **Attach Xcode debugger:**

   - In Xcode: Debug → Attach to Process by PID or Name
   - Select your app: "TestAndroidTVRemoteApp"
   - Or attach by device: iPhone → TestAndroidTVRemoteApp

3. **Set breakpoints in native code:**

   - TLS connection establishment
   - Certificate validation
   - Socket disconnection/cleanup
   - Error callbacks

4. **Trigger the issue:**
   - Run your Appium test that reproduces the problem
   - The native debugger will pause at breakpoints
   - Inspect variables, call stack, and step through code

#### Advanced Debugging Techniques

**1. Symbolic Breakpoints:**
Set breakpoints on Objective-C method names:

```
-[TcpSocketClient connectTLS:]
-[GCDAsyncSocket connectToHost:onPort:error:]
```

**2. Exception Breakpoints:**

- Add Exception Breakpoint in Xcode
- Catches all Objective-C exceptions
- Useful for TLS/certificate errors

**3. Network Debugging:**
Enable network logging in Xcode console:

```bash
# Set environment variable in Xcode scheme
CFNETWORK_DIAGNOSTICS=3
```

**4. Certificate Chain Inspection:**
Add breakpoints in Security framework calls:

```objc
SecTrustEvaluate()
SecCertificateCreateWithData()
SecPolicyCreateSSL()
```

#### Debugging Your Specific Sony TV Issues

**Issue: `secureConnect` callback not triggered**

- Set breakpoint in `didReceiveTrust:` method
- Check if TLS handshake completes
- Inspect certificate validation results

**Issue: Multiple connections not cleaned up**

- Set breakpoint in `didDisconnectWithError:`
- Check if cleanup code is called
- Monitor socket state transitions

**Issue: TV blocking after multiple attempts**

- Monitor connection attempt frequency
- Check socket reuse vs. creation
- Inspect error codes and retry logic

### Debugging Workflow Example

**Complete debugging session for connection stability (Python debugpy-like workflow):**

#### **Single Test Focus (Recommended for debugging)**

1. **Terminal 1:** Start Appium server
```bash
yarn appium:start
```

2. **Terminal 2:** Start specific test in debug wait mode
```bash
yarn appium:debug-spec appium/tests/sonyTvPairingNative.test.js
```
Output shows:
```
Debugger listening on ws://127.0.0.1:9230/...
For help, see: https://nodejs.org/en/docs/inspector
```
**Process waits here - no execution yet**

3. **Xcode:** Configure for wait-and-attach
   - Open: `cd example/ios && open TestAndroidTVRemoteApp.xcworkspace`
   - Edit Scheme → Run → Info → Check "Wait for the executable to be launched" 
   - Set breakpoints in `TcpSocketClient.m`:
     ```objc
     - (void)connectTLS:(NSDictionary *)options  // TLS start
     - (void)didReceiveTrust:(SecTrustRef)trust  // Certificate validation  
     - (void)didDisconnectWithError:(NSError *)err  // Cleanup issues
     ```
   - Press ⌘R (Run) - **Xcode waits for app launch**

4. **VS Code:** Set breakpoints and trigger execution
   - Set breakpoints in `PairingManager.js`, test files, etc.
   - Go to Run and Debug (Ctrl+Shift+D)
   - Select "Attach to Appium/WDIO Tests"
   - Press **F5** - This starts the test execution

5. **Dual debugging session begins:**
   - **VS Code** attachment triggers test execution
   - **Test launches React Native app**
   - **Xcode automatically attaches** when app starts
   - **Both debuggers active** - step through JS → Native code flow
   - Debug the exact path: JavaScript → react-native-tcp-socket → iOS system calls

#### **Auto-Discovery Mode (All tests)**

```bash
# Run all tests with auto-discovery
yarn appium:debug  # Runs all *.test.js files in appium/tests/
```

This workflow ensures you **never miss early execution** and get **complete visibility** into both JavaScript and native code - just like Python's `debugpy --wait-for-client` behavior!

This dual-debugging approach gives you complete visibility into the connection lifecycle and helps identify where the stability issues occur.

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

#### 5. WebDriverAgent Build Issues

```
Error: Unable to launch WebDriverAgent because of xcodebuild failure
```

**Solutions**:

1. **Check development certificate:**
   - Open Xcode Preferences → Accounts
   - Ensure valid Apple Developer account is signed in
   - Download development certificates if missing

2. **Manual WebDriverAgent setup:**
   - Follow the **WebDriverAgent Setup** section above
   - Configure code signing manually in Xcode
   - Build WebDriverAgent for your specific device

3. **Clear WebDriverAgent cache:**
   ```bash
   # Remove cached WebDriverAgent builds
   rm -rf ~/.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent/build
   
   # Force rebuild on next test run
   yarn appium:test
   ```

4. **Update bundle identifier conflicts:**
   - WebDriverAgent may conflict with existing bundle IDs
   - Change bundle ID in WebDriverAgent project if needed

#### 6. Code Signing Issues

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
