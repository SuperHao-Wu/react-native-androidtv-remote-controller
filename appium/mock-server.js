const { startMockTLSServer } = require('../__tests__/MockServer');
const forge = require('node-forge');
const crypto = require('crypto');

// Helper function to extract modulus and exponent from certificate (like client-side)
function getCertificateModulusExponent(certPem) {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const publicKey = cert.publicKey;
    
    // Extract modulus and exponent as hex strings
    const modulus = publicKey.n.toString(16).toUpperCase();
    const exponent = publicKey.e.toString(16).toUpperCase();
    
    return { modulus, exponent };
  } catch (error) {
    console.error('Error extracting certificate details:', error);
    return null;
  }
}

// Generate cryptographically valid PIN like Android TV does
function generateValidPin(clientCert, serverCert) {
  try {
    // Generate random 4-character hex PIN data (like "1234")
    const pinData = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    
    // Extract certificate details
    const clientDetails = getCertificateModulusExponent(clientCert);
    const serverDetails = getCertificateModulusExponent(serverCert);
    
    if (!clientDetails || !serverDetails) {
      throw new Error('Could not extract certificate details');
    }
    
    // Create SHA256 hash exactly like client-side validation does
    const sha256 = forge.md.sha256.create();
    sha256.update(forge.util.hexToBytes(clientDetails.modulus), 'raw');
    sha256.update(forge.util.hexToBytes(clientDetails.exponent), 'raw');
    sha256.update(forge.util.hexToBytes(serverDetails.modulus), 'raw');
    sha256.update(forge.util.hexToBytes(serverDetails.exponent), 'raw');
    sha256.update(forge.util.hexToBytes(pinData), 'raw');
    
    const hash = sha256.digest().getBytes();
    const hashArray = Array.from(hash, c => c.charCodeAt(0) & 0xff);
    const validationByte = hashArray[0];
    
    // Create complete PIN: validation_byte + pin_data
    const completePIN = validationByte.toString(16).toUpperCase().padStart(2, '0') + pinData;
    
    console.log(`🔢 [6467] ${getLocalTimestamp()} Generated PIN: ${completePIN} (validation: ${validationByte}, data: ${pinData})`);
    
    return completePIN;
  } catch (error) {
    console.error('Error generating PIN:', error);
    return 'AB1234'; // Fallback to hardcoded PIN if generation fails
  }
}

