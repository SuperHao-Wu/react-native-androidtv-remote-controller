# Android TV Remote Control Protocol Workflow

This document visualizes the complete authentication and connection workflow for the Android TV Remote Control protocol, showing the correct certificate-based authentication flow.

## Overview

The Android TV protocol uses **certificate-based authentication** with two distinct phases:
- **Pairing Phase (Port 6467)**: Initial certificate exchange and PIN validation
- **Remote Phase (Port 6466)**: Ongoing remote control using persistent certificates

## Complete Workflow Visualization

```
App Startup
    ↓
Check iOS Keychain for stored client certificate
    ↓
┌─────────────────────────────────────────────────────────────────┐
│                         Certificate Check                       │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────┐           NO            ┌─────────────────────┐
│ Certificate     │─────────────────────────▶│ INITIAL PAIRING     │
│ Exists in       │                         │ REQUIRED            │
│ Keychain?       │                         │                     │
└─────────────────┘                         └─────────────────────┘
    │ YES                                            │
    ▼                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CONNECTION ATTEMPT                     │
└─────────────────────────────────────────────────────────────────┘
    │                                               │
    ▼                                               ▼
┌─────────────────┐                    ┌─────────────────────────┐
│ RESUME          │                    │ INITIAL PAIRING FLOW    │
│ CONNECTION      │                    │ (Port 6467)             │
│ (Port 6466)     │                    │                         │
└─────────────────┘                    └─────────────────────────┘
    │                                               │
    ▼                                               ▼
┌─────────────────┐     FAILED         ┌─────────────────────────┐
│ TLS Handshake   │─────────────────▶  │ Certificate Invalid     │
│ using stored    │                    │ → Clear Keychain        │
│ certificate     │                    │ → Start New Pairing     │
└─────────────────┘                    └─────────────────────────┘
    │ SUCCESS                                       │
    ▼                                               │
┌─────────────────┐                                │
│ CONNECTED       │                                │
│ Ready for       │                                │
│ Remote Commands │                                │
└─────────────────┘                                │
                                                   │
                  ┌────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PAIRING PHASE DETAIL                      │
│                        (Port 6467)                             │
└─────────────────────────────────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 1. Generate fresh   │
        │    client cert +    │
        │    private key      │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 2. TCP connect to   │
        │    TV:6467          │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 3. TLS handshake    │
        │    exchange certs   │
        │    with TV          │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 4. TV shows PIN     │
        │    on screen        │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 5. User enters PIN  │
        │    in mobile app    │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 6. PIN validation   │
        │    via crypto       │
        │    protocol         │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 7. SUCCESS:         │
        │    Store client     │
        │    cert + key in    │
        │    iOS Keychain     │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 8. Close pairing    │
        │    connection       │
        │    (Port 6467)      │
        └─────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REMOTE PHASE DETAIL                       │
│                        (Port 6466)                             │
└─────────────────────────────────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 1. Load stored      │
        │    client cert +    │
        │    key from         │
        │    iOS Keychain     │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 2. TCP connect to   │
        │    TV:6466          │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 3. TLS handshake    │
        │    using stored     │
        │    certificate      │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 4. TV recognizes    │
        │    certificate as   │
        │    previously       │
        │    paired           │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 5. CONNECTION       │
        │    AUTHORIZED       │
        │    No PIN needed!   │
        └─────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ 6. Send remote      │
        │    commands:        │
        │    - Mute/Unmute    │
        │    - Volume         │
        │    - Navigation     │
        │    - Power          │
        │    - App launch     │
        └─────────────────────┘
```

## Authentication Flow Details

### Certificate-Based Authentication

| Phase | Port | Purpose | Authentication Method | Certificate Usage |
|-------|------|---------|----------------------|-------------------|
| **Pairing** | 6467 | Initial setup | PIN validation | Generate new certificate |
| **Remote** | 6466 | Remote control | Certificate recognition | Reuse stored certificate |

