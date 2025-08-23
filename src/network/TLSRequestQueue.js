import TcpSockets from 'react-native-tcp-socket';
import { PooledTLSConnection } from './PooledTLSConnection.js';

// DEBUG: Check what we're actually importing (safe logging)
console.log('🔍 TLSRequestQueue: DEBUG - TcpSockets import successful');
console.log('🔍 TLSRequestQueue: DEBUG - TcpSockets.connectTLS type:', typeof TcpSockets.connectTLS);
// Avoid toString() on React Native bridge functions - can cause circular references

class TLSRequestQueue {
    constructor() {
        this.retryAttempts = new Map(); // hostPort -> retry count for tracking
        this.maxRetries = Infinity; // Infinite retries by default
        this.baseDelay = 1000; // 1 second base delay (more conservative for TLS failures)
        this.maxDelay = 10000; // 10 second maximum delay
        this.activeConnections = new Map(); // hostPort -> { controller, onProgress } for cancellation
    }
    
    async createConnectionWithRetry(host, port, connectOptions, options = {}) {
        const hostPort = `${host}:${port}`;
        const requestId = Math.random().toString(36).substr(2, 8);
        const { onProgress, abortSignal } = options;
        
        // Support custom maxRetries, default to infinite
        const maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.maxRetries;
        const isInfinite = maxRetries === Infinity;
        
        console.log(`🔄 TLSRequestQueue: [${requestId}] ======================================`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] STARTING RETRY CONNECTION PROCESS`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Target: ${hostPort}`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Max retries: ${isInfinite ? 'INFINITE' : maxRetries}`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Base delay: ${this.baseDelay}ms`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Max delay: ${this.maxDelay}ms`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] Cancellable: ${!!abortSignal}`);
        console.log(`🔄 TLSRequestQueue: [${requestId}] ======================================`);
        
        // Initialize retry count for this host:port
        if (!this.retryAttempts.has(hostPort)) {
            this.retryAttempts.set(hostPort, 0);
        }
        
        // Store active connection for cancellation
        const connectionController = {
            cancelled: false,
            currentSocket: null
        };
        this.activeConnections.set(hostPort, { controller: connectionController, onProgress });
        
        // Handle abort signal
        if (abortSignal) {
            if (abortSignal.aborted) {
                this.activeConnections.delete(hostPort);
                throw new Error('Connection cancelled before starting');
            }
            
            abortSignal.addEventListener('abort', () => {
                console.log(`🛑 TLSRequestQueue: [${requestId}] Connection cancelled by user`);
                connectionController.cancelled = true;
                if (connectionController.currentSocket) {
                    this._destroySocket(connectionController.currentSocket, 
                        connectionController.currentSocket._id || 'unknown', 'user cancellation');
                }
                this.activeConnections.delete(hostPort);
            });
        }
        
        const startTime = Date.now();
        let attempt = 1;
        
