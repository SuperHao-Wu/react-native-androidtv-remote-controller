import forge from "node-forge"
import modPow from 'react-native-modpow'

export class CertificateGenerator {

    static generateFull(name) {

        console.log(`Entering generateFull(${name})`);
        console.log('modPow: ', modPow);

        forge.jsbn.BigInteger.prototype.modPow = function nativeModPow(e, m) {
            const result = modPow({
                target: this.toString(16),
                value: e.toString(16),
                modifier: m.toString(16)
            });

            return new forge.jsbn.BigInteger(result, 16);
        };
        
        let date = new Date();
        date.setUTCFullYear(2021);
        let date2 = new Date();
        date2.setUTCFullYear(2099);
        let keys = forge.pki.rsa.generateKeyPair(2048);
        let cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(19));
        cert.validity.notBefore = date;
        cert.validity.notAfter = date2;

        let attributes = [
            {name: 'commonName', value: name},
            {name: 'countryName', value: 'CNT'},
            {shortName: 'ST', value: 'ST'},
            {name: 'localityName', value: 'LOC'},
            {name: 'organizationName', value: 'O'},
            {shortName: 'OU', value: 'OU'}
        ];
        cert.setSubject(attributes);
        
        // Set issuer to self (self-signed certificate)
        cert.setIssuer(attributes);
        
        // Add extensions required for client authentication
        cert.setExtensions([
            {
                name: 'keyUsage',
                digitalSignature: true,
                keyEncipherment: true,
                critical: true
            },
            {
                name: 'extKeyUsage',
                clientAuth: true,
                critical: true
            },
            {
                name: 'basicConstraints',
                cA: false,
                critical: true
            }
        ]);

        console.log('🔑 Certificate Extensions Added:', {
            keyUsage: 'digitalSignature + keyEncipherment',
            extKeyUsage: 'clientAuth',
            basicConstraints: 'cA=false'
        });
        
        cert.sign(keys.privateKey, forge.md.sha256.create());
        
        // Log certificate details for debugging
        const certPem = forge.pki.certificateToPem(cert);
        const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
        
        console.log('📋 Generated Certificate Details:', {
            subject: cert.subject.getField('CN')?.value,
            issuer: cert.issuer.getField('CN')?.value,
            serialNumber: cert.serialNumber,
            validFrom: cert.validity.notBefore.toISOString(),
            validTo: cert.validity.notAfter.toISOString(),
            keyAlgorithm: 'RSA-2048',
            signatureAlgorithm: 'SHA256withRSA',
            extensions: cert.extensions?.map(ext => ext.name),
            certLength: certPem.length,
            keyLength: keyPem.length,
            certType: 'PEM'
        });
        
        console.log('🔑 Certificate PEM Preview:', certPem.substring(0, 200) + '...');
        
        console.log('Exiting generateFull');

        return {
            cert: certPem,
            key: keyPem,
        }
    }
}