### Key Differences from Token-Based Systems

| Aspect | ❌ Token-Based (Wrong) | ✅ Certificate-Based (Correct) |
|--------|----------------------|-------------------------------|
| **Authentication** | Server validates tokens | TV recognizes certificates |
| **Storage** | Store tokens in keychain | Store certificates + keys in keychain |
| **Transmission** | Send tokens in app messages | Present certificates in TLS handshake |
| **Validation** | Server checks token validity | TLS validates certificate automatically |
| **Session** | Tokens can expire | Certificates persist until revoked |

## Error Scenarios and Recovery

### 1. Certificate Not Found (First Time)
```
App Launch → Check Keychain → No Certificate → Start Pairing → Store Certificate → Connect
```

### 2. Certificate Invalid/Expired
```
Connect Attempt → TLS Handshake Failed → Clear Keychain → Show "Re-pair Required" → Start Pairing
```

### 3. Connection Lost During Remote Phase
```
Connection Drop → Auto-retry with Stored Certificate → Success/Failure → Handle Accordingly
```

### 4. User Forced Re-pairing
```
User Action → Clear Stored Certificate → Start Fresh Pairing → Store New Certificate → Connect
```

## Implementation Checklist

### Phase 1: Certificate Storage
- [ ] Replace TokenManager with CertificateManager
- [ ] Update SecureStorage to store certificates + keys
- [ ] Remove token-related methods
- [ ] Add certificate validation logic

### Phase 2: Authentication Flow
- [ ] Modify AndroidRemote to check for stored certificates
- [ ] Update PairingManager to store certificates after successful pairing
- [ ] Modify RemoteManager to use stored certificates
- [ ] Remove token transmission logic

### Phase 3: Error Handling
- [ ] Handle certificate invalidity gracefully
- [ ] Add certificate cleanup methods
- [ ] Implement re-pairing flow
- [ ] Add connection status indicators

### Phase 4: User Interface
- [ ] Show "Resume Connection" vs "Pair Device" based on certificate existence
- [ ] Add "Re-pair" option for certificate issues
- [ ] Display proper connection states
- [ ] Handle automatic connection attempts

### Phase 5: Testing
- [ ] Update E2E tests for certificate-based flow
- [ ] Test certificate persistence across app restarts
- [ ] Verify connection resumption works
- [ ] Test re-pairing scenarios

## Smart Connect Button Workflow (Phase 5)

### Single-Button Interface with Intelligent Routing

```
User Clicks "Connect" Button
    ↓
Check iOS Keychain for Client Certificate
    ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Certificate Check                         │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────┐           NO            ┌─────────────────────┐
│ Certificate     │─────────────────────────▶│ FRESH PAIRING       │
│ Exists in       │                         │ (Port 6467)         │
│ Keychain?       │                         │                     │
└─────────────────┘                         └─────────────────────┘
    │ YES                                            │
    ▼                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TRY REMOTE CONNECTION                       │
│                      (Port 6466)                              │
└─────────────────────────────────────────────────────────────────┘
    │                                               │
    ▼                                               ▼
┌─────────────────┐     SUCCESS       ┌─────────────────────────┐
│ TLS Handshake   │──────────────────▶│ CONNECTED              │
│ with Stored     │                   │ Remote Control Ready    │
│ Certificate     │                   │                         │
└─────────────────┘                   └─────────────────────────┘
    │ FAILED                                      
    ▼                                             
┌─────────────────────────────────────────────────────────────────┐
│                    CERTIFICATE INVALID                        │
│                  Clear from Keychain                          │
│                 Fallback to Pairing                           │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RE-PAIRING FLOW                           │
│                      (Port 6467)                              │
│                   PIN Entry Required                          │
└─────────────────────────────────────────────────────────────────┘
```

### Connection States and User Experience

