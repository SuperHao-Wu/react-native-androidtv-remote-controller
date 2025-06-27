const fs = require("fs");
const forge = require("node-forge");

// Helper: pad hex string to even length
function toEvenHex(val) {
	let hex =
		typeof val === "string"
			? val.replace(/^0x/i, "")
			: val.toString(16).toUpperCase();
	if (hex.length % 2) hex = "0" + hex;
	return hex.toUpperCase();
}

// Read certs (adjust paths as needed)
let client_cert_pem = fs.readFileSync(
	"/Users/wuhao/my_projects/sony_tv_controller/androidtvremote2/cert.pem",
	"utf8"
);
let client_cert = forge.pki.certificateFromPem(client_cert_pem);

let server_cert_der = fs.readFileSync(
	"/Users/wuhao/my_projects/sony_tv_controller/androidtvremote2/server_from_tv.der"
);
let server_cert_asn1 = forge.asn1.fromDer(
	forge.util.createBuffer(server_cert_der)
);
let server_cert = forge.pki.certificateFromAsn1(server_cert_asn1);

// Get modulus and exponent as hex
function get_modulus_exponent(cert) {
	let pub = cert.publicKey;
	let n = pub.n.toString(16).toUpperCase();
	let e = pub.e.toString(16).toUpperCase();
	n = toEvenHex(n);
	e = toEvenHex(e);
	// if (n.length % 2) n = "0" + n;
	// if (e.length % 2) e = "0" + e;
	return { modulus: n, exponent: e };
}

let client = get_modulus_exponent(client_cert);
let server = get_modulus_exponent(server_cert);

// Pin to test (must be the real PIN from TV)
let pin = "0DFC1C"; // Example: "0DFC1C"
if (pin.length !== 6) throw Error("PIN must be 6 hex digits");

let sha256 = forge.md.sha256.create();
sha256.update(forge.util.hexToBytes(client.modulus), "raw");
sha256.update(forge.util.hexToBytes(client.exponent), "raw");
sha256.update(forge.util.hexToBytes(server.modulus), "raw");
sha256.update(forge.util.hexToBytes(server.exponent), "raw");
sha256.update(forge.util.hexToBytes(pin.slice(2)), "raw"); // Last 4 digits

let hash = sha256.digest().getBytes();
let hash_array = Array.from(hash, (c) => c.charCodeAt(0) & 0xff);
let check = hash_array[0];

console.log("PIN first byte (decimal):", parseInt(pin.slice(0, 2), 16));
console.log("Hash first byte (decimal):", check);

if (check === parseInt(pin.slice(0, 2), 16)) {
	console.log("PIN VALID!");
} else {
	console.log("PIN INVALID!");
}
