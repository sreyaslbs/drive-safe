import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, Animated, Alert, PermissionsAndroid, Platform, Vibration, TextInput, LayoutAnimation, Switch } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callSimulator } from './src/utils/CallLogSimulation';
import { smsHelper } from './src/utils/SMSHelper';
import CallDetectorManager from 'react-native-call-detector';

// Configure notifications for background alerts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldVibrate: true,
  }),
});

export default function App() {
  const [isDriving, setIsDriving] = useState(false);
  const [logs, setLogs] = useState([]); // Concise logs for current session
  const [activeUrgentAlert, setActiveUrgentAlert] = useState(null);
  const [callDetector, setCallDetector] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'history', 'settings'

  // Feature State
  const [customMessage, setCustomMessage] = useState("I'm currently driving and will call you back when it's safe. If this is urgent, please call again.");
  const [vipContacts, setVipContacts] = useState([]);
  const [newVip, setNewVip] = useState("");
  const [autoDecline, setAutoDecline] = useState(false);
  const [rideHistory, setRideHistory] = useState([]);
  const [currentTripData, setCurrentTripData] = useState(null);

  // Refs for deduplication
  const lastCallTime = useRef(0);
  const lastCallNum = useRef(null);
  const unknownCallTimeout = useRef(null);

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    loadPersistentData();
    requestNotificationPermissions();
  }, []);

  const loadPersistentData = async () => {
    try {
      const history = await AsyncStorage.getItem('ride_history');
      const settings = await AsyncStorage.getItem('app_settings');
      if (history) setRideHistory(JSON.parse(history));
      if (settings) {
        const { msg, vip, decline } = JSON.parse(settings);
        if (msg) setCustomMessage(msg);
        if (vip) setVipContacts(vip);
        if (decline !== undefined) setAutoDecline(decline);
      }
    } catch (e) {
      console.error('Failed to load data', e);
    }
  };

  const saveSettings = async (msg, vip, decline) => {
    try {
      await AsyncStorage.setItem('app_settings', JSON.stringify({ msg, vip, decline }));
    } catch (e) { console.error(e); }
  };

  const requestNotificationPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted' && Platform.OS !== 'web') {
      addLog('Notification access restricted', 'info');
    }
  };

  useEffect(() => {
    if (isDriving) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();

      if (Platform.OS === 'android') startCallDetection();
    } else {
      pulseAnim.setValue(1);
      stopCallDetection();
      if (unknownCallTimeout.current) clearTimeout(unknownCallTimeout.current);
    }
    return () => stopCallDetection();
  }, [isDriving]);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        PermissionsAndroid.PERMISSIONS.ANSWER_PHONE_CALLS,
      ];
      if (Platform.Version >= 33) permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (Platform.Version >= 30) permissions.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS);

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
      Alert.alert('Permission Required', 'Enable Phone, Call logs, and SMS permissions to protect your drive.');
      setIsDriving(false);
      return;
    }

    const detector = new CallDetectorManager(async (event, number) => {
      if (event === 'Incoming' || event === 'Ringing') {
        const now = Date.now();
        const displayNum = number || 'Unknown Number';

        // DEDUPLICATION: If we got a real number within 2 seconds of an unknown number,
        // or just a duplicate event for the SAME number, ignore it.
        if (now - lastCallTime.current < 2000) {
          if (lastCallNum.current === displayNum) return; // Exact duplicate
          if (lastCallNum.current && lastCallNum.current !== 'Unknown Number' && displayNum === 'Unknown Number') return; // New one is worse than old one
        }

        // Handle 'Unknown Number' Delay Fix
        if (!number || number === 'Unknown' || number === 'Unknown Number') {
          if (unknownCallTimeout.current) clearTimeout(unknownCallTimeout.current);
          unknownCallTimeout.current = setTimeout(() => {
            processIncomingCall('Unknown Number');
          }, 800); // Wait bit to see if real number arrives
          return;
        }

        // Real Number arrived! Clear any pending unknown timeout
        if (unknownCallTimeout.current) {
          clearTimeout(unknownCallTimeout.current);
          unknownCallTimeout.current = null;
        }

        processIncomingCall(number);
      }
    }, true);
    setCallDetector(detector);
  };

  const processIncomingCall = async (number) => {
    lastCallTime.current = Date.now();
    lastCallNum.current = number;

    // VIP CHECK
    if (number !== 'Unknown Number' && vipContacts.some(v => number.includes(v.replace(/\s/g, '')))) {
      addLog(`VIP Call from ${number} - Ignored`, 'status');
      updateTripCalls(number, 'VIP Ignored');
      return;
    }

    addLog(`Received Call from ${number}`, 'info');

    if (autoDecline) {
      addLog(`Declined Call from ${number}`, 'status');
      smsHelper.declineCallBackground();
    }

    const result = callSimulator.handleIncomingCall(number || 'Unknown');

    if (result.isUrgent) {
      addLog(`Seems Urgent Call from ${number}`, 'urgent');
      setActiveUrgentAlert(number);
      showUrgentNotification(number);
      updateTripCalls(number, 'Urgent Alert');
      Vibration.vibrate([0, 500, 200, 500, 200, 1000]);
    } else if (result.shouldSendSMS && number !== 'Unknown Number') {
      try {
        const res = await smsHelper.sendSMSBackground(number, customMessage);
        if (res.success) {
          addLog(`Auto SMS sent to ${number}`, 'info');
          updateTripCalls(number, autoDecline ? 'Declined & Replied' : 'Replied');
        }
      } catch (e) { }
    }
  };

  const updateTripCalls = (number, status) => {
    setCurrentTripData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        calls: [...prev.calls, { number, status, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]
      };
    });
  };

  const showUrgentNotification = async (number) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🚨 Urgent Caller",
        body: `${number} is calling persistently. Please pull over.`,
        data: { number },
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  };

  const stopCallDetection = () => {
    if (callDetector) {
      callDetector.dispose();
      setCallDetector(null);
    }
  };

  const toggleDrivingMode = async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const becomingActive = !isDriving;

    if (becomingActive) {
      setLogs([]); // Clear previous logs
      setCurrentTripData({
        id: Date.now().toString(),
        date: new Date().toLocaleDateString(),
        startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        calls: []
      });
      setIsDriving(true);
      addLog('Ride Started', 'status');
    } else {
      addLog('Ride Ended', 'status');
      setIsDriving(false);
      // Save to History
      if (currentTripData) {
        const completedTrip = {
          ...currentTripData,
          endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        const newHistory = [completedTrip, ...rideHistory].slice(0, 20);
        setRideHistory(newHistory);
        await AsyncStorage.setItem('ride_history', JSON.stringify(newHistory));
      }
      setActiveUrgentAlert(null);
      // Auto-clear logs after stopping is handled by the becomingActive logic above next time we start
      // But user wanted "After every ride is stopped, logs could be auto cleared"
      // So let's clear them after a short delay so they can see "Ride Ended"
      setTimeout(() => {
        if (!becomingActive) setLogs([]);
      }, 3000);
    }
  };

  const addLog = (action, type = 'info') => {
    const newLog = {
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action,
      type
    };
    setLogs(prev => [newLog, ...prev]);
  };

  const addVip = () => {
    if (newVip.length > 5 && !vipContacts.includes(newVip)) {
      const updated = [...vipContacts, newVip];
      setVipContacts(updated);
      saveSettings(customMessage, updated, autoDecline);
      setNewVip("");
    }
  };

  const renderHome = () => (
    <View style={styles.tabContent}>
      <View style={styles.hero}>
        <TouchableOpacity activeOpacity={0.9} onPress={toggleDrivingMode}>
          <Animated.View style={[
            styles.mainButton,
            { transform: [{ scale: pulseAnim }], borderColor: isDriving ? '#f43f5e' : '#10b981' }
          ]}>
            <View style={[styles.buttonInner, { backgroundColor: isDriving ? '#f43f5e15' : '#10b98115' }]}>
              <Text style={[styles.buttonText, { color: isDriving ? '#f43f5e' : '#10b981' }]}>
                {isDriving ? 'STOP' : 'START'}
              </Text>
            </View>
          </Animated.View>
        </TouchableOpacity>
        <Text style={[styles.statusHint, { color: isDriving ? '#f43f5e' : '#94a3b8' }]}>
          {isDriving ? 'MONITORING CALLS' : 'SYSTEM STANDBY'}
        </Text>
      </View>

      <View style={styles.logSection}>
        {logs.length > 0 && (
          <View style={styles.logFeed}>
            {logs.map(log => (
              <View key={log.id} style={styles.minimalLog}>
                <Text style={[styles.logActionText, log.type === 'urgent' && styles.logUrgentText]}>
                  • {log.action}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  const renderHistory = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.tabTitle}>Ride History</Text>
      {rideHistory.length === 0 ? (
        <Text style={styles.emptyText}>No history available.</Text>
      ) : (
        rideHistory.map(ride => (
          <View key={ride.id} style={styles.historyCard}>
            <View style={styles.historyTop}>
              <Text style={styles.historyDate}>{ride.date}</Text>
              <Text style={styles.historyDuration}>{ride.startTime} - {ride.endTime}</Text>
            </View>
            {ride.calls.map((call, idx) => (
              <View key={idx} style={styles.historyCallRow}>
                <Text style={styles.historyCallNum}>{call.number}</Text>
                <Text style={[styles.historyCallStatus, { color: call.status.includes('Declined') ? '#f43f5e' : '#3b82f6' }]}>{call.status}</Text>
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderSettings = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.tabTitle}>Settings</Text>

      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Auto-Decline Calls</Text>
            <Text style={styles.settingSub}>Hang up the first call automatically</Text>
          </View>
          <Switch
            value={autoDecline}
            onValueChange={(val) => { setAutoDecline(val); saveSettings(customMessage, vipContacts, val); }}
            trackColor={{ false: '#334155', true: '#3b82f6' }}
            thumbColor="#f8fafc"
          />
        </View>

        <View style={styles.spacer} />

        <Text style={styles.inputLabel}>AUTO-REPLY TEXT</Text>
        <TextInput
          style={styles.textInput}
          multiline
          value={customMessage}
          onChangeText={(val) => { setCustomMessage(val); saveSettings(val, vipContacts, autoDecline); }}
        />

        <View style={styles.spacer} />

        <Text style={styles.inputLabel}>VIP WHITELIST</Text>
        <View style={styles.vipInputRow}>
          <TextInput
            style={styles.vipInput}
            value={newVip}
            onChangeText={setNewVip}
            placeholder="Phone number..."
            placeholderTextColor="#64748b"
            keyboardType="phone-pad"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addVip}>
            <Text style={styles.addBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.vipList}>
          {vipContacts.map(vip => (
            <View key={vip} style={styles.vipItem}>
              <Text style={styles.vipNumText}>{vip}</Text>
              <TouchableOpacity onPress={() => {
                const updated = vipContacts.filter(v => v !== vip);
                setVipContacts(updated);
                saveSettings(customMessage, updated, autoDecline);
              }}>
                <Text style={styles.removeVip}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {activeUrgentAlert && (
        <View style={styles.urgentAlert}>
          <Text style={styles.urgentAlertText}>URGENT CALL FROM {activeUrgentAlert}</Text>
          <TouchableOpacity onPress={() => setActiveUrgentAlert(null)}>
            <Text style={styles.dismissText}>DISMISS</Text>
          </TouchableOpacity>
        </View>
      )}

      <Animated.View style={[styles.main, { opacity: fadeAnim }]}>
        {activeTab === 'home' && renderHome()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'settings' && renderSettings()}

        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => setActiveTab('home')} style={styles.navItem}>
            <Text style={[styles.navIcon, activeTab === 'home' && styles.activeNav]}>DRIVE</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveTab('history')} style={styles.navItem}>
            <Text style={[styles.navIcon, activeTab === 'history' && styles.activeNav]}>HISTORY</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveTab('settings')} style={styles.navItem}>
            <Text style={[styles.navIcon, activeTab === 'settings' && styles.activeNav]}>CONFIG</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  main: { flex: 1 },
  tabContent: { flex: 1, padding: 24, paddingBottom: 100 },
  tabTitle: { fontSize: 28, fontWeight: '900', color: '#f8fafc', marginBottom: 24 },

  // Home
  hero: { alignItems: 'center', marginTop: 60, marginBottom: 40 },
  mainButton: { width: 180, height: 180, borderRadius: 90, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  statusHint: { marginTop: 20, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  logSection: { flex: 1 },
  minimalLog: { marginBottom: 12 },
  logActionText: { color: '#94a3b8', fontSize: 15, fontWeight: '500' },
  logUrgentText: { color: '#f43f5e', fontWeight: 'bold' },

  // History
  historyCard: { backgroundColor: '#1e293b60', padding: 20, borderRadius: 24, marginBottom: 16, borderTopWidth: 1, borderTopColor: '#ffffff08' },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#ffffff05', paddingBottom: 10 },
  historyDate: { color: '#f8fafc', fontWeight: 'bold' },
  historyDuration: { color: '#64748b', fontSize: 11 },
  historyCallRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  historyCallNum: { color: '#cbd5e1', fontSize: 13 },
  historyCallStatus: { fontSize: 11, fontWeight: 'bold' },

  // Settings
  settingsCard: { backgroundColor: '#1e293b60', padding: 24, borderRadius: 24 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold' },
  settingSub: { color: '#64748b', fontSize: 11, marginTop: 2 },
  spacer: { height: 30 },
  inputLabel: { color: '#64748b', fontSize: 10, fontWeight: '900', marginBottom: 12, letterSpacing: 1 },
  textInput: { backgroundColor: '#0f172a', color: '#f8fafc', padding: 16, borderRadius: 16, fontSize: 14, minHeight: 100, textAlignVertical: 'top' },
  vipInputRow: { flexDirection: 'row', gap: 10 },
  vipInput: { flex: 1, backgroundColor: '#0f172a', color: '#f8fafc', padding: 14, borderRadius: 12 },
  addBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: 'bold' },
  vipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  vipItem: { backgroundColor: '#334155', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  vipNumText: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  removeVip: { color: '#94a3b8', fontSize: 14 },

  // Shared
  navBar: { position: 'absolute', bottom: 30, left: 30, right: 30, height: 70, backgroundColor: '#1e293b', borderRadius: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', elevation: 10 },
  navItem: { padding: 10 },
  navIcon: { color: '#64748b', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  activeNav: { color: '#3b82f6' },
  urgentAlert: { backgroundColor: '#f43f5e', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  urgentAlertText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  dismissText: { color: '#fff', fontSize: 11, fontWeight: '900', opacity: 0.8 },
  emptyText: { color: '#475569', textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
});
