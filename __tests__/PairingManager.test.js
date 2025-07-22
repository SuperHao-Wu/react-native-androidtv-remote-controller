import { EventEmitter } from "events";
import { PairingManager } from "../src/pairing/PairingManager";

// Mock TcpSockets
jest.mock("react-native-tcp-socket", () => {
	return {
		connectTLS: jest.fn()
	};
});

import TcpSockets from "react-native-tcp-socket";

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

		// Create a proper mock response using the PairingMessageManager
		const mockPairingRequestAck = pairingManager.pairingMessageManager.create({
			pairingRequestAck: {
				serverName: "test-server"
			},
			status: pairingManager.pairingMessageManager.Status.STATUS_OK,
			protocolVersion: 2
		});

		const resultPromise = pairingManager.start();

		// Simulate successful secure connection
		mockSocket.emit("secureConnect");

		// Simulate pairing request ack response
		mockSocket.emit("data", mockPairingRequestAck);

		// Mock the next steps of pairing flow
		const mockPairingOption = pairingManager.pairingMessageManager.create({
			pairingOption: {
				preferredRole:
					pairingManager.pairingMessageManager.RoleType.ROLE_TYPE_OUTPUT,
				inputEncodings: [
					{
						type: pairingManager.pairingMessageManager.EncodingType
							.ENCODING_TYPE_HEXADECIMAL,
						symbolLength: 6
					}
				]
			},
			status: pairingManager.pairingMessageManager.Status.STATUS_OK,
			protocolVersion: 2
		});
		mockSocket.emit("data", mockPairingOption);

		const mockConfigAck = pairingManager.pairingMessageManager.create({
			pairingConfigurationAck: {},
			status: pairingManager.pairingMessageManager.Status.STATUS_OK,
			protocolVersion: 2
		});
		mockSocket.emit("data", mockConfigAck);

		const mockSecretAck = pairingManager.pairingMessageManager.create({
			pairingSecretAck: {
				secret: Buffer.from([1, 2, 3, 4])
			},
			status: pairingManager.pairingMessageManager.Status.STATUS_OK,
			protocolVersion: 2
		});
		mockSocket.emit("data", mockSecretAck);

		mockSocket.emit("close", false);
		const result = await resultPromise;

		expect(result).toBe(true);
	});
});
