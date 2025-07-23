# Sony TV Pairing - Native iOS Testing with Appium Guide

## Overview

This guide demonstrates how to set up and run comprehensive native iOS tests for Sony TV pairing functionality using Appium on real iPhone hardware. The testing framework validates the native `react-native-tcp-socket` implementation without requiring actual Sony TV hardware by using sophisticated mock servers.

## 🎯 Testing Strategy

### Why Native Testing?

- **Real Device Validation**: Tests run on actual iPhone hardware, not simulators
- **Native Network Stack**: Validates actual TCP socket implementation behavior
- **Production Environment**: Tests the exact same code path users experience
- **Mock TV Approach**: Avoids Sony TV timeout/blocking issues by using mock servers

### Test Architecture

```
iPhone Device (Real Hardware)
    ↕ XCUITest Automation
Appium Server
    ↕ WebDriverIO
Test Suite
    ↕ Mock TLS Server
Simulated Sony TV
```

## 🚀 Setup Completed

### 1. **Dependencies Installed**

```json
{
	"devDependencies": {
		"appium": "^2.19.0",
		"@wdio/cli": "^9.18.4",
		"@wdio/local-runner": "^9.18.4",
		"@wdio/mocha-framework": "^9.18.0",
		"@wdio/spec-reporter": "^9.18.0",
		"@wdio/appium-service": "^9.18.4",
		"webdriverio": "^9.18.4",
		"chai": "^5.2.1"
	}
}
```

### 2. **XCUITest Driver Configured**

- Driver: `xcuitest@9.9.6`
- Platform: iOS real device testing
- Device: 吴昊's iPhone (UDID: 00008101-0010299E1484001E)

### 3. **Test Framework Structure**

```
appium/
├── wdio.conf.js              # Main Appium configuration
├── wdio.simple.conf.js       # Basic connectivity config
├── tests/
│   ├── setup.js              # Test environment setup
│   ├── deviceConnection.test.js    # Basic device connectivity
│   └── sonyTvPairingNative.test.js # Full Sony TV pairing tests
├── logs/                     # Test execution logs
└── screenshots/              # Failure screenshots
```

## 📱 Current Status

### ✅ Successfully Achieved

1. **Appium Server Running**: Connected to localhost:4723
2. **iPhone Recognition**: Device UDID properly detected
3. **XCUITest Communication**: Native iOS automation framework active
4. **Test Framework Ready**: Complete test suite created

### 🔍 Next Step Required

**Bundle ID Detection**: The app bundle identifier needs to be determined from your manually built app.

Current error:

```
App with bundle identifier 'org.reactjs.native.example.TestAndroidTVRemoteApp' unknown
```

## 🛠️ Bundle ID Resolution

To find your app's actual bundle ID, run:

```bash
# Method 1: Check with ios-deploy
ios-deploy --list_bundle_id

# Method 2: Check Info.plist in built app
grep -A1 CFBundleIdentifier example/ios/TestAndroidTVRemoteApp/Info.plist

# Method 3: Use ideviceinstaller (if installed)
ideviceinstaller -u 00008101-0010299E1484001E -l
```

Once you have the correct bundle ID, update the configuration in `appium/wdio.simple.conf.js`:

```javascript
capabilities: [
	{
		// ... other settings
		'appium:bundleId': 'YOUR_ACTUAL_BUNDLE_ID',
		// ... other settings
	},
];
```

## 🧪 Test Suite Features

### 1. **Device Connection Tests**

- iPhone connectivity validation
- App state verification
- Network capability checks
- Screenshot functionality

### 2. **Sony TV Pairing Simulation**

The comprehensive test suite (`sonyTvPairingNative.test.js`) includes:

#### **TCP Socket Connection Tests**

```javascript
it('should handle Sony TV connection through native TCP socket implementation');
```

- Validates native `react-native-tcp-socket` functionality
- Tests real TCP connections to mock Sony TV server
- Verifies network permissions and connectivity

#### **End-to-End Pairing Flow**

```javascript
it('should handle mock Sony TV pairing flow end-to-end');
```

- Complete pairing sequence simulation
- PIN entry and validation
- Certificate exchange testing
- UI responsiveness validation

#### **Performance & Resilience Tests**

