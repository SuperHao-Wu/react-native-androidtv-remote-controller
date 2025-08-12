'use strict';

import { Image, NativeModules } from 'react-native';
const Sockets = NativeModules.TcpSockets;
import Socket from './Socket';

/**
 * @typedef {object} TLSSocketOptions
 * @property {any} [ca]
 * @property {any} [key]
 * @property {any} [cert]
 * @property {string} [androidKeyStore]
 * @property {string} [certAlias]
 * @property {string} [keyAlias]
 * @property {string[]} [resolvedKeys]
 *
 * @extends {Socket}
 */
export default class TLSSocket extends Socket {
    /**
     * @param {Socket} socket Any instance of `Socket`.
     * @param {TLSSocketOptions} [options] Options for the TLS socket.
     */
    constructor(socket, options = {}) {
        super();
        console.log(`🔧 TLSSocket.constructor: Creating TLS socket for underlying socket ${socket._id}`);
        
        // DIAGNOSTIC: Log initial state from underlying socket
        console.log(`🔍 DIAGNOSTIC: TLSSocket constructor - underlying socket ${socket._id} state:`);
        console.log(`🔍 DIAGNOSTIC: socket._pending: ${socket._pending}, socket._connecting: ${socket._connecting}`);
        console.log(`🔍 DIAGNOSTIC: socket._readyState: ${socket._readyState}, socket._destroyed: ${socket._destroyed}`);
        console.log(`🔍 DIAGNOSTIC: socket.pending: ${socket.pending}, socket.connecting: ${socket.connecting}`);
        
        /** @private */
        this._options = { ...options };
        TLSSocket.resolveAssetIfNeeded(this._options, 'ca');
        TLSSocket.resolveAssetIfNeeded(this._options, 'key');
        TLSSocket.resolveAssetIfNeeded(this._options, 'cert');

        /** @private */
        this._socket = socket;
        // @ts-ignore
        this._setId(this._socket._id);
        
        // DIAGNOSTIC: Log TLS socket state after _setId
        console.log(`🔍 DIAGNOSTIC: TLSSocket ${this._id} state after _setId:`);
        console.log(`🔍 DIAGNOSTIC: this._pending: ${this._pending}, this._connecting: ${this._connecting}`);
        console.log(`🔍 DIAGNOSTIC: this._readyState: ${this._readyState}, this._destroyed: ${this._destroyed}`);
        
        /** @private */
        this._tlsConnectCallback = null;
        this._tlsHandshakeComplete = false;
        this._tlsTimeout = null;
        
        console.log(`🔧 TLSSocket.constructor: TLS socket ${this._id} created, setting up TLS event handling`);
        this._setupTLSEventHandling();
        this._startTLS();
        this._startTLSTimeout();
        if (socket.pending || socket.connecting) {
            console.log(`🔧 TLSSocket.constructor: Socket ${this._id} is pending/connecting, waiting for connect event`);
            socket.once('connect', () => this._initialize());
        } else {
            console.log(`🔧 TLSSocket.constructor: Socket ${this._id} already connected, initializing immediately`);
            this._initialize();
        }
    }

