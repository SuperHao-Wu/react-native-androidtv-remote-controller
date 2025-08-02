import { PairingMessageManager } from './PairingMessageManager.js';
import forge from 'node-forge';
import { Buffer } from 'buffer';
import EventEmitter from 'events';
import TcpSockets from 'react-native-tcp-socket';
import { get_modulus_exponent } from './pairing_utils.js';

//import RNFS from 'react-native-fs';

class PairingManager extends EventEmitter {
	constructor(host, port, certs, service_name, systeminfo) {
		super();
		this.host = host;
		this.port = port;
		this.chunks = Buffer.from([]);
		this.certs = certs;
		this.service_name = service_name;
		this.pairingMessageManager = new PairingMessageManager(systeminfo);
		this.isCancelled = false;
		// Phase 1: Add connection state tracking
		this.connectionState = 'disconnected'; // disconnected, connecting, connected, paired
		this.connectionTimeout = null;
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
          console.debug(`Certificates logged to: ${logFile}`);
      
          // Log the full path for debugging
          console.debug('Document Directory:', RNFS.DocumentDirectoryPath);
        } catch (error) {
          console.error('Error writing certificate logs:', error);
        }
      }*/

	async sendCode(pin) {
		console.debug('Sending code : ', pin);

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
			console.debug('Code validated, sending pairing secret');
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
		return new Promise((resolve, reject) => {
			// Phase 1: Add connection timeout protection
			this.connectionTimeout = setTimeout(() => {
				console.error(`${this.host} Pairing connection timeout after 15 seconds`);
				this.connectionState = 'disconnected';
				if (this.client) {
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

			console.debug(`${this.host} PairingManager.start(): initiating connection`);
			this.connectionState = 'connecting';

			console.debug(`${this.host} 🔧 Creating TLS connection with options:`, {
				host: options.host,
				port: options.port,
				hasKey: !!options.key,
				hasCert: !!options.cert,
				androidKeyStore: options.androidKeyStore,
				certAlias: options.certAlias,
				keyAlias: options.keyAlias
			});

			debugger;
			this.client = TcpSockets.connectTLS(options, () => {
				debugger;
				console.debug(`${this.host} 🔌 TCP connection established (waiting for TLS handshake)`);
				// Don't change state here - wait for secureConnect
			});

			this.isCancelled = false;
			this.client.pairingManager = this;

			this.client.on('secureConnect', async () => {
				debugger;
				console.debug(`${this.host} 🔐 TLS handshake completed successfully`);
				this.connectionState = 'connected';
				
				// Log TLS connection details
				try {
					const clientCert = await this.client.getCertificate();
					const serverCert = await this.client.getPeerCertificate();
					console.debug(`${this.host} 📜 TLS certificates exchanged:`, {
						clientCertValid: !!clientCert,
						serverCertValid: !!serverCert,
						clientSubject: clientCert?.subject,
						serverSubject: serverCert?.subject
					});
				} catch (certError) {
					console.debug(`${this.host} ⚠️ Could not retrieve TLS certificates:`, certError);
				}

				// Phase 1: Add delay before sending pairing request to avoid race condition
				console.debug(`${this.host} Waiting 300ms before sending pairing request...`);
				await this.sleep(300);

				// Check if connection is still valid and not cancelled
				if (this.isCancelled || this.connectionState !== 'connected') {
					console.debug(`${this.host} Connection cancelled or invalid, aborting pairing request`);
					return;
				}

				console.debug(`${this.host} Sending pairing request`);
				this.client.write(this.pairingMessageManager.createPairingRequest(this.service_name));
			});

			this.client.on('data', data => {
				debugger;
				let buffer = Buffer.from(data);
				this.chunks = Buffer.concat([this.chunks, buffer]);

				if (this.chunks.length > 0 && this.chunks.readInt8(0) === this.chunks.length - 1) {
					let message = this.pairingMessageManager.parse(this.chunks);

					console.debug('Receive : ' + Array.from(this.chunks));
					console.debug('Receive : ' + JSON.stringify(message.toJSON()));

					if (message.status !== this.pairingMessageManager.Status.STATUS_OK) {
						this.client.destroy(new Error(message.status));
					} else {
						// Phase 1: Add delays between pairing protocol steps
						if (message.pairingRequestAck) {
							console.debug(
								`${this.host} Received pairingRequestAck, waiting 200ms before sending pairingOption`,
							);
							setTimeout(() => {
								if (!this.isCancelled && this.connectionState === 'connected') {
									this.client.write(this.pairingMessageManager.createPairingOption());
								}
							}, 200);
						} else if (message.pairingOption) {
							console.debug(
								`${this.host} Received pairingOption, waiting 200ms before sending pairingConfiguration`,
							);
							setTimeout(() => {
								if (!this.isCancelled && this.connectionState === 'connected') {
									this.client.write(this.pairingMessageManager.createPairingConfiguration());
								}
							}, 200);
						} else if (message.pairingConfigurationAck) {
							console.debug(`${this.host} Received pairingConfigurationAck, emitting secret event`);
							this.connectionState = 'paired';
							this.emit('secret');
						} else if (message.pairingSecretAck) {
							console.debug(this.host + ' Paired!');
							this.connectionState = 'paired';
							// Clear timeout since we're successfully paired
							if (this.connectionTimeout) {
								clearTimeout(this.connectionTimeout);
								this.connectionTimeout = null;
							}
							this.client.destroy();
						} else {
							console.debug(this.host + ' What Else ?');
						}
					}
					this.chunks = Buffer.from([]);
				}
			});

			// Add TLS-specific event handlers
			this.client.on('connect', () => {
				console.debug(`${this.host} 🔗 Socket connect event (before TLS)`);
			});

			this.client.on('timeout', () => {
				console.debug(`${this.host} ⏰ Socket timeout event`);
			});

			this.client.on('end', () => {
				console.debug(`${this.host} 🔚 Socket end event (other side closed)`);
			});

			this.client.on('close', hasError => {
				debugger;
				console.debug(`${this.host} 🚪 Socket close event - hasError: ${hasError}, connectionState: ${this.connectionState}`);
				
				// Phase 1: Clean up connection state and timeout
				this.connectionState = 'disconnected';
				if (this.connectionTimeout) {
					clearTimeout(this.connectionTimeout);
					this.connectionTimeout = null;
				}

				if (hasError) {
					console.log(`${this.host} ❌ PairingManager.close() failure - connection had errors`);
					reject(false);
				} else if (this.isCancelled) {
					console.log(`${this.host} 🚫 PairingManager.close() on cancelPairing()`);
					this.isCancelled = false;
					reject(false);
				} else {
					console.log(`${this.host} ✅ PairingManager.close() success - normal closure`);
					resolve(true);
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
				
				// Phase 1: Update connection state on error
				this.connectionState = 'disconnected';
				if (this.connectionTimeout) {
					clearTimeout(this.connectionTimeout);
					this.connectionTimeout = null;
				}
			});
		});
	}

	stop() {
		console.debug(`${this.host} PairingManager.stop(): Cleaning up connection`);
		
		// Update connection state
		this.connectionState = 'disconnected';
		this.isCancelled = true;
		
		// Clear any pending timeouts
		if (this.connectionTimeout) {
			clearTimeout(this.connectionTimeout);
			this.connectionTimeout = null;
		}
		
		// Close and clean up TCP client socket
		if (this.client) {
			try {
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
		
		console.debug(`${this.host} PairingManager.stop(): Cleanup completed`);
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
