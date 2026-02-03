const client = require('../index');

/**
 * Player Statistics Manager
 * Tracks player performance and game statistics
 */
class PlayerStats {
    /**
     * Initialize player stats if not exists
     * @param {string} playerId 
     */
    static initializeStats(playerId) {
        const statsKey = `player-stats-${playerId}`;
        
        if (!client.database.has(statsKey)) {
            const defaultStats = {
                // Basic stats
                totalGames: 0,
                wins: 0,
                losses: 0,
                survived: 0,
                
                // Win by team
                werewolfWins: 0,
                villagerWins: 0,
                
                // Role usage count
                roles: {
                    '狼王': 0,
                    '狼人': 0,
                    '隱狼': 0,
                    '預言家': 0,
                    '女巫': 0,
                    '獵人': 0,
                    '騎士': 0,
                    '熊': 0,
                    '村民': 0
                },
                
                // Death statistics
                deaths: {
                    '被狼人殺死': 0,      // Killed by werewolves (刀口)
                    '被女巫毒死': 0,      // Poisoned by witch
                    '被放逐': 0,          // Exiled by voting (投票逐出)
                    '被射殺': 0,          // Shot by hunter/wolf king
                    '被騎士決鬥': 0,      // Killed by knight duel
                    '決鬥失敗': 0,        // Knight duel failed
                    '自爆': 0             // Self-destruct
                },
                
                // Action statistics
                actions: {
                    werewolfKills: 0,        // Times killed as werewolf
                    seerChecks: 0,           // Times checked as seer
                    witchSaves: 0,           // Times saved as witch
                    witchPoisons: 0,         // Times poisoned as witch
                    hunterShoots: 0,         // Times shot as hunter
                    wolfKingShoots: 0,       // Times shot as wolf king
                    knightDuels: 0,          // Times dueled as knight
                    votesGiven: 0,           // Times voted
                    votesReceived: 0         // Times received votes
                },
                
                // First/Last updated
                firstGame: Date.now(),
                lastGame: Date.now()
            };
            
            client.database.set(statsKey, defaultStats);
        }
        
        return client.database.get(statsKey);
    }
    
    /**
     * Get player stats
     * @param {string} playerId 
     */
    static getStats(playerId) {
        const statsKey = `player-stats-${playerId}`;
        
        if (!client.database.has(statsKey)) {
            return this.initializeStats(playerId);
        }
        
        return client.database.get(statsKey);
    }
    
    /**
     * Save player stats
     * @param {string} playerId 
     * @param {Object} stats 
     */
    static saveStats(playerId, stats) {
        const statsKey = `player-stats-${playerId}`;
        stats.lastGame = Date.now();
        client.database.set(statsKey, stats);
    }
    
    /**
     * Record game completion
     * @param {string} playerId 
     * @param {string} role - Player's role in the game
     * @param {boolean} won - Whether player won
     * @param {string} winningTeam - 'werewolf' or 'villager'
     * @param {boolean} survived - Whether player survived
     * @param {string} deathReason - Reason for death (if died)
     */
    static recordGame(playerId, role, won, winningTeam, survived, deathReason = null) {
        const stats = this.getStats(playerId);
        
        // Update basic stats
        stats.totalGames++;
        if (won) {
            stats.wins++;
            if (winningTeam === 'werewolf') {
                stats.werewolfWins++;
            } else {
                stats.villagerWins++;
            }
        } else {
            stats.losses++;
        }
        
        if (survived) {
            stats.survived++;
        }
        
        // Update role usage
        if (stats.roles[role] !== undefined) {
            stats.roles[role]++;
        }
        
        // Update death statistics
        if (deathReason && stats.deaths[deathReason] !== undefined) {
            stats.deaths[deathReason]++;
        }
        
        this.saveStats(playerId, stats);
    }

    /**
     * Record werewolf kill action
     * @param {string} playerId
     */
    static recordWerewolfKill(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.werewolfKills++;
        this.saveStats(playerId, stats);
    }

    /**
     * Record seer check action
     * @param {string} playerId
     */
    static recordSeerCheck(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.seerChecks++;
        this.saveStats(playerId, stats);
    }

