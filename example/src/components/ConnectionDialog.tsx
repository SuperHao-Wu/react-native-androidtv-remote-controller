import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';

interface ConnectionProgress {
  hostPort: string;
  attempt: number;
  maxRetries: string | number;
  phase: 'connecting' | 'retrying' | 'success' | 'failed';
  startTime?: number;
  error?: string;
  retryDelay?: number;
  nextAttempt?: number;
  totalTime?: number;
  attemptTime?: number;
}

interface ConnectionDialogProps {
  visible: boolean;
  progress: ConnectionProgress | null;
  onCancel: () => void;
  title?: string;
}

export const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
  visible,
  progress,
  onCancel,
  title = 'Connecting to TV',
}) => {
  const [dots, setDots] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(0));

  // Animated dots for loading effect
  useEffect(() => {
    if (!visible || !progress || progress.phase === 'success') return;
    
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    return () => clearInterval(interval);
  }, [visible, progress]);

  // Handle retry countdown
  useEffect(() => {
    if (!progress || progress.phase !== 'retrying' || !progress.retryDelay) return;

    setCountdown(Math.ceil(progress.retryDelay / 1000));
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [progress?.retryDelay, progress?.phase]);

  // Fade in animation
  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible, fadeAnim]);

  const getPhaseText = () => {
    if (!progress) return 'Initializing...';
    
    const { phase, attempt, maxRetries, hostPort } = progress;
    const port = hostPort.split(':')[1];
    const portDescription = port === '6467' ? 'Pairing' : 'Remote Control';
    const attemptText = maxRetries === 'infinite' ? `${attempt}` : `${attempt}/${maxRetries}`;
    
    switch (phase) {
      case 'connecting':
        return `${portDescription} (Port ${port})\nAttempt ${attemptText}${dots}`;
      case 'retrying':
        return `${portDescription} (Port ${port})\nRetrying... (${countdown}s)\nNext: Attempt ${progress.nextAttempt || attempt + 1}`;
      case 'success':
        return `${portDescription} Connected!`;
      case 'failed':
        return `${portDescription} Failed\nAfter ${attemptText} attempts`;
      default:
        return 'Connecting...';
    }
  };

  const getStatusColor = () => {
    if (!progress) return '#007AFF';
    
    switch (progress.phase) {
      case 'connecting':
        return '#007AFF';
      case 'retrying':
        return '#FF9500';
      case 'success':
        return '#34C759';
      case 'failed':
        return '#FF3B30';
      default:
        return '#007AFF';
    }
  };

  const getErrorText = () => {
    if (!progress?.error) return null;
    
    // Make error messages more user-friendly
    if (progress.error.includes('TLS_HANDSHAKE_TIMEOUT')) {
      return 'Connection timeout. This is common during initial pairing.';
    }
    if (progress.error.includes('CONNECTION_CLOSED')) {
      return 'Connection was closed. Retrying...';
    }
    return progress.error;
  };

  const showCancelButton = progress?.phase !== 'success' && progress?.phase !== 'failed';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
    >
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalContent, { opacity: fadeAnim }]}>
          <Text style={styles.title}>{title}</Text>
          
          <View style={styles.statusContainer}>
            {progress?.phase === 'success' ? (
              <Text style={styles.successIcon}>✓</Text>
            ) : progress?.phase === 'failed' ? (
              <Text style={styles.errorIcon}>✗</Text>
            ) : (
              <ActivityIndicator size="large" color={getStatusColor()} />
            )}
            
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getPhaseText()}
            </Text>
          </View>

          {progress && (
            <View style={styles.detailsContainer}>
              <Text style={styles.detailText}>
                Attempts: {progress.attempt} {progress.maxRetries !== 'infinite' ? `/ ${progress.maxRetries}` : '(infinite)'}
              </Text>
              {progress.phase === 'retrying' && countdown > 0 && (
                <Text style={styles.detailText}>
                  Next attempt in: {countdown}s
                </Text>
              )}
              {progress.totalTime && (
                <Text style={styles.detailText}>
                  Elapsed: {Math.round(progress.totalTime / 1000)}s
                </Text>
              )}
            </View>
          )}

          {getErrorText() && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{getErrorText()}</Text>
            </View>
          )}

          {showCancelButton && (
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          )}

          {progress?.phase === 'success' && (
            <TouchableOpacity
              style={[styles.button, styles.successButton]}
              onPress={onCancel}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          )}

          {progress?.phase === 'failed' && (
            <TouchableOpacity
              style={[styles.button, styles.retryButton]}
              onPress={onCancel}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  successIcon: {
    fontSize: 48,
    color: '#34C759',
    fontWeight: 'bold',
  },
  errorIcon: {
    fontSize: 48,
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  detailsContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 16,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  errorContainer: {
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FED7D7',
  },
  errorText: {
    fontSize: 14,
    color: '#E53E3E',
    textAlign: 'center',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  successButton: {
    backgroundColor: '#34C759',
  },
  retryButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
