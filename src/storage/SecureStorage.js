import * as Keychain from 'react-native-keychain';

/**
 * Secure storage for Android TV remote client certificates.
 * 
 * Uses iOS Keychain for persistent client certificate storage. 
 * Certificates are reused for authentication matching the working Python implementation.
 */
export class SecureStorage {
  /**
   * Generate service name for specific host
   * @param {string} host - TV host address
   * @returns {string} Service name for keychain
   */
  static serviceForHost(host) {
    return `android-tv-${host}`;
  }

  /**
   * Store client certificate and private key securely in iOS Keychain
   * @param {string} host - TV host address (e.g., "192.168.1.100") 
   * @param {string} certificatePem - Client certificate in PEM format
   * @param {string} privateKeyPem - Private key in PEM format
   * @param {Object} opts - Options for biometric requirements
   */
  static async saveCertificate(host, certificatePem, privateKeyPem, opts = {}) {
    try {
      const service = this.serviceForHost(host);
      
      console.log(`🔐 SecureStorage: Saving client certificate for ${host} (${certificatePem.length} + ${privateKeyPem.length} chars)`);

      // Combine certificate and private key for storage
      const certData = JSON.stringify({
        certificate: certificatePem,
        privateKey: privateKeyPem,
        timestamp: Date.now()
      });

      const options = {
        service,
        accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        // Only enable biometric prompt if explicitly requested
        ...(opts.requireUserPresence
          ? { authenticationType: Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS }
          : {}),
        // Cross-platform compatibility  
        securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
      };

      await Keychain.setInternetCredentials(service, 'client-cert', certData, options);
      
      console.log(`✅ SecureStorage: Client certificate saved successfully for ${host}`);
    } catch (error) {
      console.error(`❌ SecureStorage: Failed to save client certificate for ${host}:`, error);
      throw error;
    }
  }
  
  /**
   * Load client certificate and private key from iOS Keychain
   * @param {string} host - TV host address
   * @param {Object} opts - Options for biometric prompt customization
   * @returns {Object|null} Certificate data {certificate, privateKey, timestamp} or null if not found
   */
  static async loadCertificate(host, opts = {}) {
    try {
      const service = this.serviceForHost(host);
      
      console.log(`🔍 SecureStorage: Loading client certificate for ${host}`);

      const queryOptions = {
        // Custom prompt for biometric authentication if needed
        ...(opts.promptTitle && {
          authenticationPrompt: { title: opts.promptTitle }
        })
      };

      const credentials = await Keychain.getInternetCredentials(service, queryOptions);
      console.log(`🔍 SecureStorage: Loaded credentials for ${host}:`, !!credentials, credentials?.username);
      
      if (!credentials || credentials.username !== 'client-cert') {
        console.log(`⚠️  SecureStorage: No client certificate found for ${host}`);
        return null;
      }

      const certData = JSON.parse(credentials.password);
      console.log(`✅ SecureStorage: Client certificate loaded for ${host} (${certData.certificate.length} chars)`);
      return certData;
    } catch (error) {
      console.error(`❌ SecureStorage: Failed to load client certificate for ${host}:`, error);
      return null;
    }
  }
  
  /**
   * Remove client certificate from iOS Keychain  
   * @param {string} host - TV host address
   */
  static async removeCertificate(host) {
    try {
      const service = this.serviceForHost(host);
      
      console.log(`🗑️ SecureStorage: Removing client certificate for ${host}`);
      
      await Keychain.resetInternetCredentials(service);
      
      console.log(`✅ SecureStorage: Client certificate removed for ${host}`);
    } catch (error) {
      console.error(`❌ SecureStorage: Failed to remove client certificate for ${host}:`, error);
      throw error;
    }
  }

  /**
   * Check if device supports biometric authentication
   * @returns {boolean} True if biometrics are available
   */
  static async supportsBiometrics() {
    try {
      const biometryType = await Keychain.getSupportedBiometryType();
      return biometryType !== null;
    } catch (error) {
      console.log('SecureStorage: Biometrics check failed:', error);
      return false;
    }
  }

  /**
   * Get storage status for debugging
   * @param {string} host - TV host address
   * @returns {Object} Status information
   */
  static async getStorageStatus(host) {
    try {
      const certData = await this.loadCertificate(host);
      const hasCertificate = certData !== null;
      const biometrics = await this.supportsBiometrics();
      
      return {
        host,
        hasCertificate: hasCertificate,
        certificateTimestamp: certData?.timestamp,
        supportsBiometrics: biometrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        host,
        hasCertificate: false,
        supportsBiometrics: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}