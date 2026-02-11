/**
 * SMSHelper.js
 * Handles SMS sending functionality for the Drive Safe app
 */

import { Linking, Platform } from 'react-native';

class SMSHelper {
    /**
     * Sends an automated SMS to the caller
     * @param {string} phoneNumber - The phone number to send SMS to
     * @param {string} customMessage - Optional custom message
     * @returns {Promise<boolean>} - Success status
     */
    async sendAutoReply(phoneNumber, customMessage = null) {
        try {
            // Remove any non-numeric characters except +
            const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');

            const defaultMessage = "I'm currently driving and will call you back when it's safe. If this is urgent, please call again.";
            const message = customMessage || defaultMessage;

            // For Android, we can use the sms: URI scheme
            // Note: This opens the SMS app with pre-filled message, user needs to press send
            // For true background SMS, we need native module (which we created above)

            if (Platform.OS === 'android') {
                const url = `sms:${cleanNumber}?body=${encodeURIComponent(message)}`;
                const canOpen = await Linking.canOpenURL(url);

                if (canOpen) {
                    await Linking.openURL(url);
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Error sending SMS:', error);
            return false;
        }
    }

    /**
     * Sends SMS using native module (background, no user interaction)
     * This requires the SMSModule native module to be properly registered
     * @param {string} phoneNumber 
     * @param {string} message 
     * @returns {Promise<boolean>}
     */
    async sendSMSBackground(phoneNumber, message = null) {
        try {
            const { NativeModules } = require('react-native');
            const { SMSModule } = NativeModules;

            if (!SMSModule) {
                return { success: false, error: 'Native SMSModule not found' };
            }

            if (!phoneNumber || phoneNumber === 'Unknown') {
                return { success: false, error: 'Invalid or hidden phone number' };
            }

            const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
            const defaultMessage = "I'm currently driving and will call you back when it's safe. If this is urgent, please call again.";
            const smsMessage = message || defaultMessage;

            await SMSModule.sendSMS(cleanNumber, smsMessage);
            return { success: true };
        } catch (error) {
            console.error('Error sending background SMS:', error);
            return { success: false, error: error.message || 'Unknown native error' };
        }
    }
}

export const smsHelper = new SMSHelper();
