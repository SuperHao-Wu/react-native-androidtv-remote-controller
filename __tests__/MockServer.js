// __tests__/MockServer.js
const tls = require("tls");
const selfsigned = require("selfsigned");
const { PairingMessageManager } = require("../dist/pairing/PairingMessageManager");

// Create a self-signed certificate for testing
const createTestCerts = () => {
	// Generate a proper self-signed certificate for testing
	const attrs = [{ name: 'commonName', value: 'localhost' }];
	const pems = selfsigned.generate(attrs, { 
		keySize: 2048,
		days: 365,
		algorithm: 'sha256',
		extensions: [{
			name: 'basicConstraints',
			cA: true
		}, {
			name: 'keyUsage',
			keyCertSign: true,
			digitalSignature: true,
			nonRepudiation: true,
			keyEncipherment: true,
			dataEncipherment: true
		}, {
			name: 'extKeyUsage',
			serverAuth: true,
			clientAuth: true,
			codeSigning: true,
			timeStamping: true
		}, {
			name: 'subjectAltName',
			altNames: [{
				type: 2, // DNS
				value: 'localhost'
			}, {
				type: 7, // IP
				ip: '127.0.0.1'
			}]
		}]
	});

	return { cert: pems.cert, key: pems.private };
};

// Validate client certificate like Sony TV does
function validateClientCertificate(socket, clientCert) {
	console.log("Mock server: Validating client certificate...");
	
	// Check if client certificate is present
	if (!clientCert || Object.keys(clientCert).length === 0) {
		console.log("Mock server: ❌ No client certificate provided");
		return false;
	}
	
	// Log client certificate details for debugging
	console.log("Mock server: Client certificate details:", {
		subject: clientCert.subject,
		issuer: clientCert.issuer,
		valid_from: clientCert.valid_from,
		valid_to: clientCert.valid_to,
		fingerprint: clientCert.fingerprint,
		serialNumber: clientCert.serialNumber
	});
	
	// Validate certificate has required properties for client authentication
	const validationChecks = {
		hasSubject: !!clientCert.subject,
		hasValidDates: !!clientCert.valid_from && !!clientCert.valid_to,
		hasFingerprint: !!clientCert.fingerprint,
		hasSerial: !!clientCert.serialNumber,
		notExpired: new Date(clientCert.valid_to) > new Date(),
		notYetValid: new Date(clientCert.valid_from) <= new Date()
	};
	
	console.log("Mock server: Certificate validation checks:", validationChecks);
	
	// Check if all validations pass
	const isValid = Object.values(validationChecks).every(check => check === true);
	
	if (!isValid) {
		console.log("Mock server: ❌ Client certificate validation failed");
		return false;
	}
	
	console.log("Mock server: ✅ Client certificate validation passed");
	return true;
}

function startMockTLSServer({ 
	port, 
	onConnect, 
	onSecureConnect, 
	onData, 
	onClose,
	responseDelay = 0,
	simulateTimeout = false,
	enablePairingFlow = true,
	validateCertificates = false  // Enable Sony TV-like certificate validation
}) {
	const { cert, key } = createTestCerts();
	
	const options = {
		key: key,
		cert: cert,
		rejectUnauthorized: false,
		requestCert: true,  // Request client certificate like Sony TV
		checkServerIdentity: () => undefined, // Allow any server identity
		// Custom certificate validation like Sony TV
		SNICallback: (servername, callback) => {
			callback(null, tls.createSecureContext({ key, cert }));
		}
	};

	const pairingMessageManager = new PairingMessageManager({ system: "test" });

	const server = tls.createServer(options, (socket) => {
		if (onConnect) onConnect(socket);

		socket.on("secureConnect", () => {
			console.log("Mock server: client securely connected");
			
			// Conditionally validate client certificate like Sony TV does
			if (validateCertificates) {
				const clientCert = socket.getPeerCertificate();
				const hasValidClientCert = validateClientCertificate(socket, clientCert);
				
				if (!hasValidClientCert) {
					console.log("Mock server: Pairing failed due to invalid client certificate");
					console.log("Mock server: SSL_NULL_WITH_NULL_NULL - No valid client certificate");
					socket.destroy(new Error("No local certificate for TLSv1.2 SSL_NULL_WITH_NULL_NULL"));
					return;
				}
				
				console.log("Mock server: Client certificate validation passed");
			} else {
				console.log("Mock server: Certificate validation disabled (mock mode)");
			}
			
			if (onSecureConnect) onSecureConnect(socket);
		});

		socket.on("data", (data) => {
			console.log("Mock server received data:", Array.from(data));
			
			if (onData) {
				onData(socket, data);
				return;
			}

			// Default pairing flow simulation if enablePairingFlow is true
			if (enablePairingFlow && !simulateTimeout) {
				setTimeout(() => {
					try {
						const message = pairingMessageManager.parse(data);
						console.log("Mock server parsed message:", message.toJSON());
						
						if (message.pairingRequest) {
							// Send pairing request ack
							const ack = pairingMessageManager.create({
								pairingRequestAck: {
									serverName: "MockTVServer"
								},
								status: pairingMessageManager.Status.STATUS_OK,
								protocolVersion: 2
							});
							socket.write(ack);
						} else if (message.pairingOption) {
							// Send pairing option with OUTPUT role (server provides the PIN)
							const option = pairingMessageManager.create({
								pairingOption: {
									preferredRole: pairingMessageManager.RoleType.ROLE_TYPE_OUTPUT,
									inputEncodings: [{
										type: pairingMessageManager.EncodingType.ENCODING_TYPE_HEXADECIMAL,
										symbolLength: 6
									}]
								},
								status: pairingMessageManager.Status.STATUS_OK,
								protocolVersion: 2
							});
							socket.write(option);
						} else if (message.pairingConfiguration) {
							// Send configuration ack
							const configAck = pairingMessageManager.create({
								pairingConfigurationAck: {},
								status: pairingMessageManager.Status.STATUS_OK,
								protocolVersion: 2
							});
							socket.write(configAck);
						} else if (message.pairingSecret) {
							// Send secret ack and close
							const secretAck = pairingMessageManager.create({
								pairingSecretAck: {
									secret: Buffer.from([1, 2, 3, 4])
								},
								status: pairingMessageManager.Status.STATUS_OK,
								protocolVersion: 2
							});
							socket.write(secretAck);
							socket.end();
						}
					} catch (error) {
						console.error("Mock server error parsing message:", error);
					}
				}, responseDelay);
			}
		});

		socket.on("close", () => {
			console.log("Mock server: client disconnected");
			if (onClose) onClose(socket);
		});

		socket.on("error", (error) => {
			console.error("Mock server socket error:", error);
		});
	});

	return new Promise((resolve, reject) => {
		server.listen(port, () => {
			console.log(`Mock TLS server listening on port ${port}`);
			resolve(server);
		});
		server.on("error", reject);
	});
}

module.exports = { startMockTLSServer };
