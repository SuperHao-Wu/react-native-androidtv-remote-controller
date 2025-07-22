// __tests__/MockServer.js
import net from "net";

export function startMockServer({ port, onConnect, onData, onClose }) {
	const server = net.createServer((socket) => {
		if (onConnect) onConnect(socket);

		socket.on("data", (data) => {
			if (onData) onData(socket, data);
		});

		socket.on("close", () => {
			if (onClose) onClose(socket);
		});
	});

	return new Promise((resolve, reject) => {
		server.listen(port, () => resolve(server));
		server.on("error", reject);
	});
}
