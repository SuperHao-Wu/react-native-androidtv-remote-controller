import * as Keychain from 'react-native-keychain';

/**
 * Secure storage for Android TV remote authentication tokens.
 * 
 * Uses iOS Keychain for authentication tokens only - no certificate storage.
 * Certificates are generated fresh each time (no client identity persistence needed).
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
   * Store authentication token securely in iOS Keychain
   * @param {string} host - TV host address (e.g., "192.168.1.100") 
   * @param {Buffer} token - Authentication token from pairing process
   * @param {Object} opts - Options for biometric requirements
   */
  static async saveAuthToken(host, token, opts = {}) {
    try {
      const tokenBase64 = token.toString('base64');
      const service = this.serviceForHost(host);
      
      console.log(`🔐 SecureStorage: Saving auth token for ${host} (${token.length} bytes)`);

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

      await Keychain.setInternetCredentials(service, 'auth-token', tokenBase64, options);
      
      console.log(`✅ SecureStorage: Auth token saved successfully for ${host}`);
    } catch (error) {
      console.error(`❌ SecureStorage: Failed to save auth token for ${host}:`, error);
      throw error;
    }
  }
  
  /**
   * Load authentication token from iOS Keychain
   * @param {string} host - TV host address
   * @param {Object} opts - Options for biometric prompt customization
   * @returns {Buffer|null} Authentication token or null if not found
   */
  static async loadAuthToken(host, opts = {}) {
    try {
      const service = this.serviceForHost(host);
      
      console.log(`🔍 SecureStorage: Loading auth token for ${host}`);

      const queryOptions = {
        // Custom prompt for biometric authentication if needed
        ...(opts.promptTitle && {
          authenticationPrompt: { title: opts.promptTitle }
        })
      };

      const credentials = await Keychain.getInternetCredentials(service, queryOptions);
      console.log(`🔍 SecureStorage: Loaded credentials for ${host}:`, !!credentials, credentials?.username);
      
      if (!credentials || credentials.username !== 'auth-token') {
        console.log(`⚠️  SecureStorage: No auth token found for ${host}`);
        return null;
      }

      const token = Buffer.from(credentials.password, 'base64');
      console.log(`✅ SecureStorage: Auth token loaded for ${host} (${token.length} bytes)`);
      return token;
    } catch (error) {
      console.error(`❌ SecureStorage: Failed to load auth token for ${host}:`, error);
      return null;
    }
  }
  
  /**
   * Remove authentication token from iOS Keychain  
   * @param {string} host - TV host address
   */
  static async removeAuthToken(host) {
    try {
      const service = this.serviceForHost(host);
      
      console.log(`🗑️ SecureStorage: Removing auth token for ${host}`);
      
      await Keychain.resetInternetCredentials(service);
      
      console.log(`✅ SecureStorage: Auth token removed for ${host}`);
    } catch (error) {
      console.error(`❌ SecureStorage: Failed to remove auth token for ${host}:`, error);
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
      const hasToken = (await this.loadAuthToken(host)) !== null;
      const biometrics = await this.supportsBiometrics();
      
      return {
        host,
        hasAuthToken: hasToken,
        supportsBiometrics: biometrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        host,
        hasAuthToken: false,
        supportsBiometrics: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}