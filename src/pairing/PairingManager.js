import { PairingMessageManager } from './PairingMessageManager.js';
import forge from 'node-forge';
import { Buffer } from 'buffer';
import EventEmitter from 'events';
import TcpSockets from 'react-native-tcp-socket';
import { get_modulus_exponent } from './pairing_utils.js';
import { GlobalTLSManager, TLSRequestQueue } from '../network/index.js';

//import RNFS from 'react-native-fs';

class PairingManager extends EventEmitter {
	constructor(host, port, certs, service_name, systeminfo) {
		super();
		this.instanceId = Math.random().toString(36).substr(2, 8);
		this.host = host;
		this.port = port;
		console.log(`🎯 PairingManager: [${this.instanceId}] Created instance for ${host}:${port}`);
		this.chunks = Buffer.from([]);
		this.certs = certs;
		this.service_name = service_name;
		this.pairingMessageManager = new PairingMessageManager(systeminfo);
		this.isCancelled = false;
		// Connection state tracking
		this.connectionState = 'disconnected'; // disconnected, connecting, connected, paired
		this.connectionTimeout = null;
		this.pairingSucceeded = false; // Track pairing success to prevent race condition
		// Connection pooling infrastructure
		this.tlsManager = GlobalTLSManager.getInstance();
		this.tlsRequestQueue = new TLSRequestQueue();
	}

	/*
    async logCertificates(clientCert, serverCert) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logDir = `${RNFS.DocumentDirectoryPath}/logs`;
        const logFile = `${logDir}/certificates-${timestamp}.log`;
      
        try {
          // Create logs directory if it doesn't exist
          await RNFS.mkdir(logDir, { NSURLIsExcludedFromBackupKey: true });
      
          const logContent = `
      === Certificate Log Generated at ${new Date().toISOString()} ===
      Client Certificate:
      ${JSON.stringify(clientCert, null, 2)}
      Server Certificate:
      ${JSON.stringify(serverCert, null, 2)}
      `;
      
          await RNFS.writeFile(logFile, logContent, 'utf8');
          console.log(`Certificates logged to: ${logFile}`);
      
          // Log the full path for debugging
          console.log('Document Directory:', RNFS.DocumentDirectoryPath);
        } catch (error) {
          console.error('Error writing certificate logs:', error);
        }
      }*/

	async sendCode(pin) {
		console.log('Sending code : ', pin);

		// let client_certificate = await this.client.getCertificate();
		// let server_certificate = await this.client.getPeerCertificate();
		let client_cert = await this.client.getCertificate();
		let server_cert = await this.client.getPeerCertificate();
		//await this.logCertificates(client_certificate, server_certificate);
		let client_certificate = get_modulus_exponent(client_cert);
		let server_certificate = get_modulus_exponent(server_cert);
		let sha256 = forge.md.sha256.create();

		sha256.update(forge.util.hexToBytes(client_certificate.modulus), 'raw');
		sha256.update(forge.util.hexToBytes(client_certificate.exponent), 'raw');
		sha256.update(forge.util.hexToBytes(server_certificate.modulus), 'raw');
		sha256.update(forge.util.hexToBytes(server_certificate.exponent), 'raw');
		sha256.update(forge.util.hexToBytes(pin.slice(2)), 'raw');

		let hash = sha256.digest().getBytes();
		let hash_array = Array.from(hash, c => c.charCodeAt(0) & 0xff);
		let check = hash_array[0];
		console.log('PIN first byte (decimal):', parseInt(pin.slice(0, 2), 16));
		console.log('Hash first byte (decimal):', check);
		if (check !== parseInt(pin.slice(0, 2), 16)) {
			console.error('Code validation failed');
			this.client.destroy(new Error('Bad Code'));
			return false;
		} else {
			console.log('Code validated, sending pairing secret');
			this.client.write(this.pairingMessageManager.createPairingSecret(hash_array));
			return true;
		}
	}

	cancelPairing() {
		this.isCancelled = true;
		this.connectionState = 'disconnected';
		// Clear any pending timeouts
		if (this.connectionTimeout) {
			clearTimeout(this.connectionTimeout);
			this.connectionTimeout = null;
		}
		this.client.destroy(new Error('Pairing canceled'));
		return false;
	}

