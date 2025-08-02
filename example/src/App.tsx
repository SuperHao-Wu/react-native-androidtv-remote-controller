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
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { PairingDialog } from './components/PairingDialog';
import { AndroidRemote, RemoteKeyCode, RemoteDirection } from 'react-native-androidtv-remote';
import { GoogleCastDiscovery, DeviceInfo } from './services/GoogleCastDiscovery';
import TcpSocket from 'react-native-tcp-socket';

function App(): React.JSX.Element {
  const [connectionStatuses, setConnectionStatuses] = useState<{ [host: string]: string }>({});
  const [showPairingDialog, setShowPairingDialog] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');

  const androidRemotesRef = useRef<Map<string, AndroidRemote>>(new Map());
  const discoveryRef = useRef<GoogleCastDiscovery | null>(null);
  const certificateRef = useRef<Map<string, { key: string | null; cert: string | null }>>(new Map());
  // search devices
  useEffect(() => {
    console.log('useEffect({}, []');
    discoveryRef.current = new GoogleCastDiscovery();
    return () => {
      androidRemotesRef.current.forEach((remote) => remote.stop());
      androidRemotesRef.current.clear();
      discoveryRef.current?.stop();
    };
  }, []);

  const handleScan = async () => {
    console.log('handleScan()');
    if (!discoveryRef.current) return;

    setScanning(true);
    setDevices([]);
    setSelectedDevice('');

    try {
      const results = await discoveryRef.current.scan();
      
      // Always add mock device for testing - use Mac's IP since app runs on iPhone
      const mockDevice: DeviceInfo = {
        name: 'Mock TV (Testing)',
        host: '192.168.2.150',  // Mac's IP address where mock server runs
        port: 6467  // Must match pairing_port in AndroidRemote options (pairing happens first)
      };
      
      const allDevices = [mockDevice, ...results.devices];
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
        
        // Check if TcpSocket module is available and has required methods
        if (TcpSocket && 
            typeof TcpSocket.connectTLS === 'function' &&
            typeof TcpSocket.createConnection === 'function') {
          console.log(`✅ TcpSocket bridge is ready after ${attempts} attempts`);
          resolve(true);
          return;
        }
        
        if (attempts >= maxAttempts) {
          console.log(`❌ TcpSocket bridge failed to initialize after ${maxAttempts} attempts`);
          resolve(false);
          return;
        }
        
        console.log(`⏳ TcpSocket bridge not ready (attempt ${attempts}/${maxAttempts}), checking again...`);
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
    setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Connecting' }));

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
          key: certificateRef.current.get(selectedDevice)?.key || null,
          cert: certificateRef.current.get(selectedDevice)?.cert || null,
          androidKeyStore: 'AndroidKeyStore',
          certAlias: 'remotectl-atv-cert',
          keyAlias: 'remotectl-atv',
        },
      };

      console.log('Creating AndroidRemote with options:', options);
      const androidRemote = new AndroidRemote(selectedDevice, options);
      androidRemotesRef.current.set(selectedDevice, androidRemote);

      // Set up minimal event listeners for UI updates
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
        const cert = androidRemote.getCertificate();
        if (cert && cert.key && cert.cert) {
          certificateRef.current.set(selectedDevice, cert);
        }
        setConnectionStatuses((prev) => ({ ...prev, [selectedDevice]: 'Connected' }));
        Alert.alert("Connected", `Remote is ready for ${selectedDevice}`);
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
            : connectionStatuses[selectedDevice] === 'Connecting'
            ? 'Connecting...'
            : 'Connect'
        }
        onPress={handleConnect}
        disabled={
          !selectedDevice || 
          connectionStatuses[selectedDevice] === 'Pairing Needed' ||
          connectionStatuses[selectedDevice] === 'Connecting'
        }
        testID="connectButton"
      />

      <View style={styles.buttonSpacer} />
      <Button
        title="Mute"
        onPress={() => handleCommandSend('KEYCODE_MUTE')}
        disabled={connectionStatuses[selectedDevice] !== 'Connected'}
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