        while (isInfinite || attempt <= maxRetries) {
            // Check for cancellation
            if (connectionController.cancelled) {
                const cancelError = new Error('Connection cancelled by user');
                cancelError.code = 'USER_CANCELLED';
                throw cancelError;
            }
            
            const attemptStartTime = Date.now();
            this.retryAttempts.set(hostPort, attempt - 1); // 0-based for display
            
            // Update progress
            if (onProgress) {
                onProgress({
                    hostPort,
                    attempt,
                    maxRetries: isInfinite ? 'infinite' : maxRetries,
                    phase: 'connecting',
                    startTime: attemptStartTime
                });
            }
            
            try {
                const displayAttempt = isInfinite ? `${attempt} (∞)` : `${attempt}/${maxRetries}`;
                console.log(`🔄 TLSRequestQueue: [${requestId}] ====== ATTEMPT ${displayAttempt} STARTED for ${hostPort} ======`);
                console.log(`🔄 TLSRequestQueue: [${requestId}] Total elapsed time: ${Date.now() - startTime}ms`);
                
                const connection = await this._createTLSConnection(host, port, connectOptions, requestId, attempt, connectionController);
                
                // Success! Reset retry count and return connection
                const totalTime = Date.now() - startTime;
                const attemptTime = Date.now() - attemptStartTime;
                this.retryAttempts.set(hostPort, 0);
                this.activeConnections.delete(hostPort);
                
                if (onProgress) {
                    onProgress({
                        hostPort,
                        attempt,
                        maxRetries: isInfinite ? 'infinite' : maxRetries,
                        phase: 'success',
                        totalTime,
                        attemptTime
                    });
                }
                
                console.log(`✅ TLSRequestQueue: [${requestId}] ====== CONNECTION SUCCESS ======`);
                console.log(`✅ TLSRequestQueue: [${requestId}] Success on attempt: ${displayAttempt}`);
                console.log(`✅ TLSRequestQueue: [${requestId}] This attempt took: ${attemptTime}ms`);
                console.log(`✅ TLSRequestQueue: [${requestId}] Total time (including retries): ${totalTime}ms`);
                console.log(`✅ TLSRequestQueue: [${requestId}] Host: ${hostPort}`);
                console.log(`✅ TLSRequestQueue: [${requestId}] ====== SUCCESS SUMMARY COMPLETE ======`);
                return connection;
                
            } catch (error) {
                const attemptTime = Date.now() - attemptStartTime;
                const totalElapsed = Date.now() - startTime;
                
                // Check if this was user cancellation
                if (error.code === 'USER_CANCELLED' || connectionController.cancelled) {
                    this.activeConnections.delete(hostPort);
                    throw error;
                }
                
                const displayAttempt = isInfinite ? `${attempt} (∞)` : `${attempt}/${maxRetries}`;
                console.log(`❌ TLSRequestQueue: [${requestId}] ====== ATTEMPT ${attempt} FAILED ======`);
                console.log(`❌ TLSRequestQueue: [${requestId}] Failed attempt: ${displayAttempt}`);
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
                
                // If this was the last attempt (and not infinite), reject with the error
                if (!isInfinite && attempt >= maxRetries) {
                    const finalTime = Date.now() - startTime;
                    console.error(`💥 TLSRequestQueue: [${requestId}] ====== FINAL FAILURE ======`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] All ${maxRetries} attempts failed for ${hostPort}`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] Total time spent: ${finalTime}ms`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] Final error: ${error.message}`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] Final error code: ${error.code || 'UNKNOWN'}`);
                    console.error(`💥 TLSRequestQueue: [${requestId}] ====== GIVING UP ======`);
                    this.retryAttempts.set(hostPort, 0); // Reset for next time
                    this.activeConnections.delete(hostPort);
                    
                    if (onProgress) {
                        onProgress({
                            hostPort,
                            attempt,
                            maxRetries,
                            phase: 'failed',
                            error: error.message,
                            totalTime: finalTime
                        });
                    }
                    
                    throw error;
                }
                
