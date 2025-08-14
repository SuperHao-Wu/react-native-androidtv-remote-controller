import { CertificateGenerator } from "./certificate/CertificateGenerator.js"
import { PairingManager } from "./pairing/PairingManager.js"
import { RemoteManager } from "./remote/RemoteManager.js";
import { RemoteMessageManager } from "./remote/RemoteMessageManager.js";
import { GlobalTLSManager } from "./network/index.js";
import { TokenManager } from "./auth/TokenManager.js";
import { SecureStorage } from "./storage/SecureStorage.js";
import EventEmitter from "events";

export class AndroidRemote extends EventEmitter {
    constructor(host, options) {
        console.log('AndroidRemote.constructor');
        console.log('🚨🚨🚨 DEPLOYMENT TEST: NEW CODE IS DEPLOYED - VERSION 2.0 🚨🚨🚨');
        super();
        this.host = host
        this.cert = {
            key: options.cert?.key,
            cert: options.cert?.cert,
            androidKeyStore: options.cert?.androidKeyStore ? options.cert?.androidKeyStore : '',
            certAlias: options.cert?.certAlias ? options.cert?.certAlias : '',
            keyAlias: options.cert?.keyAlias ? options.cert?.keyAlias : '',
        };
        this.pairing_port = options.pairing_port ? options.pairing_port : 6467;
        this.remote_port = options.remote_port ? options.remote_port : 6466;
        this.service_name = options.service_name ? options.service_name : "Service Name";
        this.systeminfo = options.systeminfo ? options.systeminfo : {
            manufacturer: "default manufacturer",
            model: "default model"
        };
        this.remoteManager = null;
        this.pairingManager = null;
        
        // Initialize global TLS manager for connection pooling
        this.tlsManager = GlobalTLSManager.getInstance();
        this.tlsManager.initialize();
        console.log('AndroidRemote.constructor: TLS connection pooling initialized');
    }

    async start() {

        if (this.remoteManager) {
            console.log('AndroidRemote.start() has already been started...');
            return;
        }

        console.log('AndroidRemote.start()');
        
        // PHASE 4: Check for existing authentication token
        console.log('🔍 AndroidRemote: Checking for existing authentication token...');
        
        try {
            // Try to load existing token from secure storage
            console.log('✅ AndroidRemote: trying to load existing token from host:', this.host);
            const existingToken = await SecureStorage.loadAuthToken(this.host);
            
            if (existingToken) {
                console.log('✅ AndroidRemote: Found existing authentication token, skipping pairing');
                console.log(`🔑 AndroidRemote: Token: ${existingToken.toString('hex').toUpperCase()}`);
                
                // Generate fresh certificate for this session (no persistence needed)
                this.cert = CertificateGenerator.generateFull(this.service_name);
                
                // Store token in memory for RemoteManager
                TokenManager.saveToken(this.host, existingToken);
                
                // Skip pairing - go directly to RemoteManager
                return await this.startRemoteManager();
            } else {
                console.log('⚠️  AndroidRemote: No existing token found, starting pairing process');
            }
        } catch (error) {
            console.error('❌ AndroidRemote: Error checking existing token:', error);
            console.log('🔄 AndroidRemote: Falling back to pairing process');
        }
        
        // No existing credentials - proceed with pairing
        if (!this.cert || !this.cert.key || !this.cert.cert) {

            this.cert = CertificateGenerator.generateFull(this.service_name);

            console.log('Before creating PairingManager');
            // Clean up any existing pairing manager
            if (this.pairingManager) {
                this.pairingManager.removeAllListeners();
                this.pairingManager = null;
            }
            this.pairingManager = new PairingManager(
                this.host,
                this.pairing_port,
                this.cert,
                this.service_name,
                this.systeminfo);

            this.pairingManager.on('secret', () => this.emit('secret'));

            let paired = await this.pairingManager.start();
            if (!paired) {
                return;
            }
            
            // Save credentials after successful pairing
            await this.saveCredentialsAfterPairing();
        }

        return await this.startRemoteManager();
    }
    
