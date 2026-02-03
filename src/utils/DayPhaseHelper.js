const WerewolfGame = require('./WerewolfGame');
const { triggerShootAbility } = require('./HunterShootHelper');

/**
 * Helper function to trigger day phase with improved announcements
 */
async function triggerDayPhase(client, channel, messageId, gameState) {
    // Process deaths from night actions
    const deathList = [];

    // Check werewolf kill
    const werewolfKillTarget = gameState.nightActions.werewolfKill;
    const witchAction = gameState.nightActions.witchAction;
    const witchAntidoteTarget = gameState.nightActions.witchAntidoteTarget;
    const witchPoisonTarget = gameState.nightActions.witchPoisonTarget;

    // If witch used antidote on werewolf kill victim, they survive
    if (werewolfKillTarget && witchAction !== 'antidote') {
        deathList.push({
            playerId: werewolfKillTarget,
            reason: '被狼人殺死'
        });
    }

    // If witch used poison, add to death list
    if (witchAction === 'poison' && witchPoisonTarget) {
        deathList.push({
            playerId: witchPoisonTarget,
            reason: '被女巫毒死'
        });
    }

    // Process deaths
    for (const death of deathList) {
        WerewolfGame.killPlayer(gameState, death.playerId, death.reason, channel.guild);
    }

    // Update game phase to day
    gameState.phase = 'day';
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Get alive and dead player counts
    const alivePlayers = WerewolfGame.getAlivePlayers(gameState);
    const aliveCount = alivePlayers.length;
    const totalPlayers = Object.keys(gameState.players).length;
    const deadCount = totalPlayers - aliveCount;

    // Build death announcement (don't reveal death reasons, randomize order)
    let deathAnnouncement = '';
    if (deathList.length === 0) {
        deathAnnouncement = '🎉 **昨晚是平安夜，沒有人死亡！**';
    } else {
        // Randomize death list order to prevent guessing who was killed by werewolf vs witch
        const shuffledDeaths = [...deathList].sort(() => Math.random() - 0.5);

        deathAnnouncement = `💀 **昨晚死亡的玩家：** (${deathList.length} 人)\n\n`;
        for (const death of shuffledDeaths) {
            const player = gameState.players[death.playerId];
            const isTestPlayer = death.playerId.startsWith('test-');
            let playerDisplay;
            if (isTestPlayer) {
                const testNumber = death.playerId.split('-')[2];
                playerDisplay = `測試玩家 ${testNumber}`;
            } else {
                playerDisplay = `<@${death.playerId}>`;
            }
            // Only show player name, not death reason
            deathAnnouncement += `• ${playerDisplay}\n`;
        }
    }

    // Build player count summary
    const playerCountSummary = `\n📊 **玩家統計：**\n✅ 存活：${aliveCount} 人\n💀 死亡：${deadCount} 人\n👥 總計：${totalPlayers} 人`;

    // Build alive players list in speaking order
    const speakingOrder = client.database.get(`game-speaking-order-${messageId}`) || [];
    let alivePlayersList = '\n\n👥 **存活玩家：**\n';

    for (const playerId of speakingOrder) {
        const player = gameState.players[playerId];
        if (player && player.alive) {
            const isTestPlayer = playerId.startsWith('test-');
            let playerDisplay;
            if (isTestPlayer) {
                const testNumber = playerId.split('-')[2];
                playerDisplay = `測試玩家 ${testNumber}`;
            } else {
                playerDisplay = `<@${playerId}>`;
            }
            alivePlayersList += `• ${playerDisplay}\n`;
        }
    }

    // Build dead players list (in speaking order)
    let deadPlayersList = '';
    const deadPlayers = [];

    for (const playerId of speakingOrder) {
        const player = gameState.players[playerId];
        if (player && !player.alive) {
            deadPlayers.push(playerId);
        }
    }

    if (deadPlayers.length > 0) {
        deadPlayersList = '\n\n✝️ **死亡玩家：**\n';
        for (const playerId of deadPlayers) {
            const isTestPlayer = playerId.startsWith('test-');
            let playerDisplay;
            if (isTestPlayer) {
                const testNumber = playerId.split('-')[2];
                playerDisplay = `測試玩家 ${testNumber}`;
            } else {
                playerDisplay = `<@${playerId}>`;
            }
            deadPlayersList += `• ${playerDisplay}\n`;
        }
    }

    // Check for bear roar (熊's passive ability)
    let bearRoarAnnouncement = '';
    const bearPlayer = Object.values(gameState.players).find(p => p.role === '熊' && p.alive);

    if (bearPlayer) {
        // Find bear's position in speaking order
        const bearIndex = speakingOrder.indexOf(bearPlayer.id);

        if (bearIndex !== -1) {
            // Find alive neighbors
            let leftNeighbor = null;
            let rightNeighbor = null;

            // Find left neighbor (previous alive player)
            for (let i = 1; i < speakingOrder.length; i++) {
                const leftIndex = (bearIndex - i + speakingOrder.length) % speakingOrder.length;
                const leftPlayerId = speakingOrder[leftIndex];
                if (gameState.players[leftPlayerId]?.alive && leftPlayerId !== bearPlayer.id) {
                    leftNeighbor = gameState.players[leftPlayerId];
                    break;
                }
            }

            // Find right neighbor (next alive player)
            for (let i = 1; i < speakingOrder.length; i++) {
                const rightIndex = (bearIndex + i) % speakingOrder.length;
                const rightPlayerId = speakingOrder[rightIndex];
                if (gameState.players[rightPlayerId]?.alive && rightPlayerId !== bearPlayer.id) {
                    rightNeighbor = gameState.players[rightPlayerId];
                    break;
                }
            }

            // Check if hidden werewolf is activated
            const otherWerewolves = Object.values(gameState.players).filter(p =>
                (p.role === '狼王' || p.role === '狼人') && p.alive
            );
            const hiddenWerewolfActivated = otherWerewolves.length === 0;

            // Check if either neighbor is a werewolf (狼王, 狼人, or activated 隱狼)
            let hasWerewolfNeighbor = false;

            if (leftNeighbor) {
                if (leftNeighbor.role === '狼王' || leftNeighbor.role === '狼人') {
                    hasWerewolfNeighbor = true;
                } else if (leftNeighbor.role === '隱狼' && hiddenWerewolfActivated) {
                    hasWerewolfNeighbor = true;
                }
            }

            if (rightNeighbor) {
                if (rightNeighbor.role === '狼王' || rightNeighbor.role === '狼人') {
                    hasWerewolfNeighbor = true;
                } else if (rightNeighbor.role === '隱狼' && hiddenWerewolfActivated) {
                    hasWerewolfNeighbor = true;
                }
            }

            // If there's a werewolf neighbor, bear roars
            if (hasWerewolfNeighbor) {
                bearRoarAnnouncement = '\n\n🐻 **昨夜，熊咆哮了！**';
            }
        }
    }

    // Send day announcement
    await channel.send({
        content: `☀️ **天亮了！第 ${gameState.round} 天**\n\n${deathAnnouncement}${playerCountSummary}${alivePlayersList}${deadPlayersList}${bearRoarAnnouncement}`,
    });

    // Check if any hunter/wolf king can shoot
    await triggerShootAbility(client, channel, messageId, gameState, deathList, async () => {
        // After all shooting is done, proceed to discussion
        // Check ALL win conditions at dawn (witch can poison werewolves!)
        await triggerDiscussionPhase(client, channel, messageId, gameState);
    });
}

