import { TLSRequestQueue } from './TLSRequestQueue.js';

class TLSConnectionPool {
    constructor() {
        this.pools = new Map(); // hostPort -> connection[]
        this.maxPoolSize = 3;   // Max connections per host:port
        this.maxIdleTime = 30000; // 30 seconds idle timeout
        this.tlsQueue = new TLSRequestQueue();
        this.pendingConnections = new Map(); // hostPort -> Promise to prevent duplicate creation
        
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this._cleanupIdleConnections();
        }, 10000); // Clean up every 10 seconds
    }
    
    async getConnection(host, port, connectOptions) {
        const hostPort = `${host}:${port}`;
        const requestId = Math.random().toString(36).substr(2, 8);
        
        console.log(`🏊 TLSConnectionPool: [${requestId}] Requesting connection for ${hostPort} - START`);
        console.log(`🏊 TLSConnectionPool: [${requestId}] Current pool stats:`, this.getPoolStats());
        console.log(`🏊 TLSConnectionPool: [${requestId}] Current queue status:`, this.tlsQueue.getQueueStatus());
        
        // Try to get existing available connection first
        const existingConnection = this._getAvailableConnection(hostPort);
        if (existingConnection) {
            console.log(`🏊 TLSConnectionPool: [${requestId}] Reusing existing connection for ${hostPort}`);
            existingConnection.markInUse();
            console.log(`🏊 TLSConnectionPool: [${requestId}] Connection reuse - COMPLETED`);
            return existingConnection;
        }
        
        // Check if we've reached the pool limit
        const pool = this.pools.get(hostPort) || [];
        if (pool.length >= this.maxPoolSize) {
            console.log(`🏊 TLSConnectionPool: Pool limit reached for ${hostPort}, waiting for available connection`);
            // Wait for an available connection or create new one when space is available
            return this._waitForAvailableConnection(hostPort, connectOptions);
        }
        
        // Check if there's already a pending connection creation for this hostPort
        if (this.pendingConnections.has(hostPort)) {
            console.log(`🏊 TLSConnectionPool: [${requestId}] Waiting for existing pending connection for ${hostPort}`);
            try {
                const pendingConnection = await this.pendingConnections.get(hostPort);
                // Check if the connection is still available
                if (pendingConnection && pendingConnection.isAlive() && !pendingConnection.inUse) {
                    console.log(`🏊 TLSConnectionPool: [${requestId}] Using recently created connection for ${hostPort}`);
                    pendingConnection.markInUse();
                    return pendingConnection;
                }
            } catch (error) {
                console.log(`🏊 TLSConnectionPool: [${requestId}] Pending connection failed for ${hostPort}, creating new one`);
            }
        }

        // Create new connection through request queue (serialized TLS handshakes)
        console.log(`🏊 TLSConnectionPool: [${requestId}] Creating new connection for ${hostPort}`);
        
        const connectionPromise = this._createNewConnection(host, port, connectOptions, hostPort, requestId);
        this.pendingConnections.set(hostPort, connectionPromise);
        
        try {
            const connection = await connectionPromise;
            console.log(`🏊 TLSConnectionPool: [${requestId}] New connection created for ${hostPort}`);
            
            // Add to pool
            this._addToPool(hostPort, connection);
            connection.markInUse();
            console.log(`🏊 TLSConnectionPool: [${requestId}] Connection creation - COMPLETED`);
            
            return connection;
        } finally {
            // Always clean up pending connection promise
            this.pendingConnections.delete(hostPort);
        }
    }
    
    async _createNewConnection(host, port, connectOptions, hostPort, requestId) {
        console.log(`🏊 TLSConnectionPool: [${requestId}] Delegating to TLS queue for ${hostPort}`);
        return await this.tlsQueue.queueRequest(host, port, connectOptions);
    }
    
    _getAvailableConnection(hostPort) {
        const pool = this.pools.get(hostPort);
        if (!pool) return null;
        
        return pool.find(conn => conn.isAlive() && !conn.inUse);
    }
    
    async _waitForAvailableConnection(hostPort, connectOptions) {
        const maxWaitTime = 5000; // 5 seconds max wait
        const checkInterval = 100; // Check every 100ms
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            const available = this._getAvailableConnection(hostPort);
            if (available) {
                available.markInUse();
                return available;
            }
            
            // Clean up any dead connections to make space
            this._cleanupDeadConnections(hostPort);
            
            const pool = this.pools.get(hostPort) || [];
            if (pool.length < this.maxPoolSize) {
                // Space available, create new connection
                const [host, port] = hostPort.split(':');
                const connection = await this.tlsQueue.queueRequest(host, parseInt(port), connectOptions);
                this._addToPool(hostPort, connection);
                connection.markInUse();
                return connection;
            }
            
            await this._sleep(checkInterval);
        }
        
        throw new Error(`Timeout waiting for available connection to ${hostPort}`);
    }
    
    _addToPool(hostPort, connection) {
        if (!this.pools.has(hostPort)) {
            this.pools.set(hostPort, []);
        }
        
        const pool = this.pools.get(hostPort);
        pool.push(connection);
        
        console.log(`🏊 TLSConnectionPool: Added connection to pool for ${hostPort} (pool size: ${pool.length})`);
        
        // Set up connection event handlers for pool management
        connection.on('close', () => {
            this._removeFromPool(hostPort, connection);
        });
        
        connection.on('error', () => {
            this._removeFromPool(hostPort, connection);
        });
    }
    
    _removeFromPool(hostPort, connection) {
        const pool = this.pools.get(hostPort);
        if (pool) {
            const index = pool.indexOf(connection);
            if (index !== -1) {
                pool.splice(index, 1);
                console.log(`🏊 TLSConnectionPool: Removed connection from pool for ${hostPort} (pool size: ${pool.length})`);
            }
            
            // Clean up empty pools
            if (pool.length === 0) {
                this.pools.delete(hostPort);
            }
        }
    }
    
    releaseConnection(connection) {
        if (connection && !connection.destroyed) {
            connection.markAvailable();
            console.log(`🏊 TLSConnectionPool: Released connection for ${connection.host}:${connection.port}`);
        }
    }
    
    _cleanupIdleConnections() {
        console.log('🏊 TLSConnectionPool: Running idle connection cleanup');
        
        for (const [hostPort, pool] of this.pools.entries()) {
            const toRemove = [];
            
            pool.forEach(conn => {
                if (!conn.isAlive()) {
                    console.log(`🏊 TLSConnectionPool: Cleaning up idle connection for ${hostPort}`);
                    toRemove.push(conn);
                }
            });
            
            toRemove.forEach(conn => {
                try {
                    conn.destroy();
                } catch (error) {
                    console.log('🏊 TLSConnectionPool: Error destroying idle connection:', error);
                }
                this._removeFromPool(hostPort, conn);
            });
        }
    }
    
    _cleanupDeadConnections(hostPort) {
        const pool = this.pools.get(hostPort);
        if (!pool) return;
        
        const toRemove = pool.filter(conn => !conn.isAlive());
        toRemove.forEach(conn => {
            try {
                conn.destroy();
            } catch (error) {
                console.log('🏊 TLSConnectionPool: Error destroying dead connection:', error);
            }
            this._removeFromPool(hostPort, conn);
        });
    }
    
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Get pool statistics for monitoring
    getPoolStats() {
        const stats = {};
        for (const [hostPort, pool] of this.pools.entries()) {
            stats[hostPort] = {
                total: pool.length,
                available: pool.filter(conn => !conn.inUse && conn.isAlive()).length,
                inUse: pool.filter(conn => conn.inUse).length,
                dead: pool.filter(conn => !conn.isAlive()).length
            };
        }
        return stats;
    }
    
    // Destroy all connections and cleanup
    destroy() {
        console.log('🏊 TLSConnectionPool: Destroying connection pool');
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        for (const [hostPort, pool] of this.pools.entries()) {
            pool.forEach(conn => {
                try {
                    conn.destroy();
                } catch (error) {
                    console.log('🏊 TLSConnectionPool: Error destroying connection during cleanup:', error);
                }
            });
        }
        
        this.pools.clear();
    }
}

export { TLSConnectionPool };