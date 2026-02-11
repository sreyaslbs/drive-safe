/**
 * CallLogSimulation.js
 * Simulates incoming call detection and urgency logic for the Drive Safe app.
 */

class CallLogSimulation {
    constructor() {
        this.callHistory = {}; // Key: phoneNumber, Value: [timestamps]
        this.URGENCY_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
    }

    /**
     * Handles an incoming call event.
     * @param {string} phoneNumber 
     * @returns {Object} result - { isUrgent: boolean, message: string, shouldSendSMS: boolean }
     */
    handleIncomingCall(phoneNumber) {
        const now = Date.now();
        const history = this.callHistory[phoneNumber] || [];

        // Check if there was a call from this number within the threshold
        const lastCallTime = history.length > 0 ? history[history.length - 1] : 0;
        const isUrgent = (now - lastCallTime) < this.URGENCY_THRESHOLD_MS;

        // Update history
        this.callHistory[phoneNumber] = [...history, now];

        return {
            isUrgent,
            phoneNumber,
            timestamp: now,
            shouldSendSMS: !isUrgent, // Send SMS only for first call, not urgent repeats
            message: isUrgent
                ? `URGENT: ${phoneNumber} called again within 2 mins!`
                : `Incoming call from ${phoneNumber}`
        };
    }

    reset() {
        this.callHistory = {};
    }
}

export const callSimulator = new CallLogSimulation();