// Helper function to get local timestamp in same format as other logs
function getLocalTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}Z`;
}

/**
 * Realistic authentication token generator for Android TV protocol.
 * Generates HMAC-based tokens that prove pairing completion and prevent forgery.
 */
class TokenGenerator {
  constructor() {
    // Server's secret key (in real TV, this would be device-specific)
    // For testing, we use a deterministic key for reproducible results
    this.serverSecret = crypto.createHash('sha256')
      .update('android-tv-mock-server-secret-2024')
      .digest();
    
    console.log(`🔐 TokenGenerator: Initialized with server secret fingerprint: ${this.serverSecret.slice(0, 4).toString('hex')}...`);
  }
  
  /**
   * Generate cryptographically secure authentication token
   * @param {string} clientCertificatePem - Client's certificate in PEM format
   * @param {number} timestamp - Current timestamp (for preventing replay attacks)
   * @returns {Buffer} 16-byte authentication token
   */
  generateAuthenticationToken(clientCertificatePem, timestamp = null) {
    try {
      if (!timestamp) {
        timestamp = Math.floor(Date.now() / 1000); // Unix timestamp
      }
      
      console.log(`🔐 TokenGenerator: Generating token for timestamp ${timestamp}`);
      
      // Create client certificate fingerprint (proves pairing completed)
      const clientFingerprint = crypto
        .createHash('sha256')
        .update(clientCertificatePem)
        .digest();
      
      // Create token payload: 8 bytes fingerprint + 4 bytes timestamp + 1 byte nonce
      const timestampBytes = Buffer.alloc(4);
      timestampBytes.writeUInt32BE(timestamp & 0xFFFFFFFF, 0);
      
      const nonce = crypto.randomBytes(1); // Random byte for uniqueness
      
      const tokenPayload = Buffer.concat([
        clientFingerprint.slice(0, 8),    // First 8 bytes of cert hash
        timestampBytes,                   // 4-byte timestamp
        nonce                            // 1-byte random nonce
      ]); // Total: 13 bytes payload
      
      // Generate HMAC signature using server secret
      const hmac = crypto.createHmac('sha256', this.serverSecret);
      hmac.update(tokenPayload);
      const signature = hmac.digest().slice(0, 3); // 3-byte signature
      
      // Final token: 13-byte payload + 3-byte signature = 16 bytes total
      const finalToken = Buffer.concat([tokenPayload, signature]);
      
      console.log(`🔐 TokenGenerator: Generated ${finalToken.length}-byte token: ${finalToken.toString('hex').toUpperCase()}`);
      console.log(`🔐 TokenGenerator: Token breakdown - Fingerprint: ${clientFingerprint.slice(0, 4).toString('hex')}..., Timestamp: ${timestamp}, Nonce: ${nonce.toString('hex')}, Signature: ${signature.toString('hex')}`);
      
      return finalToken;
    } catch (error) {
      console.error('❌ TokenGenerator: Failed to generate token:', error);
      // Fallback to simple token for testing
      return Buffer.from([0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, 0x12, 0x34, 0x56, 0x78, 0x9A]);
    }
  }
  
  /**
   * Validate authentication token 
   * @param {Buffer} token - Token to validate
   * @param {string} clientCertificatePem - Original client certificate
   * @param {number} maxAgeSeconds - Maximum age of token (default 24 hours)
   * @returns {boolean} True if token is valid
   */
  validateToken(token, clientCertificatePem, maxAgeSeconds = 24 * 60 * 60) {
    try {
      if (!token || token.length !== 16) {
        console.log('❌ TokenGenerator: Invalid token length');
        return false;
      }
      
      console.log(`🔍 TokenGenerator: Validating token: ${token.toString('hex').toUpperCase()}`);
      
      // Extract components
      const tokenPayload = token.slice(0, 13);
      const providedSignature = token.slice(13, 16);
      
      // Extract timestamp from payload
      const timestampBytes = tokenPayload.slice(8, 12);
      const timestamp = timestampBytes.readUInt32BE(0);
      
      // Check token age
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const tokenAge = currentTimestamp - timestamp;
      
      if (tokenAge > maxAgeSeconds) {
        console.log(`❌ TokenGenerator: Token expired (age: ${tokenAge}s, max: ${maxAgeSeconds}s)`);
        return false;
      }
      
      // Regenerate signature and compare
      const hmac = crypto.createHmac('sha256', this.serverSecret);
      hmac.update(tokenPayload);
      const expectedSignature = hmac.digest().slice(0, 3);
      
      const isValid = crypto.timingSafeEqual(providedSignature, expectedSignature);
      
      if (isValid) {
        console.log(`✅ TokenGenerator: Token validated successfully (age: ${tokenAge}s)`);
      } else {
        console.log('❌ TokenGenerator: Token signature mismatch');
      }
      
      return isValid;
    } catch (error) {
      console.error('❌ TokenGenerator: Token validation error:', error);
      return false;
    }
  }
  
  /**
   * Generate a simpler test token for development (deterministic)
   * @param {string} clientId - Simple client identifier
   * @returns {Buffer} 16-byte test token
   */
  generateTestToken(clientId = 'test-client') {
    const hash = crypto.createHash('sha256').update(clientId + this.serverSecret.toString('hex')).digest();
    return hash.slice(0, 16);
  }
}

class MockServerManager {
  constructor() {
    this.pairingServer = null;
    this.remoteServer = null;
    this.isRunning = false;
    this.validateCertificates = true; // Default to Sony TV-like behavior
    this.pairingState = {
      connected: false,
      pairingRequestReceived: false,
      pairingOptionReceived: false,
      pairingConfigurationReceived: false,
      pairingSecretReceived: false,
      pairingCompleted: false,
      lastActivity: null
    };
    // Certificate storage for PIN calculation
    this.clientCertificate = null;
    this.serverCertificate = null;
    this.generatedPin = null;
    
    // Token generation and storage
    this.tokenGenerator = new TokenGenerator();
    this.clientTokens = new Map(); // Maps client address to authentication token
    this.authenticatedClients = new Set(); // Track clients with valid tokens
    
    // TV state for remote control simulation
    this.tvState = {
      muted: false,
      volume: 50,
      power: true,
      lastMuteCommand: null,
      muteToggleCount: 0
    };
  }

  // Enable/disable certificate validation for testing
  setCertificateValidation(enabled) {
    this.validateCertificates = enabled;
    console.log(`🔐 Certificate validation ${enabled ? 'ENABLED' : 'DISABLED'} (${enabled ? 'Sony TV mode' : 'Mock mode'})`);
  }
  
  // Generate PIN with test certificates when real certificates not available
  generateTestPin() {
    try {
      // Generate test certificates using node-forge
      const testClientCert = this.createTestCertificate('Test Client');
      const testServerCert = this.createTestCertificate('Test Server');
      
      console.log(`🔧 [6467] ${getLocalTimestamp()} Generated test certificates for PIN calculation`);
      return generateValidPin(testClientCert, testServerCert);
    } catch (error) {
      console.error('Error generating test PIN:', error);
      // Last resort: generate a semi-random PIN that still follows format
      const pinData = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
      const validationByte = Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0');
      return validationByte + pinData;
    }
  }
  
  // Create a test certificate using node-forge
  createTestCertificate(commonName) {
    // Generate a key pair
    const keyPair = forge.pki.rsa.generateKeyPair(1024);
    
    // Create a certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keyPair.publicKey;
    cert.serialNumber = '01' + Math.floor(Math.random() * 1000000).toString();
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    // Set subject and issuer
    const attrs = [{
      name: 'commonName',
      value: commonName
    }, {
      name: 'organizationName',
      value: 'Test Organization'
    }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    
    // Sign the certificate
    cert.sign(keyPair.privateKey);
    
    // Convert to PEM format
    return forge.pki.certificateToPem(cert);
  }

  async start() {
    if (this.isRunning) {
      console.log('🖥️  Mock servers already running');
      return;
    }

    console.log('🚀 Starting mock Sony TV servers...');

    try {
      // Start pairing server (6467) with configurable certificate validation
      this.pairingServer = await startMockTLSServer({
        port: 6467,
        responseDelay: 100,
        enablePairingFlow: true,
        validateCertificates: this.validateCertificates, // Use instance setting
        onConnect: (socket) => {
          console.log(`🖥️  [6467] ${getLocalTimestamp()} Pairing server: Connection from`, socket.remoteAddress);
          this.pairingState.connected = true;
          this.pairingState.lastActivity = getLocalTimestamp();
          
          // Try immediate certificate extraction (connection might already be secure)
          setTimeout(() => {
            try {
              console.log(`🔍 [6467] ${getLocalTimestamp()} Attempting certificate extraction...`);
              
              const clientCert = socket.getPeerCertificate(true);
              const serverCert = socket.getCertificate();
              
              console.log(`🔍 [6467] ${getLocalTimestamp()} Certificate extraction - client cert exists:`, !!clientCert);
              console.log(`🔍 [6467] ${getLocalTimestamp()} Certificate extraction - server cert exists:`, !!serverCert);
              console.log(`🔍 [6467] ${getLocalTimestamp()} Certificate extraction - client has raw:`, !!clientCert?.raw);
              console.log(`🔍 [6467] ${getLocalTimestamp()} Certificate extraction - server has raw:`, !!serverCert?.raw);
              
              if (clientCert && clientCert.raw && serverCert && serverCert.raw) {
                // Convert DER to PEM format
                this.clientCertificate = forge.pki.certificateToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(clientCert.raw.toString('binary'))));
                this.serverCertificate = forge.pki.certificateToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(serverCert.raw.toString('binary'))));
                
                console.log(`📜 [6467] ${getLocalTimestamp()} Real certificates extracted successfully for PIN generation`);
              } else {
                console.log(`⚠️  [6467] ${getLocalTimestamp()} Could not extract certificates - will use test certificates`);
                console.log(`     Client cert:`, clientCert ? Object.keys(clientCert) : 'null');
                console.log(`     Server cert:`, serverCert ? Object.keys(serverCert) : 'null');
              }
            } catch (error) {
              console.error(`❌ [6467] ${getLocalTimestamp()} Certificate extraction failed:`, error.message);
            }
          }, 100); // Small delay to ensure TLS handshake is complete
        },
        onSecureConnect: (socket) => {
          // This callback may not be called by the MockServer implementation
          // Certificate extraction moved to onConnect -> secureConnect event
        },
        onData: (socket, data) => {
          console.log(`📨 [6467] ${getLocalTimestamp()} Pairing server: Received`, data.length, 'bytes');
          this.updatePairingState(data);
          
          // Let the MockServer handle the default pairing flow by calling it directly
          this.handlePairingFlow(socket, data);
        },
        onClose: (socket) => {
          console.log(`🚪 [6467] ${getLocalTimestamp()} Pairing server: Connection closed`);
          this.pairingState.connected = false;
        }
      });

      // Start remote server (6466)
      this.remoteServer = await startMockTLSServer({
        port: 6466,
        responseDelay: 100,
        enablePairingFlow: false,
        onConnect: (socket) => {
          console.log(`🖥️  [6466] ${getLocalTimestamp()} Remote server: Connection from`, socket.remoteAddress);
        },
        onSecureConnect: (socket) => {
          console.log(`🔐 [6466] ${getLocalTimestamp()} Remote server: Secure connection established`);
        },
        onData: (socket, data) => {
          console.log(`📨 [6466] ${getLocalTimestamp()} Remote server: Received`, data.length, 'bytes');
          this.handleRemoteMessage(socket, data);
        },
        onClose: (socket) => {
          console.log(`🚪 [6466] ${getLocalTimestamp()} Remote server: Connection closed`);
        }
      });

      this.isRunning = true;
      console.log('✅ Mock Sony TV servers running on 192.168.2.150:6467 (pairing) and 192.168.2.150:6466 (remote)');
      
    } catch (error) {
      console.error('❌ Failed to start mock servers:', error);
      await this.stop();
      throw error;
    }
  }

  async stop() {
    console.log('🛑 Stopping mock servers...');
    
    if (this.pairingServer) {
      this.pairingServer.close();
      this.pairingServer = null;
    }
    
    if (this.remoteServer) {
      this.remoteServer.close();
      this.remoteServer = null;
    }
    
    this.isRunning = false;
    console.log('✅ Mock servers stopped');
  }

  updatePairingState(data) {
    try {
      // Try to parse the protocol buffer message to understand what was received
      const { PairingMessageManager } = require('../dist/pairing/PairingMessageManager');
      const pairingMessageManager = new PairingMessageManager({ system: "test" });
      const message = pairingMessageManager.parse(data);
      
      this.pairingState.lastActivity = getLocalTimestamp();
      
      if (message.pairingRequest) {
        this.pairingState.pairingRequestReceived = true;
        console.log(`📋 [6467] ${getLocalTimestamp()} Pairing protocol: PAIRING_REQUEST received`);
      } else if (message.pairingOption) {
        this.pairingState.pairingOptionReceived = true;
        console.log(`📋 [6467] ${getLocalTimestamp()} Pairing protocol: PAIRING_OPTION received`);
      } else if (message.pairingConfiguration) {
        this.pairingState.pairingConfigurationReceived = true;
        console.log(`📋 [6467] ${getLocalTimestamp()} Pairing protocol: PAIRING_CONFIGURATION received (should trigger secret dialog)`);
      } else if (message.pairingSecret) {
        this.pairingState.pairingSecretReceived = true;
        console.log(`📋 [6467] ${getLocalTimestamp()} Pairing protocol: PAIRING_SECRET received`);
      }
    } catch (error) {
      console.log(`⚠️  [6467] ${getLocalTimestamp()} Could not parse pairing message:`, error.message);
    }
  }

  handlePairingFlow(socket, data) {
    // This implements the same logic as MockServer's default pairing flow
    const { PairingMessageManager } = require('../dist/pairing/PairingMessageManager');
    const pairingMessageManager = new PairingMessageManager({ system: "test" });
    
    setTimeout(() => {
      try {
        const message = pairingMessageManager.parse(data);
        console.log("Mock server parsed message:", message.toJSON());
        
        if (message.pairingRequest) {
          // Send pairing request ack
          const ack = pairingMessageManager.create({
            pairingRequestAck: {
              serverName: "MockTVServer"
            },
            status: pairingMessageManager.Status.STATUS_OK,
            protocolVersion: 2
          });
          socket.write(ack);
        } else if (message.pairingOption) {
          // Send pairing option with OUTPUT role (server provides the PIN)
          const option = pairingMessageManager.create({
            pairingOption: {
              preferredRole: pairingMessageManager.RoleType.ROLE_TYPE_OUTPUT,
              inputEncodings: [{
                type: pairingMessageManager.EncodingType.ENCODING_TYPE_HEXADECIMAL,
                symbolLength: 6
              }]
            },
            status: pairingMessageManager.Status.STATUS_OK,
            protocolVersion: 2
          });
          socket.write(option);
        } else if (message.pairingConfiguration) {
          // Generate cryptographically valid PIN
          if (this.clientCertificate && this.serverCertificate) {
            this.generatedPin = generateValidPin(this.clientCertificate, this.serverCertificate);
            console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: Sending pairingConfigurationAck (TV would display PIN: ${this.generatedPin})`);
          } else {
            // Generate PIN with dummy certificates if extraction failed
            console.log(`⚠️  [6467] ${getLocalTimestamp()} Certificates not available, generating PIN with test certificates`);
            this.generatedPin = this.generateTestPin();
            console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: Sending pairingConfigurationAck (test PIN: ${this.generatedPin})`);
          }
          
          const configAck = pairingMessageManager.create({
            pairingConfigurationAck: {},
            status: pairingMessageManager.Status.STATUS_OK,
            protocolVersion: 2
          });
          socket.write(configAck);
        } else if (message.pairingSecret) {
          // Validate PIN AB1234 (convert hex AB1234 to expected secret format)
          console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: Received pairing secret, validating PIN AB1234`);
          const receivedSecret = message.pairingSecret.secret;
          console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: Received secret bytes:`, Array.from(receivedSecret));
          
          // For automated testing, accept any secret (real validation would check PIN hash)
          console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: PIN validation successful (test mode)`);
          
          // Generate realistic authentication token using client certificate
          let authToken;
          const clientId = socket.remoteAddress + ':' + socket.remotePort;
          
          if (this.clientCertificate) {
            // Use real client certificate to generate secure token
            console.log(`🔐 [6467] ${getLocalTimestamp()} Generating authentication token using client certificate`);
            authToken = this.tokenGenerator.generateAuthenticationToken(this.clientCertificate);
          } else {
            // Fallback to test token for development
            console.log(`🔐 [6467] ${getLocalTimestamp()} Generating test token (no client certificate available)`);
            authToken = this.tokenGenerator.generateTestToken(clientId);
          }
          
          // Store token for remote connection validation
          this.clientTokens.set(clientId, authToken);
          console.log(`🔐 [6467] ${getLocalTimestamp()} Stored authentication token for client ${clientId}`);
          
          const secretAck = pairingMessageManager.create({
            pairingSecretAck: {
              secret: authToken  // Send realistic HMAC token instead of [1,2,3,4]
            },
            status: pairingMessageManager.Status.STATUS_OK,
            protocolVersion: 2
          });
          socket.write(secretAck);
          
          // Mark pairing as completed
          this.pairingState.pairingCompleted = true;
          console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: Pairing completed successfully with token: ${authToken.toString('hex').toUpperCase()}`);
          
          // Don't close connection immediately - let client handle it
          console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: Keeping connection alive for final handshake`);
        }
      } catch (error) {
        console.error("Mock server error parsing message:", error);
      }
    }, 100); // 100ms delay like the original
  }

  /**
   * Handle remote control messages on port 6466
   */
  handleRemoteMessage(socket, data) {
    try {
      // Import RemoteMessageManager dynamically
      const { RemoteMessageManager } = require('../dist/remote/RemoteMessageManager');
      const remoteMessageManager = new RemoteMessageManager();
      
      console.log(`🎮 [6466] ${getLocalTimestamp()} Parsing remote control message...`);
      
      // Parse the remote message
      const message = remoteMessageManager.parse(data);
      
      if (message.remoteKeyInject) {
        const keyCode = message.remoteKeyInject.keyCode;
        const direction = message.remoteKeyInject.direction;
        
        console.log(`🎮 [6466] ${getLocalTimestamp()} Remote key inject: keyCode=${keyCode}, direction=${direction}`);
        
        // Handle specific key codes
        if (keyCode === 91 || keyCode === 164) { // KEYCODE_MUTE or KEYCODE_VOLUME_MUTE
          this.handleMuteCommand(socket, keyCode, direction);
        } else {
          console.log(`🎮 [6466] ${getLocalTimestamp()} Received key command: ${keyCode} (not handled by mock server)`);
        }
      } else if (message.remoteConfigure) {
        console.log(`🎮 [6466] ${getLocalTimestamp()} Remote configure message received`);
        // Handle remote configuration if needed
      } else if (message.remotePingRequest) {
        console.log(`🎮 [6466] ${getLocalTimestamp()} Remote ping request received`);
        // Handle ping if needed
      } else {
        console.log(`🎮 [6466] ${getLocalTimestamp()} Unknown remote message type:`, Object.keys(message));
      }
      
    } catch (error) {
      console.error(`❌ [6466] ${getLocalTimestamp()} Error parsing remote message:`, error.message);
    }
  }
  
  /**
   * Handle mute/unmute command
   */
  handleMuteCommand(socket, keyCode, direction) {
    const timestamp = getLocalTimestamp();
    
    // Toggle mute state
    this.tvState.muted = !this.tvState.muted;
    this.tvState.lastMuteCommand = timestamp;
    this.tvState.muteToggleCount++;
    
    const muteState = this.tvState.muted ? 'MUTED' : 'UNMUTED';
    const keyName = keyCode === 91 ? 'KEYCODE_MUTE' : 'KEYCODE_VOLUME_MUTE';
    
    console.log(`🔇 [6466] ${timestamp} MUTE COMMAND RECEIVED: ${keyName} -> TV is now ${muteState}`);
    console.log(`🔇 [6466] ${timestamp} TV State: muted=${this.tvState.muted}, volume=${this.tvState.volume}, toggleCount=${this.tvState.muteToggleCount}`);
    
    // Log for test validation
    console.log(`📊 [6466] ${timestamp} MUTE_STATE_CHANGED: ${this.tvState.muted ? 'true' : 'false'}`);
  }

  async checkStatus() {
    return {
      isRunning: this.isRunning,
      pairingServer: this.pairingServer ? 'running' : 'stopped',
      remoteServer: this.remoteServer ? 'running' : 'stopped',
      pairingState: this.pairingState
    };
  }

  getPairingState() {
    return this.pairingState;
  }

  resetPairingState() {
    this.pairingState = {
      connected: false,
      pairingRequestReceived: false,
      pairingOptionReceived: false,
      pairingConfigurationReceived: false,
      pairingSecretReceived: false,
      pairingCompleted: false,
      lastActivity: null
    };
  }
}

