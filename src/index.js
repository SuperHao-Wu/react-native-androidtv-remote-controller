import { CertificateGenerator } from "./certificate/CertificateGenerator.js"
import { PairingManager } from "./pairing/PairingManager.js"
import { RemoteManager } from "./remote/RemoteManager.js";
import { RemoteMessageManager } from "./remote/RemoteMessageManager.js";
import { GlobalTLSManager } from "./network/index.js";
import { CertificateManager } from "./auth/CertificateManager.js";
import { SecureStorage } from "./storage/SecureStorage.js";
import EventEmitter from "events";

export { SecureStorage };

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
        
        // PHASE 5: Smart Connect Button with Intelligent Port Routing
        console.log('🔍 AndroidRemote: Starting smart connection routing...');
        
        // Check for existing client certificate
        const existingCertData = await SecureStorage.loadCertificate(this.host);
        
        const isValid = CertificateManager.isValidCertificateData(existingCertData);
        console.log('🔍 AndroidRemote: Certificate validation result:', isValid);
        
        if (existingCertData && isValid) {
            try {
                // Certificate exists - try port 6466 (remote) first
                this.emit('trying-remote');
                console.log('✅ AndroidRemote: Found existing certificate - attempting remote connection (port 6466)');
                console.log(`🔑 AndroidRemote: Certificate: ${existingCertData.certificate.substring(0, 100)}...`);
                
                return await this.attemptRemoteConnection(existingCertData);
                
            } catch (error) {
                // Certificate invalid - clear and fall back to pairing
                console.error('❌ AndroidRemote: Remote connection failed - certificate may be invalid:', error.message);
                this.emit('falling-back-to-pairing');
                await this.clearStoredCredentials();
                return await this.startPairingFlow();
            }
        } else {
            // No certificate - start fresh pairing
            console.log('⚠️  AndroidRemote: No existing certificate found - starting pairing flow (port 6467)');
            return await this.startPairingFlow();
        }
    }
    
    /**
     * Attempt remote connection using stored certificate (port 6466)
     */
    async attemptRemoteConnection(existingCertData) {
        console.log('🚀 AndroidRemote: Attempting remote connection with stored certificate...');
        
        // Use stored certificate
        this.cert = {
            key: existingCertData.privateKey,
            cert: existingCertData.certificate,
            androidKeyStore: this.cert.androidKeyStore,
            certAlias: this.cert.certAlias,
            keyAlias: this.cert.keyAlias,
        };
        
        // Store certificate in memory for RemoteManager  
        CertificateManager.saveCertificate(this.host, existingCertData.certificate, existingCertData.privateKey);
        
        // Start RemoteManager directly with stored certificate
        return await this.startRemoteManager();
    }
    
    /**
     * Start fresh pairing flow (port 6467)
     */
    async startPairingFlow() {
        console.log('🔗 AndroidRemote: Starting fresh pairing flow...');
        
        // Generate fresh certificate for pairing
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
     * Save client certificate after successful pairing
     */
    async saveCredentialsAfterPairing() {
        try {
            console.log('💾 AndroidRemote: Saving client certificate after successful pairing...');
            
            // Save the client certificate and private key used for pairing
            if (!this.cert || !this.cert.cert || !this.cert.key) {
                console.error('❌ AndroidRemote: No client certificate found after pairing');
                return;
            }
            
            // Save the certificate and private key for future connections
            await SecureStorage.saveCertificate(this.host, this.cert.cert, this.cert.key);
            
            // Also store in memory for immediate use
            CertificateManager.saveCertificate(this.host, this.cert.cert, this.cert.key);
            
            console.log('✅ AndroidRemote: Client certificate saved successfully');
            console.log(`🔐 AndroidRemote: Certificate (${this.cert.cert.length} + ${this.cert.key.length} chars) stored for ${this.host}`);
            
        } catch (error) {
            console.error('❌ AndroidRemote: Failed to save client certificate after pairing:', error);
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
     * Clear stored client certificate (for testing or re-pairing)
     */
    async clearStoredCredentials() {
        try {
            console.log('🗑️ AndroidRemote: Clearing stored client certificate...');
            
            // Remove the stored certificate and private key
            await SecureStorage.removeCertificate(this.host);
            CertificateManager.clearCertificate(this.host);
            
            console.log('✅ AndroidRemote: Stored client certificate cleared');
        } catch (error) {
            console.error('❌ AndroidRemote: Failed to clear client certificate:', error);
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
    SecureStorage,
}