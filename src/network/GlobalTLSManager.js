import { TLSConnectionPool } from './TLSConnectionPool.js';

class GlobalTLSManager {
    constructor() {
        this.connectionPool = new TLSConnectionPool();
        this.initialized = false;
    }
    
    static getInstance() {
        if (!GlobalTLSManager.instance) {
            GlobalTLSManager.instance = new GlobalTLSManager();
        }
        return GlobalTLSManager.instance;
    }
    
    initialize() {
        if (!this.initialized) {
            console.log('🌐 GlobalTLSManager: Initializing TLS connection manager');
            this.initialized = true;
        }
    }
    
    async getConnection(host, port, connectOptions) {
        this.initialize();
        
        console.log(`🌐 GlobalTLSManager: Requesting TLS connection to ${host}:${port}`);
        
        try {
            const connection = await this.connectionPool.getConnection(host, port, connectOptions);
            console.log(`🌐 GlobalTLSManager: Successfully obtained TLS connection to ${host}:${port}`);
            return connection;
        } catch (error) {
            console.error(`🌐 GlobalTLSManager: Failed to obtain TLS connection to ${host}:${port}:`, error);
            throw error;
        }
    }
    
    releaseConnection(connection) {
        if (connection) {
            console.log(`🌐 GlobalTLSManager: Releasing TLS connection to ${connection.host}:${connection.port}`);
            this.connectionPool.releaseConnection(connection);
        }
    }
    
    // Get comprehensive statistics for monitoring
    getStats() {
        return {
            pools: this.connectionPool.getPoolStats(),
            queues: this.connectionPool.tlsQueue.getQueueStatus(),
            initialized: this.initialized
        };
    }
    
    // Cleanup specific host connections
    cleanupHost(host, port) {
        const hostPort = `${host}:${port}`;
        console.log(`🌐 GlobalTLSManager: Cleaning up connections for ${hostPort}`);
        
        // Clear any pending requests
        this.connectionPool.tlsQueue.clearQueue(host, port);
        
        // Note: Pool cleanup happens automatically through connection events
    }
    
    // Destroy all connections and cleanup (for app shutdown)
    destroy() {
        console.log('🌐 GlobalTLSManager: Destroying global TLS manager');
        
        if (this.connectionPool) {
            this.connectionPool.destroy();
        }
        
        this.initialized = false;
        GlobalTLSManager.instance = null;
    }
    
    // Debug method to log current state
    logStatus() {
        const stats = this.getStats();
        console.log('🌐 GlobalTLSManager Status:', JSON.stringify(stats, null, 2));
    }
}

// Singleton instance
GlobalTLSManager.instance = null;

export { GlobalTLSManager };