import TcpSockets from 'react-native-tcp-socket';
import { PooledTLSConnection } from './PooledTLSConnection.js';

class TLSRequestQueue {
    constructor() {
        this.queues = new Map(); // hostPort -> { requests: [], processing: boolean }
        this.maxConcurrentPerHost = 1; // Serialize TLS handshakes per host to eliminate resource contention
    }
    
    async queueRequest(host, port, connectOptions) {
        const hostPort = `${host}:${port}`;
        const requestId = Math.random().toString(36).substr(2, 8);
        
        console.log(`🚦 TLSRequestQueue: [${requestId}] Queueing TLS request for ${hostPort}`);
        
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
                timestamp: Date.now(),
                requestId
            });
            
            console.log(`🚦 TLSRequestQueue: [${requestId}] Queue length for ${hostPort}: ${queue.requests.length}`);
            
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
            const { host, port, connectOptions, resolve, reject, requestId } = request;
            
            try {
                console.log(`🚦 TLSRequestQueue: [${requestId}] Processing TLS request for ${hostPort} (${queue.requests.length} remaining)`);
                
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
            
            let socket = null;
            
            const timeoutId = setTimeout(() => {
                console.error(`🔧 TLSRequestQueue: TLS connection timeout for ${host}:${port}`);
                if (socket) {
                    socket.destroy(new Error('TLS connection timeout'));
                }
                reject(new Error('TLS connection timeout'));
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

            // CRITICAL FIX: Use callback-only approach to avoid React Native TLS event conflicts
            socket = TcpSockets.connectTLS(connectOptions, () => {
                console.log(`🔧 TLSRequestQueue: secureConnect callback fired for ${host}:${port}`);
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
            
            socket.on('connect', () => {
                console.log(`🔧 TLSRequestQueue: TCP connection established for ${host}:${port}`);
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