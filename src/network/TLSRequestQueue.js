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
        this.baseDelay = 50; // Base delay in milliseconds
        this.maxDelay = 2000; // Maximum delay in milliseconds
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
            console.log(`🔧 TLSRequestQueue: [${requestId}] === CREATING TLS CONNECTION ===`);
            console.log(`🔧 TLSRequestQueue: [${requestId}] Target: ${host}:${port} (attempt ${attempt})`);
            console.log(`🔧 TLSRequestQueue: [${requestId}] Connection options: hasKey=${!!connectOptions.key}, hasCert=${!!connectOptions.cert}`);
            
            let socket = null;
            let isResolved = false;
            let tcpConnectTime = 'unknown';
            let tlsHandshakeStartTime = null;
            
            // REMOVED: TLSRequestQueue timeout - TLSSocket handles TLS handshake timeout (20 seconds)
            // We rely on TLSSocket's _startTLSTimeout() which provides specific TLS_HANDSHAKE_TIMEOUT error
            
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

            // Use callback-only approach to avoid React Native TLS event conflicts
            console.log(`🔧 TLSRequestQueue: [${requestId}] Calling TcpSockets.connectTLS...`);
            console.log(`🔍 TLSRequestQueue: [${requestId}] DEBUG - About to call TcpSockets.connectTLS function`);
            tlsHandshakeStartTime = Date.now() - connectionStartTime;
            
            try {
                socket = TcpSockets.connectTLS(connectOptions, () => {
                    if (isResolved) return;
                    isResolved = true;
                    const secureConnectTime = Date.now() - connectionStartTime;
                    console.log(`🔧 TLSRequestQueue: [${requestId}] === TLS HANDSHAKE SUCCESS ===`);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] secureConnect callback fired for ${host}:${port} (attempt ${attempt})`);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] TCP connect time: ${tcpConnectTime}ms`);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] TLS handshake time: ${secureConnectTime - (tlsHandshakeStartTime || 0)}ms`);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] Total connection time: ${secureConnectTime}ms`);
                    
                    // Log TLS connection state
                    try {
                        console.log(`🔧 TLSRequestQueue: [${requestId}] TLS Connection State:`, {
                            authorized: socket.authorized,
                            authorizationError: socket.authorizationError,
                            encrypted: socket.encrypted,
                            protocol: socket.getProtocol ? socket.getProtocol() : 'Unknown',
                            cipher: socket.getCipher ? socket.getCipher() : 'Unknown'
                        });
                    } catch (stateError) {
                        console.log(`🔧 TLSRequestQueue: [${requestId}] Could not get TLS state:`, stateError.message);
                    }
                    
                    console.log(`🔧 TLSRequestQueue: [${requestId}] Creating PooledTLSConnection wrapper...`);
                    const retryConnection = new PooledTLSConnection(socket, host, port);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] === TLS CONNECTION COMPLETE ===`);
                    resolve(retryConnection);
                });
                
                socket.on('connect', () => {
                    tcpConnectTime = Date.now() - connectionStartTime;
                    console.log(`🔧 TLSRequestQueue: [${requestId}] === TCP CONNECTION ESTABLISHED ===`);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] TCP connected for ${host}:${port} (attempt ${attempt})`);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] TCP connect took: ${tcpConnectTime}ms`);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] Now waiting for TLS handshake...`);
                });
                
                socket.on('error', (error) => {
                    if (isResolved) return;
                    isResolved = true;
                    const errorTime = Date.now() - connectionStartTime;
                    console.error(`🔧 TLSRequestQueue: [${requestId}] === CONNECTION ERROR ===`);
                    console.error(`🔧 TLSRequestQueue: [${requestId}] Error after ${errorTime}ms for ${host}:${port} (attempt ${attempt})`);
                    console.error(`🔧 TLSRequestQueue: [${requestId}] TCP connected: ${tcpConnectTime !== 'unknown' ? 'YES at ' + tcpConnectTime + 'ms' : 'NO'}`);
                    console.error(`🔧 TLSRequestQueue: [${requestId}] TLS started: ${tlsHandshakeStartTime ? 'YES at ' + tlsHandshakeStartTime + 'ms' : 'NO'}`);
                    console.error(`🔧 TLSRequestQueue: [${requestId}] Error details:`, error);
                    console.error(`🔧 TLSRequestQueue: [${requestId}] Error code:`, error.code); // Will show TLS_HANDSHAKE_TIMEOUT
                    reject(error);
                });

                socket.on('close', () => {
                    if (isResolved) return;
                    isResolved = true;
                    const closeTime = Date.now() - connectionStartTime;
                    console.log(`🔧 TLSRequestQueue: [${requestId}] === CONNECTION CLOSED ===`);
                    console.log(`🔧 TLSRequestQueue: [${requestId}] Connection closed after ${closeTime}ms for ${host}:${port} (attempt ${attempt})`);
                    const closeError = new Error('TLS connection closed unexpectedly');
                    closeError.code = 'CONNECTION_CLOSED';
                    reject(closeError);
                });

            } catch (error) {
                if (isResolved) return;
                isResolved = true;
                console.error(`🔧 TLSRequestQueue: [${requestId}] Error creating TLS connection:`, error);
                reject(error);
            }
        });
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