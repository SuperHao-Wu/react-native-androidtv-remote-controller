/**
 * In-memory certificate manager for Android TV client certificates.
 * 
 * Manages client certificates and private keys during app session.
 * Provides session-based certificate storage with automatic cleanup on app restart.
 */
export class CertificateManager {
  // Static certificate storage - shared across all AndroidRemote instances
  static certificates = new Map(); // host -> {certificate, privateKey, timestamp} mapping
  
  /**
   * Save client certificate for a host (in-memory only)
   * @param {string} host - TV host address (e.g., "192.168.1.100")
   * @param {string} certificatePem - Client certificate in PEM format
   * @param {string} privateKeyPem - Private key in PEM format
   */
  static saveCertificate(host, certificatePem, privateKeyPem) {
    if (!host || !certificatePem || !privateKeyPem) {
      console.error('❌ CertificateManager: Invalid host, certificate, or private key provided');
      return false;
    }
    
    console.log(`🔑 CertificateManager: Saving certificate for ${host} (${certificatePem.length} + ${privateKeyPem.length} chars)`);
    
    this.certificates.set(host, {
      certificate: certificatePem,
      privateKey: privateKeyPem,
      timestamp: Date.now(),
      host: host
    });
    
    console.log(`✅ CertificateManager: Certificate cached in memory for ${host}`);
    return true;
  }
  
  /**
   * Get client certificate for a host
   * @param {string} host - TV host address
   * @returns {Object|null} Certificate data {certificate, privateKey, timestamp} or null if not found
   */
  static getCertificate(host) {
    if (!host) {
      console.error('❌ CertificateManager: Invalid host provided');
      return null;
    }
    
    const certData = this.certificates.get(host);
    if (certData) {
      console.log(`✅ CertificateManager: Certificate found for ${host} (cached ${Date.now() - certData.timestamp}ms ago)`);
      return certData;
    } else {
      console.log(`⚠️ CertificateManager: No certificate found for ${host}`);
      return null;
    }
  }
  
  /**
   * Check if certificate exists for a host
   * @param {string} host - TV host address
   * @returns {boolean} True if certificate exists
   */
  static hasCertificate(host) {
    return this.certificates.has(host);
  }
  
  /**
   * Clear certificate for a specific host
   * @param {string} host - TV host address
   */
  static clearCertificate(host) {
    if (!host) {
      console.error('❌ CertificateManager: Invalid host provided');
      return false;
    }
    
    const deleted = this.certificates.delete(host);
    if (deleted) {
      console.log(`🗑️ CertificateManager: Certificate cleared for ${host}`);
    } else {
      console.log(`⚠️ CertificateManager: No certificate to clear for ${host}`);
    }
    return deleted;
  }
  
  /**
   * Clear all certificates (for app reset/logout)
   */
  static clearAllCertificates() {
    const count = this.certificates.size;
    this.certificates.clear();
    console.log(`🗑️ CertificateManager: Cleared ${count} certificates from memory`);
  }
  
  /**
   * Get all stored certificate hosts
   * @returns {string[]} Array of host addresses with certificates
   */
  static getAllHosts() {
    return Array.from(this.certificates.keys());
  }
  
  /**
   * Validate certificate data format
   * @param {Object} certData - Certificate data object
   * @returns {boolean} True if valid certificate data
   */
  static isValidCertificateData(certData) {
    return (
      certData &&
      typeof certData === 'object' &&
      typeof certData.certificate === 'string' &&
      typeof certData.privateKey === 'string' &&
      certData.certificate.includes('-----BEGIN CERTIFICATE-----') &&
      (certData.privateKey.includes('-----BEGIN PRIVATE KEY-----') || 
       certData.privateKey.includes('-----BEGIN RSA PRIVATE KEY-----'))
    );
  }
  
  /**
   * Get certificate info for debugging
   * @param {string} host - TV host address  
   * @returns {Object} Certificate information
   */
  static getCertificateInfo(host) {
    const certData = this.getCertificate(host);
    if (!certData) {
      return {
        host,
        exists: false,
        timestamp: new Date().toISOString(),
      };
    }
    
    return {
      host,
      exists: true,
      certificateLength: certData.certificate.length,
      privateKeyLength: certData.privateKey.length,
      storedAt: new Date(certData.timestamp).toISOString(),
      ageMs: Date.now() - certData.timestamp,
      timestamp: new Date().toISOString(),
    };
  }
}