/**
 * Trigger discussion phase (after dawn announcements and shooting)
 */
async function triggerDiscussionPhase(client, channel, messageId, gameState) {
    // Check win condition
    const winner = WerewolfGame.checkWinCondition(gameState);

    if (winner) {
        // End game for any victory
        await handleGameEnd(client, channel, messageId, gameState, winner);
        return;
    }

    // Send discussion button
    await channel.send({
        content: `準備進入討論階段...`,
        components: [{
            type: 1,
            components: [{
                type: 2,
                custom_id: `start-discussion-${messageId}`,
                label: '💬 開始討論',
                style: 1 // Blue
            }]
        }]
    });
}

/**
 * Handle game end
 */
async function handleGameEnd(client, channel, messageId, gameState, winner) {
    const { getRoleDisplay } = require('./WerewolfRoles');
    const PlayerStats = require('./PlayerStats');

    // Clear all "狼死人" roles when game ends
    const { clearAllDeadRoles } = require('./DeadPlayerRole');
    await clearAllDeadRoles(channel.guild);

    // Record game statistics for all players
    for (const [playerId, player] of Object.entries(gameState.players)) {
        // Skip test players
        if (playerId.startsWith('test-')) {
            continue;
        }

        // Determine if player won
        const playerRole = player.role;
        const isWerewolf = ['狼王', '狼人', '隱狼'].includes(playerRole);
        const playerWon = (isWerewolf && winner === 'werewolf') || (!isWerewolf && winner === 'villager');

        // Record game completion
        PlayerStats.recordGame(
            playerId,
            playerRole,
            playerWon,
            winner,
            player.alive,
            player.deathReason || null
        );
    }

    // Build final results
    let resultsText = '**最終結果：**\n\n';

    for (const [playerId, player] of Object.entries(gameState.players)) {
        const isTestPlayer = playerId.startsWith('test-');
        let playerDisplay;
        if (isTestPlayer) {
            const testNumber = playerId.split('-')[2];
            playerDisplay = `測試玩家 ${testNumber}`;
        } else {
            playerDisplay = `<@${playerId}>`;
        }

        const status = player.alive ? '✅ 存活' : '💀 死亡';
        resultsText += `${playerDisplay} - ${getRoleDisplay(player.role)} - ${status}\n`;
    }

    // Determine winner message
    const winnerEmoji = winner === 'werewolf' ? '🐺' : '👥';
    const winnerText = winner === 'werewolf' ? '**狼人陣營勝利！**' : '**村民陣營勝利！**';

    // Send game end message
    await channel.send({
        content: `🎉 **遊戲結束！**\n\n${winnerEmoji} ${winnerText}\n\n${resultsText}`,
        components: [{
            type: 1,
            components: [{
                type: 2,
                custom_id: `end-game-${messageId}`,
                label: '🏁 結束遊戲',
                style: 4 // Red
            }]
        }]
    });

    // Update game state
    gameState.phase = 'ended';
    WerewolfGame.saveGame(messageId, gameState, client.database);
}

module.exports = {
    triggerDayPhase,
    triggerDiscussionPhase,
    handleGameEnd
};

