const client = require('../index');

/**
 * Utility class for managing werewolf game state with database persistence
 */
class GameState {
    /**
     * Get players for a game message
     * @param {string} messageId 
     * @returns {Set<string>}
     */
    static getPlayers(messageId) {
        if (!global.gamePlayers) {
            global.gamePlayers = new Map();
        }
        
        if (!global.gamePlayers.has(messageId)) {
            // Try to load from database
            const dbKey = `game-players-${messageId}`;
            if (client.database.has(dbKey)) {
                const playersArray = client.database.get(dbKey);
                global.gamePlayers.set(messageId, new Set(playersArray));
            } else {
                global.gamePlayers.set(messageId, new Set());
            }
        }
        
        return global.gamePlayers.get(messageId);
    }

    /**
     * Save players to database
     * @param {string} messageId 
     * @param {Set<string>} players 
     */
    static savePlayers(messageId, players) {
        if (!global.gamePlayers) {
            global.gamePlayers = new Map();
        }
        
        global.gamePlayers.set(messageId, players);
        
        // Save to database
        const dbKey = `game-players-${messageId}`;
        client.database.set(dbKey, Array.from(players));
    }

    /**
     * Get character selections for a game message
     * @param {string} messageId 
     * @returns {Object}
     */
    static getCharacterSelections(messageId) {
        if (!global.characterSelections) {
            global.characterSelections = new Map();
        }
        
        if (!global.characterSelections.has(messageId)) {
            // Try to load from database
            const dbKey = `game-characters-${messageId}`;
            if (client.database.has(dbKey)) {
                const selections = client.database.get(dbKey);
                global.characterSelections.set(messageId, selections);
            } else {
                global.characterSelections.set(messageId, {});
            }
        }
        
        return global.characterSelections.get(messageId);
    }

    /**
     * Save character selections to database
     * @param {string} messageId 
     * @param {Object} selections 
     */
    static saveCharacterSelections(messageId, selections) {
        if (!global.characterSelections) {
            global.characterSelections = new Map();
        }
        
        global.characterSelections.set(messageId, selections);
        
        // Save to database
        const dbKey = `game-characters-${messageId}`;
        client.database.set(dbKey, selections);
    }

    /**
     * Get speaking order for a game message
     * @param {string} messageId
     * @returns {Array<string>}
     */
    static getSpeakingOrder(messageId) {
        if (!global.speakingOrder) {
            global.speakingOrder = new Map();
        }

        if (!global.speakingOrder.has(messageId)) {
            // Try to load from database
            const dbKey = `game-speaking-order-${messageId}`;
            if (client.database.has(dbKey)) {
                const order = client.database.get(dbKey);
                global.speakingOrder.set(messageId, order);
            } else {
                global.speakingOrder.set(messageId, []);
            }
        }

        return global.speakingOrder.get(messageId);
    }

    /**
     * Save speaking order to database
     * @param {string} messageId
     * @param {Array<string>} order
     */
    static saveSpeakingOrder(messageId, order) {
        if (!global.speakingOrder) {
            global.speakingOrder = new Map();
        }

        global.speakingOrder.set(messageId, order);

        // Save to database
        const dbKey = `game-speaking-order-${messageId}`;
        client.database.set(dbKey, order);
    }

    /**
     * Get game rules for a game message
     * @param {string} messageId
     * @returns {Object}
     */
    static getGameRules(messageId) {
        if (!global.gameRules) {
            global.gameRules = new Map();
        }

        if (!global.gameRules.has(messageId)) {
            // Try to load from database
            const dbKey = `game-rules-${messageId}`;
            if (client.database.has(dbKey)) {
                const rules = client.database.get(dbKey);
                global.gameRules.set(messageId, rules);
            } else {
                // Default rules
                global.gameRules.set(messageId, {
                    witchCanSaveSelfFirstNight: true
                });
            }
        }

        return global.gameRules.get(messageId);
    }

    /**
     * Save game rules to database
     * @param {string} messageId
     * @param {Object} rules
     */
    static saveGameRules(messageId, rules) {
        if (!global.gameRules) {
            global.gameRules = new Map();
        }

        global.gameRules.set(messageId, rules);

        // Save to database
        const dbKey = `game-rules-${messageId}`;
        client.database.set(dbKey, rules);
    }

    /**
     * Delete game data from memory and database
     * @param {string} messageId
     */
    static deleteGame(messageId) {
        // Delete from memory
        if (global.gamePlayers) {
            global.gamePlayers.delete(messageId);
        }
        if (global.characterSelections) {
            global.characterSelections.delete(messageId);
        }
        if (global.speakingOrder) {
            global.speakingOrder.delete(messageId);
        }
        if (global.gameRules) {
            global.gameRules.delete(messageId);
        }

        // Delete from database
        client.database.delete(`game-players-${messageId}`);
        client.database.delete(`game-characters-${messageId}`);
        client.database.delete(`game-speaking-order-${messageId}`);
        client.database.delete(`game-rules-${messageId}`);
    }

    /**
     * Initialize global maps if they don't exist
     */
    static initialize() {
        if (!global.gamePlayers) {
            global.gamePlayers = new Map();
        }
        if (!global.characterSelections) {
            global.characterSelections = new Map();
        }
        if (!global.speakingOrder) {
            global.speakingOrder = new Map();
        }
        if (!global.gameRules) {
            global.gameRules = new Map();
        }
    }
}

module.exports = GameState;