	// Phase 1: Add utility method for delays
	sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	async start() {
		console.log(`🎯 PairingManager: [${this.instanceId}] Starting pairing process for ${this.host}:${this.port}`);
		debugger
		return new Promise(async (resolve, reject) => {
			// Add connection timeout protection
			this.connectionTimeout = setTimeout(() => {
				console.error(`${this.host} Pairing connection timeout after 30 seconds`);
				this.connectionState = 'disconnected';
				if (this.client) {
					// Direct connection - no pool cleanup needed
					this.client.destroy(new Error('Connection timeout'));
				}
				reject(new Error('Connection timeout'));
			}, 30000); // 30 second timeout (extended for automated PIN entry)

			let options = {
				port: this.port,
				host: this.host,
				key: this.certs.key,
				cert: this.certs.cert,
				rejectUnauthorized: false, // if true => use ca
				// Specific to react-native-tcp-socket (patched)
				androidKeyStore: this.certs.androidKeyStore,
				certAlias: this.certs.certAlias,
				keyAlias: this.certs.keyAlias,
			};

			console.log(`🎯 PairingManager: [${this.instanceId}] ${this.host} PairingManager.start(): initiating connection using connection pool`);
			this.connectionState = 'connecting';

			console.log(`${this.host} 🔧 Creating TLS connection through connection pool with options:`, {
				host: options.host,
				port: options.port,
				hasKey: !!options.key,
				hasCert: !!options.cert,
				keyLength: options.key ? options.key.length : 0,
				certLength: options.cert ? options.cert.length : 0,
				keyType: options.key ? (options.key.includes('BEGIN PRIVATE KEY') ? 'PEM' : 'Unknown') : 'None',
				certType: options.cert ? (options.cert.includes('BEGIN CERTIFICATE') ? 'PEM' : 'Unknown') : 'None',
				androidKeyStore: options.androidKeyStore,
				certAlias: options.certAlias,
				keyAlias: options.keyAlias
			});

			// Log certificate details for debugging TLS issues
			console.log(`${this.host} 🔑 Client Certificate Details:`, {
				keyPreview: options.key ? options.key.substring(0, 100) + '...' : 'None',
				certPreview: options.cert ? options.cert.substring(0, 100) + '...' : 'None'
			});

			try {
				// 🔧 FIX: Use TLSRequestQueue with retry logic instead of direct connection
				console.log(`🎯 PairingManager: [${this.instanceId}] ${this.host} 🔄 PairingManager: Using TLSRequestQueue with retry logic`);
				const pooledConnection = await this.tlsRequestQueue.createConnectionWithRetry(this.host, this.port, options);
				
				// Extract the underlying TLS socket from the pooled connection
				this.client = pooledConnection.socket;
				console.log(`🎯 PairingManager: [${this.instanceId}] ${this.host} � TLS connection established via TLSRequestQueue`);
				
				console.log(`🔧 PairingManager: [${this.instanceId}] CRITICAL MOMENT: About to set connectionState to 'connected' and proceed with pairing`);
				console.log(`🔧 PairingManager: [${this.instanceId}] Current state before setting connected: ${this.connectionState}`);
				console.log(`🔧 PairingManager: [${this.instanceId}] Client socket status: destroyed=${this.client.destroyed}`);
				
				this.connectionState = 'connected';
				
				this.isCancelled = false;
				this.client.pairingManager = this;
				
				console.log(`🔧 PairingManager: [${this.instanceId}] State now set to 'connected', proceeding with certificate analysis`);;

				// CRITICAL FIX: Certificate analysis calls were causing TLS encrypted alerts
				// These getCertificate/getPeerCertificate calls triggered connection termination
				// Skip certificate analysis to prevent connection closure
				console.log(`${this.host} 🔐 TLS handshake completed successfully - skipping certificate analysis to prevent encrypted alerts`);

				// CRITICAL DEBUG: Remove delay to test if it's causing encrypted alerts
				// The encrypted alert happens during this 300ms delay, not during certificate analysis
				console.log(`🔧 PairingManager: [${this.instanceId}] SKIPPING DELAY to test encrypted alert cause`);
				console.log(`${this.host} Proceeding immediately to pairing request (no 300ms delay)`);
				// await this.sleep(300); // DISABLED TO TEST

				// Check if connection is still valid and not cancelled  
				console.log(`🔧 PairingManager: [${this.instanceId}] NO DELAY - checking connection state immediately`);
				console.log(`🔧 PairingManager: [${this.instanceId}] isCancelled: ${this.isCancelled}, connectionState: ${this.connectionState}`);
				console.log(`🔧 PairingManager: [${this.instanceId}] Client socket destroyed: ${this.client.destroyed}`);
				
				if (this.isCancelled || this.connectionState !== 'connected') {
					console.log(`🔧 PairingManager: [${this.instanceId}] ABORTING: Connection cancelled or invalid, aborting pairing request`);
					console.log(`${this.host} Connection cancelled or invalid, aborting pairing request`);
					return;
				}
				
				console.log(`🔧 PairingManager: [${this.instanceId}] CONNECTION VALID - proceeding immediately to event handlers`);

				// Set up event handlers for the pooled connection BEFORE sending data
				console.log(`🔧 PairingManager: [${this.instanceId}] Setting up event handlers for pooled connection`);
				
				this.client.on('data', data => {
					console.log(`🔧 PairingManager: [${this.instanceId}] DATA EVENT: Received ${data.length} bytes from ${this.host}:${this.port}`);
					debugger;
					let buffer = Buffer.from(data);
					this.chunks = Buffer.concat([this.chunks, buffer]);

					if (this.chunks.length > 0 && this.chunks.readInt8(0) === this.chunks.length - 1) {
						let message = this.pairingMessageManager.parse(this.chunks);

						console.log(`🔧 PairingManager: [${this.instanceId}] Parsed message from ${this.host}: ` + Array.from(this.chunks));
						console.log(`🔧 PairingManager: [${this.instanceId}] Message content: ` + JSON.stringify(message.toJSON()));

						if (message.status !== this.pairingMessageManager.Status.STATUS_OK) {
							this.client.destroy(new Error(message.status));
						} else {
							// Add delays between pairing protocol steps
							if (message.pairingRequestAck) {
								console.log(
									`${this.host} Received pairingRequestAck, waiting 200ms before sending pairingOption`,
								);
								setTimeout(() => {
									if (!this.isCancelled && this.connectionState === 'connected') {
										this.client.write(this.pairingMessageManager.createPairingOption());
									}
								}, 200);
							} else if (message.pairingOption) {
								console.log(
									`${this.host} Received pairingOption, waiting 200ms before sending pairingConfiguration`,
								);
								setTimeout(() => {
									if (!this.isCancelled && this.connectionState === 'connected') {
										this.client.write(this.pairingMessageManager.createPairingConfiguration());
									}
								}, 200);
							} else if (message.pairingConfigurationAck) {
								console.log(`${this.host} Received pairingConfigurationAck, emitting secret event`);
								this.connectionState = 'paired';
								// Direct connection - no pool cleanup needed
								console.log(`${this.host} 🔓 Direct connection - no pool cleanup needed`);
								this.emit('secret');
							} else if (message.pairingSecretAck) {
								console.log(this.host + ' Paired!');
								
								// Pairing successful - certificate trust established
								console.log(`✅ PairingManager: Pairing completed successfully for ${this.host}`);
								console.log(`🔐 PairingManager: Client certificate is now trusted by TV`);
								
								this.connectionState = 'paired';
								this.pairingSucceeded = true; // Mark pairing as successful before destroying connection
								// Clear timeout since we're successfully paired
								if (this.connectionTimeout) {
									clearTimeout(this.connectionTimeout);
									this.connectionTimeout = null;
								}
								// Direct connection - no pool cleanup needed
								this.client.destroy();
							} else {
								console.log(this.host + ' What Else ?');
							}
						}
						this.chunks = Buffer.from([]);
					}
				});

				this.client.on('close', hasError => {
					console.log(`🔧 PairingManager: [${this.instanceId}] CLOSE EVENT START - hasError: ${hasError}, connectionState: ${this.connectionState}`);
					console.log(`🔧 PairingManager: [${this.instanceId}] Close event call stack:`);
					console.trace(`🔧 PairingManager: [${this.instanceId}] Close event trace`);
					debugger;
					
					console.log(`${this.host} 🚪 Socket close event - hasError: ${hasError}, connectionState: ${this.connectionState}`);
					
					// Check if pairing was completed before cleaning up state
					const wasAlreadyPaired = this.connectionState === 'paired';
					
					// Clean up connection state and timeout
					this.connectionState = 'disconnected';
					if (this.connectionTimeout) {
						clearTimeout(this.connectionTimeout);
						this.connectionTimeout = null;
					}
					
					// Only release connection if pairing was not completed
					// (If pairing completed, connection was already released at the right time)
					if (!wasAlreadyPaired) {
						console.log(`${this.host} 🔓 Direct connection closed (pairing incomplete) - no pool cleanup needed`);
					} else {
						console.log(`${this.host} ✅ Direct connection closed after successful pairing`);
					}

					if (hasError) {
						console.log(`${this.host} ❌ PairingManager.close() failure - connection had errors`);
						reject(false);
					} else if (this.isCancelled) {
						console.log(`${this.host} 🚫 PairingManager.close() on cancelPairing()`);
						this.isCancelled = false;
						reject(false);
					} else if (this.pairingSucceeded) {
						console.log(`${this.host} ✅ PairingManager.close() success - pairing completed successfully`);
						resolve(true);
					} else {
						console.log(`${this.host} ❌ PairingManager.close() failure - connection closed before pairing completed (success flag: ${this.pairingSucceeded})`);
						reject(false);
					}
				});

				this.client.on('error', error => {
					console.log(`🔧 PairingManager: [${this.instanceId}] ERROR EVENT START`);
					console.log(`🔧 PairingManager: [${this.instanceId}] Error event call stack:`);
					console.trace(`🔧 PairingManager: [${this.instanceId}] Error event trace`);
					
					console.error(`${this.host} 💥 PairingManager error:`, {
						code: error.code,
						message: error.message,
						errno: error.errno,
						syscall: error.syscall,
						connectionState: this.connectionState
					});
					
					// Update connection state on error
					this.connectionState = 'disconnected';
					if (this.connectionTimeout) {
						clearTimeout(this.connectionTimeout);
						this.connectionTimeout = null;
					}
					
					// Direct connection - no pool cleanup needed on error
				});
				
				console.log(`🔧 PairingManager: [${this.instanceId}] EVENT HANDLERS SETUP COMPLETED`);
				console.log(`🔧 PairingManager: [${this.instanceId}] Ready to send pairing request`);

				// Now send the pairing request after all event handlers are set up
				console.log(`${this.host} Sending pairing request`);
				console.log(`🔧 PairingManager: [${this.instanceId}] About to send pairing request to ${this.host}:${this.port}`);
				console.log(`🔧 PairingManager: [${this.instanceId}] Connection state: ${this.connectionState}`);
				console.log(`🔧 PairingManager: [${this.instanceId}] Client socket state: destroyed=${this.client.destroyed}, readyState=${this.client.readyState}`);
				console.log(`🔧 PairingManager: [${this.instanceId}] Service name: ${this.service_name}`);
				
				try {
					// Create and send proper Android TV pairing request
					console.log(`🔧 PairingManager: [${this.instanceId}] Creating pairing request for service: ${this.service_name}`);
					const pairingRequestBuffer = this.pairingMessageManager.createPairingRequest(this.service_name);
					console.log(`🔧 PairingManager: [${this.instanceId}] Pairing request created, size: ${pairingRequestBuffer.length} bytes`);
					
					// Wait 300ms after TLS handshake for stability (Phase 1 timing fix)
					await this.sleep(300);
					
					console.log(`🔧 PairingManager: [${this.instanceId}] Sending pairing request to ${this.host}:${this.port}`);
					const writeResult = this.client.write(pairingRequestBuffer);
					console.log(`🔧 PairingManager: [${this.instanceId}] Pairing request write result: ${writeResult}`);
					console.log(`🔧 PairingManager: [${this.instanceId}] Pairing request sent successfully`);
				} catch (error) {
					console.error(`🔧 PairingManager: [${this.instanceId}] ERROR sending simple test message:`, error);
					throw error;
				}

			} catch (error) {
				console.error(`${this.host} Failed to establish direct TLS connection:`, error);
				this.connectionState = 'disconnected';
				if (this.connectionTimeout) {
					clearTimeout(this.connectionTimeout);
					this.connectionTimeout = null;
				}
				reject(error);
			}
		});
	}

