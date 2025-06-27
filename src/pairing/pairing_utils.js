function toEvenHex(val) {
	let hex = typeof val === 'string' ? val.replace(/^0x/i, '') : val.toString(16).toUpperCase();
	if (hex.length % 2) hex = '0' + hex;
	return hex.toUpperCase();
}

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

export { get_modulus_exponent };
