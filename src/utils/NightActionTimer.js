/**
 * Utility for managing night action timers
 */
class NightActionTimer {
    /**
     * Start a countdown timer for a message
     * @param {Message} message - Discord message to update
     * @param {string} baseContent - Base content without timer
     * @param {number} duration - Duration in seconds
     * @param {Function} onComplete - Callback when timer completes
     * @param {string} timerKey - Unique key for this timer
     * @returns {Object} - Timer object with interval and timeout IDs
     */
    static startTimer(message, baseContent, duration, onComplete, timerKey) {
        let timeLeft = duration;

        // Update message every 1 second
        const timerInterval = setInterval(async () => {
            timeLeft -= 1;
            if (timeLeft > 0) {
                try {
                    await message.edit({
                        content: `${baseContent}\n\n⏱️ **剩餘時間：${timeLeft} 秒**`
                    });
                } catch (error) {
                    clearInterval(timerInterval);
                }
            }
        }, 1000);

        // Execute callback after duration
        const timeoutId = setTimeout(async () => {
            clearInterval(timerInterval);
            
            // Clean up timer storage
            if (global.nightActionTimers) {
                global.nightActionTimers.delete(timerKey);
            }
            
            // Execute completion callback
            if (onComplete) {
                await onComplete();
            }
        }, duration * 1000);

        // Store timer globally for cancellation
        if (!global.nightActionTimers) {
            global.nightActionTimers = new Map();
        }
        global.nightActionTimers.set(timerKey, {
            interval: timerInterval,
            timeout: timeoutId,
            message: message
        });

        return { interval: timerInterval, timeout: timeoutId };
    }

    /**
     * Cancel a timer
     * @param {string} timerKey - Unique key for the timer
     */
    static cancelTimer(timerKey) {
        if (global.nightActionTimers && global.nightActionTimers.has(timerKey)) {
            const timers = global.nightActionTimers.get(timerKey);
            if (timers.interval) clearInterval(timers.interval);
            if (timers.timeout) clearTimeout(timers.timeout);
            global.nightActionTimers.delete(timerKey);
            return true;
        }
        return false;
    }

    /**
     * Check if a timer exists
     * @param {string} timerKey - Unique key for the timer
     * @returns {boolean}
     */
    static hasTimer(timerKey) {
        return global.nightActionTimers && global.nightActionTimers.has(timerKey);
    }

    /**
     * Get timer info
     * @param {string} timerKey - Unique key for the timer
     * @returns {Object|null}
     */
    static getTimer(timerKey) {
        if (global.nightActionTimers && global.nightActionTimers.has(timerKey)) {
            return global.nightActionTimers.get(timerKey);
        }
        return null;
    }
}

module.exports = NightActionTimer;

