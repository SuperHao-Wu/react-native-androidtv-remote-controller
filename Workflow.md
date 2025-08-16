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

## Port Usage Summary

| Port | Purpose | When Used | Authentication | Connection Type |
|------|---------|-----------|----------------|-----------------|
| **6467** | Pairing | First time + re-pairing | PIN validation | Temporary |
| **6466** | Remote Control | Normal operation | Certificate recognition | Persistent |

## Security Considerations

1. **Certificate Storage**: Store in iOS Keychain with appropriate security attributes
2. **Certificate Validation**: Verify certificate integrity before use
3. **Certificate Cleanup**: Remove invalid certificates promptly
4. **Re-pairing Security**: Clear all stored data when re-pairing
5. **TLS Security**: Use proper TLS configuration for both ports