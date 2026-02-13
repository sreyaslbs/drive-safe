package com.sreya.drivesafe;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

public class NotificationService extends NotificationListenerService {

    private static final String WHATSAPP_PACKAGE = "com.whatsapp";
    private static final String TAG = "DriveSafeNotify";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();
        if (!WHATSAPP_PACKAGE.equals(packageName)) {
            return;
        }

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        // Detect if it's a WhatsApp Call
        // WhatsApp calls usually have CATEGORY_CALL or specific strings in extras
        boolean isCall = false;
        
        // Android 8.0+ uses categories
        if (Notification.CATEGORY_CALL.equals(notification.category)) {
            isCall = true;
        }

        // Check extras for "call" related strings (fallback for some versions)
        Bundle extras = notification.extras;
        if (!isCall && extras != null) {
            String title = extras.getString(Notification.EXTRA_TITLE, "");
            String text = extras.getString(Notification.EXTRA_TEXT, "");
            
            if (title.toLowerCase().contains("whatsapp call") || 
                text.toLowerCase().contains("incoming voice call") ||
                text.toLowerCase().contains("incoming video call")) {
                isCall = true;
            }
        }

        if (isCall && extras != null) {
            String callerName = extras.getString(Notification.EXTRA_TITLE, "WhatsApp Caller");
            Log.d(TAG, "Detected WhatsApp Call from: " + callerName);
            
            // Broadcast to the rest of the app
            Intent intent = new Intent("com.sreya.drivesafe.WHATSAPP_CALL");
            intent.putExtra("caller", callerName);
            sendBroadcast(intent);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Handle if needed
    }
}
