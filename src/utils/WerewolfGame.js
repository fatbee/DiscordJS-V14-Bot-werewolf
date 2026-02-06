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

        // Get the pre-shuffled speaking order from database
        const fixedSpeakingOrder = GameState.getSpeakingOrder(messageId);

        if (config.werewolf.testMode) {
            console.log(`[DEBUG] initializeGame: messageId=${messageId}`);
            console.log(`[DEBUG] initializeGame: fixedSpeakingOrder=`, fixedSpeakingOrder);
            console.log(`[DEBUG] initializeGame: roleAssignments=`, roleAssignments);
        }

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
            fixedSpeakingOrder: fixedSpeakingOrder, // Store the fixed speaking order
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
                canVote: true, // For 白痴 (Idiot) role
                hasSpoken: false,
                deathRound: null,
                deathReason: null,
                lastWords: null,
                idiotRevealed: false // Track if 白痴 has revealed their card
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
     * Get alive werewolves (狼王 + 狼人 + 隱狼)
     */
    static getAliveWerewolves(gameState) {
        return Object.values(gameState.players).filter(p =>
            p.alive && (p.role === '狼王' || p.role === '狼人' || p.role === '隱狼')
        );
    }

    /**
     * Get alive villagers (good guys)
     */
    static getAliveVillagers(gameState) {
        return Object.values(gameState.players).filter(p =>
            p.alive && p.role !== '狼王' && p.role !== '狼人' && p.role !== '隱狼'
        );
    }

    /**
     * Get alive villagers by type (村民 vs 神職)
     */
    static getAliveVillagersByType(gameState) {
        const alivePlayers = Object.values(gameState.players).filter(p => p.alive);
        const villagers = alivePlayers.filter(p => p.role === '村民'); // 平民
        const gods = alivePlayers.filter(p =>
            p.role !== '狼王' && p.role !== '狼人' && p.role !== '隱狼' && p.role !== '村民'
        ); // 神職 (預言家、女巫、獵人等)

        return { villagers, gods };
    }

    /**
     * Check win condition
     * @returns {string|null} - 'werewolf', 'villager', or null if game continues
     */
    static checkWinCondition(gameState) {
        const aliveWerewolves = this.getAliveWerewolves(gameState);
        const { villagers, gods } = this.getAliveVillagersByType(gameState);
        const totalGoodGuys = villagers.length + gods.length;

        // 1. 狼人 >= 好人總數 (綁票) - 狼人勝利
        if (aliveWerewolves.length >= totalGoodGuys) {
            return 'werewolf';
        }

        // 2. 村民 = 0 (屠民) - 狼人勝利
        if (villagers.length === 0 && totalGoodGuys > 0) {
            return 'werewolf';
        }

        // 3. 神職 = 0 (屠神) - 狼人勝利
        if (gods.length === 0 && totalGoodGuys > 0) {
            return 'werewolf';
        }

        // 4. 狼人 = 0 - 好人勝利
        if (aliveWerewolves.length === 0) {
            return 'villager';
        }

        return null; // Game continues
    }

    /**
     * Kill a player
     */
    static killPlayer(gameState, playerId, reason, guild = null) {
        if (gameState.players[playerId]) {
            gameState.players[playerId].alive = false;
            gameState.players[playerId].deathRound = gameState.round;
            gameState.players[playerId].deathReason = reason;

            // Add "狼死人" role to dead player (if guild is provided)
            if (guild) {
                const { addDeadRole } = require('./DeadPlayerRole');
                addDeadRole(guild, playerId).catch(err => {
                    console.error(`Failed to add dead role to ${playerId}:`, err);
                });
            }
        }
    }

    /**
     * Initialize speaking order for the day
     * Uses the pre-shuffled speaking order from game setup, filtering out dead players
     * Determines starting position and direction based on last night's deaths
     */
    static initializeSpeakingOrder(gameState) {
        const alivePlayers = this.getAlivePlayers(gameState);
        const alivePlayerIds = new Set(alivePlayers.map(p => p.id));

        if (config.werewolf.testMode) {
            console.log(`[DEBUG] initializeSpeakingOrder: alivePlayers.length=${alivePlayers.length}`);
            console.log(`[DEBUG] initializeSpeakingOrder: alivePlayerIds=`, Array.from(alivePlayerIds));
            console.log(`[DEBUG] initializeSpeakingOrder: fixedSpeakingOrder=`, gameState.fixedSpeakingOrder);
        }

        // Get the fixed speaking order from game state (set during game initialization)
        // Filter to only include alive players, maintaining the original order
        let baseOrder = [];
        if (gameState.fixedSpeakingOrder && gameState.fixedSpeakingOrder.length > 0) {
            baseOrder = gameState.fixedSpeakingOrder.filter(id => alivePlayerIds.has(id));
            if (config.werewolf.testMode) {
                console.log(`[DEBUG] initializeSpeakingOrder: baseOrder (from fixedSpeakingOrder)=`, baseOrder);
            }
        } else {
            // Fallback: if no fixed order exists, use alive players in their current order
            baseOrder = alivePlayers.map(p => p.id);
            if (config.werewolf.testMode) {
                console.log(`[DEBUG] initializeSpeakingOrder: baseOrder (fallback)=`, baseOrder);
            }
        }

        // Get last night's deaths (players who died this round)
        const lastNightDeaths = Object.values(gameState.players).filter(p =>
            !p.alive && p.deathRound === gameState.round
        );

        // Determine speaking order based on death count
        let finalOrder = [];

        if (lastNightDeaths.length === 1) {
            // 1 person died: Start from the dead player's position, random direction
            const deadPlayerId = lastNightDeaths[0].id;
            const deadPlayerIndex = gameState.fixedSpeakingOrder.indexOf(deadPlayerId);

            if (deadPlayerIndex !== -1) {
                // Random direction: true = clockwise, false = counter-clockwise
                const isClockwise = Math.random() < 0.5;

                // Build order starting from dead player's position
                const totalPlayers = gameState.fixedSpeakingOrder.length;
                const tempOrder = [];

                for (let i = 0; i < totalPlayers; i++) {
                    let index;
                    if (isClockwise) {
                        // Clockwise: deadPlayerIndex, deadPlayerIndex+1, deadPlayerIndex+2, ...
                        index = (deadPlayerIndex + i) % totalPlayers;
                    } else {
                        // Counter-clockwise: deadPlayerIndex, deadPlayerIndex-1, deadPlayerIndex-2, ...
                        index = (deadPlayerIndex - i + totalPlayers) % totalPlayers;
                    }
                    const playerId = gameState.fixedSpeakingOrder[index];
                    if (alivePlayerIds.has(playerId)) {
                        tempOrder.push(playerId);
                    }
                }

                finalOrder = tempOrder;
            } else {
                // Fallback: use base order
                finalOrder = baseOrder;
            }
        } else {
            // 0 deaths or 2+ deaths: Random starting position, random direction
            const isClockwise = Math.random() < 0.5;
            const startIndex = Math.floor(Math.random() * baseOrder.length);

            // Build order from random start position
            const tempOrder = [];
            for (let i = 0; i < baseOrder.length; i++) {
                let index;
                if (isClockwise) {
                    index = (startIndex + i) % baseOrder.length;
                } else {
                    index = (startIndex - i + baseOrder.length) % baseOrder.length;
                }
                tempOrder.push(baseOrder[index]);
            }

            finalOrder = tempOrder;
        }

        gameState.speaking.order = finalOrder;
        gameState.speaking.current = 0;
    }
}

module.exports = WerewolfGame;

