import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, Animated } from 'react-native';
import { ExpoStatusBar } from 'expo-status-bar';

export default function App() {
  const [isDriving, setIsDriving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [pulseAnim] = useState(new Animated.Value(1));

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
    const newLog = {
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString(),
      action: !isDriving ? 'Started Driving' : 'Safely Stopped',
      type: 'status'
    };
    setLogs([newLog, ...logs]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
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

        <View style={styles.logsHeader}>
          <Text style={styles.logsTitle}>Activity Log</Text>
          <TouchableOpacity onPress={() => setLogs([])}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.logsList} showsVerticalScrollIndicator={false}>
          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No activity recorded yet.</Text>
          ) : (
            logs.map(log => (
              <View key={log.id} style={styles.logItem}>
                <Text style={styles.logTime}>{log.time}</Text>
                <Text style={styles.logAction}>{log.action}</Text>
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
    marginBottom: 40,
  },
  toggleButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
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
    fontSize: 36,
    fontWeight: '900',
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: space - between,
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
  logTime: {
    color: '#94a3b8',
    fontSize: 12,
  },
  logAction: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    color: '#475569',
    marginTop: 20,
    fontStyle: 'italic',
  },
});
