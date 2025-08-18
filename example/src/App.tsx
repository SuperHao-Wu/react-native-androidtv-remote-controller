import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Button,
  Alert,
  StyleSheet,
  SafeAreaView,
  Modal,
  ActivityIndicator,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { PairingDialog } from './components/PairingDialog';
import RNRemote from 'react-native-androidtv-remote';
const { AndroidRemote, RemoteKeyCode, RemoteDirection, SecureStorage } = RNRemote;
import { GoogleCastDiscovery, DeviceInfo } from './services/GoogleCastDiscovery';
import { LaunchArguments } from 'react-native-launch-arguments';
import {Buffer} from 'buffer';

// E2E Test Mode Detection using Launch Arguments (corrected syntax)
console.log('🚀 App.tsx: Starting launch arguments detection...');
const launchArgs = LaunchArguments.value() as Record<string, any> | undefined;
console.log('🧪 Launch Arguments (JSON):', JSON.stringify(launchArgs, null, 2));
const rawHost = launchArgs?.['e2ehost'];
const rawCertificate = launchArgs?.['e2ecertificate'];
const rawPrivateKey = launchArgs?.['e2eprivatekey'];

console.log('🔍 Raw e2etestmode value:', launchArgs?.['e2etestmode']);
console.log('🔍 Raw e2etestmode type:', typeof launchArgs?.['e2etestmode']);

const E2E_TEST_MODE = Boolean(
  launchArgs?.['e2etestmode'] === '1' || launchArgs?.['e2etestmode'] === 1
);
const E2E_HOST: string | null = typeof rawHost === 'string' && rawHost.length > 0 ? rawHost : null;
const E2E_CERTIFICATE: string | null = typeof rawCertificate === 'string' && rawCertificate.length > 0 ? rawCertificate : null;
const E2E_PRIVATE_KEY: string | null = typeof rawPrivateKey === 'string' && rawPrivateKey.length > 0 ? rawPrivateKey : null;

console.log('🧪 E2E_TEST_MODE (boolean):', E2E_TEST_MODE);
console.log('🧪 E2E_HOST:', E2E_HOST);
console.log('🧪 E2E_CERTIFICATE length:', E2E_CERTIFICATE ? (E2E_CERTIFICATE as string).length : 0);
console.log('🧪 E2E_PRIVATE_KEY length:', E2E_PRIVATE_KEY ? (E2E_PRIVATE_KEY as string).length : 0);

