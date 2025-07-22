function toEvenHex(val) {
	let hex =
		typeof val === "string"
			? val.replace(/^0x/i, "")
			: val.toString(16).toUpperCase();
	if (hex.length % 2) hex = "0" + hex;
	return hex.toUpperCase();
}

// Get modulus and exponent as hex
function get_modulus_exponent(cert) {
	// Prefer .publicKey if present (old logic), otherwise use top-level
	let n, e;
	debugger;
	if (cert.publicKey && cert.publicKey.n && cert.publicKey.e) {
		n = cert.publicKey.n;
		e = cert.publicKey.e;
	} else if (cert.modulus && cert.exponent) {
		n = cert.modulus.replace(/^0x/i, ""); // Strip 0x if present
		e = cert.exponent.replace(/^0x/i, "");
	} else {
		throw new Error(
			"Certificate missing modulus or exponent: " + JSON.stringify(cert)
		);
	}
	n = toEvenHex(n);
	e = toEvenHex(e);
	return { modulus: n, exponent: e };
}

export { get_modulus_exponent };
