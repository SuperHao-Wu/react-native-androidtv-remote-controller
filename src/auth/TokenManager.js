/**
 * In-memory token manager for Android TV authentication tokens.
 * 
 * Manages authentication tokens received during pairing for use in remote control connections.
 * Tokens are stored in memory during app session and can be persisted via SecureStorage.
 */
export class TokenManager {
  // Static token storage - shared across all AndroidRemote instances
  static tokens = new Map(); // host -> token mapping
  
  /**
   * Save authentication token for a host
   * @param {string} host - TV host address (e.g., "192.168.1.100")
   * @param {Buffer} token - Authentication token from pairingSecretAck
   */
  static saveToken(host, token) {
    if (!host || !token) {
      console.error('❌ TokenManager: Invalid host or token provided');
      return false;
    }
    
    console.log(`🔑 TokenManager: Saving token for ${host} (${token.length} bytes)`);
    console.log(`🔑 TokenManager: Token: ${token.toString('hex').toUpperCase()}`);
    
    this.tokens.set(host, {
      token: token,
      timestamp: Date.now(),
      host: host
    });
    
    console.log(`✅ TokenManager: Token saved for ${host}`);
    return true;
  }
  
  /**
   * Get authentication token for a host
   * @param {string} host - TV host address
   * @returns {Buffer|null} Authentication token or null if not found
   */
  static getToken(host) {
    if (!host) {
      console.error('❌ TokenManager: No host provided');
      return null;
    }
    
    const tokenData = this.tokens.get(host);
    if (!tokenData) {
      console.log(`⚠️  TokenManager: No token found for ${host}`);
      return null;
    }
    
    const ageMinutes = (Date.now() - tokenData.timestamp) / (1000 * 60);
    console.log(`✅ TokenManager: Retrieved token for ${host} (age: ${ageMinutes.toFixed(1)} minutes)`);
    
    return tokenData.token;
  }
  
  /**
   * Check if a valid token exists for a host
   * @param {string} host - TV host address
   * @returns {boolean} True if valid token exists
   */
  static hasValidToken(host) {
    const tokenData = this.tokens.get(host);
    if (!tokenData) {
      return false;
    }
    
    // Check token age (24 hours max)
    const ageHours = (Date.now() - tokenData.timestamp) / (1000 * 60 * 60);
    const isValid = ageHours < 24;
    
    console.log(`🔍 TokenManager: Token for ${host} is ${isValid ? 'valid' : 'expired'} (age: ${ageHours.toFixed(1)}h)`);
    
    return isValid;
  }
  
  /**
   * Remove token for a host
   * @param {string} host - TV host address
   */
  static removeToken(host) {
    if (!host) {
      console.error('❌ TokenManager: No host provided');
      return false;
    }
    
    const existed = this.tokens.has(host);
    this.tokens.delete(host);
    
    if (existed) {
      console.log(`🗑️ TokenManager: Token removed for ${host}`);
    } else {
      console.log(`⚠️  TokenManager: No token to remove for ${host}`);
    }
    
    return existed;
  }
  
  /**
   * Clear all stored tokens
   */
  static clearAllTokens() {
    const count = this.tokens.size;
    this.tokens.clear();
    console.log(`🗑️ TokenManager: Cleared ${count} tokens`);
  }
  
  /**
   * Get all stored tokens (for debugging)
   * @returns {Array} Array of token information
   */
  static getAllTokens() {
    const tokenList = [];
    
    this.tokens.forEach((tokenData, host) => {
      const ageMinutes = (Date.now() - tokenData.timestamp) / (1000 * 60);
      tokenList.push({
        host: host,
        tokenLength: tokenData.token.length,
        tokenHex: tokenData.token.toString('hex').toUpperCase(),
        ageMinutes: ageMinutes,
        timestamp: new Date(tokenData.timestamp).toISOString()
      });
    });
    
    return tokenList;
  }
  
  /**
   * Get storage statistics
   * @returns {Object} Storage statistics
   */
  static getStats() {
    const tokens = this.getAllTokens();
    const validTokens = tokens.filter(t => t.ageMinutes < 24 * 60); // 24 hours
    
    return {
      totalTokens: tokens.length,
      validTokens: validTokens.length,
      expiredTokens: tokens.length - validTokens.length,
      hosts: tokens.map(t => t.host),
      oldestTokenAgeHours: tokens.length > 0 ? Math.max(...tokens.map(t => t.ageMinutes)) / 60 : 0,
      newestTokenAgeMinutes: tokens.length > 0 ? Math.min(...tokens.map(t => t.ageMinutes)) : 0
    };
  }
  
  /**
   * Cleanup expired tokens
   * @param {number} maxAgeHours - Maximum age in hours (default 24)
   * @returns {number} Number of tokens removed
   */
  static cleanupExpiredTokens(maxAgeHours = 24) {
    let removedCount = 0;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    
    this.tokens.forEach((tokenData, host) => {
      const age = Date.now() - tokenData.timestamp;
      if (age > maxAgeMs) {
        this.tokens.delete(host);
        removedCount++;
        console.log(`🗑️ TokenManager: Removed expired token for ${host} (age: ${(age / 1000 / 60 / 60).toFixed(1)}h)`);
      }
    });
    
    if (removedCount > 0) {
      console.log(`🧹 TokenManager: Cleanup removed ${removedCount} expired tokens`);
    }
    
    return removedCount;
  }
}