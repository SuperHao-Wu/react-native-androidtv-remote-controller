const { startMockTLSServer } = require('../__tests__/MockServer');

class MockServerManager {
  constructor() {
    this.pairingServer = null;
    this.remoteServer = null;
    this.isRunning = false;
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

  async start() {
    if (this.isRunning) {
      console.log('🖥️  Mock servers already running');
      return;
    }

    console.log('🚀 Starting mock Sony TV servers...');

    try {
      // Start pairing server (6467)
      this.pairingServer = await startMockTLSServer({
        port: 6467,
        responseDelay: 100,
        enablePairingFlow: true,
        onConnect: (socket) => {
          console.log(`🖥️  [6467] ${new Date().toISOString()} Pairing server: Connection from`, socket.remoteAddress);
          this.pairingState.connected = true;
          this.pairingState.lastActivity = new Date().toISOString();
        },
        onSecureConnect: (socket) => {
          console.log(`🔐 [6467] ${new Date().toISOString()} Pairing server: Secure connection established`);
        },
        onData: (socket, data) => {
          console.log(`📨 [6467] ${new Date().toISOString()} Pairing server: Received`, data.length, 'bytes');
          this.updatePairingState(data);
          
          // Let the MockServer handle the default pairing flow by calling it directly
          this.handlePairingFlow(socket, data);
        },
        onClose: (socket) => {
          console.log(`🚪 [6467] ${new Date().toISOString()} Pairing server: Connection closed`);
          this.pairingState.connected = false;
        }
      });

      // Start remote server (6466)
      this.remoteServer = await startMockTLSServer({
        port: 6466,
        responseDelay: 100,
        enablePairingFlow: false,
        onConnect: (socket) => {
          console.log(`🖥️  [6466] ${new Date().toISOString()} Remote server: Connection from`, socket.remoteAddress);
        },
        onSecureConnect: (socket) => {
          console.log(`🔐 [6466] ${new Date().toISOString()} Remote server: Secure connection established`);
        },
        onData: (socket, data) => {
          console.log(`📨 [6466] ${new Date().toISOString()} Remote server: Received`, data.length, 'bytes');
        },
        onClose: (socket) => {
          console.log(`🚪 [6466] ${new Date().toISOString()} Remote server: Connection closed`);
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
      
      this.pairingState.lastActivity = new Date().toISOString();
      
      if (message.pairingRequest) {
        this.pairingState.pairingRequestReceived = true;
        console.log(`📋 [6467] ${new Date().toISOString()} Pairing protocol: PAIRING_REQUEST received`);
      } else if (message.pairingOption) {
        this.pairingState.pairingOptionReceived = true;
        console.log(`📋 [6467] ${new Date().toISOString()} Pairing protocol: PAIRING_OPTION received`);
      } else if (message.pairingConfiguration) {
        this.pairingState.pairingConfigurationReceived = true;
        console.log(`📋 [6467] ${new Date().toISOString()} Pairing protocol: PAIRING_CONFIGURATION received (should trigger secret dialog)`);
      } else if (message.pairingSecret) {
        this.pairingState.pairingSecretReceived = true;
        console.log(`📋 [6467] ${new Date().toISOString()} Pairing protocol: PAIRING_SECRET received`);
      }
    } catch (error) {
      console.log(`⚠️  [6467] ${new Date().toISOString()} Could not parse pairing message:`, error.message);
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
          // Send configuration ack
          const configAck = pairingMessageManager.create({
            pairingConfigurationAck: {},
            status: pairingMessageManager.Status.STATUS_OK,
            protocolVersion: 2
          });
          socket.write(configAck);
        } else if (message.pairingSecret) {
          // Send secret ack and close
          const secretAck = pairingMessageManager.create({
            pairingSecretAck: {
              secret: Buffer.from([1, 2, 3, 4])
            },
            status: pairingMessageManager.Status.STATUS_OK,
            protocolVersion: 2
          });
          socket.write(secretAck);
          socket.end();
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
        pairingState: serverManager.pairingState,
        timestamp: new Date().toISOString()
      };
      
      res.writeHead(200);
      res.end(JSON.stringify(status, null, 2));
    } else if (req.url === '/reset' && req.method === 'POST') {
      serverManager.resetPairingState();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Pairing state reset' }));
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