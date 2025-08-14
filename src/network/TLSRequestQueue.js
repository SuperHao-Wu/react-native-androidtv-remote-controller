import TcpSockets from 'react-native-tcp-socket';
import { PooledTLSConnection } from './PooledTLSConnection.js';

// DEBUG: Check what we're actually importing
console.log('🔍 TLSRequestQueue: DEBUG - Imported TcpSockets object keys:', Object.keys(TcpSockets));
console.log('🔍 TLSRequestQueue: DEBUG - TcpSockets.connectTLS type:', typeof TcpSockets.connectTLS);
console.log('🔍 TLSRequestQueue: DEBUG - TcpSockets.connectTLS toString:', TcpSockets.connectTLS.toString().substring(0, 200));

class TLSRequestQueue {
    constructor() {
        this.retryAttempts = new Map(); // hostPort -> retry count for tracking
        this.maxRetries = 4; // Maximum retry attempts
        this.baseDelay = 1000; // 1 second base delay (more conservative for TLS failures)
        this.maxDelay = 10000; // 10 second maximum delay
    }
    
    async createConnectionWithRetry(host, port, connectOptions) {
        const hostPort = `${host}:${port}`;
        const requestId = Math.random().toString(36).substr(2, 8);
        
        console.log(`🔄 TLSRequestQueue: [${requestId}] ======================================`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] STARTING RETRY CONNECTION PROCESS`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Target: ${hostPort}`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Max retries: ${this.maxRetries}`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Base delay: ${this.baseDelay}ms`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Max delay: ${this.maxDelay}ms`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] ======================================`);
        
        // Initialize retry count for this host:port
        if (!this.retryAttempts.has(hostPort)) {
            this.retryAttempts.set(hostPort, 0);
        }
        
