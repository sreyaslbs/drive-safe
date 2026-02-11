package com.sreya.drivesafe;

import android.telephony.SmsManager;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

public class SMSModule extends ReactContextBaseJavaModule {
    
    public SMSModule(ReactApplicationContext reactContext) {
        super(reactContext);
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
}