    /**
     * Record witch save action
     * @param {string} playerId
     */
    static recordWitchSave(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.witchSaves++;
        this.saveStats(playerId, stats);
    }

    /**
     * Record witch poison action
     * @param {string} playerId
     */
    static recordWitchPoison(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.witchPoisons++;
        this.saveStats(playerId, stats);
    }

    /**
     * Record hunter shoot action
     * @param {string} playerId
     */
    static recordHunterShoot(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.hunterShoots++;
        this.saveStats(playerId, stats);
    }

    /**
     * Record wolf king shoot action
     * @param {string} playerId
     */
    static recordWolfKingShoot(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.wolfKingShoots++;
        this.saveStats(playerId, stats);
    }

    /**
     * Record knight duel action
     * @param {string} playerId
     */
    static recordKnightDuel(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.knightDuels++;
        this.saveStats(playerId, stats);
    }

    /**
     * Record vote given
     * @param {string} playerId
     */
    static recordVoteGiven(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.votesGiven++;
        this.saveStats(playerId, stats);
    }

    /**
     * Record vote received
     * @param {string} playerId
     */
    static recordVoteReceived(playerId) {
        const stats = this.getStats(playerId);
        stats.actions.votesReceived++;
        this.saveStats(playerId, stats);
    }

    /**
     * Get formatted stats display
     * @param {string} playerId
     * @returns {string}
     */
    static getStatsDisplay(playerId) {
        const stats = this.getStats(playerId);

        const winRate = stats.totalGames > 0 ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : 0;
        const survivalRate = stats.totalGames > 0 ? ((stats.survived / stats.totalGames) * 100).toFixed(1) : 0;

        let display = `📊 **玩家統計數據**\n\n`;

        // Basic stats
        display += `**基本數據：**\n`;
        display += `總場次：${stats.totalGames}\n`;
        display += `勝利：${stats.wins} | 失敗：${stats.losses}\n`;
        display += `勝率：${winRate}%\n`;
        display += `存活場次：${stats.survived} (${survivalRate}%)\n`;
        display += `狼人陣營勝利：${stats.werewolfWins}\n`;
        display += `村民陣營勝利：${stats.villagerWins}\n\n`;

        // Role usage
        display += `**角色使用次數：**\n`;
        const roleEntries = Object.entries(stats.roles).filter(([_, count]) => count > 0);
        if (roleEntries.length > 0) {
            roleEntries.forEach(([role, count]) => {
                display += `${role}：${count} 次\n`;
            });
        } else {
            display += `_尚無數據_\n`;
        }
        display += `\n`;

        // Death statistics
        display += `**死亡統計：**\n`;
        const deathEntries = Object.entries(stats.deaths).filter(([_, count]) => count > 0);
        if (deathEntries.length > 0) {
            deathEntries.forEach(([reason, count]) => {
                display += `${reason}：${count} 次\n`;
            });
        } else {
            display += `_尚無數據_\n`;
        }
        display += `\n`;

        // Action statistics
        display += `**行動統計：**\n`;
        if (stats.actions.werewolfKills > 0) display += `狼人殺人：${stats.actions.werewolfKills} 次\n`;
        if (stats.actions.seerChecks > 0) display += `預言家查驗：${stats.actions.seerChecks} 次\n`;
        if (stats.actions.witchSaves > 0) display += `女巫救人：${stats.actions.witchSaves} 次\n`;
        if (stats.actions.witchPoisons > 0) display += `女巫毒人：${stats.actions.witchPoisons} 次\n`;
        if (stats.actions.hunterShoots > 0) display += `獵人射殺：${stats.actions.hunterShoots} 次\n`;
        if (stats.actions.wolfKingShoots > 0) display += `狼王射殺：${stats.actions.wolfKingShoots} 次\n`;
        if (stats.actions.knightDuels > 0) display += `騎士決鬥：${stats.actions.knightDuels} 次\n`;
        if (stats.actions.votesGiven > 0) display += `投票次數：${stats.actions.votesGiven} 次\n`;
        if (stats.actions.votesReceived > 0) display += `被投票次數：${stats.actions.votesReceived} 次\n`;

        if (Object.values(stats.actions).every(v => v === 0)) {
            display += `_尚無數據_\n`;
        }

        return display;
    }
}

module.exports = PlayerStats;
