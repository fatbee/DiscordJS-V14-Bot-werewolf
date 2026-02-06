const client = require('../index');

/**
 * Role Assignment Helper
 * Provides balanced role assignment that considers player history
 */
class RoleAssignmentHelper {
    /**
     * Get player's role history
     * @param {string} playerId 
     * @returns {Array} Recent role history (last 10 games)
     */
    static getRoleHistory(playerId) {
        const historyKey = `role-history-${playerId}`;
        if (!client.database.has(historyKey)) {
            return [];
        }
        return client.database.get(historyKey);
    }

    /**
     * Save player's role to history
     * @param {string} playerId 
     * @param {string} role 
     */
    static saveRoleToHistory(playerId, role) {
        const historyKey = `role-history-${playerId}`;
        let history = this.getRoleHistory(playerId);
        
        // Add new role to history
        history.push({
            role: role,
            team: this.getRoleTeam(role),
            timestamp: Date.now()
        });
        
        // Keep only last 10 games
        if (history.length > 10) {
            history = history.slice(-10);
        }
        
        client.database.set(historyKey, history);
    }

    /**
     * Get role's team
     * @param {string} role 
     * @returns {string} 'werewolf' or 'villager'
     */
    static getRoleTeam(role) {
        const werewolfRoles = ['狼王', '狼人', '隱狼'];
        return werewolfRoles.includes(role) ? 'werewolf' : 'villager';
    }

