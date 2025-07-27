const { startMockTLSServer } = require('../__tests__/MockServer');

class MockServerManager {
  constructor() {
    this.pairingServer = null;
    this.remoteServer = null;
    this.isRunning = false;
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
          console.log('🖥️  [6467] Pairing server: Connection from', socket.remoteAddress);
        },
        onSecureConnect: (socket) => {
          console.log('🔐 [6467] Pairing server: Secure connection established');
        },
        onData: (socket, data) => {
          console.log('📨 [6467] Pairing server: Received', data.length, 'bytes');
        },
        onClose: (socket) => {
          console.log('🚪 [6467] Pairing server: Connection closed');
        }
      });

      // Start remote server (6466)
      this.remoteServer = await startMockTLSServer({
        port: 6466,
        responseDelay: 100,
        enablePairingFlow: false,
        onConnect: (socket) => {
          console.log('🖥️  [6466] Remote server: Connection from', socket.remoteAddress);
        },
        onSecureConnect: (socket) => {
          console.log('🔐 [6466] Remote server: Secure connection established');
        },
        onData: (socket, data) => {
          console.log('📨 [6466] Remote server: Received', data.length, 'bytes');
        },
        onClose: (socket) => {
          console.log('🚪 [6466] Remote server: Connection closed');
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

  async checkStatus() {
    return {
      isRunning: this.isRunning,
      pairingServer: this.pairingServer ? 'running' : 'stopped',
      remoteServer: this.remoteServer ? 'running' : 'stopped'
    };
  }
}

// For standalone usage
if (require.main === module) {
  const serverManager = new MockServerManager();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    await serverManager.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    await serverManager.stop();
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