| Button State | Status Message | Description | Next Action |
|-------------|---------------|-------------|-------------|
| **"Connect"** | `Disconnected` | Ready to connect (fresh or dropped) | User clicks to start |
| **"Connecting..."** | `Connecting (Remote)` | Trying port 6466 with certificate | TLS handshake in progress |
| **"Re-pairing..."** | `Re-pairing Required` | Certificate failed, trying port 6467 | PIN dialog will appear |
| **"Pairing..."** | `Pairing Needed` | Waiting for user PIN entry | User enters PIN |
| **"Disconnect"** | `Connected` | Remote control ready | Commands work |

### Enhanced Error Handling and Recovery

```
Connection Drop Detected
    ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Connection Health Monitor                   │
│                   (Heartbeat Detection)                        │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────┐           ┌─────────────────────────────────┐
│ Heartbeat       │    FAIL   │ Re-enable "Connect" Button      │
│ Failed?         │──────────▶│ No Auto-Reconnection           │
│                 │           │ User Controls Reconnection     │
└─────────────────┘           └─────────────────────────────────┘
    │ SUCCESS                           │
    ▼                                   ▼
┌─────────────────┐           ┌─────────────────────────────────┐
│ Connection      │           │ User Clicks "Connect"          │
│ Healthy         │           │ Smart Routing Logic Applies    │
│ Continue        │           │ (Certificate Check → Port      │
└─────────────────┘           │  Selection → Connection)       │
                              └─────────────────────────────────┘
```

## Port Usage Summary

| Port | Purpose | When Used | Authentication | Connection Type | Trigger |
|------|---------|-----------|----------------|-----------------|---------|
| **6467** | Pairing | First time + certificate invalid | PIN validation | Temporary | No certificate OR certificate failed |
| **6466** | Remote Control | Certificate exists | Certificate recognition | Persistent | Valid certificate found |

## Enhanced Connection Management (Phase 5)

### TLS Retry Logic Integration

**Both ports now use robust retry logic:**
- **Port 6467 (Pairing)**: Existing TLS retry with exponential backoff
- **Port 6466 (Remote)**: NEW - Same retry logic for certificate-based connections

**Benefits:**
- Handles iOS TLS resource contention on both ports
- Fast failure detection (3s timeout per attempt)
- Graceful degradation when certificates become invalid

### Heartbeat and Health Monitoring

**Proactive Connection Health:**
```javascript
// RemoteManager enhanced with heartbeat monitoring
this.lastPingReceived = null;
this.heartbeatInterval = setInterval(() => {
  const timeSinceLastPing = Date.now() - (this.lastPingReceived || Date.now());
  if (timeSinceLastPing > 15000) { // 15s without ping
    this.handleUnhealthyConnection();
  }
}, 5000); // Check every 5s
```

**iOS App Lifecycle Integration:**
- Background/foreground transition handling
- Connection health checks on app resume
- Graceful connection management during app state changes

### Implementation Phases

| Phase | Component | Status | Description |
|-------|-----------|--------|-------------|
| **5.1** | Smart AndroidRemote.start() | 🔄 Pending | Intelligent port routing logic |
| **5.2** | Enhanced UI States | 🔄 Pending | Connection status and button management |
| **5.3** | RemoteManager TLS Retry | 🔄 Pending | Apply retry logic to port 6466 |
| **5.4** | Heartbeat Monitoring | 🔄 Pending | Proactive connection health tracking |
| **5.5** | iOS Lifecycle Integration | 🔄 Pending | Background/foreground handling |

## Security Considerations

1. **Certificate Storage**: Store in iOS Keychain with appropriate security attributes
2. **Certificate Validation**: Verify certificate integrity before use
3. **Certificate Cleanup**: Remove invalid certificates promptly
4. **Re-pairing Security**: Clear all stored data when re-pairing
5. **TLS Security**: Use proper TLS configuration for both ports
6. **Connection Health**: Monitor heartbeats to detect compromised connections