// Add HTTP status server for tests to query pairing state
function startStatusServer(serverManager, port = 3001) {
  const http = require('http');
  
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.url === '/status' && req.method === 'GET') {
      const status = {
        isRunning: serverManager.isRunning,
        pairingServer: serverManager.pairingServer ? 'running' : 'stopped',
        remoteServer: serverManager.remoteServer ? 'running' : 'stopped',
        certificateValidation: {
          enabled: serverManager.validateCertificates,
          mode: serverManager.validateCertificates ? 'Sony TV mode' : 'Mock mode'
        },
        pairingState: serverManager.pairingState,
        generatedPin: serverManager.generatedPin, // Add generated PIN for test access
        authentication: {
          totalTokensIssued: serverManager.clientTokens.size,
          authenticatedClients: serverManager.authenticatedClients.size,
          tokenGenerator: {
            algorithm: 'HMAC-SHA256',
            tokenLength: '16 bytes',
            components: 'fingerprint(8) + timestamp(4) + nonce(1) + signature(3)'
          }
        },
        tvState: serverManager.tvState, // Add TV state for remote control testing
        timestamp: getLocalTimestamp()
      };
      
      res.writeHead(200);
      res.end(JSON.stringify(status, null, 2));
    } else if (req.url === '/reset' && req.method === 'POST') {
      serverManager.resetPairingState();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Pairing state reset' }));
    } else if (req.url === '/certificate-validation/enable' && req.method === 'POST') {
      serverManager.setCertificateValidation(true);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Certificate validation enabled (Sony TV mode)' }));
    } else if (req.url === '/certificate-validation/disable' && req.method === 'POST') {
      serverManager.setCertificateValidation(false);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Certificate validation disabled (Mock mode)' }));
    } else if (req.url === '/generate-test-token' && req.method === 'POST') {
      // Generate a realistic authentication token for E2E testing
      try {
        const host = req.headers['x-test-host'] || '192.168.2.150';
        console.log(`🧪 Mock Server: Generating test token for E2E testing (host: ${host})`);
        
        // Generate test client certificate for token creation
        const testClientCert = serverManager.createTestCertificate(`Test Client - ${host}`);
        
        // Use the same token generation as real pairing flow
        const testToken = serverManager.tokenGenerator.generateAuthenticationToken(testClientCert);
        
        // Store the token in server's client tokens map (simulate successful pairing)
        const clientId = `${host}:test`;
        serverManager.clientTokens.set(clientId, testToken);
        
        console.log(`✅ Mock Server: Generated test token for ${host}: ${testToken.toString('hex').toUpperCase()}`);
        
        const response = {
          success: true,
          host: host,
          token: testToken.toString('base64'),
          tokenHex: testToken.toString('hex').toUpperCase(),
          tokenLength: testToken.length,
          message: 'Test authentication token generated successfully',
          timestamp: getLocalTimestamp()
        };
        
        res.writeHead(200);
        res.end(JSON.stringify(response, null, 2));
      } catch (error) {
        console.error('❌ Mock Server: Failed to generate test token:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Failed to generate test token',
          details: error.message,
          timestamp: getLocalTimestamp()
        }));
      }
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  
  server.listen(port, () => {
    console.log(`📊 Mock server status endpoint running on http://localhost:${port}/status`);
  });
  
  return server;
}

// For standalone usage
if (require.main === module) {
  const serverManager = new MockServerManager();
  
  // Start status server
  const statusServer = startStatusServer(serverManager);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    await serverManager.stop();
    statusServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    await serverManager.stop();
    statusServer.close();
    process.exit(0);
  });

  // Start servers
  serverManager.start().then(() => {
    console.log('🎯 Mock servers ready for testing!');
    console.log('Press Ctrl+C to stop');
  }).catch((error) => {
    console.error('💥 Failed to start servers:', error);
    process.exit(1);
  });
}

module.exports = MockServerManager;