    /**
     * @private
     */
    _setupTLSEventHandling() {
        console.log(`🔧 TLSSocket._setupTLSEventHandling: Setting up native TLS event listeners for socket ${this._id}`);
        
        // Listen for the REAL secureConnect event from native layer
        this._secureConnectListener = this._eventEmitter.addListener('secureConnect', (evt) => {
            if (evt.id !== this._id) return;
            console.log(`🔐 TLSSocket._setupTLSEventHandling: Native secureConnect event received for socket ${this._id}`);
            console.log(`🔐 TLSSocket._setupTLSEventHandling: TLS handshake completed successfully`);
            
            // DIAGNOSTIC: Log socket state before and after secureConnect
            console.log(`🔍 DIAGNOSTIC: Socket ${this._id} state BEFORE secureConnect processing:`);
            console.log(`🔍 DIAGNOSTIC: _pending: ${this._pending}, _connecting: ${this._connecting}, _destroyed: ${this._destroyed}`);
            console.log(`🔍 DIAGNOSTIC: _readyState: ${this._readyState}, _tlsHandshakeComplete: ${this._tlsHandshakeComplete}`);
            
            this._tlsHandshakeComplete = true;
            
            // 🔧 CRITICAL FIX: Call _setConnected to set _pending = false after TLS handshake
            console.log(`🔧 TLSSocket.secureConnect: Calling _setConnected to mark socket as ready for writes`);
            this._setConnected({
                localAddress: this._socket.localAddress,
                localPort: this._socket.localPort,
                remoteAddress: this._socket.remoteAddress,
                remotePort: this._socket.remotePort,
                remoteFamily: this._socket.remoteFamily,
            });
            
            // Clear timeout since handshake completed
            if (this._tlsTimeout) {
                clearTimeout(this._tlsTimeout);
                this._tlsTimeout = null;
                console.log(`🔐 TLSSocket._setupTLSEventHandling: Cleared TLS timeout for socket ${this._id}`);
            }
            
            // DIAGNOSTIC: Log socket state after processing
            console.log(`🔍 DIAGNOSTIC: Socket ${this._id} state AFTER secureConnect processing:`);
            console.log(`🔍 DIAGNOSTIC: _pending: ${this._pending}, _connecting: ${this._connecting}, _destroyed: ${this._destroyed}`);
            console.log(`🔍 DIAGNOSTIC: _readyState: ${this._readyState}, _tlsHandshakeComplete: ${this._tlsHandshakeComplete}`);
            
            // Fire the stored callback if it exists
            if (this._tlsConnectCallback) {
                console.log(`🔐 TLSSocket._setupTLSEventHandling: Calling stored TLS connect callback for socket ${this._id}`);
                this._tlsConnectCallback();
                this._tlsConnectCallback = null; // Clear after calling
            }
            
            // Also emit the event for any other listeners
            this.emit('secureConnect');
        });
    }

    /**
     * @private
     */
    _startTLSTimeout() {
        console.log(`🔧 TLSSocket._startTLSTimeout: Starting 10-second TLS handshake timeout for socket ${this._id}`);
        
        this._tlsTimeout = setTimeout(() => {
            if (this._tlsHandshakeComplete) return; // Already completed
            
            console.error(`❌ TLSSocket._startTLSTimeout: TLS handshake timeout after 10 seconds for socket ${this._id}`);
            console.error(`❌ TLSSocket._startTLSTimeout: Native socketDidSecure callback never fired`);
            
            // Fire callback with error if it exists
            if (this._tlsConnectCallback) {
                console.error(`❌ TLSSocket._startTLSTimeout: Calling stored callback with timeout error for socket ${this._id}`);
                const timeoutError = new Error('TLS handshake timeout - socketDidSecure callback never fired');
                timeoutError.code = 'TLS_HANDSHAKE_TIMEOUT'; // Add error code for retry logic
                this._tlsConnectCallback = null; // Clear callback
                this.emit('error', timeoutError);
            }
            
            this._tlsTimeout = null;
        }, 10000); // 10 second timeout
    }

