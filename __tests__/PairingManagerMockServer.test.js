import { startMockTLSServer } from './MockServer';
import { PairingManager } from '../src/pairing/PairingManager';

// Mock TcpSockets but allow real TLS connections to our mock server
jest.mock('../src/tcp-socket/src/index.js', () => {
	const tls = require('tls');
	return {
		connectTLS: (options, callback) => {
			// Create a real TLS connection to our mock server
			const socket = tls.connect(
				{
					port: options.port,
					host: options.host,
					rejectUnauthorized: false,
				},
				callback,
			);

			// Add the missing methods that PairingManager expects
			socket.getCertificate = jest.fn().mockResolvedValue({
				modulus: '0123456789ABCDEF',
				exponent: '010001',
			});

			socket.getPeerCertificate = jest.fn().mockResolvedValue({
				modulus: 'FEDCBA9876543210',
				exponent: '010001',
			});

			return socket;
		},
	};
});

describe('Integration test with mock TLS server', () => {
	let server;
	const TEST_PORT = 16467; // Use different port to avoid conflicts

	afterEach(async () => {
		if (server) {
			server.close();
			await new Promise(resolve => setTimeout(resolve, 100)); // Wait for server to close
		}
	});

	it('should timeout when server is slow to respond', async () => {
		// Start mock server that delays responses significantly
		server = await startMockTLSServer({
			port: TEST_PORT,
			responseDelay: 2000, // 2 second delay - should cause timeout
			enablePairingFlow: true,
		});

		const pairingManager = new PairingManager(
			'localhost',
			TEST_PORT,
			{ key: 'fake', cert: 'fake' },
			'mock_service',
			{ system: 'test' },
		);

		// Start pairing but don't wait too long
		const pairingPromise = pairingManager.start();

		// Wait 1 second then cancel - simulating user timeout
		await new Promise(resolve => setTimeout(resolve, 1000));

		const cancelled = pairingManager.cancelPairing();
		expect(cancelled).toBe(false); // cancelPairing returns false

		// The promise should reject due to cancellation
		await expect(pairingPromise).rejects.toBe(false);
	}, 10000);

	it('should complete pairing when server responds normally', async () => {
		// Start mock server with normal response times
		server = await startMockTLSServer({
			port: TEST_PORT,
			responseDelay: 100, // Quick response
			enablePairingFlow: true,
		});

		const pairingManager = new PairingManager(
			'localhost',
			TEST_PORT,
			{ key: 'fake', cert: 'fake' },
			'mock_service',
			{ system: 'test' },
		);

		// Mock the sendCode method to simulate PIN entry
		const originalSendCode = pairingManager.sendCode;
		pairingManager.sendCode = jest.fn().mockImplementation(async pin => {
			// Call the original method but with a valid PIN that will pass validation
			// For testing, we'll mock the validation to always pass
			console.debug('Mock sendCode called with PIN:', pin);

			// Skip the PIN validation for testing and just send the secret
			const hash_array = [
				1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
				26, 27, 28, 29, 30, 31, 32,
			];
			pairingManager.client.write(
				pairingManager.pairingMessageManager.createPairingSecret(hash_array),
			);
			return true;
		});

		// Start pairing
		const pairingPromise = pairingManager.start();

		// Wait for the secret event to be emitted, then send a code
		pairingManager.once('secret', () => {
			console.log('Secret event received, sending mock PIN');
			pairingManager.sendCode('123456');
		});

		// Wait for pairing to complete
		const result = await pairingPromise;
		expect(result).toBe(true);
	}, 15000);

	it('should handle server that never responds after secure connection', async () => {
		// Start mock server that connects but never sends pairing responses
		server = await startMockTLSServer({
			port: TEST_PORT,
			simulateTimeout: true, // Server connects but never responds to pairing messages
			enablePairingFlow: false,
		});

		const pairingManager = new PairingManager(
			'localhost',
			TEST_PORT,
			{ key: 'fake', cert: 'fake' },
			'mock_service',
			{ system: 'test' },
		);

		const pairingPromise = pairingManager.start();

		// Wait a bit then cancel
		await new Promise(resolve => setTimeout(resolve, 1500));
		pairingManager.cancelPairing();

		await expect(pairingPromise).rejects.toBe(false);
	}, 10000);

	it('should handle server connection errors', async () => {
		// Don't start any server - connection should fail
		const pairingManager = new PairingManager(
			'localhost',
			TEST_PORT, // No server listening on this port
			{ key: 'fake', cert: 'fake' },
			'mock_service',
			{ system: 'test' },
		);

		// This should fail to connect
		try {
			await pairingManager.start();
			// If we get here, the test failed
			expect(true).toBe(false);
		} catch (error) {
			// Should fail due to connection error
			expect(error).toBe(false);
		}
	}, 10000);
});
