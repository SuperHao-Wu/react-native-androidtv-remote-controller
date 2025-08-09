import { PairingMessageManager } from './PairingMessageManager.js';
import forge from 'node-forge';
import { Buffer } from 'buffer';
import EventEmitter from 'events';
import TcpSockets from '../tcp-socket/src/index.js';
import { get_modulus_exponent } from './pairing_utils.js';
import { GlobalTLSManager } from '../network/index.js';

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
		// Connection pooling infrastructure
		this.tlsManager = GlobalTLSManager.getInstance();
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
				console.error(`${this.host} Pairing connection timeout after 15 seconds`);
				this.connectionState = 'disconnected';
				if (this.client) {
					this.tlsManager.releaseConnection(this.client);
					this.client.destroy(new Error('Connection timeout'));
				}
				reject(new Error('Connection timeout'));
			}, 15000); // 15 second timeout

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
				// Use connection pool instead of direct TLS connection
				console.log(`🎯 PairingManager: [${this.instanceId}] ${this.host} 🔄 PairingManager: Requesting connection from pool - START`);
				this.client = await this.tlsManager.getConnection(this.host, this.port, options);
				console.log(`🎯 PairingManager: [${this.instanceId}] ${this.host} 🔄 PairingManager: Requesting connection from pool - COMPLETED`);
				
				console.log(`${this.host} 🔐 TLS connection obtained from pool`);
				this.connectionState = 'connected';
				
				this.isCancelled = false;
				this.client.pairingManager = this;

				// Log comprehensive TLS connection details for Sony TV debugging
				try {
					const clientCert = await this.client.getCertificate();
					const serverCert = await this.client.getPeerCertificate();
					
					console.log(`${this.host} 📜 TLS Handshake Certificate Analysis:`, {
						clientCertPresent: !!clientCert,
						serverCertPresent: !!serverCert,
						clientSubject: clientCert?.subject,
						clientIssuer: clientCert?.issuer,
						clientFingerprint: clientCert?.fingerprint,
						clientValidFrom: clientCert?.validFrom,
						clientValidTo: clientCert?.validTo,
						serverSubject: serverCert?.subject,
						serverIssuer: serverCert?.issuer,
						serverFingerprint: serverCert?.fingerprint
					});

					// Specifically check if client certificate has the right properties for Android TV
					if (clientCert) {
						console.log(`${this.host} 🔍 Client Certificate Validation:`, {
							hasSubject: !!clientCert.subject,
							hasPublicKey: !!clientCert.pubkey,
							keyAlgorithm: clientCert.keyAlgorithm || 'Unknown',
							signatureAlgorithm: clientCert.signatureAlgorithm || 'Unknown',
							version: clientCert.version || 'Unknown',
							serialNumber: clientCert.serialNumber || 'Unknown'
						});
					} else {
						console.error(`${this.host} ❌ CRITICAL: No client certificate retrieved - this explains 'SSL_NULL_WITH_NULL_NULL' error on Sony TV`);
					}

				} catch (certError) {
					console.error(`${this.host} ❌ TLS Certificate retrieval failed:`, {
						error: certError.message,
						code: certError.code,
						stack: certError.stack?.split('\n').slice(0, 3).join('\n')
					});
				}

				// Add delay before sending pairing request to avoid race condition
				console.log(`${this.host} Waiting 300ms before sending pairing request...`);
				await this.sleep(300);

				// Check if connection is still valid and not cancelled
				if (this.isCancelled || this.connectionState !== 'connected') {
					console.log(`${this.host} Connection cancelled or invalid, aborting pairing request`);
					return;
				}

				// Set up event handlers for the pooled connection BEFORE sending data
				this.client.on('data', data => {
					debugger;
					let buffer = Buffer.from(data);
					this.chunks = Buffer.concat([this.chunks, buffer]);

					if (this.chunks.length > 0 && this.chunks.readInt8(0) === this.chunks.length - 1) {
						let message = this.pairingMessageManager.parse(this.chunks);

						console.log('Receive : ' + Array.from(this.chunks));
						console.log('Receive : ' + JSON.stringify(message.toJSON()));

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
								// CRITICAL: Release connection now that pairing is complete
								// This prevents race condition with connection pool cleanup
								console.log(`${this.host} 🔓 Releasing connection after successful pairing`);
								this.tlsManager.releaseConnection(this.client);
								this.emit('secret');
							} else if (message.pairingSecretAck) {
								console.log(this.host + ' Paired!');
								this.connectionState = 'paired';
								// Clear timeout since we're successfully paired
								if (this.connectionTimeout) {
									clearTimeout(this.connectionTimeout);
									this.connectionTimeout = null;
								}
								// Release connection back to pool before destroying
								this.tlsManager.releaseConnection(this.client);
								this.client.destroy();
							} else {
								console.log(this.host + ' What Else ?');
							}
						}
						this.chunks = Buffer.from([]);
					}
				});

				this.client.on('close', hasError => {
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
						console.log(`${this.host} 🔓 Releasing connection on close (pairing incomplete)`);
						this.tlsManager.releaseConnection(this.client);
					} else {
						console.log(`${this.host} ✅ Connection already released after successful pairing`);
					}

					if (hasError) {
						console.log(`${this.host} ❌ PairingManager.close() failure - connection had errors`);
						reject(false);
					} else if (this.isCancelled) {
						console.log(`${this.host} 🚫 PairingManager.close() on cancelPairing()`);
						this.isCancelled = false;
						reject(false);
					} else if (this.connectionState === 'paired') {
						console.log(`${this.host} ✅ PairingManager.close() success - pairing completed`);
						resolve(true);
					} else {
						console.log(`${this.host} ❌ PairingManager.close() failure - connection closed before pairing completed (state: ${this.connectionState})`);
						reject(false);
					}
				});

				this.client.on('error', error => {
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
					
					// Release connection back to pool on error
					this.tlsManager.releaseConnection(this.client);
				});

				// Now send the pairing request after all event handlers are set up
				console.log(`${this.host} Sending pairing request`);
				this.client.write(this.pairingMessageManager.createPairingRequest(this.service_name));

			} catch (error) {
				console.error(`${this.host} Failed to obtain TLS connection from pool:`, error);
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
				// Release connection back to pool first
				this.tlsManager.releaseConnection(this.client);
				
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