function App(): React.JSX.Element {
  const [connectionStatuses, setConnectionStatuses] = useState<{ [host: string]: string }>({});
  const [showPairingDialog, setShowPairingDialog] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');

  const androidRemotesRef = useRef<Map<string, any>>(new Map());
  const discoveryRef = useRef<GoogleCastDiscovery | null>(null);

  
  // iOS app lifecycle state management
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);
  // search devices
  useEffect(() => {
    discoveryRef.current = new GoogleCastDiscovery();
    return () => {
      androidRemotesRef.current.forEach((remote) => remote.stop());
      androidRemotesRef.current.clear();
      discoveryRef.current?.stop();
    };
  }, []);

  // iOS app lifecycle integration - handle background/foreground transitions
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log(`📱 App lifecycle: ${appState.current} -> ${nextAppState}`);
      
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground
        console.log('📱 App lifecycle: App returned to foreground');
        
        if (backgroundTime.current) {
          const timeInBackground = Date.now() - backgroundTime.current;
          console.log(`📱 App lifecycle: App was in background for ${Math.round(timeInBackground / 1000)}s`);
          
          // If app was in background for more than 30 seconds, check connection health
          if (timeInBackground > 30000) {
            console.log('📱 App lifecycle: App was in background for significant time - checking connection health');
            checkConnectionHealthAfterBackground();
          }
          
          backgroundTime.current = null;
        }
      } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        // App went to background
        console.log('📱 App lifecycle: App went to background');
        backgroundTime.current = Date.now();
      }
      
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => subscription?.remove();
  }, []);
  
  // Check connection health after app returns from background
  const checkConnectionHealthAfterBackground = () => {
    androidRemotesRef.current.forEach((remote, host) => {
      const status = connectionStatuses[host];
      
      if (status === 'Connected') {
        console.log(`📱 App lifecycle: Checking connection health for ${host} after background return`);
        
        // For connected devices, the heartbeat monitoring in RemoteManager should automatically
        // detect if the connection is still healthy. If not, it will emit 'unpaired' event
        // which we handle by re-enabling the Connect button for user to reconnect.
        
        // We could optionally send a test ping here, but the existing heartbeat
        // monitoring should handle this automatically.
      }
    });
  };

  // E2E Test Mode: Auto-populate mock device and pre-populate client certificate
  useEffect(() => {
    if (E2E_TEST_MODE && E2E_HOST && E2E_CERTIFICATE && E2E_PRIVATE_KEY) {
      console.log('🧪 E2E_TEST_MODE: Setting up test environment...');
      
      const setupE2EMode = async () => {
        try {
          // Step 1: Store the pre-generated client certificate in keychain
          console.log(`🔐 E2E_TEST_MODE: Pre-populating client certificate for ${E2E_HOST}`);
          const certificatePem = Buffer.from(E2E_CERTIFICATE as string, 'base64').toString('utf8');
          const privateKeyPem = Buffer.from(E2E_PRIVATE_KEY as string, 'base64').toString('utf8');
          await SecureStorage.saveCertificate(E2E_HOST as string, certificatePem, privateKeyPem);
          console.log(`✅ E2E_TEST_MODE: Client certificate stored in keychain (${certificatePem.length} + ${privateKeyPem.length} chars)`);
          
          // Step 2: Set up mock device 
          const mockDevice: DeviceInfo = {
            name: 'Mock TV (E2E Test Mode)',
            host: E2E_HOST as string,  
            port: 6467  
          };
          
          setDevices([mockDevice]);
          setSelectedDevice(mockDevice.host || '');
          console.log('✅ E2E_TEST_MODE: Mock device and client certificate ready for testing');
          
        } catch (error) {
          console.error('❌ E2E_TEST_MODE: Failed to setup test environment:', error);
        }
      };
      
      setupE2EMode();
    }
  }, []);

  const handleScan = async () => {
    console.log('handleScan()');
    if (!discoveryRef.current) return;

    setScanning(true);
    setDevices([]);
    setSelectedDevice('');

    try {
      const results = await discoveryRef.current.scan();
      const allDevices = [...results.devices];
      setDevices(allDevices);
      
      if (allDevices.length > 0) {
        // Default to mock device for testing
        setSelectedDevice(allDevices[0].host || '');
      }
    } catch (error) {
      Alert.alert('Scan Error', 'Failed to discover devices');
    } finally {
      setScanning(false);
    }
  };

  // TLS readiness checker - waits for actual native TLS state
  const waitForTLSReady = async (socket: any): Promise<boolean> => {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 150; // 15 seconds max (150 * 100ms) - increased timeout
      
      const checkTLS = async () => {
        attempts++;
        
        try {
          const isReady = await socket.isTLSReady();
          console.log(`🔍 TLS readiness check attempt ${attempts}: ${isReady}`);
          if (isReady) {
            console.log(`✅ TLS is actually ready after ${attempts} attempts`);
            resolve(true);
            return;
          }
        } catch (error: any) {
          console.log(`⚠️ TLS readiness check failed (attempt ${attempts}): ${error.message}`);
        }
        
        if (attempts >= maxAttempts) {
          console.log(`❌ TLS failed to be ready after ${maxAttempts} attempts`);
          resolve(false);
          return;
        }
        
        console.log(`⏳ TLS not ready (attempt ${attempts}/${maxAttempts}), checking again...`);
        setTimeout(checkTLS, 100); // Check every 100ms
      };
      
      checkTLS();
    });
  };

  // Reliable bridge readiness checker with proper React Native timing
  const waitForBridgeReady = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 100; // Maximum 10 seconds (100 * 100ms)
      
      const checkBridge = () => {
        attempts++;
        
        // TcpSocket is now bundled in react-native-androidtv-remote
        // Simple check: if we've waited enough time for native bridge to initialize
        if (attempts >= 10) { // Wait at least 1 second (10 * 100ms)
          console.log(`✅ Native bridge should be ready after ${attempts} attempts`);
          resolve(true);
          return;
        }
        
        if (attempts >= maxAttempts) {
          console.log(`❌ TcpSocket bridge failed to initialize after ${maxAttempts} attempts`);
          resolve(false);
          return;
        }
        
        console.log(`⏳ Native bridge initializing (attempt ${attempts}/${maxAttempts}), checking again...`);
        // Use setTimeout instead of requestAnimationFrame for React Native
        setTimeout(checkBridge, 100); // Check every 100ms
      };
      
      checkBridge();
    });
  };

  const handleConnect = async () => {
    console.log('handleConnect() - START');
    console.log('selectedDevice:', selectedDevice);
    console.log('connectionStatuses:', connectionStatuses);
    
    if (!selectedDevice) {
      Alert.alert('Error', 'Please select a device first');
      return;
    }

    const currentStatus = connectionStatuses[selectedDevice] || 'Disconnected';
    if (currentStatus === 'Connected') {
      const remote = androidRemotesRef.current.get(selectedDevice);
      if (remote) {
        remote.stop();
        androidRemotesRef.current.delete(selectedDevice);
        setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Disconnected' }));
      }
      return;
    }

    // Clean up any existing connection for this device
    const existingRemote = androidRemotesRef.current.get(selectedDevice);
    if (existingRemote) {
      console.log('🧹 Cleaning up existing AndroidRemote connection...');
      try {
        existingRemote.stop();
        existingRemote.removeAllListeners();
      } catch (error) {
        console.log('⚠️ Error during cleanup:', error);
      }
      androidRemotesRef.current.delete(selectedDevice);
    }

    // Set connecting state immediately
    setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Connecting (Pairing)' }));

    try {
      console.log('🔍 Waiting for native bridge to be ready...');
      
      // Wait for bridge readiness before starting connection
      const bridgeReady = await waitForBridgeReady();
      
      if (!bridgeReady) {
        console.log('❌ Bridge failed to initialize, aborting connection');
        setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Error' }));
        Alert.alert("Bridge Error", "TCP socket bridge failed to initialize. Please restart the app.");
        return;
      }

      const options = {
        pairing_port: 6467,
        remote_port: 6466,
        service_name: 'com.vricosti.androidtv.example',
        systeminfo: {
          manufacturer: 'default-manufacturer',
          model: 'default-model',
        },
        cert: {
          // AndroidRemote now handles certificate loading from SecureStorage internally
          key: null, // Will be loaded from SecureStorage by AndroidRemote
          cert: null, // Will be loaded from SecureStorage by AndroidRemote
          androidKeyStore: 'AndroidKeyStore',
          certAlias: 'remotectl-atv-cert',
          keyAlias: 'remotectl-atv',
        },
      };

      console.log('Creating AndroidRemote with options:', options);
      const androidRemote = new AndroidRemote(selectedDevice, options);
      androidRemotesRef.current.set(selectedDevice, androidRemote);

      // Set up enhanced event listeners for smart connection UI updates
      
      // Smart connection routing events
      androidRemote.on('trying-remote', () => {
        console.log('AndroidRemote: trying-remote event - attempting port 6466 with certificate');
        setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Connecting (Remote)' }));
      });
      
      androidRemote.on('falling-back-to-pairing', () => {
        console.log('AndroidRemote: falling-back-to-pairing event - certificate invalid, starting pairing');
        setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Re-pairing Required' }));
      });
      
      androidRemote.on('secret', async () => {
        console.log('AndroidRemote: secret event received - waiting for TLS readiness...');
        
        // Wait for actual TLS readiness before showing dialog
        // During pairing, the client is in pairingManager
        const pairingClient = androidRemote.pairingManager?.client;
        if (!pairingClient) {
          console.log('❌ No pairing client found');
          setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Error' }));
          Alert.alert("Client Error", "No pairing client available");
          return;
        }
        
        const tlsReady = await waitForTLSReady(pairingClient);
        
        if (tlsReady) {
          console.log('✅ TLS ready, showing pairing dialog');
          setShowPairingDialog(true);
          setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Pairing Needed' }));
        } else {
          console.log('❌ TLS not ready for pairing dialog');
          setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Error' }));
          Alert.alert("TLS Error", "TLS connection not ready for pairing");
        }
      });

      androidRemote.on('ready', () => {
        console.log('AndroidRemote: ready event received');
        // Certificate storage is now handled automatically by AndroidRemote
        setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Connected' }));
        // UI feedback via status and enabled Mute button is sufficient - no alert needed
      });

      androidRemote.on('unpaired', () => {
        console.log('AndroidRemote: unpaired event received');
        setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Unpaired' }));
        Alert.alert("Unpaired", `The device ${selectedDevice} has been unpaired`);
      });

      // Add error handling for runtime errors
      androidRemote.on('error', (error: any) => {
        console.log('AndroidRemote: error event received:', error);
        setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Error' }));
        
        // Clean up the failed connection
        try {
          androidRemote.stop();
          androidRemote.removeAllListeners();
        } catch (cleanupError) {
          console.log('⚠️ Error during runtime cleanup:', cleanupError);
        }
        androidRemotesRef.current.delete(selectedDevice);
        
        Alert.alert("Runtime Error", `Connection error: ${error.message || error}`);
      });

      console.log('🚀 Starting AndroidRemote connection...');
      
      // Promise-based connection with proper error handling
      await androidRemote.start();
      
      // If we get here without throwing, connection initiation was successful
      console.log('✅ AndroidRemote connection initiated successfully');
      
    } catch (error: any) {
      console.log('❌ AndroidRemote connection failed:', error);
      setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Error' }));
      Alert.alert("Connection Error", `Failed to connect: ${error.message}`);
      
      // Clean up on error - thorough cleanup
      const remote = androidRemotesRef.current.get(selectedDevice);
      if (remote) {
        try {
          remote.stop();
          remote.removeAllListeners();
        } catch (cleanupError) {
          console.log('⚠️ Error during error cleanup:', cleanupError);
        }
        androidRemotesRef.current.delete(selectedDevice);
      }
    }
  };

  const handlePairingCodeSubmit = async (pairingCode: string | null) => {
    console.log('entering handlePairingCodeSubmit()');
    if (!selectedDevice || !androidRemotesRef.current.has(selectedDevice)) return;

    const remote = androidRemotesRef.current.get(selectedDevice);
    if (!remote) return;

    if (pairingCode === null) {
      console.log('before cancelPairing()');
      await remote.cancelPairing();
      setShowPairingDialog(false);
      remote.stop();
      androidRemotesRef.current.delete(selectedDevice);
      setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Disconnected' }));
      return;
    }

    try {
      console.log('before sendPairingCode()');
      await remote.sendPairingCode(pairingCode);
      setShowPairingDialog(false);
    } catch (error) {
      console.error('Error during pairing:', error);
      setShowPairingDialog(false);
      
      // Clean up failed pairing attempt
      try {
        remote.stop();
        remote.removeAllListeners();
      } catch (cleanupError) {
        console.log('⚠️ Error during pairing cleanup:', cleanupError);
      }
      androidRemotesRef.current.delete(selectedDevice);
      setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Disconnected' }));
    }
  };

  const handleCommandSend = (cmd) => {
    console.log('handleCommandSend()');
    if (!selectedDevice || !androidRemotesRef.current.has(selectedDevice)) return;
    const remote = androidRemotesRef.current.get(selectedDevice);
    if (!remote) return;
    console.log('before sendKey()');
    remote.sendKey(RemoteKeyCode[cmd], RemoteDirection.SHORT);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.statusText}>Status: {connectionStatuses[selectedDevice] || 'Disconnected'}</Text>
      
      {E2E_TEST_MODE && (
        <Text style={styles.testModeText}>🧪 E2E TEST MODE ACTIVE</Text>
      )}

      <Button title="Search Devices" onPress={handleScan} testID="searchDevicesButton" />

      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedDevice}
          onValueChange={(itemValue) => setSelectedDevice(itemValue)}
          style={styles.picker}
          enabled={!scanning && devices.length > 0}
          testID="devicePicker"
        >
          {devices.length === 0 ? (
            <Picker.Item label="No devices found" value="" />
          ) : (
            devices.map((device) => (
              <Picker.Item key={device.host} label={device.name} value={device.host} />
            ))
          )}
        </Picker>
      </View>

      <Button
        title={
          connectionStatuses[selectedDevice] === 'Connected' 
            ? 'Disconnect' 
            : connectionStatuses[selectedDevice] === 'Connecting (Remote)'
            ? 'Connecting...'
            : connectionStatuses[selectedDevice] === 'Connecting (Pairing)'
            ? 'Connecting...'
            : connectionStatuses[selectedDevice] === 'Re-pairing Required'
            ? 'Re-pairing...'
            : 'Connect'
        }
        onPress={handleConnect}
        disabled={
          !selectedDevice || 
          connectionStatuses[selectedDevice] === 'Pairing Needed' ||
          connectionStatuses[selectedDevice] === 'Connecting (Remote)' ||
          connectionStatuses[selectedDevice] === 'Connecting (Pairing)' ||
          connectionStatuses[selectedDevice] === 'Re-pairing Required'
        }
        testID="connectButton"
      />

      <View style={styles.buttonSpacer} />
      <Button
        title="Mute"
        onPress={() => handleCommandSend('KEYCODE_MUTE')}
        disabled={connectionStatuses[selectedDevice] !== 'Connected'}
        testID="muteButton"
      />

      <Modal visible={scanning} transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.scanningText}>Scanning for devices...</Text>
          </View>
        </View>
      </Modal>

      <PairingDialog
        visible={showPairingDialog}
        onSubmit={handlePairingCodeSubmit}
        onCancel={() => handlePairingCodeSubmit(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    margin: 10,
  },
  statusText: {
    marginBottom: 10,
  },
  testModeText: {
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: 'bold',
    color: '#FF6B35',
    backgroundColor: '#FFF3E0',
    padding: 8,
    borderRadius: 4,
  },
  pickerContainer: {
    // Contain the Picker to prevent overlap on iOS
    height: Platform.OS === 'ios' ? 150 : 50, // Larger on iOS to accommodate wheel
    width: '100%',
    marginVertical: 10,
    justifyContent: 'center', // Center the Picker vertically
  },
  picker: {
    width: '100%',
    ...(Platform.OS === 'ios' && {
      height: 150, // Explicit height for iOS wheel
    }),
    ...(Platform.OS === 'android' && {
      height: 50, // Smaller height for Android dropdown
    }),
  },
  buttonSpacer: {
    height: 40, // Existing spacer between Connect and Mute
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  scanningText: {
    marginTop: 10,
    fontSize: 16,
  },
});

export default App;