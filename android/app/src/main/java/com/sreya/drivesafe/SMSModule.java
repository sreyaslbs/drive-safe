package com.sreya.drivesafe;

import android.telephony.SmsManager;
import android.telecom.TelecomManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.provider.Settings;
import android.text.TextUtils;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

public class SMSModule extends ReactContextBaseJavaModule {
    
    public SMSModule(ReactApplicationContext reactContext) {
        super(reactContext);
        registerWhatsAppReceiver();
    }

    private void registerWhatsAppReceiver() {
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if ("com.sreya.drivesafe.WHATSAPP_CALL".equals(intent.getAction())) {
                    String caller = intent.getStringExtra("caller");
                    sendEvent("onWhatsAppCallDetected", caller);
                }
            }
        };
        IntentFilter filter = new IntentFilter("com.sreya.drivesafe.WHATSAPP_CALL");
        getReactApplicationContext().registerReceiver(receiver, filter);
    }

    private void sendEvent(String eventName, String data) {
        WritableMap params = Arguments.createMap();
        params.putString("caller", data);
        getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }

    @Override
    public String getName() {
        return "SMSModule";
    }

    @ReactMethod
    public void sendSMS(String phoneNumber, String message, Promise promise) {
        if (phoneNumber == null || phoneNumber.isEmpty()) {
            promise.reject("SMS_INVALID_NUMBER", "Phone number is empty");
            return;
        }
        if (message == null || message.isEmpty()) {
            promise.reject("SMS_INVALID_MESSAGE", "Message is empty");
            return;
        }

        try {
            SmsManager smsManager;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                smsManager = getReactApplicationContext().getSystemService(SmsManager.class);
            } else {
                smsManager = SmsManager.getDefault();
            }

            if (smsManager == null) {
                promise.reject("SMS_MANAGER_NULL", "Could not obtain SmsManager");
                return;
            }

            smsManager.sendTextMessage(phoneNumber, null, message, null, null);
            promise.resolve("SMS sent successfully");
        } catch (Exception e) {
            promise.reject("SMS_SEND_FAILED", e.getMessage());
        }
    }

    @ReactMethod
    public void declineCall(Promise promise) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                TelecomManager telecomManager = (TelecomManager) getReactApplicationContext().getSystemService(Context.TELECOM_SERVICE);
                if (telecomManager != null) {
                    boolean success = telecomManager.endCall();
                    if (success) {
                        promise.resolve("Call declined");
                    } else {
                        promise.reject("DECLINE_FAILED", "Could not end call via TelecomManager");
                    }
                } else {
                    promise.reject("TELECOM_MANAGER_NULL", "TelecomManager unavailable");
                }
            } else {
                promise.reject("API_LOW", "Decline call not supported on this Android version");
            }
        } catch (SecurityException e) {
            promise.reject("SECURITY_ERROR", "Missing ANSWER_PHONE_CALLS permission: " + e.getMessage());
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void acceptCall(Promise promise) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                TelecomManager telecomManager = (TelecomManager) getReactApplicationContext().getSystemService(Context.TELECOM_SERVICE);
                if (telecomManager != null) {
                    telecomManager.acceptRingingCall();
                    promise.resolve("Call accepted");
                } else {
                    promise.reject("TELECOM_MANAGER_NULL", "TelecomManager unavailable");
                }
            } else {
                promise.reject("API_LOW", "Accept call not supported on this Android version");
            }
        } catch (SecurityException e) {
            promise.reject("SECURITY_ERROR", "Missing ANSWER_PHONE_CALLS permission: " + e.getMessage());
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isNotificationListenerEnabled(Promise promise) {
        String packageName = getReactApplicationContext().getPackageName();
        String flat = Settings.Secure.getString(getReactApplicationContext().getContentResolver(), "enabled_notification_listeners");
        if (!TextUtils.isEmpty(flat)) {
            String[] names = flat.split(":");
            for (String name : names) {
                if (name.contains(packageName)) {
                    promise.resolve(true);
                    return;
                }
            }
        }
        promise.resolve(false);
    }

    @ReactMethod
    public void requestNotificationListenerPermission() {
        Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
    }
}
