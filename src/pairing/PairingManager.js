import { PairingMessageManager } from "./PairingMessageManager.js";
import forge from "node-forge";
import { Buffer } from "buffer";
import EventEmitter from "events";
import TcpSockets from "react-native-tcp-socket";
import { get_modulus_exponent } from "./pairing_utils.js";
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
	}

	async sendCode(pin) {
		try {
			console.log("Sending code : ", pin);
			debugger;

			let client_cert = await this.client.getCertificate();
			let server_cert = await this.client.getPeerCertificate();
			console.log("client_cert:", client_cert);
			console.log("server_cert:", server_cert);
			let client_certificate = get_modulus_exponent(client_cert);
			let server_certificate = get_modulus_exponent(server_cert);
			let sha256 = forge.md.sha256.create();

			sha256.update(forge.util.hexToBytes(client_certificate.modulus), "raw");
			sha256.update(forge.util.hexToBytes(client_certificate.exponent), "raw");
			sha256.update(forge.util.hexToBytes(server_certificate.modulus), "raw");
			sha256.update(forge.util.hexToBytes(server_certificate.exponent), "raw");
			sha256.update(forge.util.hexToBytes(pin.slice(2)), "raw");

			let hash = sha256.digest().getBytes();
			let hash_array = Array.from(hash, (c) => c.charCodeAt(0) & 0xff);
			let check = hash_array[0];
			console.log("PIN first byte (decimal):", parseInt(pin.slice(0, 2), 16));
			console.log("Hash first byte (decimal):", check);
			if (check !== parseInt(pin.slice(0, 2), 16)) {
				console.error("Code validation failed");
				this.client.destroy(new Error("Bad Code"));
				return false;
			} else {
				console.log("Code validated, sending pairing secret");
				this.client.write(
					this.pairingMessageManager.createPairingSecret(hash_array)
				);
				return true;
			}
		} catch (err) {
			console.error("sendCode error:", err);
			this._destroyClient(new Error("Pairing canceled"));
			return false;
		}
	}

	cancelPairing() {
		this.isCancelled = true;
		this.client.destroy(new Error("Pairing canceled"));
		return false;
	}

	async start() {
		// Prevent multiple parallel connects
		if (this.client) {
			console.warn("Previous connection still exists, destroying.");
			this._destroyClient();
			// Optionally: wait a bit for socket cleanup
			await new Promise((res) => setTimeout(res, 300));
		}
		return new Promise((resolve, reject) => {
			let finished = false;
			const finish = (result, err) => {
				if (finished) return;
				finished = true;
				this._clearConnectionTimeout();
				this._destroyClient();
				if (err) reject(err);
				else resolve(result);
			};

			let options = {
				port: this.port,
				host: this.host,
				key: this.certs.key,
				cert: this.certs.cert,
				rejectUnauthorized: false, // if true => use ca
				// androidKeyStore: this.certs.androidKeyStore,
				certAlias: this.certs.certAlias,
				keyAlias: this.certs.keyAlias
			};

			//console.log('PairingManager.start(): before connectTLS');
			this.client = TcpSockets.connectTLS(options, () => {
				console.log(this.host + " Pairing connected");
			});

			this.isCancelled = false;
			this.client.pairingManager = this;
			// --- Add connection timeout ---
			this.connectionTimeout = setTimeout(() => {
				console.error("Pairing connection timed out");
				finish(false, new Error("Pairing connection timed out"));
			}, 10000);

			this.client.on("secureConnect", () => {
				this._clearConnectionTimeout();
				console.log(this.host + " Pairing secure connected ");
				this.client.write(
					this.pairingMessageManager.createPairingRequest(this.service_name)
				);
			});

			this.client.on("data", (data) => {
				let buffer = Buffer.from(data);
				this.chunks = Buffer.concat([this.chunks, buffer]);

				if (
					this.chunks.length > 0 &&
					this.chunks.readInt8(0) === this.chunks.length - 1
				) {
					let message = this.pairingMessageManager.parse(this.chunks);

					console.log("Receive : " + Array.from(this.chunks));
					console.log("Receive : " + JSON.stringify(message.toJSON()));

					if (message.status !== this.pairingMessageManager.Status.STATUS_OK) {
						this.client.destroy(new Error(message.status));
					} else {
						if (message.pairingRequestAck) {
							this.client.write(
								this.pairingMessageManager.createPairingOption()
							);
						} else if (message.pairingOption) {
							this.client.write(
								this.pairingMessageManager.createPairingConfiguration()
							);
						} else if (message.pairingConfigurationAck) {
							this.emit("secret");
						} else if (message.pairingSecretAck) {
							console.log(this.host + " Paired!");
							this.client.destroy();
						} else {
							console.log(this.host + " What Else ?");
						}
					}
					this.chunks = Buffer.from([]);
				}
			});

			this.client.on("close", (hasError) => {
				this._clearConnectionTimeout();
				if (!finished) {
					if (hasError) {
						console.log("PairingManager.close() failure");
						finish(false, new Error("Connection closed with error"));
					} else if (this.isCancelled) {
						console.log("PairingManager.close() on cancelPairing()");
						this.isCancelled = false;
						finish(false, new Error("Cancelled"));
					} else {
						console.log("PairingManager.close() success");
						finish(true);
					}
				}
			});

			this.client.on("error", (error) => {
				this._clearConnectionTimeout();
				console.error("PairingManager error:", error);
				finish(false, error);
			});
		});
	}
	_destroyClient(err) {
		if (this.client) {
			try {
				this.client.destroy(err);
			} catch (e) {}
			this.client = null;
		}
	}
	_clearConnectionTimeout() {
		if (this.connectionTimeout) {
			clearTimeout(this.connectionTimeout);
			this.connectionTimeout = null;
		}
	}
}

export { PairingManager };
