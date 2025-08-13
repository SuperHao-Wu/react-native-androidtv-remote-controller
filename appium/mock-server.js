const { startMockTLSServer } = require('../__tests__/MockServer');
const forge = require('node-forge');

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
          
          const secretAck = pairingMessageManager.create({
            pairingSecretAck: {
              secret: Buffer.from([1, 2, 3, 4])
            },
            status: pairingMessageManager.Status.STATUS_OK,
            protocolVersion: 2
          });
          socket.write(secretAck);
          
          // Mark pairing as completed
          this.pairingState.pairingCompleted = true;
          console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: Pairing completed successfully!`);
          
          // Don't close connection immediately - let client handle it
          console.log(`📋 [6467] ${getLocalTimestamp()} Mock server: Keeping connection alive for final handshake`);
        }
      } catch (error) {
        console.error("Mock server error parsing message:", error);
      }
    }, 100); // 100ms delay like the original
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