        const startTime = Date.now();
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            const attemptStartTime = Date.now();
            try {
                console.log(`🔄 TLSRequestQueue: [${requestId}] ====== ATTEMPT ${attempt}/${this.maxRetries} STARTED for ${hostPort} ======`);
                console.log(`🔄 TLSRequestQueue: [${requestId}] Total elapsed time: ${Date.now() - startTime}ms`);
                
                const connection = await this._createTLSConnection(host, port, connectOptions, requestId, attempt);
                
                // Success! Reset retry count and return connection
                const totalTime = Date.now() - startTime;
                const attemptTime = Date.now() - attemptStartTime;
                this.retryAttempts.set(hostPort, 0);
                
                console.log(`✅ TLSRequestQueue: [${requestId}] ====== CONNECTION SUCCESS ======`);
                console.log(`✅ TLSRequestQueue: [${requestId}] Success on attempt: ${attempt}/${this.maxRetries}`);
                console.log(`✅ TLSRequestQueue: [${requestId}] This attempt took: ${attemptTime}ms`);
                console.log(`✅ TLSRequestQueue: [${requestId}] Total time (including retries): ${totalTime}ms`);
                console.log(`✅ TLSRequestQueue: [${requestId}] Host: ${hostPort}`);
                console.log(`✅ TLSRequestQueue: [${requestId}] ====== SUCCESS SUMMARY COMPLETE ======`);
                return connection;
                
            } catch (error) {
                const attemptTime = Date.now() - attemptStartTime;
                const totalElapsed = Date.now() - startTime;
                
                console.log(`❌ TLSRequestQueue: [${requestId}] ====== ATTEMPT ${attempt} FAILED ======`);
                console.log(`❌ TLSRequestQueue: [${requestId}] Failed attempt: ${attempt}/${this.maxRetries}`);
                console.log(`❌ TLSRequestQueue: [${requestId}] This attempt took: ${attemptTime}ms`);
                console.log(`❌ TLSRequestQueue: [${requestId}] Total elapsed: ${totalElapsed}ms`);
                console.log(`❌ TLSRequestQueue: [${requestId}] Error: ${error.message}`);
                console.log(`❌ TLSRequestQueue: [${requestId}] Error code: ${error.code || 'UNKNOWN'}`);
                console.log(`❌ TLSRequestQueue: [${requestId}] Host: ${hostPort}`);
                
                // Log specific error types for debugging
                if (error.code === 'TLS_HANDSHAKE_TIMEOUT') {
                    console.log(`🕐 TLSRequestQueue: [${requestId}] TLS handshake timeout (10s) - will retry with fresh connection`);
                } else if (error.code === 'CONNECTION_CLOSED') {
                    console.log(`🔌 TLSRequestQueue: [${requestId}] Connection closed unexpectedly - will retry`);
                } else {
                    console.log(`🔍 TLSRequestQueue: [${requestId}] Generic error: ${error.message} - will retry`);
                }
                
                // If this was the last attempt, reject with the error
                if (attempt === this.maxRetries) {
                    const finalTime = Date.now() - startTime;
                    console.error(`💥 TLSRequestQueue: [${requestId}] ====== FINAL FAILURE ======`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] All ${this.maxRetries} attempts failed for ${hostPort}`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] Total time spent: ${finalTime}ms`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] Final error: ${error.message}`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] Final error code: ${error.code || 'UNKNOWN'}`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] ====== GIVING UP ======`);
                    this.retryAttempts.set(hostPort, 0); // Reset for next time
                    throw error;
                }
                
                // Calculate exponential backoff delay with jitter
                const baseDelay = Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay);
                const jitter = Math.random() * 50; // ±25ms jitter
                const delay = baseDelay + jitter;
                
                console.log(`⏰ TLSRequestQueue: [${requestId}] ====== PREPARING RETRY ======`);
                console.log(`⏰ TLSRequestQueue: [${requestId}] Next attempt: ${attempt + 1}/${this.maxRetries}`);
                console.log(`⏰ TLSRequestQueue: [${requestId}] Waiting: ${Math.round(delay)}ms`);
                console.log(`⏰ TLSRequestQueue: [${requestId}] Backoff calculation: baseDelay=${Math.round(Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay))}ms + jitter=${Math.round(jitter)}ms`);
                
                await this._sleep(delay);
                
                console.log(`🔄 TLSRequestQueue: [${requestId}] Wait complete, starting next attempt...`);
            }
        }
    }
    
    // Remove old queue processing logic - replaced with retry logic above
    
    async _createTLSConnection(host, port, connectOptions, requestId, attempt) {
        return new Promise((resolve, reject) => {
            const connectionStartTime = Date.now();
            
            let socket = null;
            let isResolved = false;
            let tcpConnectTime = 'unknown';
            let tlsHandshakeStartTime = null;
            
            // Helper function to get combined request:socket ID for logging
            // This dynamically gets the socket ID each time it's called
            const getLogId = () => {
                const currentSocketId = socket?._id || 'unknown';
                return `${requestId}:${currentSocketId}`;
            };
            
            console.log(`🔧 TLSRequestQueue: [${requestId}] === CREATING TLS CONNECTION ===`);
            console.log(`🔧 TLSRequestQueue: [${requestId}] Target: ${host}:${port} (attempt ${attempt})`);
            console.log(`🔧 TLSRequestQueue: [${requestId}] Connection options: hasKey=${!!connectOptions.key}, hasCert=${!!connectOptions.cert}`);
            
            // REMOVED: TLSRequestQueue timeout - TLSSocket handles TLS handshake timeout (20 seconds)
            // We rely on TLSSocket's _startTLSTimeout() which provides specific TLS_HANDSHAKE_TIMEOUT error
            
            // Log what we're sending to TLS connection for Sony TV debugging
            console.log(`🔧 TLSRequestQueue: [${requestId}] TLS Connection Options:`, {
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

            tlsHandshakeStartTime = Date.now() - connectionStartTime;
            
            try {
                socket = TcpSockets.connectTLS(connectOptions, () => {
                    if (isResolved) return;
                    isResolved = true;
                    const secureConnectTime = Date.now() - connectionStartTime;
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] === TLS HANDSHAKE SUCCESS ===`);
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] secureConnect callback fired for ${host}:${port} (attempt ${attempt})`);
                    // Handle case where TLS success fires before TCP connect event
                    const displayTcpTime = tcpConnectTime !== 'unknown' ? `${tcpConnectTime}ms` : 'not captured (TLS success before connect event)';
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] TCP connect time: ${displayTcpTime}`);
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] TLS handshake time: ${secureConnectTime - (tlsHandshakeStartTime || 0)}ms`);
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] Total connection time: ${secureConnectTime}ms`);
                    
                    // Log TLS connection state
                    try {
                        console.log(`🔧 TLSRequestQueue: [${getLogId()}] TLS Connection State:`, {
                            authorized: socket.authorized,
                            authorizationError: socket.authorizationError,
                            encrypted: socket.encrypted,
                            protocol: socket.getProtocol ? socket.getProtocol() : 'Unknown',
                            cipher: socket.getCipher ? socket.getCipher() : 'Unknown'
                        });
                    } catch (stateError) {
                        console.log(`🔧 TLSRequestQueue: [${getLogId()}] Could not get TLS state:`, stateError.message);
                    }
                    
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] Creating PooledTLSConnection wrapper...`);
                    const retryConnection = new PooledTLSConnection(socket, host, port);
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] === TLS CONNECTION COMPLETE ===`);
                    resolve(retryConnection);
                });
                
                console.log(`🔧 TLSRequestQueue: [${getLogId()}] Socket created successfully`);
                console.log(`🔧 TLSRequestQueue: [${getLogId()}] Calling TcpSockets.connectTLS...`);
                console.log(`🔍 TLSRequestQueue: [${getLogId()}] DEBUG - About to call TcpSockets.connectTLS function`);
                
                socket.on('connect', () => {
                    tcpConnectTime = Date.now() - connectionStartTime;
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] === TCP CONNECTION ESTABLISHED ===`);
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] TCP connected for ${host}:${port} (attempt ${attempt})`);
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] TCP connect took: ${tcpConnectTime}ms`);
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] Now waiting for TLS handshake...`);
                });
                
                socket.on('error', (error) => {
                    if (isResolved) return;
                    isResolved = true;
                    const errorTime = Date.now() - connectionStartTime;
                    console.error(`🔧 TLSRequestQueue: [${getLogId()}] === CONNECTION ERROR ===`);
                    console.error(`🔧 TLSRequestQueue: [${getLogId()}] Error after ${errorTime}ms for ${host}:${port} (attempt ${attempt})`);
                    console.error(`🔧 TLSRequestQueue: [${getLogId()}] TCP connected: ${tcpConnectTime !== 'unknown' ? 'YES at ' + tcpConnectTime + 'ms' : 'NO'}`);
                    console.error(`🔧 TLSRequestQueue: [${getLogId()}] TLS started: ${tlsHandshakeStartTime ? 'YES at ' + tlsHandshakeStartTime + 'ms' : 'NO'}`);
                    console.error(`🔧 TLSRequestQueue: [${getLogId()}] Error details:`, error);
                    console.error(`🔧 TLSRequestQueue: [${getLogId()}] Error code:`, error.code); // Will show TLS_HANDSHAKE_TIMEOUT
                    
                    // Immediately destroy failed socket to prevent resource leak
                    const currentSocketId = socket?._id || 'unknown';
                    console.error(`💥 TLSRequestQueue: [${getLogId()}] Socket ${currentSocketId} failed - destroying immediately to prevent resource leak`);
                    const destroyed = this._destroySocket(socket, currentSocketId, `error: ${error.code || error.message}`);
                    
                    if (destroyed) {
                        console.error(`🗑️ TLSRequestQueue: [${getLogId()}] Socket ${currentSocketId} destroyed immediately (not waiting for OS cleanup)`);
                    } else {
                        console.error(`⚠️ TLSRequestQueue: [${getLogId()}] Socket ${currentSocketId} could not be destroyed - may cause resource leak`);
                    }
                    
                    reject(error);
                });

                socket.on('close', () => {
                    if (isResolved) return;
                    isResolved = true;
                    const closeTime = Date.now() - connectionStartTime;
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] === CONNECTION CLOSED ===`);
                    console.log(`🔧 TLSRequestQueue: [${getLogId()}] Connection closed after ${closeTime}ms for ${host}:${port} (attempt ${attempt})`);
                    
                    // Check if this was a natural close vs our explicit destruction
                    const currentSocketId = socket?._id || 'unknown';
                    if (socket.destroyed) {
                        console.log(`ℹ️ TLSRequestQueue: [${getLogId()}] Socket ${currentSocketId} closed after explicit destruction (expected)`);
                    } else {
                        console.warn(`⚠️ TLSRequestQueue: [${getLogId()}] Socket ${currentSocketId} closed naturally without explicit destruction`);
                    }
                    
                    const closeError = new Error('TLS connection closed unexpectedly');
                    closeError.code = 'CONNECTION_CLOSED';
                    reject(closeError);
                });

            } catch (error) {
                if (isResolved) return;
                isResolved = true;
                console.error(`🔧 TLSRequestQueue: [${getLogId()}] Error creating TLS connection:`, error);
                
                // Clean up socket if it was created before the error
                if (socket) {
                    const currentSocketId = socket?._id || 'unknown';
                    this._destroySocket(socket, currentSocketId, 'creation error');
                }
                
                reject(error);
            }
        });
    }
    
    _destroySocket(socket, socketId, reason) {
        try {
            if (socket && !socket.destroyed) {
                console.log(`🗑️ TLSRequestQueue: Destroying socket ${socketId} (reason: ${reason})`);
                socket.destroy();
                console.log(`✅ TLSRequestQueue: Socket ${socketId} destroyed successfully`);
                return true;
            } else {
                console.log(`ℹ️ TLSRequestQueue: Socket ${socketId} already destroyed or null (reason: ${reason})`);
                return false;
            }
        } catch (cleanupError) {
            console.error(`⚠️ TLSRequestQueue: Failed to destroy socket ${socketId}:`, cleanupError.message);
            return false;
        }
    }
    
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Get retry status for monitoring
    getRetryStatus() {
        const status = {};
        for (const [hostPort, retryCount] of this.retryAttempts.entries()) {
            status[hostPort] = {
                currentRetries: retryCount,
                maxRetries: this.maxRetries
            };
        }
        return status;
    }
    
    // Reset retry count for a specific host (useful for cleanup)
    clearRetryCount(host, port) {
        const hostPort = `${host}:${port}`;
        this.retryAttempts.set(hostPort, 0);
        console.log(`🔄 TLSRequestQueue: Reset retry count for ${hostPort}`);
    }
}

export { TLSRequestQueue };