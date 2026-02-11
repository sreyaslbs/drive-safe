import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, Animated, Alert, PermissionsAndroid, Platform, Vibration, TextInput } from 'react-native';
import * as Location from 'expo-location';
import { callSimulator } from './src/utils/CallLogSimulation';
import { smsHelper } from './src/utils/SMSHelper';
import CallDetectorManager from 'react-native-call-detector';

export default function App() {
  const [isDriving, setIsDriving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [activeUrgentAlert, setActiveUrgentAlert] = useState(null);
  const [callDetector, setCallDetector] = useState(null);

  // New State for Features
  const [customMessage, setCustomMessage] = useState("I'm currently driving and will call you back when it's safe. If this is urgent, please call again.");
  const [vipContacts, setVipContacts] = useState([]); // Array of strings
  const [newVip, setNewVip] = useState("");
  const [speed, setSpeed] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const locationSubscription = useRef(null);

  // GPS Speedometer Logic
  useEffect(() => {
    if (isDriving) {
      startLocationTracking();
    } else {
      stopLocationTracking();
      setSpeed(0);
    }
    return () => stopLocationTracking();
  }, [isDriving]);

  const startLocationTracking = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      addLog('Location permission denied - Speedometer inactive', 'info');
      return;
    }

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      (location) => {
        // Convert m/s to km/h (speed * 3.6)
        const currentSpeed = Math.round((location.coords.speed || 0) * 3.6);
        setSpeed(currentSpeed);
      }
    );
  };

  const stopLocationTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
  };

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
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      // READ_PHONE_NUMBERS is required for Android 11+ to get the number
      if (Platform.Version >= 30) {
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS);
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      return (
        granted[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.SEND_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  };

  const startCallDetection = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Call detection requires phone state, call log, SMS, and location permissions.');
      return;
    }

    addLog('Call Detector Active', 'status');

    const detector = new CallDetectorManager(async (event, number) => {
      // Modern Android often uses different event names or state strings
      const isIncoming = event === 'Incoming' || event === 'Ringing';

      if (isIncoming) {
        const displayNum = number || 'Hidden Number';

        // VIP CHECK: If number is in VIP list, do nothing
        if (number && vipContacts.some(v => number.includes(v.replace(/\s/g, '')))) {
          addLog(`VIP Call from ${displayNum} - Letting it ring`, 'status');
          return;
        }

        // Log the incoming call immediately
        addLog(`Incoming call from: ${displayNum}`, 'info');

        if (!number || number === 'Unknown') {
          addLog('ℹ️ Cannot reply: Number hidden', 'info');
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
            const res = await smsHelper.sendSMSBackground(number, customMessage);
            if (res.success) {
              addLog(`✅ Auto-reply sent to ${number}`, 'info');
            } else {
              addLog(`❌ SMS failed: ${res.error}`, 'urgent');
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

  const addVip = () => {
    if (newVip.length > 5 && !vipContacts.includes(newVip)) {
      setVipContacts([...vipContacts, newVip]);
      setNewVip("");
    }
  };

  const removeVip = (num) => {
    setVipContacts(vipContacts.filter(v => v !== num));
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

      {/* Speedometer Header */}
      {isDriving ? (
        <View style={styles.speedometerContainer}>
          <Text style={styles.speedValue}>{speed}</Text>
          <Text style={styles.speedUnit}>KM/H</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>DRIVE SAFE</Text>
          <Text style={styles.headerSubtitle}>Arrive Alive. Stay Focused.</Text>
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
            { backgroundColor: isDriving ? '#ef4444' : '#10b981' }
          ]}>
            <Text style={styles.toggleText}>
              {isDriving ? 'STOP' : 'START'}
            </Text>
          </Animated.View>
        </TouchableOpacity>

        {/* Settings Toggle */}
        {!isDriving && (
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => setShowSettings(!showSettings)}
          >
            <Text style={styles.settingsBtnText}>{showSettings ? 'Close Settings' : 'App Settings'}</Text>
          </TouchableOpacity>
        )}

        {showSettings && !isDriving && (
          <View style={styles.settingsCard}>
            <Text style={styles.sectionTitle}>Auto-Reply Message</Text>
            <TextInput
              style={styles.input}
              multiline
              value={customMessage}
              onChangeText={setCustomMessage}
              placeholder="Enter auto-reply text..."
              placeholderTextColor="#475569"
            />

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>VIP Contacts (No Auto-Reply)</Text>
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={newVip}
                onChangeText={setNewVip}
                keyboardType="phone-pad"
                placeholder="Phone number..."
                placeholderTextColor="#475569"
              />
              <TouchableOpacity style={styles.addBtn} onPress={addVip}>
                <Text style={styles.addBtnText}>ADD</Text>
              </TouchableOpacity>
            </View>

            {vipContacts.map(vip => (
              <View key={vip} style={styles.vipItem}>
                <Text style={styles.vipText}>{vip}</Text>
                <TouchableOpacity onPress={() => removeVip(vip)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.logsHeader}>
          <Text style={styles.logsTitle}>Trip Activity</Text>
          <TouchableOpacity onPress={() => setLogs([])}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  urgentBanner: { backgroundColor: '#ef4444', padding: 16 },
  urgentBannerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  urgentText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  urgentSubtext: { color: '#fee2e2', fontSize: 12, marginTop: 2 },
  dismissButton: { backgroundColor: 'rgba(255, 255, 255, 0.2)', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  dismissButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  header: { padding: 24, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#f8fafc', letterSpacing: 4 },
  headerSubtitle: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  speedometerContainer: { padding: 20, alignItems: 'center', backgroundColor: '#1e293b', margin: 20, borderRadius: 100, width: 200, height: 200, alignSelf: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#3b82f6' },
  speedValue: { fontSize: 80, fontWeight: '900', color: '#3b82f6' },
  speedUnit: { fontSize: 18, color: '#94a3b8', fontWeight: 'bold' },
  content: { flex: 1, padding: 24 },
  statusCard: { backgroundColor: '#1e293b', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 30 },
  statusLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  statusValue: { fontSize: 32, fontWeight: '800', marginTop: 4 },
  toggleContainer: { alignItems: 'center', marginBottom: 20 },
  toggleButton: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center', elevation: 10 },
  toggleText: { color: '#fff', fontSize: 28, fontWeight: '900' },
  settingsBtn: { backgroundColor: '#334155', padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  settingsBtnText: { color: '#f8fafc', fontWeight: '600' },
  settingsCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 16, marginBottom: 20 },
  sectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  input: { backgroundColor: '#0f172a', color: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 10, textAlignVertical: 'top' },
  addRow: { flexDirection: 'row', marginBottom: 10 },
  addBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8, marginLeft: 10 },
  addBtnText: { color: '#fff', fontWeight: 'bold' },
  vipItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  vipText: { color: '#f8fafc' },
  removeText: { color: '#ef4444', fontSize: 12 },
  logsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 10 },
  logsTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  clearText: { color: '#3b82f6', fontSize: 14 },
  logItem: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
  logItemUrgent: { backgroundColor: '#450a0a', borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  logTime: { color: '#94a3b8', fontSize: 10 },
  logAction: { color: '#f8fafc', fontSize: 13, flex: 1, marginLeft: 10 },
  emptyText: { textAlign: 'center', color: '#475569', marginTop: 10, fontStyle: 'italic' },
});
