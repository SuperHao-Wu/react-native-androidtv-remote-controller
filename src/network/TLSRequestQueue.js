import TcpSockets from 'react-native-tcp-socket';
import { PooledTLSConnection } from './PooledTLSConnection.js';

class TLSRequestQueue {
    constructor() {
        this.queues = new Map(); // hostPort -> { requests: [], processing: boolean }
        this.maxConcurrentPerHost = 1; // Serialize TLS handshakes per host to eliminate resource contention
    }
    
    async queueRequest(host, port, connectOptions) {
        const hostPort = `${host}:${port}`;
        
        console.log(`🚦 TLSRequestQueue: Queueing TLS request for ${hostPort}`);
        
        return new Promise((resolve, reject) => {
            // Initialize queue for this host:port if it doesn't exist
            if (!this.queues.has(hostPort)) {
                this.queues.set(hostPort, {
                    requests: [],
                    processing: false
                });
            }
            
            const queue = this.queues.get(hostPort);
            
            // Add request to queue
            queue.requests.push({
                host,
                port,
                connectOptions,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            console.log(`🚦 TLSRequestQueue: Queue length for ${hostPort}: ${queue.requests.length}`);
            
            // Process queue if not already processing
            this._processQueue(hostPort);
        });
    }
    
    async _processQueue(hostPort) {
        const queue = this.queues.get(hostPort);
        if (!queue || queue.processing || queue.requests.length === 0) {
            return;
        }
        
        queue.processing = true;
        console.log(`🚦 TLSRequestQueue: Starting to process queue for ${hostPort}`);
        
        while (queue.requests.length > 0) {
            const request = queue.requests.shift();
            const { host, port, connectOptions, resolve, reject } = request;
            
            try {
                console.log(`🚦 TLSRequestQueue: Processing TLS request for ${hostPort} (${queue.requests.length} remaining)`);
                
                // Create TLS connection with proper error handling
                const connection = await this._createTLSConnection(host, port, connectOptions);
                
                console.log(`🚦 TLSRequestQueue: TLS connection created successfully for ${hostPort}`);
                resolve(connection);
                
                // Add small delay between connections to further reduce resource contention
                if (queue.requests.length > 0) {
                    await this._sleep(100);
                }
                
            } catch (error) {
                console.error(`🚦 TLSRequestQueue: TLS connection failed for ${hostPort}:`, error);
                reject(error);
                
                // Add delay before processing next request on error
                if (queue.requests.length > 0) {
                    await this._sleep(500);
                }
            }
        }
        
        queue.processing = false;
        console.log(`🚦 TLSRequestQueue: Finished processing queue for ${hostPort}`);
    }
    
    async _createTLSConnection(host, port, connectOptions) {
        return new Promise((resolve, reject) => {
            console.log(`🔧 TLSRequestQueue: Creating TLS connection to ${host}:${port}`);
            
            const timeoutId = setTimeout(() => {
                console.error(`🔧 TLSRequestQueue: TLS connection timeout for ${host}:${port}`);
                socket.destroy(new Error('TLS connection timeout'));
            }, 15000); // 15 second timeout
            
            // Log what we're sending to TLS connection for Sony TV debugging
            console.log(`🔧 TLSRequestQueue: TLS Connection Options:`, {
                host,
                port,
                hasKey: !!connectOptions.key,
                hasCert: !!connectOptions.cert,
                keySize: connectOptions.key ? connectOptions.key.length : 0,
                certSize: connectOptions.cert ? connectOptions.cert.length : 0,
                rejectUnauthorized: connectOptions.rejectUnauthorized,
                androidKeyStore: connectOptions.androidKeyStore,
                certAlias: connectOptions.certAlias,
                keyAlias: connectOptions.keyAlias
            });

            const socket = TcpSockets.connectTLS(connectOptions, () => {
                console.log(`🔧 TLSRequestQueue: TLS connection established for ${host}:${port}`);
            });
            
            socket.on('secureConnect', () => {
                clearTimeout(timeoutId);
                console.log(`🔧 TLSRequestQueue: TLS handshake completed for ${host}:${port}`);
                
                // Log TLS connection state
                try {
                    console.log(`🔧 TLSRequestQueue: TLS Connection State:`, {
                        authorized: socket.authorized,
                        authorizationError: socket.authorizationError,
                        encrypted: socket.encrypted,
                        protocol: socket.getProtocol ? socket.getProtocol() : 'Unknown',
                        cipher: socket.getCipher ? socket.getCipher() : 'Unknown'
                    });
                } catch (stateError) {
                    console.log(`🔧 TLSRequestQueue: Could not get TLS state:`, stateError.message);
                }
                
                const pooledConnection = new PooledTLSConnection(socket, host, port);
                resolve(pooledConnection);
            });
            
            socket.on('error', (error) => {
                clearTimeout(timeoutId);
                console.error(`🔧 TLSRequestQueue: TLS connection error for ${host}:${port}:`, error);
                reject(error);
            });
        });
    }
    
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Get queue status for monitoring
    getQueueStatus() {
        const status = {};
        for (const [hostPort, queue] of this.queues.entries()) {
            status[hostPort] = {
                queueLength: queue.requests.length,
                processing: queue.processing
            };
        }
        return status;
    }
    
    // Clear queue for a specific host (useful for cleanup)
    clearQueue(host, port) {
        const hostPort = `${host}:${port}`;
        const queue = this.queues.get(hostPort);
        if (queue) {
            // Reject all pending requests
            queue.requests.forEach(request => {
                request.reject(new Error('Queue cleared'));
            });
            queue.requests = [];
            queue.processing = false;
        }
    }
}

export { TLSRequestQueue };