    /**
     * @private
     */
    _initialize() {
        console.log(`🔧 TLSSocket._initialize: Initializing TLS socket ${this._id}`);
        
        // DIAGNOSTIC: Log socket state before _initialize
        console.log(`🔍 DIAGNOSTIC: Socket ${this._id} state BEFORE _initialize:`);
        console.log(`🔍 DIAGNOSTIC: _pending: ${this._pending}, _connecting: ${this._connecting}, _destroyed: ${this._destroyed}`);
        console.log(`🔍 DIAGNOSTIC: _readyState: ${this._readyState}, _tlsHandshakeComplete: ${this._tlsHandshakeComplete}`);
        
        // Avoid calling twice destroy() if an error occurs
        this._socket._errorListener?.remove();
        this.on('error', (error) => this._socket.emit('error', error));
        this._setConnected({
            // @ts-ignore
            localAddress: this._socket.localAddress,
            // @ts-ignore
            localPort: this._socket.localPort,
            // @ts-ignore
            remoteAddress: this._socket.remoteAddress,
            // @ts-ignore
            remotePort: this._socket.remotePort,
            // @ts-ignore
            remoteFamily: this._socket.remoteFamily,
        });
        
        // DIAGNOSTIC: Log socket state after _initialize
        console.log(`🔍 DIAGNOSTIC: Socket ${this._id} state AFTER _initialize:`);
        console.log(`🔍 DIAGNOSTIC: _pending: ${this._pending}, _connecting: ${this._connecting}, _destroyed: ${this._destroyed}`);
        console.log(`🔍 DIAGNOSTIC: _readyState: ${this._readyState}, _tlsHandshakeComplete: ${this._tlsHandshakeComplete}`);
    }

    /**
     * @private
     */
    _startTLS() {
        console.log(`🔧 TLSSocket._startTLS: Starting TLS for socket ${this._id} with options:`, this._options);
        Sockets.startTLS(this._id, this._options);
        console.log(`🔧 TLSSocket._startTLS: Called native startTLS for socket ${this._id}`);
    }

    /**
     * Checks if a certificate identity exists in the keychain
     * @param {object} options Object containing the identity aliases
     * @param {string} [options.androidKeyStore] The android keystore type
     * @param {string} [options.certAlias] The certificate alias
     * @param {string} [options.keyAlias] The key alias
     * @returns {Promise<boolean>} Promise resolving to true if identity exists
     */
    static hasIdentity(options = {}) {
        return Sockets.hasIdentity({
            androidKeyStore: options.androidKeyStore,
            certAlias: options.certAlias,
            keyAlias: options.keyAlias,
        });
    }

    getCertificate() {
        return Sockets.getCertificate(this._id);
    }

    getPeerCertificate() {
        return Sockets.getPeerCertificate(this._id);
    }

    /**
     * Check if TLS connection is actually ready and secure
     * @returns {Promise<boolean>} Promise resolving to true if TLS is ready
     */
    isTLSReady() {
        return Sockets.isTLSReady(this._id);
    }

    /**
     * @private
     * Resolves the asset source if necessary and registers the resolved key.
     * @param {TLSSocketOptions} options The options object containing the source to be resolved.
     * @param {'ca' | 'key' | 'cert'} key The key name being resolved.
     */
    static resolveAssetIfNeeded(options, key) {
        const source = options[key];
        if (source && typeof source !== 'string') {
            if (!options.resolvedKeys) {
                options.resolvedKeys = [];
            }
            options.resolvedKeys.push(key);
            options[key] = Image.resolveAssetSource(source).uri;
        }
    }
    
    /**
     * Override destroy to properly clear TLS timeout
     * @param {Error} [error] Optional error for destroy event  
     */
    destroy(error) {
        console.log(`🔧 TLSSocket.destroy: Destroying TLS socket ${this._id} and clearing timeouts`);
        
        // Clear TLS timeout if it exists
        if (this._tlsTimeout) {
            clearTimeout(this._tlsTimeout);
            this._tlsTimeout = null;
            console.log(`🔧 TLSSocket.destroy: Cleared TLS timeout for socket ${this._id}`);
        }
        
        // Clear callback to prevent it from firing after destroy
        if (this._tlsConnectCallback) {
            console.log(`🔧 TLSSocket.destroy: Clearing TLS connect callback for socket ${this._id}`);
            this._tlsConnectCallback = null;
        }
        
        // Call parent destroy method
        return super.destroy(error);
    }
}
