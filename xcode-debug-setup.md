# Xcode Native Debugging Setup

This guide shows how to debug the native Objective-C code in `react-native-tcp-socket` alongside the React Native JavaScript code.

## Quick Setup

1. **Open Xcode project**:
   ```bash
   cd example
   open ios/TestAndroidTVRemoteApp.xcworkspace
   ```

2. **Set breakpoints in native TCP socket code**:
   - Navigate to `Pods/react-native-tcp-socket/ios/TcpSocketClient.m`
   - Set breakpoints in key methods:
     - `connectWithOptions:` (line ~200) - When connection starts
     - `onConnect:` (line ~250) - When TCP connection establishes
     - `onSecureConnect:` (line ~270) - When TLS handshake completes
     - `onData:` (line ~300) - When data is received
     - `onError:` (line ~350) - When errors occur

## Debug Workflow (Recommended)

This approach allows debugging both JavaScript and native code simultaneously:

1. **Terminal 1: Start mock server**
   ```bash
   yarn mock:start
   ```

2. **Terminal 2: Start test with JavaScript debugger**
   ```bash
   yarn appium:debug --spec appium/tests/tcpConnectionDebug.test.js
   ```

3. **VS Code: Attach JavaScript debugger**
   - Open Command Palette (Cmd+Shift+P)
   - Select "Debug: Attach to Node Process"
   - Choose the process on port 9230
   - Set breakpoint at `await connectButton.click();` (line 131)

4. **Let test run until it hits the VS Code breakpoint**
   - Test will pause just before the native TCP code executes

5. **Xcode: Attach to running app process**
   - Debug > Attach to Process by PID or Name
   - Select "TestAndroidTVRemoteApp"
   - Verify your breakpoints in TcpSocketClient.m are set

6. **Continue execution from VS Code**
   - Resume from the VS Code breakpoint
   - Native breakpoints in Xcode will be hit when TCP socket code executes

## Key Breakpoint Locations

### TcpSocketClient.m (react-native-tcp-socket)

```objc
// Connection initiation
- (void)connectWithOptions:(NSDictionary *)options {
    // Set breakpoint here - line ~200
    NSLog(@"🔌 TCP connection starting to %@:%@", host, port);
}

// TCP connection established
- (void)onConnect:(GCDAsyncSocket *)sock toHost:(NSString *)host port:(uint16_t)port {
    // Set breakpoint here - line ~250  
    NSLog(@"✅ TCP connected to %@:%d", host, port);
}

// TLS handshake completed
- (void)onSocket:(GCDAsyncSocket *)sock didSecureConnectionToHost:(NSString *)host {
    // Set breakpoint here - line ~270
    NSLog(@"🔐 TLS secure connection established");
}

// Data received
- (void)onSocket:(GCDAsyncSocket *)sock didReadData:(NSData *)data withTag:(long)tag {
    // Set breakpoint here - line ~300
    NSLog(@"📨 Received %lu bytes", (unsigned long)data.length);
}

// Connection error
- (void)onSocket:(GCDAsyncSocket *)sock didDisconnectWithError:(NSError *)err {
    // Set breakpoint here - line ~350
    NSLog(@"❌ TCP disconnected: %@", err.localizedDescription);
}
```

## Debugging Tips

1. **Monitor both JavaScript and native logs**:
   - JavaScript console in VS Code Debug Console
   - Native logs in Xcode Debug Console
   - Mock server logs in Terminal 1

2. **Common debugging scenarios**:
   - **Connection not starting**: Check `connectWithOptions` breakpoint
   - **TCP connects but TLS fails**: Check `onConnect` vs `didSecureConnectionToHost`
   - **Data not received**: Check `onData` breakpoint and mock server logs
   - **Connection drops**: Check `didDisconnectWithError` for error details

## Troubleshooting

### "Unknown client: TestAndroidTVRemoteApp"
- This is normal - iOS security warning for debugging
- Doesn't affect functionality

### Breakpoints not hitting in Xcode
- Ensure you attach Xcode debugger AFTER the app is running
- Verify breakpoints are in the correct TcpSocketClient.m file
- Check that native code path is actually being executed

### Mock server not receiving connections  
- Verify iPhone and Mac are on same network
- Check mock server logs for connection attempts
- Confirm IP address is correct (192.168.2.150, not localhost)

## Example Debug Session

```bash
# Terminal 1: Mock server with timestamped logs
yarn mock:start

# Terminal 2: Test with JavaScript debugger waiting
yarn appium:debug --spec appium/tests/tcpConnectionDebug.test.js

# VS Code: Attach to Node on port 9230, set breakpoint at line 131
# Let test run until it hits the breakpoint (just before connectButton.click())
# Xcode: Debug > Attach to Process > TestAndroidTVRemoteApp  
# VS Code: Continue execution
# Xcode: Native breakpoints will be hit in TcpSocketClient.m
```

This setup provides complete visibility into both the React Native JavaScript layer and the native TCP socket implementation, allowing you to debug Sony TV connection issues end-to-end.
