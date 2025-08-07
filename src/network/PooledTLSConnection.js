import EventEmitter from 'events';

class PooledTLSConnection extends EventEmitter {
    constructor(socket, host, port) {
        super();
        this.socket = socket;
        this.host = host;
        this.port = port;
        this.lastUsed = Date.now();
        this.inUse = false;
        this.isHealthy = true;
        
        // Forward socket events
        this.socket.on('error', (error) => {
            this.isHealthy = false;
            this.emit('error', error);
        });
        
        this.socket.on('close', (hasError) => {
            this.isHealthy = false;
            this.emit('close', hasError);
        });
        
        this.socket.on('end', () => {
            this.isHealthy = false;
            this.emit('end');
        });
        
        // Forward TLS-specific events
        this.socket.on('secureConnect', () => {
            this.emit('secureConnect');
        });
        
        this.socket.on('data', (data) => {
            // Update lastUsed timestamp on data activity to prevent premature cleanup
            this.lastUsed = Date.now();
            this.emit('data', data);
        });
    }
    
    isAlive() {
        const maxIdleTime = 30000; // 30 seconds
        const isRecent = (Date.now() - this.lastUsed) < maxIdleTime;
        // CRITICAL FIX: Don't clean up connections that are still processing data
        // If the connection was recently used (within 15 seconds), keep it alive even if marked available
        const recentlyActive = (Date.now() - this.lastUsed) < 15000; // 15 seconds protection window
        const shouldKeepAlive = this.inUse || recentlyActive;
        return this.isHealthy && !shouldKeepAlive && isRecent && !this.socket.destroyed;
    }
    
    markInUse() {
        this.inUse = true;
        this.lastUsed = Date.now();
    }
    
    markAvailable() {
        this.inUse = false;
        this.lastUsed = Date.now();
    }
    
    write(data) {
        this.lastUsed = Date.now();
        return this.socket.write(data);
    }
    
    destroy(error) {
        this.isHealthy = false;
        this.socket.destroy(error);
    }
    
    removeAllListeners() {
        super.removeAllListeners();
        this.socket.removeAllListeners();
    }
    
    // Proxy common socket methods
    async getCertificate() {
        return this.socket.getCertificate();
    }
    
    async getPeerCertificate() {
        return this.socket.getPeerCertificate();
    }
    
    isTLSReady() {
        // Since we're a pooled connection that's already been through TLS handshake,
        // we should always be TLS ready if the socket is not destroyed
        return !this.socket.destroyed && this.isHealthy;
    }
    
    get destroyed() {
        return this.socket.destroyed;
    }
    
    get readyState() {
        return this.socket.readyState;
    }
    
    // Connection info
    getConnectionInfo() {
        return {
            host: this.host,
            port: this.port,
            lastUsed: this.lastUsed,
            inUse: this.inUse,
            isHealthy: this.isHealthy,
            isAlive: this.isAlive()
        };
    }
}

export { PooledTLSConnection };