# Drive Safe App - Call Detection Fix

## Problem
The app was showing "Call Detector Active" but not actually detecting incoming calls.

## Root Causes Identified

### 1. **BroadcastReceiver Never Registered** (CRITICAL)
The `react-native-call-detector` library had a fatal bug in `CallDetectorModule.java`:
- The `startListener()` method created a `CallReceiver` object but **never registered it** with Android's system
- Without registration, the receiver cannot listen to phone state changes
- This is like creating a phone but never plugging it in

### 2. **Wrong Event Extraction**
In the `onReceive()` method:
```java
// WRONG - This just passes the constant string "state" 
this.detectorModule.notifyCallStateChange(TelephonyManager.EXTRA_STATE);

// CORRECT - Extract actual state value from intent
String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
String phoneNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
```

### 3. **Incorrect Event Emission**
The original code emitted "Disconnected" for ALL call states:
```java
// WRONG - Everything becomes "Disconnected"
if (state.equals(TelephonyManager.EXTRA_STATE_IDLE) || state.equals(TelephonyManager.EXTRA_STATE_OFFHOOK)) { 
    emitter.emit("Disconnected", null); 
}
if (state.equals(TelephonyManager.EXTRA_STATE_RINGING)) emitter.emit("Disconnected", null);
```

### 4. **Missing Permission**
The `READ_CALL_LOG` permission was declared in `app.json` but missing from `AndroidManifest.xml`

## Fixes Applied

### 1. Fixed CallDetectorModule.java
- ✅ Added `IntentFilter` import
- ✅ Registered BroadcastReceiver with `ACTION_PHONE_STATE_CHANGED` action
- ✅ Extract state and phone number from intent extras
- ✅ Emit correct events:
  - `EXTRA_STATE_RINGING` → "Incoming" event
  - `EXTRA_STATE_OFFHOOK` → "Offhook" event  
  - `EXTRA_STATE_IDLE` → "Disconnected" event
- ✅ Added `stopListener()` method to properly unregister receiver

### 2. Updated AndroidManifest.xml
- ✅ Added `READ_CALL_LOG` permission

### 3. Created Proper Patch
- ✅ Generated `patches/react-native-call-detector+0.2.0.patch`
- ✅ Patch will auto-apply on `npm install` via `postinstall` script

## How It Works Now

1. **User presses START** → `toggleDrivingMode()` sets `isDriving = true`
2. **useEffect triggers** → Calls `startCallDetection()`
3. **Permissions requested** → `READ_PHONE_STATE`, `READ_CALL_LOG`, `SEND_SMS`
4. **CallDetectorManager created** → Calls native `startListener()`
5. **BroadcastReceiver registered** → Now listening for `ACTION_PHONE_STATE_CHANGED`
6. **Incoming call arrives** → Android broadcasts `ACTION_PHONE_STATE_CHANGED`
7. **onReceive() triggered** → Extracts state and phone number
8. **Event emitted** → "Incoming" event with phone number
9. **App.js receives event** → Processes through `callSimulator.handleIncomingCall()`
10. **Log displayed** → Shows call detection in activity log

## Testing Instructions

1. Install the new APK on your phone
2. Grant all permissions when prompted (Phone, Call Log, SMS)
3. Press START to enable driving mode
4. Have someone call your phone
5. You should see:
   - "Detector: Incoming (phone number)" in the activity log
   - First call: "Incoming call from [number]"
   - Second call within 5 minutes: "⚠️ URGENT CALL" banner

## Key Changes in Code

**Before:**
```java
public void startListener() {
    if (this.callReceiver == null) {
        this.callReceiver = new CallReceiver(this);
        // NOTHING ELSE - receiver never registered!
    }
}
```

**After:**
```java
public void startListener() {
    ReactApplicationContext context = getReactApplicationContext();
    
    if (this.callReceiver == null) {
        this.callReceiver = new CallReceiver(this);
        IntentFilter filter = new IntentFilter();
        filter.addAction(TelephonyManager.ACTION_PHONE_STATE_CHANGED);
        context.registerReceiver(this.callReceiver, filter);  // NOW IT WORKS!
    }
}
```

## Build Command
```bash
eas build --profile preview --platform android
```

The new APK will have proper call detection functionality.
