/**
 * CallLogSimulation.js
 * Simulates incoming call detection and urgency logic for the Drive Safe app.
 */

class CallLogSimulation {
    constructor() {
        this.callHistory = {}; // Key: phoneNumber, Value: [timestamps]
        this.URGENCY_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
    }

    /**
     * Simulates an incoming call event.
     * @param {string} phoneNumber 
     * @returns {Object} result - { isUrgent: boolean, message: string }
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
            message: isUrgent
                ? `EMERGENCY: ${phoneNumber} called again within 3 mins!`
                : `Auto-replied to ${phoneNumber}`
        };
    }

    reset() {
        this.callHistory = {};
    }
}

export const callSimulator = new CallLogSimulation();