```javascript
it('should handle slow Sony TV responses without freezing');
it('should maintain stable memory usage during mock TV communication');
it('should handle rapid connection attempts without crashing');
```

- App stability under load
- Memory management validation
- Network timeout handling
- Concurrent connection testing

#### **Security & Certificate Tests**

```javascript
it('should handle TLS certificate validation with mock server');
```

- TLS/SSL certificate handling
- Security protocol validation
- Encryption verification

### 3. **Mock Server Integration**

The tests utilize your existing `MockServer.js` with enhancements:

- **Real TLS Connections**: Uses Node.js TLS module for authentic testing
- **Configurable Delays**: Simulates various Sony TV response times
- **Pairing Flow Simulation**: Complete authentication sequence
- **Error Scenario Testing**: Network failures, timeouts, certificate issues

## 🏃‍♂️ Running the Tests

### 1. **Start Appium Server**

```bash
yarn appium:start
# OR manually:
npx appium server --address localhost --port 4723 --relaxed-security --allow-cors
```

### 2. **Ensure iPhone App is Running**

Make sure your manually built React Native app is installed and running on the iPhone.

### 3. **Run Basic Connectivity Test**

```bash
npx wdio run ./appium/wdio.simple.conf.js
```

### 4. **Run Full Sony TV Pairing Tests**

```bash
npx wdio run ./appium/wdio.conf.js
```

## 📊 Test Output Example

```
🚀 Starting test session...
📱 Testing connection to iPhone device...
✅ Successfully connected to iPhone and verified app

🔌 Testing native TCP socket connection...
🖥️  Mock Sony TV server started
📱 Found connect button, testing connection...
✅ Native TCP socket connection test completed

🔐 Testing end-to-end Sony TV pairing flow...
🖥️  Mock Sony TV pairing server started
📱 Found pair button, initiating pairing...
🔢 Found PIN input, entering test PIN...
✅ End-to-end pairing flow test completed

🐌 Testing app resilience with slow TV responses...
🖥️  Mock slow Sony TV server started
📱 Triggering connection to slow server...
✅ App remains responsive with slow TV responses

📊 Testing memory stability during TV communication...
📱 Connection attempt 1/3...
📱 Connection attempt 2/3...
📱 Connection attempt 3/3...
✅ Memory remains stable during multiple connections
```

## 🎯 Benefits of This Testing Approach

### **1. Real Device Validation**

- Tests actual iPhone hardware behavior
- Validates native iOS networking stack
- Confirms real-world performance characteristics

### **2. Mock TV Advantages**

- **No TV Blocking**: Avoids Sony TV retry timeout issues
- **Controlled Testing**: Configurable response times and scenarios
- **Rapid Iteration**: Fast test execution without hardware dependencies
- **Edge Case Testing**: Simulate network failures, slow responses, etc.

### **3. Comprehensive Coverage**

- **Native Code Paths**: Tests `react-native-tcp-socket` implementation
- **UI Integration**: Validates React Native UI responsiveness
- **Memory Management**: Ensures stable performance
- **Security Validation**: TLS/certificate handling verification

### **4. Production Readiness**

- **Real Network Stack**: Tests actual iOS networking behavior
- **Device-Specific Testing**: iPhone-specific optimizations and limitations
- **Performance Validation**: Real device memory and CPU constraints

## 🔧 Configuration Files

### **Main Configuration** (`appium/wdio.conf.js`)

- Real device targeting with your iPhone UDID
- Comprehensive test suite execution
- Screenshot capture on failures
- Performance monitoring hooks

### **Simple Configuration** (`appium/wdio.simple.conf.js`)

- Basic connectivity testing
- Simplified setup for debugging
- Quick validation of Appium setup

### **Test Environment** (`appium/tests/setup.js`)

- Mock server configuration
- Test timeouts and settings
- Global test utilities

## 🎉 Next Steps

1. **Determine Bundle ID**: Find your app's actual bundle identifier
2. **Update Configuration**: Modify the bundle ID in test configs
3. **Run Tests**: Execute the full test suite
4. **Analyze Results**: Review test output and performance metrics
5. **Iterate**: Enhance tests based on your specific Sony TV integration needs

This testing framework provides a robust foundation for validating Sony TV pairing functionality on real iOS devices while avoiding the complexity and blocking issues of testing with actual TV hardware.
