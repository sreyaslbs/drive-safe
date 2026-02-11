import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, Animated, Alert, PermissionsAndroid, Platform, Vibration } from 'react-native';
import { callSimulator } from './src/utils/CallLogSimulation';
import { smsHelper } from './src/utils/SMSHelper';
import CallDetectorManager from 'react-native-call-detector';

export default function App() {
  const [isDriving, setIsDriving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [activeUrgentAlert, setActiveUrgentAlert] = useState(null);
  const [callDetector, setCallDetector] = useState(null);

  // Real Call Detection Logic
  useEffect(() => {
    if (isDriving && Platform.OS === 'android') {
      startCallDetection();
    } else {
      stopCallDetection();
    }
    return () => stopCallDetection(); // Cleanup on unmount
  }, [isDriving]);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
      ];

      // READ_PHONE_NUMBERS is required for Android 11+ to get the number
      if (Platform.Version >= 30) {
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS);
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      return (
        granted[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.SEND_SMS] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  };

  const startCallDetection = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Call detection requires phone state, call log, and SMS permissions.');
      return;
    }

    addLog('Call Detector Active', 'status');

    const detector = new CallDetectorManager(async (event, number) => {
      // Modern Android often uses different event names or state strings
      const isIncoming = event === 'Incoming' || event === 'Ringing';

      if (isIncoming) {
        // Log the incoming call immediately
        const displayNum = number || 'Hidden Number';
        addLog(`Incoming call from: ${displayNum}`, 'info');

        if (!number || number === 'Unknown') {
          addLog('ℹ️ Cannot send SMS: Number is hidden or permission missing', 'info');
        }

        const result = callSimulator.handleIncomingCall(number || 'Unknown');

        if (result.isUrgent) {
          // Urgent call - vibrate and show alert
          addLog('⚠️ URGENT CALL ALERT', 'urgent');
          setActiveUrgentAlert(number || 'Unknown');
          Vibration.vibrate([0, 500, 200, 500, 200, 1000]);
        } else if (result.shouldSendSMS && number && number !== 'Unknown') {
          // First call - send background SMS
          try {
            addLog(`Sending auto-reply to ${number}...`, 'info');
            const result = await smsHelper.sendSMSBackground(number);
            if (result.success) {
              addLog(`✅ Auto-reply SMS sent to ${number}`, 'info');
            } else {
              addLog(`❌ SMS failed: ${result.error}`, 'urgent');
            }
          } catch (error) {
            addLog(`❌ SMS Error: ${error.message}`, 'urgent');
          }
        }
      }
    },
      true, // readPhoneNumber
      () => {
        addLog('Permission denied by user', 'urgent');
      },
      { title: 'Phone State Permission', message: 'This app needs access to your phone state to detect calls while driving.' }
    );
    setCallDetector(detector);
  };

  const stopCallDetection = () => {
    if (callDetector) {
      callDetector.dispose();
      setCallDetector(null);
    }
  };

  useEffect(() => {
    if (isDriving) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isDriving]);

  const toggleDrivingMode = () => {
    setIsDriving(!isDriving);
    const newStatus = !isDriving;
    addLog(newStatus ? 'Started Driving' : 'Safely Stopped', 'status');
    if (!newStatus) setActiveUrgentAlert(null); // Clear alerts on stop
  };

  const addLog = (action, type = 'info') => {
    const newLog = {
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString(),
      action,
      type
    };
    setLogs(prev => [newLog, ...prev]);
  };

  const simulateIncomingCall = (phone = '9876543210') => {
    if (!isDriving) {
      Alert.alert('Info', 'Simulation only works in Driving Mode');
      return;
    }

    const result = callSimulator.handleIncomingCall(phone);
    addLog(result.message, result.isUrgent ? 'urgent' : 'info');

    if (result.isUrgent) {
      setActiveUrgentAlert(phone);
      // Vibrate for urgent calls in simulation too
      Vibration.vibrate([0, 500, 200, 500, 200, 1000]);
      addLog('⚠️ URGENT CALL ALERT - Please pull over safely', 'urgent');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {activeUrgentAlert && (
        <View style={styles.urgentBanner}>
          <View style={styles.urgentBannerContent}>
            <View>
              <Text style={styles.urgentText}>⚠️ URGENT CALL FROM {activeUrgentAlert}</Text>
              <Text style={styles.urgentSubtext}>Safely pull over to respond.</Text>
            </View>
            <TouchableOpacity
              onPress={() => setActiveUrgentAlert(null)}
              style={styles.dismissButton}
            >
              <Text style={styles.dismissButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>DRIVE SAFE</Text>
        <Text style={styles.headerSubtitle}>Arrive Alive. Stay Focused.</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Current Status</Text>
          <Text style={[styles.statusValue, { color: isDriving ? '#ef4444' : '#10b981' }]}>
            {isDriving ? 'DRIVING' : 'PARKED'}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={toggleDrivingMode}
          style={styles.toggleContainer}
        >
          <Animated.View style={[
            styles.toggleButton,
            { transform: [{ scale: pulseAnim }], backgroundColor: isDriving ? '#ef4444' : '#10b981' }
          ]}>
            <Text style={styles.toggleText}>
              {isDriving ? 'STOP' : 'START'}
            </Text>
          </Animated.View>
        </TouchableOpacity>

        {isDriving && (
          <TouchableOpacity
            style={styles.simulateBtn}
            onPress={() => simulateIncomingCall()}
          >
            <Text style={styles.simulateBtnText}>Simulate Call</Text>
          </TouchableOpacity>
        )}

        <View style={styles.logsHeader}>
          <Text style={styles.logsTitle}>Trip Activity</Text>
          <TouchableOpacity onPress={() => setLogs([])}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.logsList} showsVerticalScrollIndicator={false}>
          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No activity recorded yet.</Text>
          ) : (
            logs.map(log => (
              <View key={log.id} style={[
                styles.logItem,
                log.type === 'urgent' && styles.logItemUrgent
              ]}>
                <Text style={styles.logTime}>{log.time}</Text>
                <Text style={[
                  styles.logAction,
                  log.type === 'urgent' && { color: '#fecaca' }
                ]}>{log.action}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  urgentBanner: {
    backgroundColor: '#ef4444',
    padding: 16,
  },
  urgentBannerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  urgentText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  urgentSubtext: {
    color: '#fee2e2',
    fontSize: 12,
    marginTop: 2,
  },
  dismissButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  dismissButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  header: {
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  statusCard: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 40,
  },
  statusLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusValue: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
  },
  toggleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  toggleButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  toggleText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
  },
  simulateBtn: {
    backgroundColor: '#334155',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
  },
  simulateBtnText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  clearText: {
    color: '#3b82f6',
    fontSize: 14,
  },
  logsList: {
    flex: 1,
  },
  logItem: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logItemUrgent: {
    backgroundColor: '#450a0a',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  logTime: {
    color: '#94a3b8',
    fontSize: 12,
  },
  logAction: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginLeft: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#475569',
    marginTop: 20,
    fontStyle: 'italic',
  },
});
