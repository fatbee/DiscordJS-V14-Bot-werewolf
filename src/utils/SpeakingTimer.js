/**
 * Speaking Timer Utility
 * Manages speaking timers with reminders and overtime handling
 */
class SpeakingTimer {
    /**
     * Start a speaking timer for a player
     * @param {Object} channel - Discord channel
     * @param {string} messageId - Game message ID
     * @param {string} speakerId - Current speaker's user ID
     * @param {Object} gameState - Game state
     * @param {Function} onTimeUp - Callback when time is up (auto-advance to next speaker)
     */
    static startTimer(channel, messageId, speakerId, gameState, onTimeUp) {
        const SPEAKING_TIME = 300; // 5 minutes in seconds
        const REMINDER_INTERVAL = 60; // Remind every 60 seconds

        let timeElapsed = 0;

        // Build speaker display
        const isTestPlayer = speakerId.startsWith('test-');
        let speakerDisplay;
        if (isTestPlayer) {
            const testNumber = speakerId.split('-')[2];
            speakerDisplay = `測試玩家 ${testNumber}`;
        } else {
            speakerDisplay = `<@${speakerId}>`;
        }

        // Create timer interval (check every 1 second for accuracy)
        const timerInterval = setInterval(async () => {
            // Check if timer should be cancelled (e.g., speaker finished early)
            if (!global.speakingTimers || !global.speakingTimers.has(messageId)) {
                clearInterval(timerInterval);
                return;
            }

            // Check if timer is paused
            const timerInfo = global.speakingTimers.get(messageId);
            if (timerInfo.paused) {
                return; // Don't increment time while paused
            }

            timeElapsed++;

            // Normal time reminders (every 60 seconds)
            if (timeElapsed % REMINDER_INTERVAL === 0 && timeElapsed < SPEAKING_TIME) {
                const timeRemaining = SPEAKING_TIME - timeElapsed;
                const minutesRemaining = Math.floor(timeRemaining / 60);

                await channel.send({
                    content: `⏱️ ${speakerDisplay} 還有 **${minutesRemaining} 分鐘**發言時間`
                });
            }

            // Time's up - auto-advance to next speaker
            if (timeElapsed === SPEAKING_TIME) {
                clearInterval(timerInterval);
                global.speakingTimers.delete(messageId);

                await channel.send({
                    content: `⏱️ ${speakerDisplay} **發言時間到！**\n\n自動進入下一位玩家...`
                });

                // Call the callback to advance to next speaker
                if (onTimeUp) {
                    await onTimeUp();
                }
            }
        }, 1000); // Check every 1 second

        // Store timer for cancellation
        if (!global.speakingTimers) {
            global.speakingTimers = new Map();
        }

        global.speakingTimers.set(messageId, {
            interval: timerInterval,
            speakerId: speakerId,
            startTime: Date.now(),
            paused: false,
            pausedAt: null,
            totalPausedTime: 0
        });
    }

    /**
     * Cancel the current speaking timer
     * @param {string} messageId - Game message ID
     */
    static cancelTimer(messageId) {
        if (global.speakingTimers && global.speakingTimers.has(messageId)) {
            const timer = global.speakingTimers.get(messageId);
            clearInterval(timer.interval);
            global.speakingTimers.delete(messageId);
        }
    }

    /**
     * Pause the current speaking timer
     * @param {string} messageId - Game message ID
     * @returns {boolean} True if paused successfully
     */
    static pauseTimer(messageId) {
        if (global.speakingTimers && global.speakingTimers.has(messageId)) {
            const timer = global.speakingTimers.get(messageId);
            if (!timer.paused) {
                timer.paused = true;
                timer.pausedAt = Date.now();
                return true;
            }
        }
        return false;
    }

    /**
     * Resume the current speaking timer
     * @param {string} messageId - Game message ID
     * @returns {boolean} True if resumed successfully
     */
    static resumeTimer(messageId) {
        if (global.speakingTimers && global.speakingTimers.has(messageId)) {
            const timer = global.speakingTimers.get(messageId);
            if (timer.paused && timer.pausedAt) {
                const pauseDuration = Date.now() - timer.pausedAt;
                timer.totalPausedTime += pauseDuration;
                timer.paused = false;
                timer.pausedAt = null;
                return true;
            }
        }
        return false;
    }

    /**
     * Check if timer is paused
     * @param {string} messageId - Game message ID
     * @returns {boolean} True if paused
     */
    static isPaused(messageId) {
        if (global.speakingTimers && global.speakingTimers.has(messageId)) {
            const timer = global.speakingTimers.get(messageId);
            return timer.paused || false;
        }
        return false;
    }

    /**
     * Get current timer info
     * @param {string} messageId - Game message ID
     * @returns {Object|null} Timer info or null if no timer exists
     */
    static getTimerInfo(messageId) {
        if (global.speakingTimers && global.speakingTimers.has(messageId)) {
            return global.speakingTimers.get(messageId);
        }
        return null;
    }
}

module.exports = SpeakingTimer;