	stop() {
		console.log(`🔧 PairingManager: [${this.instanceId}] STOP() CALLED - tracing who called stop()`);
		console.trace(`🔧 PairingManager: [${this.instanceId}] Stop() call stack trace`);
		console.log(`${this.host} PairingManager.stop(): Cleaning up connection`);
		
		// Update connection state
		this.connectionState = 'disconnected';
		this.isCancelled = true;
		
		// Clear any pending timeouts
		if (this.connectionTimeout) {
			clearTimeout(this.connectionTimeout);
			this.connectionTimeout = null;
		}
		
		// Close and clean up pooled TLS client socket
		if (this.client) {
			try {
				// Direct connection - no pool cleanup needed
				
				// Remove all event listeners to prevent memory leaks
				this.client.removeAllListeners();
				
				// Destroy the socket connection
				this.client.destroy();
				this.client = null;
			} catch (error) {
				console.log(`${this.host} PairingManager.stop(): Error during cleanup:`, error);
			}
		}
		
		// Reset chunks buffer
		this.chunks = Buffer.from([]);
		
		console.log(`${this.host} PairingManager.stop(): Cleanup completed`);
	}

	hexStringToBytes(q) {
		let bytes = [];
		for (let i = 0; i < q.length; i += 2) {
			let byte = parseInt(q.substring(i, i + 2), 16);
			if (byte > 127) {
				byte = -(~byte & 0xff) - 1;
			}
			bytes.push(byte);
		}
		return bytes;
	}
}

export { PairingManager };
