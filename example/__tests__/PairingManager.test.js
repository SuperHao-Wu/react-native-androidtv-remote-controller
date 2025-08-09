import { PairingManager } from "../../src/pairing/PairingManager";
import { EventEmitter } from "events";

// Mock TcpSockets (now bundled in the library)
jest.mock("../../src/tcp-socket/src/index.js", () => {
	return {
		connectTLS: jest.fn()
	};
});

import TcpSockets from "../../src/tcp-socket/src/index.js";

describe("PairingManager connection lifecycle", () => {
	let mockSocket;

	beforeEach(() => {
		jest.clearAllMocks();

		mockSocket = new EventEmitter();
		mockSocket.write = jest.fn();
		mockSocket.destroy = jest.fn();
		mockSocket.getCertificate = jest
			.fn()
			.mockResolvedValue({ modulus: "", exponent: "" });
		mockSocket.getPeerCertificate = jest
			.fn()
			.mockResolvedValue({ modulus: "", exponent: "" });

		TcpSockets.connectTLS.mockImplementation((options, callback) => {
			// Simulate socket created, but secureConnect never fires
			setTimeout(() => {
				// simulate hanging socket without secureConnect
			}, 10);
			return mockSocket;
		});
	});

	it("should detect if secureConnect is not called and not retry indefinitely", async () => {
		const pairingManager = new PairingManager(
			"Android.local.",
			6467,
			{ key: "fake-key", cert: "fake-cert" },
			"service_name",
			{ system: "test" }
		);

		const timeout = new Promise((resolve) => setTimeout(resolve, 500));
		const pairingResult = pairingManager.start();

		await timeout;

		// secureConnect was never emitted, simulate retry behavior check
		expect(mockSocket.write).not.toHaveBeenCalled();
		expect(mockSocket.destroy).not.toHaveBeenCalled();

		// Manually destroy to simulate cleanup
		pairingManager.cancelPairing();

		expect(mockSocket.destroy).toHaveBeenCalledTimes(1);
	});

	it("should complete pairing if secureConnect and data events are fired correctly", async () => {
		const pairingManager = new PairingManager(
			"Android.local.",
			6467,
			{ key: "fake-key", cert: "fake-cert" },
			"service_name",
			{ system: "test" }
		);

		const resultPromise = pairingManager.start();

		// Simulate successful secure connection
		mockSocket.emit("secureConnect");

		// Simulate pairing flow
		mockSocket.emit("data", Buffer.from([1, 0])); // minimal valid message

		mockSocket.emit("close", false);
		const result = await resultPromise;

		expect(result).toBe(true);
	});
});
