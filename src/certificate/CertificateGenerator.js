import forge from "node-forge"
import modPow from 'react-native-modpow'

export class CertificateGenerator {

    static generateFull(name) {

        console.log(`🔧 CertificateGenerator: Entering generateFull(${name})`);
        console.log('🔧 CertificateGenerator: modPow available:', typeof modPow);

        console.log('🔧 CertificateGenerator: Setting up modPow override...');
        forge.jsbn.BigInteger.prototype.modPow = function nativeModPow(e, m) {
            const result = modPow({
                target: this.toString(16),
                value: e.toString(16),
                modifier: m.toString(16)
            });

            return new forge.jsbn.BigInteger(result, 16);
        };
        console.log('🔧 CertificateGenerator: modPow override complete');
        
        console.log('🔧 CertificateGenerator: Creating validity dates...');
        let date = new Date();
        date.setUTCFullYear(2021);
        let date2 = new Date();
        date2.setUTCFullYear(2099);
        
        console.log('🔧 CertificateGenerator: Generating RSA key pair (2048-bit)...');
        let keys = forge.pki.rsa.generateKeyPair(2048);
        console.log('🔧 CertificateGenerator: RSA key pair generated successfully');
        
        console.log('🔧 CertificateGenerator: Creating certificate...');
        let cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(19));
        cert.validity.notBefore = date;
        cert.validity.notAfter = date2;

        console.log('🔧 CertificateGenerator: Setting certificate attributes...');
        let attributes = [
            {name: 'commonName', value: name},
            {name: 'countryName', value: 'CNT'},
            {shortName: 'ST', value: 'ST'},
            {name: 'localityName', value: 'LOC'},
            {name: 'organizationName', value: 'O'},
            {shortName: 'OU', value: 'OU'}
        ];
        cert.setSubject(attributes);
        
        console.log('🔧 CertificateGenerator: Signing certificate...');
        cert.sign(keys.privateKey, forge.md.sha256.create());
        console.log('🔧 CertificateGenerator: Certificate signed successfully');
        
        console.log('🔧 CertificateGenerator: Converting to PEM format...');
        const result = {
            cert : forge.pki.certificateToPem(cert),
            key : forge.pki.privateKeyToPem(keys.privateKey),
        };
        
        console.log('🔧 CertificateGenerator: Exiting generateFull - SUCCESS');

        return result;
        }
    }
