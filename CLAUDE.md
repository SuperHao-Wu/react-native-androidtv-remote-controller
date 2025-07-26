# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native library for Android TV remote control functionality, porting Android TV Remote protocol to React Native. The library handles TLS-secured TCP socket communication with Android TV devices for pairing and remote control operations.

## Core Architecture

### Main Components

- **AndroidRemote** (`src/index.js`) - Main entry point class that orchestrates pairing and remote operations
- **PairingManager** (`src/pairing/PairingManager.js`) - Handles device pairing using TLS handshake and PIN validation
- **RemoteManager** (`src/remote/RemoteManager.js`) - Manages remote control communication after pairing
- **CertificateGenerator** (`src/certificate/CertificateGenerator.js`) - Generates client certificates for TLS authentication

### Protocol Implementation

The library implements Android TV's proprietary remote protocol using:
- **TLS over TCP sockets** via `react-native-tcp-socket` (patched for certificate handling)
- **Protocol Buffers** for message serialization (`pairingmessage.proto.js`, `remotemessage.proto.js`)
- **Certificate-based authentication** using node-forge for cryptographic operations

### Key Dependencies

- `react-native-tcp-socket` (peer dependency) - TLS socket implementation
- `react-native-modpow` (peer dependency) - Modular exponentiation for crypto
- `node-forge` - Certificate generation and cryptographic operations
- `protobufjs` - Protocol buffer message handling

## Development Commands

### Build Commands
```bash
# Build library (transpile ES6 to CommonJS)
yarn babel

# Run unit tests
yarn test

# Run Appium iOS tests on real device
yarn appium:ios

# Start Appium server for manual testing
yarn appium:start

# Check Appium iOS setup
yarn appium:doctor
```

### Test Framework

The project includes comprehensive testing:
- **Jest unit tests** in `__tests__/` directory
- **Appium native iOS tests** in `appium/` directory for real device validation
- **Mock servers** for simulating Android TV behavior without hardware

### Appium Testing Setup

Real device testing configuration for iPhone (UDID: 00008101-0010299E1484001E):
- Bundle ID: `org.reactjs.native.example.TestAndroidTVRemoteApp`
- Tests validate native TCP socket implementation
- Mock TLS servers simulate Sony TV pairing protocol

## Development Guidelines

### Certificate Handling

The library supports multiple certificate storage approaches:
- In-memory certificates (default)
- Android Keystore integration via `androidKeyStore`, `certAlias`, `keyAlias` options
- Custom certificate injection through constructor options

### TLS Socket Configuration

When working with TLS connections, note:
- `rejectUnauthorized: false` is used due to self-signed certificates
- Android-specific keystore parameters are passed through to native layer
- Socket timeouts are configured for ping/keepalive (10 seconds)

### Protocol Buffer Messages

Message types are defined in `.proto.js` files:
- Pairing: `createPairingRequest`, `createPairingSecret`, etc.
- Remote: `createRemoteKeyInject`, `createRemotePingResponse`, etc.

### Error Handling Patterns

Both managers implement automatic reconnection logic:
- `ECONNREFUSED` triggers retry after 1 second delay
- `ECONNRESET` emits 'unpaired' event
- `EHOSTDOWN` stops reconnection attempts
- Manual stop via `isManualStop` flag prevents unwanted reconnections

### Event-Driven Architecture

The library uses EventEmitter pattern extensively:
- `secret` - PIN entry required during pairing
- `ready` - Remote connection established
- `powered` - TV power state changed
- `volume` - Volume level updates
- `current_app` - Active app package name
- `unpaired` - Authentication lost, re-pairing needed

## File Structure Notes

- `src/` - Main library source code
- `example/` - React Native test application
- `dist/` - Babel-compiled output (generated)
- `__tests__/` - Jest unit tests
- `appium/` - Native device testing framework
- `validation.js` - Library export validation

## Testing Strategy

The project employs a multi-layered testing approach:
1. **Unit tests** with Jest for individual component logic
2. **Mock server tests** for protocol validation without hardware
3. **Native device tests** with Appium for real-world validation on iPhone hardware

This comprehensive testing ensures the library works correctly across different environments and device configurations.