                // Calculate exponential backoff delay with jitter
                const baseDelay = Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay);
                const jitter = Math.random() * 50; // ±25ms jitter
                const delay = baseDelay + jitter;
                
                const nextDisplayAttempt = isInfinite ? `${attempt + 1} (∞)` : `${attempt + 1}/${maxRetries}`;
                console.log(`⏰ TLSRequestQueue: [${requestId}] ====== PREPARING RETRY ======`);
                console.log(`⏰ TLSRequestQueue: [${requestId}] Next attempt: ${nextDisplayAttempt}`);
                console.log(`⏰ TLSRequestQueue: [${requestId}] Waiting: ${Math.round(delay)}ms`);
                console.log(`⏰ TLSRequestQueue: [${requestId}] Backoff calculation: baseDelay=${Math.round(Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay))}ms + jitter=${Math.round(jitter)}ms`);
                
                if (onProgress) {
                    onProgress({
                        hostPort,
                        attempt,
                        maxRetries: isInfinite ? 'infinite' : maxRetries,
                        phase: 'retrying',
                        error: error.message,
                        retryDelay: Math.round(delay),
                        nextAttempt: attempt + 1
                    });
                }
                
                await this._sleep(delay);
                
                // Check for cancellation after sleep
                if (connectionController.cancelled) {
                    const cancelError = new Error('Connection cancelled by user');
                    cancelError.code = 'USER_CANCELLED';
                    this.activeConnections.delete(hostPort);
                    throw cancelError;
                }
                
                console.log(`🔄 TLSRequestQueue: [${requestId}] Wait complete, starting next attempt...`);
            }
            
            attempt++;
        }
    }
    
    // Remove old queue processing logic - replaced with retry logic above
    
    async _createTLSConnection(host, port, connectOptions, requestId, attempt, connectionController) {
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
                
                // Store socket reference for cancellation
                connectionController.currentSocket = socket;
                
                console.log(`🔧 TLSRequestQueue: [${getLogId()}] Socket created successfully`);
                console.log(`🔧 TLSRequestQueue: [${getLogId()}] Calling TcpSockets.connectTLS...`);
                console.log(`🔍 TLSRequestQueue: [${getLogId()}] DEBUG - About to call TcpSockets.connectTLS function`);
                
                socket.on('connect', () => {
                    // Check for cancellation
                    if (connectionController.cancelled) {
                        if (!isResolved) {
                            isResolved = true;
                            const cancelError = new Error('Connection cancelled by user');
                            cancelError.code = 'USER_CANCELLED';
                            reject(cancelError);
                        }
                        return;
                    }
                    
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
            const activeConnection = this.activeConnections.get(hostPort);
            status[hostPort] = {
                currentRetries: retryCount,
                maxRetries: this.maxRetries === Infinity ? 'infinite' : this.maxRetries,
                isActive: !!activeConnection,
                canCancel: !!activeConnection
            };
        }
        return status;
    }
    
    // Cancel active connection for a specific host:port
    cancelConnection(host, port) {
        const hostPort = `${host}:${port}`;
        const activeConnection = this.activeConnections.get(hostPort);
        
        if (activeConnection) {
            console.log(`🛑 TLSRequestQueue: Cancelling connection to ${hostPort}`);
            activeConnection.controller.cancelled = true;
            
            if (activeConnection.controller.currentSocket) {
                this._destroySocket(
                    activeConnection.controller.currentSocket, 
                    activeConnection.controller.currentSocket._id || 'unknown', 
                    'user cancellation'
                );
            }
            
            this.activeConnections.delete(hostPort);
            this.retryAttempts.set(hostPort, 0); // Reset retry count
            return true;
        }
        
        console.log(`ℹ️ TLSRequestQueue: No active connection to cancel for ${hostPort}`);
        return false;
    }
    
    // Cancel all active connections
    cancelAllConnections() {
        const cancelledHosts = [];
        for (const [hostPort, activeConnection] of this.activeConnections.entries()) {
            console.log(`🛑 TLSRequestQueue: Cancelling connection to ${hostPort}`);
            activeConnection.controller.cancelled = true;
            
            if (activeConnection.controller.currentSocket) {
                this._destroySocket(
                    activeConnection.controller.currentSocket, 
                    activeConnection.controller.currentSocket._id || 'unknown', 
                    'mass cancellation'
                );
            }
            
            cancelledHosts.push(hostPort);
            this.retryAttempts.set(hostPort, 0); // Reset retry count
        }
        
        this.activeConnections.clear();
        console.log(`🛑 TLSRequestQueue: Cancelled ${cancelledHosts.length} active connections`);
        return cancelledHosts;
    }
    
    // Check if a connection is currently active
    isConnectionActive(host, port) {
        const hostPort = `${host}:${port}`;
        return this.activeConnections.has(hostPort);
    }
    
    // Reset retry count for a specific host (useful for cleanup)
    clearRetryCount(host, port) {
        const hostPort = `${host}:${port}`;
        this.retryAttempts.set(hostPort, 0);
        console.log(`🔄 TLSRequestQueue: Reset retry count for ${hostPort}`);
    }
}

export { TLSRequestQueue };