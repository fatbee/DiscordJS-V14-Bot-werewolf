const { QuickYAML } = require('quick-yaml.db');
const config = require('../config');

/**
 * Werewolf Game State Manager
 * Manages the complete game state including phases, player status, and actions
 */
class WerewolfGame {
    /**
     * Initialize a new game
     * @param {string} messageId - The game message ID
     * @param {Map<string, string>} roleAssignments - Player ID to role mapping
     * @param {QuickYAML} database - Database instance
     */
    static initializeGame(messageId, roleAssignments, database) {
        // Get game rules from database
        const GameState = require('./GameState');
        const gameRules = GameState.getGameRules(messageId) || {
            witchCanSaveSelfFirstNight: true
        };

        const gameState = {
            messageId: messageId,
            phase: 'night', // 'night' or 'day'
            round: 1,
            players: {},
            roleAssignments: roleAssignments,
            nightActions: {},
            dayVotes: {},
            deathQueue: [], // Players who will die at dawn
            speaking: {
                order: [],
                current: -1
            },
            witchPotions: {}, // Track witch potion usage
            hunterAlive: true,
            gameRules: gameRules, // Store game rules in game state
            createdAt: Date.now()
        };

        // Initialize player states
        for (const [playerId, role] of Object.entries(roleAssignments)) {
            gameState.players[playerId] = {
                id: playerId,
                role: role,
                alive: true,
                canSpeak: true,
                hasSpoken: false,
                deathRound: null,
                deathReason: null,
                lastWords: null
            };
        }

        // Initialize witch potions
        const witchId = Object.keys(roleAssignments).find(id => roleAssignments[id] === '女巫');
        if (witchId) {
            gameState.witchPotions[witchId] = {
                antidote: true, // 解藥
                poison: true    // 毒藥
            };
        }

        // Save to database
        database.set(`werewolf-game-${messageId}`, gameState);
        
        return gameState;
    }

    /**
     * Get game state from database
     */
    static getGame(messageId, database) {
        return database.get(`werewolf-game-${messageId}`);
    }

    /**
     * Save game state to database
     */
    static saveGame(messageId, gameState, database) {
        database.set(`werewolf-game-${messageId}`, gameState);
    }

    /**
     * Delete game from database
     */
    static deleteGame(messageId, database) {
        database.delete(`werewolf-game-${messageId}`);
    }

    /**
     * Get all alive players
     */
    static getAlivePlayers(gameState) {
        return Object.values(gameState.players).filter(p => p.alive);
    }

    /**
     * Get alive players by role
     */
    static getAlivePlayersByRole(gameState, role) {
        return Object.values(gameState.players).filter(p => p.alive && p.role === role);
    }

    /**
     * Get alive werewolves (狼王 + 狼人)
     */
    static getAliveWerewolves(gameState) {
        return Object.values(gameState.players).filter(p => 
            p.alive && (p.role === '狼王' || p.role === '狼人')
        );
    }

    /**
     * Get alive villagers (good guys)
     */
    static getAliveVillagers(gameState) {
        return Object.values(gameState.players).filter(p => 
            p.alive && p.role !== '狼王' && p.role !== '狼人'
        );
    }

    /**
     * Check win condition
     * @returns {string|null} - 'werewolf', 'villager', or null if game continues
     */
    static checkWinCondition(gameState) {
        const aliveWerewolves = this.getAliveWerewolves(gameState);
        const aliveVillagers = this.getAliveVillagers(gameState);

        // Werewolves win if villagers <= werewolves
        if (aliveVillagers.length <= aliveWerewolves.length) {
            return 'werewolf';
        }

        // Villagers win if all werewolves are dead
        if (aliveWerewolves.length === 0) {
            return 'villager';
        }

        return null; // Game continues
    }

    /**
     * Kill a player
     */
    static killPlayer(gameState, playerId, reason) {
        if (gameState.players[playerId]) {
            gameState.players[playerId].alive = false;
            gameState.players[playerId].deathRound = gameState.round;
            gameState.players[playerId].deathReason = reason;
        }
    }

    /**
     * Initialize speaking order for the day
     */
    static initializeSpeakingOrder(gameState) {
        const alivePlayers = this.getAlivePlayers(gameState);
        
        // Shuffle alive players for speaking order
        const shuffled = [...alivePlayers];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        gameState.speaking.order = shuffled.map(p => p.id);
        gameState.speaking.current = 0;
    }
}

module.exports = WerewolfGame;

