import { TLSRequestQueue } from './TLSRequestQueue.js';

class TLSConnectionPool {
    constructor() {
        this.pools = new Map(); // hostPort -> connection[]
        this.maxPoolSize = 3;   // Max connections per host:port
        this.maxIdleTime = 30000; // 30 seconds idle timeout
        this.requestQueue = new TLSRequestQueue();
        
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this._cleanupIdleConnections();
        }, 10000); // Clean up every 10 seconds
    }
    
    async getConnection(host, port, connectOptions) {
        const hostPort = `${host}:${port}`;
        
        console.log(`🏊 TLSConnectionPool: Requesting connection for ${hostPort}`);
        
        // Try to get existing available connection first
        const existingConnection = this._getAvailableConnection(hostPort);
        if (existingConnection) {
            console.log(`🏊 TLSConnectionPool: Reusing existing connection for ${hostPort}`);
            existingConnection.markInUse();
            return existingConnection;
        }
        
        // Check if we've reached the pool limit
        const pool = this.pools.get(hostPort) || [];
        if (pool.length >= this.maxPoolSize) {
            console.log(`🏊 TLSConnectionPool: Pool limit reached for ${hostPort}, waiting for available connection`);
            // Wait for an available connection or create new one when space is available
            return this._waitForAvailableConnection(hostPort, connectOptions);
        }
        
        // Create new connection through request queue (serialized TLS handshakes)
        console.log(`🏊 TLSConnectionPool: Creating new connection for ${hostPort}`);
        const connection = await this.requestQueue.queueRequest(host, port, connectOptions);
        
        // Add to pool
        this._addToPool(hostPort, connection);
        connection.markInUse();
        
        return connection;
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
                const connection = await this.requestQueue.queueRequest(host, parseInt(port), connectOptions);
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