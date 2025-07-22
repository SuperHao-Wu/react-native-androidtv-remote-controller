import { startMockServer } from "./MockServer";
import { PairingManager } from "../src/pairing/PairingManager";

describe("Integration test with real socket", () => {
	let server;

	beforeEach(async () => {
		server = await startMockServer({
			port: 6467,
			onConnect: (socket) => {
				// Optionally delay secureConnect message to simulate slowness
				setTimeout(() => {
					// simulate server response like pairing ack here
					// socket.write(...);
				}, 1000);
			}
		});
	});

	afterEach(() => {
		server.close();
	});

	it("should timeout or hang if server is slow to respond", async () => {
		const pairingManager = new PairingManager(
			"localhost", // connect to local mock server
			6467,
			{ key: "fake", cert: "fake" },
			"mock_service",
			{ system: "test" }
		);

		const resultPromise = pairingManager.start();

		// Wait for a short time to simulate a timeout scenario
		await new Promise((r) => setTimeout(r, 500));

		pairingManager.cancelPairing();

		const result = await resultPromise.catch(() => false);

		expect(result).toBe(false); // or whatever your pairingManager returns
	});
});