    /**
     * Calculate werewolf streak for a player
     * @param {string} playerId 
     * @returns {number} Number of consecutive werewolf games
     */
    static getWerewolfStreak(playerId) {
        const history = this.getRoleHistory(playerId);
        if (history.length === 0) return 0;
        
        let streak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].team === 'werewolf') {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }

    /**
     * Calculate villager streak for a player
     * @param {string} playerId
     * @returns {number} Number of consecutive villager games
     */
    static getVillagerStreak(playerId) {
        const history = this.getRoleHistory(playerId);
        if (history.length === 0) return 0;

        let streak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].team === 'villager') {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }

    /**
     * Get how many times a player has played a specific role recently
     * @param {string} playerId
     * @param {string} role
     * @param {number} lookback - How many recent games to check (default: 5)
     * @returns {number} Count of times played this role
     */
    static getRecentRoleCount(playerId, role, lookback = 5) {
        const history = this.getRoleHistory(playerId);
        if (history.length === 0) return 0;

        const recentHistory = history.slice(-lookback);
        return recentHistory.filter(h => h.role === role).length;
    }

    /**
     * Get player's role diversity score (higher = more diverse)
     * @param {string} playerId
     * @returns {number} Diversity score (0-1)
     */
    static getRoleDiversityScore(playerId) {
        const PlayerStats = require('./PlayerStats');
        const stats = PlayerStats.getStats(playerId);

        if (stats.totalGames === 0) return 1.0; // New players have max diversity

        // Count how many different roles the player has played
        const rolesPlayed = Object.values(stats.roles).filter(count => count > 0).length;
        const totalRoles = 9; // Total number of roles in the game

        return rolesPlayed / totalRoles;
    }

    /**
     * Save teammate pairing history
     * @param {Object} roleAssignments - Player ID to role mapping
     */
    static saveTeammatePairings(roleAssignments) {
        const werewolfPlayers = [];
        const villagerPlayers = [];

        // Separate players by team
        for (const [playerId, role] of Object.entries(roleAssignments)) {
            if (playerId.startsWith('test-')) continue; // Skip test players

            if (this.getRoleTeam(role) === 'werewolf') {
                werewolfPlayers.push(playerId);
            } else {
                villagerPlayers.push(playerId);
            }
        }

        // Save werewolf pairings
        for (let i = 0; i < werewolfPlayers.length; i++) {
            for (let j = i + 1; j < werewolfPlayers.length; j++) {
                this.recordTeammatePairing(werewolfPlayers[i], werewolfPlayers[j], 'werewolf');
            }
        }

        // Save villager pairings (only for god roles to avoid too much data)
        const godRoles = ['預言家', '女巫', '獵人', '騎士', '熊', '白痴', '守衛'];
        const godPlayers = villagerPlayers.filter(playerId => {
            const role = roleAssignments[playerId];
            return godRoles.includes(role);
        });

        for (let i = 0; i < godPlayers.length; i++) {
            for (let j = i + 1; j < godPlayers.length; j++) {
                this.recordTeammatePairing(godPlayers[i], godPlayers[j], 'villager');
            }
        }
    }

    /**
     * Record a teammate pairing
     * @param {string} playerId1
     * @param {string} playerId2
     * @param {string} team
     */
    static recordTeammatePairing(playerId1, playerId2, team) {
        // Create a consistent pairing key (sorted player IDs)
        const pairKey = [playerId1, playerId2].sort().join('-');
        const historyKey = `teammate-history-${pairKey}`;

        let history = [];
        if (client.database.has(historyKey)) {
            history = client.database.get(historyKey);
        }

        history.push({
            team: team,
            timestamp: Date.now()
        });

        // Keep only last 10 pairings
        if (history.length > 10) {
            history = history.slice(-10);
        }

        client.database.set(historyKey, history);
    }

    /**
     * Get recent teammate pairing count
     * @param {string} playerId1
     * @param {string} playerId2
     * @param {string} team
     * @param {number} lookback - How many recent games to check
     * @returns {number} Count of times paired on same team
     */
    static getRecentTeammatePairings(playerId1, playerId2, team, lookback = 3) {
        const pairKey = [playerId1, playerId2].sort().join('-');
        const historyKey = `teammate-history-${pairKey}`;

        if (!client.database.has(historyKey)) {
            return 0;
        }

        const history = client.database.get(historyKey);
        const recentHistory = history.slice(-lookback);

        return recentHistory.filter(h => h.team === team).length;
    }

    /**
     * Assign roles with balanced distribution
     * @param {Array<string>} players - Array of player IDs
     * @param {Array<string>} rolePool - Array of roles to assign
     * @returns {Object} Player ID to role mapping
     */
    static assignRolesBalanced(players, rolePool) {
        const assignments = {};

        // Add randomness: 30% chance to use completely random assignment
        // This keeps the system unpredictable and natural
        if (Math.random() < 0.3) {
            return this.assignRolesRandomly(players, rolePool);
        }

        // Separate roles by team
        const werewolfRoles = [];
        const villagerRoles = [];

        for (const role of rolePool) {
            if (this.getRoleTeam(role) === 'werewolf') {
                werewolfRoles.push(role);
            } else {
                villagerRoles.push(role);
            }
        }

        // Calculate player weights for werewolf assignment
        const playerWeights = players.map(playerId => {
            const history = this.getRoleHistory(playerId);

            // Base weight: 1.0
            let weight = 1.0;

            // Add random variance (0.8x - 1.2x) to make it less predictable
            const randomFactor = 0.8 + Math.random() * 0.4;
            weight *= randomFactor;

            // Only adjust weight if player has enough history (at least 3 games)
            if (history.length >= 3) {
                const werewolfStreak = this.getWerewolfStreak(playerId);
                const villagerStreak = this.getVillagerStreak(playerId);

                // Only apply significant adjustment for very long streaks (4+ games)
                // This makes it less obvious while still preventing extreme cases
                if (werewolfStreak >= 4) {
                    weight *= 0.4; // 60% reduction for 4+ werewolf games
                } else if (werewolfStreak === 3) {
                    weight *= 0.7; // 30% reduction for 3 werewolf games
                }

                if (villagerStreak >= 4) {
                    weight *= 1.6; // 60% increase for 4+ villager games
                } else if (villagerStreak === 3) {
                    weight *= 1.3; // 30% increase for 3 villager games
                }
            }

            return { playerId, weight };
        });

        // Assign werewolf roles using weighted random selection
        const assignedWerewolves = new Set();
        for (const werewolfRole of werewolfRoles) {
            // Filter out already assigned players
            const availablePlayers = playerWeights.filter(p => !assignedWerewolves.has(p.playerId));

            if (availablePlayers.length === 0) break;

            // Weighted random selection
            const selectedPlayer = this.weightedRandomSelect(availablePlayers);
            assignments[selectedPlayer.playerId] = werewolfRole;
            assignedWerewolves.add(selectedPlayer.playerId);
        }

        // Assign villager roles with role diversity consideration
        const remainingPlayers = players.filter(p => !assignedWerewolves.has(p));
        const villagerRoleAssignments = this.assignVillagerRolesWithDiversity(remainingPlayers, villagerRoles);

        // Merge assignments
        Object.assign(assignments, villagerRoleAssignments);

        // Check and adjust for teammate pairing issues
        this.adjustForTeammatePairings(assignments, players);

        return assignments;
    }

    /**
     * Assign villager roles with role diversity consideration
     * @param {Array<string>} players
     * @param {Array<string>} roles
     * @returns {Object} Player ID to role mapping
     */
    static assignVillagerRolesWithDiversity(players, roles) {
        const assignments = {};
        const availablePlayers = [...players];
        const availableRoles = [...roles];

        // Separate god roles and villager roles
        const godRoles = ['預言家', '女巫', '獵人', '騎士', '熊', '白痴', '守衛'];
        const godRolesInPool = availableRoles.filter(r => godRoles.includes(r));
        const villagerRolesInPool = availableRoles.filter(r => !godRoles.includes(r));

        // Assign god roles first with diversity consideration
        for (const godRole of godRolesInPool) {
            if (availablePlayers.length === 0) break;

            // Calculate weights based on role diversity
            const playerWeights = availablePlayers.map(playerId => {
                let weight = 1.0;

                // Add random variance (0.7x - 1.3x) for unpredictability
                const randomFactor = 0.7 + Math.random() * 0.6;
                weight *= randomFactor;

                // Check how many times player has played this specific role recently
                const recentRoleCount = this.getRecentRoleCount(playerId, godRole, 5);

                // Reduce weight if player has played this role recently
                if (recentRoleCount >= 2) {
                    weight *= 0.3; // 70% reduction if played 2+ times in last 5 games
                } else if (recentRoleCount === 1) {
                    weight *= 0.6; // 40% reduction if played once in last 5 games
                }

                // Boost weight for players with low role diversity
                const diversityScore = this.getRoleDiversityScore(playerId);
                if (diversityScore < 0.5) {
                    weight *= 1.5; // 50% boost for players who haven't tried many roles
                }

                return { playerId, weight };
            });

            // Weighted random selection
            const selectedPlayer = this.weightedRandomSelect(playerWeights);
            assignments[selectedPlayer.playerId] = godRole;

            // Remove assigned player from available pool
            const playerIndex = availablePlayers.indexOf(selectedPlayer.playerId);
            availablePlayers.splice(playerIndex, 1);
        }

        // Assign remaining villager roles randomly
        const shuffledVillagerRoles = this.shuffleArray(villagerRolesInPool);
        availablePlayers.forEach((playerId, index) => {
            assignments[playerId] = shuffledVillagerRoles[index];
        });

        return assignments;
    }

    /**
     * Adjust role assignments to avoid repeated teammate pairings
     * @param {Object} assignments - Current role assignments
     * @param {Array<string>} allPlayers - All players in the game
     */
    static adjustForTeammatePairings(assignments, allPlayers) {
        // Add randomness: 40% chance to skip pairing adjustment
        // This makes the system less predictable
        if (Math.random() < 0.4) {
            return;
        }

        // Get werewolf players
        const werewolfPlayers = allPlayers.filter(p =>
            this.getRoleTeam(assignments[p]) === 'werewolf'
        );

        // If there are 2+ werewolves, check for repeated pairings
        if (werewolfPlayers.length >= 2) {
            for (let i = 0; i < werewolfPlayers.length; i++) {
                for (let j = i + 1; j < werewolfPlayers.length; j++) {
                    const player1 = werewolfPlayers[i];
                    const player2 = werewolfPlayers[j];

                    // Check if these two have been werewolf teammates recently
                    const recentPairings = this.getRecentTeammatePairings(player1, player2, 'werewolf', 3);

                    // If they've been paired 2+ times in last 3 games, try to swap one
                    if (recentPairings >= 2) {
                        // Try to swap player2 with a villager player
                        const villagerPlayers = allPlayers.filter(p =>
                            this.getRoleTeam(assignments[p]) === 'villager' &&
                            !p.startsWith('test-')
                        );

                        if (villagerPlayers.length > 0) {
                            // Pick a random villager to swap with
                            const swapTarget = villagerPlayers[Math.floor(Math.random() * villagerPlayers.length)];

                            // Swap roles
                            const temp = assignments[player2];
                            assignments[player2] = assignments[swapTarget];
                            assignments[swapTarget] = temp;

                            // Only swap once per assignment to keep it subtle
                            return;
                        }
                    }
                }
            }
        }
    }

    /**
     * Assign roles completely randomly (fallback method)
     * @param {Array<string>} players
     * @param {Array<string>} rolePool
     * @returns {Object} Player ID to role mapping
     */
    static assignRolesRandomly(players, rolePool) {
        const assignments = {};
        const shuffledRoles = this.shuffleArray([...rolePool]);

        players.forEach((playerId, index) => {
            assignments[playerId] = shuffledRoles[index];
        });

        return assignments;
    }

    /**
     * Weighted random selection
     * @param {Array} items - Array of {playerId, weight}
     * @returns {Object} Selected item
     */
    static weightedRandomSelect(items) {
        const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const item of items) {
            random -= item.weight;
            if (random <= 0) {
                return item;
            }
        }
        
        return items[items.length - 1];
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     * @param {Array} array 
     * @returns {Array} Shuffled array
     */
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

module.exports = RoleAssignmentHelper;