    /**
     * Start RemoteManager with existing credentials
     */
    async startRemoteManager() {
        console.log('🚀 AndroidRemote: Starting RemoteManager...');
        
        this.remoteManager = new RemoteManager(this.host, this.remote_port, this.cert, this.systeminfo);

        this.remoteManager.on('powered', (powered) => this.emit('powered', powered));

        this.remoteManager.on('volume', (volume) => this.emit('volume', volume));

        this.remoteManager.on('current_app', (current_app) => this.emit('current_app', current_app));

        this.remoteManager.on('ready', () => this.emit('ready'));

        this.remoteManager.on('unpaired', () => {
            console.log('📱 AndroidRemote: Unpaired event - may need to clear stored credentials');
            this.emit('unpaired');
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        let started = await this.remoteManager.start().catch((error) => {
            console.error(error);
        });

        return started;
    }
    
    /**
     * Save authentication token after successful pairing
     */
    async saveCredentialsAfterPairing() {
        try {
            console.log('💾 AndroidRemote: Saving authentication token after successful pairing...');
            
            // Get authentication token from TokenManager (stored by PairingManager)
            const authToken = TokenManager.getToken(this.host);
            if (!authToken) {
                console.error('❌ AndroidRemote: No authentication token found after pairing');
                return;
            }
            
            // Save only the authentication token (certificates are generated fresh each session)
            await SecureStorage.saveAuthToken(this.host, authToken);
            
            console.log('✅ AndroidRemote: Authentication token saved successfully');
            console.log(`🔐 AndroidRemote: Token (${authToken.length} bytes) stored for ${this.host}`);
            
        } catch (error) {
            console.error('❌ AndroidRemote: Failed to save authentication token after pairing:', error);
            // Don't throw - pairing was successful, storage failure is not critical
        }
    }

    sendPairingCode(code) {
        return this.pairingManager?.sendCode(code);
    }

    cancelPairing() {
        return this.pairingManager?.cancelPairing();
    }

    sendPower() {
        return this.remoteManager?.sendPower();
    }

    sendAppLink(app_link) {
        return this.remoteManager?.sendAppLink(app_link);
    }

    sendKey(key, direction) {
        return this.remoteManager?.sendKey(key, direction);
    }

    getCertificate() {
        return {
            key: this.cert.key,
            cert: this.cert.cert,
        }
    }
    
    /**
     * Clear stored authentication token (for testing or re-pairing)
     */
    async clearStoredCredentials() {
        try {
            console.log('🗑️ AndroidRemote: Clearing stored authentication token...');
            
            // Remove only the authentication token (certificates are not persisted)
            await SecureStorage.removeAuthToken(this.host);
            TokenManager.removeToken(this.host);
            
            console.log('✅ AndroidRemote: Stored authentication token cleared');
        } catch (error) {
            console.error('❌ AndroidRemote: Failed to clear authentication token:', error);
        }
    }

    stop() {
        console.log('AndroidRemote.stop(): Cleaning up all resources');
        
        // Remove event listeners from remoteManager
        if (this.remoteManager) {
            this.remoteManager.removeAllListeners();  // Use removeAllListeners() instead of individual removes
            this.remoteManager.stop();
            this.remoteManager = null;
        }

        // Remove event listeners from pairingManager
        if (this.pairingManager) {
            this.pairingManager.removeAllListeners();
            this.pairingManager.stop(); // ← Critical: Close TCP socket before nulling
            this.pairingManager = null;
        }
        
        // Clean up TLS manager connections for this host
        if (this.tlsManager) {
            this.tlsManager.cleanupHost(this.host, this.pairing_port);
            this.tlsManager.cleanupHost(this.host, this.remote_port);
        }
        
        console.log('AndroidRemote.stop(): Cleanup completed');
    }
}


const remoteMessageManager = new RemoteMessageManager();
let RemoteKeyCode = remoteMessageManager.RemoteKeyCode;
let RemoteDirection = remoteMessageManager.RemoteDirection;
export {
    RemoteKeyCode,
    RemoteDirection,
}
export default {
    AndroidRemote,
    CertificateGenerator,
    RemoteKeyCode,
    RemoteDirection,
}