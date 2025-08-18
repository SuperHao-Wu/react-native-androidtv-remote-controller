#!/bin/bash

# Launch iOS app with dynamically generated certificate from mock server
# This script replicates the certificate generation logic from the Appium test

set -e  # Exit on any error

HOST="192.168.2.150"
MOCK_SERVER_PORT="3001"
BUNDLE_ID="com.haoandroidtv.example"

echo "🚀 Launch iOS with Certificate Script"
echo "📱 Host: $HOST"
echo "🔧 Mock Server: localhost:$MOCK_SERVER_PORT"
echo "📦 Bundle ID: $BUNDLE_ID"
echo ""

# Step 1: Check if mock server is running
echo "🔍 Step 1: Checking mock server availability..."
if ! curl -s "http://localhost:$MOCK_SERVER_PORT/status" > /dev/null; then
    echo "❌ Mock server is not running on localhost:$MOCK_SERVER_PORT"
    echo "💡 Please start the mock server first: yarn mock:start"
    exit 1
fi
echo "✅ Mock server is running"

# Step 2: Generate certificate from mock server
echo "🔐 Step 2: Generating certificate from mock server..."
CERT_RESPONSE=$(curl -s -X POST "http://localhost:$MOCK_SERVER_PORT/generate-test-certificate" \
    -H "Content-Type: application/json" \
    -H "x-test-host: $HOST" \
    -d '{}')

# Check if certificate generation was successful
SUCCESS=$(echo "$CERT_RESPONSE" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
    echo "❌ Certificate generation failed:"
    echo "$CERT_RESPONSE" | jq -r '.error'
    exit 1
fi

# Extract certificate and private key
CERTIFICATE=$(echo "$CERT_RESPONSE" | jq -r '.certificate')
PRIVATE_KEY=$(echo "$CERT_RESPONSE" | jq -r '.privateKey')

if [ "$CERTIFICATE" = "null" ] || [ "$PRIVATE_KEY" = "null" ]; then
    echo "❌ Certificate or private key is null"
    exit 1
fi

echo "✅ Certificate generated successfully"
echo "📋 Certificate length: ${#CERTIFICATE} chars"
echo "📋 Private key length: ${#PRIVATE_KEY} chars"

# Step 3: Get device ID
echo "📱 Step 3: Getting iOS device ID..."
DEVICE_ID=$(idevice_id -l | head -n 1)
if [ -z "$DEVICE_ID" ]; then
    echo "❌ No iOS device found. Please connect your device."
    exit 1
fi
echo "✅ Device ID: $DEVICE_ID"

# Step 4: Launch iOS app with certificate parameters
echo "🚀 Step 4: Launching iOS app with certificate parameters..."
echo "📋 Launch arguments:"
echo "   - e2etestmode: 1"
echo "   - e2ehost: $HOST"
echo "   - e2ecertificate: ${CERTIFICATE:0:50}... (${#CERTIFICATE} chars)"
echo "   - e2eprivatekey: ${PRIVATE_KEY:0:50}... (${#PRIVATE_KEY} chars)"
echo ""

# Launch the app with xcrun devicectl
echo "🚀 Launching app..."
xcrun devicectl device process launch \
    --device "$DEVICE_ID" \
    --console \
    "$BUNDLE_ID" \
    -- \
    -e2etestmode 1 \
    -e2ehost "$HOST" \
    -e2ecertificate "$CERTIFICATE" \
    -e2eprivatekey "$PRIVATE_KEY"

echo ""
echo "✅ App launched successfully with certificate parameters!"
echo "📱 The app should now have the certificate stored and be ready for smart reconnection testing."