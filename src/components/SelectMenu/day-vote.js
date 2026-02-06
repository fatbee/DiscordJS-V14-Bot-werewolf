const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { triggerShootAbility } = require("../../utils/HunterShootHelper");
const PlayerStats = require("../../utils/PlayerStats");
const config = require("../../config");

module.exports = new Component({
    customId: 'day-vote',
    type: 'select',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {StringSelectMenuInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract messageId from custom_id
        const messageId = interaction.customId.split('-').pop();
        
        // Get game state
        const gameState = WerewolfGame.getGame(messageId, client.database);
        
        if (!gameState) {
            return await interaction.reply({
                content: '❌ 找不到遊戲數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if user is alive (or bot owner in test mode)
        const userId = interaction.user.id;
        const userPlayer = gameState.players[userId];
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;

        if (!isOwner && (!userPlayer || !userPlayer.alive)) {
            return await interaction.reply({
                content: '❌ 你不是存活的玩家！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if user can vote (白痴 who revealed cannot vote)
        if (!isOwner && userPlayer.canVote === false) {
            return await interaction.reply({
                content: '❌ 你已經失去投票權！（白痴翻牌後無法投票）',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if this is PK voting phase
        const isPKPhase = gameState.pkPlayers && gameState.pkPlayers.length > 0;

        // If in PK phase, check if user is a PK player
        if (isPKPhase && !isOwner) {
            const isPKPlayer = gameState.pkPlayers.includes(userId);
            if (isPKPlayer) {
                return await interaction.reply({
                    content: '❌ 進入PK的玩家不能投票！只有其他玩家可以投票。',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Get selected target
        const targetId = interaction.values[0];

        // Handle clear vote option
        if (targetId === 'clear-vote') {
            // Remove user's vote
            if (gameState.dayVotes && gameState.dayVotes[userId]) {
                delete gameState.dayVotes[userId];
                WerewolfGame.saveGame(messageId, gameState, client.database);

                return await interaction.reply({
                    content: '🔄 你的投票已清除！你可以重新選擇。',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                return await interaction.reply({
                    content: '❌ 你還沒有投票！',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Validate target (skip validation for abstain)
        if (targetId !== 'abstain') {
            const targetPlayer = gameState.players[targetId];

            if (!targetPlayer || !targetPlayer.alive) {
                return await interaction.reply({
                    content: '❌ 無效的目標！',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Record vote
        if (!gameState.dayVotes) {
            gameState.dayVotes = {};
        }
        gameState.dayVotes[userId] = targetId;
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Record vote statistics (skip test players and abstentions)
        if (!userId.startsWith('test-')) {
            PlayerStats.recordVoteGiven(userId);
        }
        if (targetId !== 'abstain' && !targetId.startsWith('test-')) {
            PlayerStats.recordVoteReceived(targetId);
        }

        // Build target display
        let targetDisplay;
        if (targetId === 'abstain') {
            targetDisplay = '棄票';
        } else {
            const isTestPlayer = targetId.startsWith('test-');
            if (isTestPlayer) {
                const testNumber = targetId.split('-')[2];
                targetDisplay = `測試玩家 ${testNumber}`;
            } else {
                targetDisplay = `<@${targetId}>`;
            }
        }

        // Send confirmation
        await interaction.reply({
            content: targetId === 'abstain' ? `✅ 你選擇了：${targetDisplay}` : `✅ 你投票給：${targetDisplay}`,
            flags: MessageFlags.Ephemeral
        });

        // Check if all alive players have voted
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState);
        const voteCount = Object.keys(gameState.dayVotes).length;

        // Always wait for 25 second timer, don't show vote count
        // Vote count is hidden to prevent information leakage
    }
}).toJSON();

/**
 * Process voting results and exile the player with most votes
 */
async function processVotingResults(client, channel, messageId, gameState) {
    // Count votes (including abstentions)
    const voteCounts = {};
    let abstentionCount = 0;

    for (const [voter, target] of Object.entries(gameState.dayVotes)) {
        if (target === 'abstain') {
            abstentionCount++;
        } else {
            voteCounts[target] = (voteCounts[target] || 0) + 1;
        }
    }

    // Build detailed vote record (who voted for whom)
    let voteDetails = '**投票詳情：**\n\n';
    for (const [voter, target] of Object.entries(gameState.dayVotes)) {
        const isVoterTest = voter.startsWith('test-');
        let voterDisplay;
        if (isVoterTest) {
            const testNumber = voter.split('-')[2];
            voterDisplay = `測試玩家 ${testNumber}`;
        } else {
            voterDisplay = `<@${voter}>`;
        }

        let targetDisplay;
        if (target === 'abstain') {
            targetDisplay = '🚫 棄票';
        } else {
            const isTargetTest = target.startsWith('test-');
            if (isTargetTest) {
                const testNumber = target.split('-')[2];
                targetDisplay = `測試玩家 ${testNumber}`;
            } else {
                targetDisplay = `<@${target}>`;
            }
        }

        voteDetails += `${voterDisplay} → ${targetDisplay}\n`;
    }

    // Build vote summary (vote counts)
    let voteSummary = '\n**投票統計：**\n\n';
    for (const [playerId, count] of Object.entries(voteCounts)) {
        const isTestPlayer = playerId.startsWith('test-');
        let playerDisplay;
        if (isTestPlayer) {
            const testNumber = playerId.split('-')[2];
            playerDisplay = `測試玩家 ${testNumber}`;
        } else {
            playerDisplay = `<@${playerId}>`;
        }
        voteSummary += `${playerDisplay}: ${count} 票\n`;
    }
    if (abstentionCount > 0) {
        voteSummary += `\n🚫 棄票：${abstentionCount} 人\n`;
    }

    // Combine vote details and summary
    const fullVoteSummary = voteDetails + voteSummary;

    // Find player(s) with most votes
    let maxVotes = 0;
    const tied = [];

    for (const [playerId, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
            tied.length = 0;
            tied.push(playerId);
        } else if (count === maxVotes && count > 0) {
            tied.push(playerId);
        }
    }

    // Check if there's a tie (PK situation)
    if (tied.length > 1) {
        // PK situation - need to check if this is first vote or PK vote
        if (!gameState.pkRound) {
            gameState.pkRound = 1;
            gameState.pkPlayers = tied;
            WerewolfGame.saveGame(messageId, gameState, client.database);

            // Build PK player displays
            const pkDisplays = tied.map(playerId => {
                const isTestPlayer = playerId.startsWith('test-');
                if (isTestPlayer) {
                    const testNumber = playerId.split('-')[2];
                    return `測試玩家 ${testNumber}`;
                } else {
                    return `<@${playerId}>`;
                }
            });

            await channel.send({
                content: `${fullVoteSummary}\n\n⚖️ **平票！進入PK階段**\n\n平票玩家：${pkDisplays.join('、')}\n\n請PK玩家依次發言辯論...`,
                components: [{
                    type: 1,
                    components: [{
                        type: 2,
                        custom_id: `start-pk-${messageId}`,
                        label: '🎤 開始PK發言',
                        style: 1 // Blue
                    }]
                }]
            });
            return;
        } else {
            // Second PK vote still tied - peaceful night, no one exiled
            delete gameState.pkRound;
            delete gameState.pkPlayers;
            WerewolfGame.saveGame(messageId, gameState, client.database);

            await channel.send({
                content: `${fullVoteSummary}\n\n🌙 **再次平票！今天是平安夜，無人出局。**`,
                components: [{
                    type: 1,
                    components: [{
                        type: 2,
                        custom_id: `start-night-${messageId}`,
                        label: '🌙 開始夜晚',
                        style: 1 // Blue
                    }]
                }]
            });
            return;
        }
    }

    // Check if no one got votes (all abstained)
    if (tied.length === 0 || maxVotes === 0) {
        await channel.send({
            content: `${fullVoteSummary}\n\n🌙 **無人得票，今天是平安夜，無人出局。**`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `start-night-${messageId}`,
                    label: '🌙 開始夜晚',
                    style: 1 // Blue
                }]
            }]
        });
        return;
    }

    // Single player with most votes - exile them
    const exiledPlayerId = tied[0];
    const exiledPlayer = gameState.players[exiledPlayerId];
    const { getRoleDisplay } = require('../../utils/WerewolfRoles');

    // Build exiled player display
    const isTestPlayer = exiledPlayerId.startsWith('test-');
    let exiledDisplay;
    if (isTestPlayer) {
        const testNumber = exiledPlayerId.split('-')[2];
        exiledDisplay = `測試玩家 ${testNumber}`;
    } else {
        exiledDisplay = `<@${exiledPlayerId}>`;
    }

    // Clear PK state if exists
    delete gameState.pkRound;
    delete gameState.pkPlayers;

    // Check if exiled player is 白痴 (Idiot) and hasn't revealed yet
    if (exiledPlayer.role === '白痴' && !exiledPlayer.idiotRevealed) {
        // Automatically reveal the idiot card
        exiledPlayer.idiotRevealed = true;
        exiledPlayer.canVote = false; // Lose voting rights
        // Player stays alive (don't kill them)

        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Announce the reveal
        await channel.send({
            content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票\n\n🃏 **${exiledDisplay} 大喊：「我是白痴！」**\n\n✅ ${exiledDisplay} 翻開了白痴牌，存活下來，但從此失去投票權！\n\n🌙 **準備進入夜晚...**`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `start-night-${messageId}`,
                    label: '🌙 開始夜晚',
                    style: 1 // Blue
                }]
            }]
        });

        return; // Exit here, no death, no last words, proceed to night
    }

    // Normal exile (not 白痴 or already revealed)
    const deathList = [{
        playerId: exiledPlayerId,
        reason: '被放逐'
    }];
    WerewolfGame.killPlayer(gameState, exiledPlayerId, '被放逐', channel.guild);
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Check win condition BEFORE last words
    const winner = WerewolfGame.checkWinCondition(gameState);

    // If game is over, announce result and end game
    if (winner) {
        await channel.send({
            content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票`
        });

        const { handleGameEnd } = require('../../utils/DayPhaseHelper');
        await handleGameEnd(client, channel, messageId, gameState, winner);
        return;
    }

    // Game continues, show last words
    const lastWordsMessage = await channel.send({
        content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票\n\n💬 ${exiledDisplay} 可以發表遺言...\n\n⏱️ **剩餘時間：3 分鐘**`,
        components: [{
            type: 1,
            components: [{
                type: 2,
                custom_id: `finish-last-words-${messageId}-${exiledPlayerId}`,
                label: '✅ 遺言完畢',
                style: 3 // Green
            }]
        }]
    });

    // Store death list for later use (for hunter/wolf king shoot)
    gameState.pendingExileShoot = deathList;
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Start 180 second (3 minute) timer for last words
    let timeLeft = 180;
    const timerInterval = setInterval(async () => {
        timeLeft -= 1;
        if (timeLeft > 0) {
            try {
                const minutesLeft = Math.floor(timeLeft / 60);
                const secondsLeft = timeLeft % 60;
                const timeDisplay = minutesLeft > 0
                    ? `${minutesLeft} 分 ${secondsLeft} 秒`
                    : `${secondsLeft} 秒`;

                await lastWordsMessage.edit({
                    content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票\n\n💬 ${exiledDisplay} 可以發表遺言...\n\n⏱️ **剩餘時間：${timeDisplay}**`
                });
            } catch (error) {
                clearInterval(timerInterval);
            }
        }
    }, 1000);

    // Set timeout to auto-finish last words after 180 seconds (3 minutes)
    const timeoutId = setTimeout(async () => {
        clearInterval(timerInterval);

        // Clear timer from global map
        if (global.lastWordsTimers) {
            global.lastWordsTimers.delete(messageId);
        }

        try {
            // Update message to remove button
            await lastWordsMessage.edit({
                content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票\n\n💬 ${exiledDisplay} 可以發表遺言...\n\n⏱️ **時間到！**`,
                components: []
            });

            // Get updated game state
            const currentGameState = WerewolfGame.getGame(messageId, client.database);
            if (!currentGameState) return;

            // Get pending exile shoot data
            const pendingDeathList = currentGameState.pendingExileShoot || [];
            delete currentGameState.pendingExileShoot;
            WerewolfGame.saveGame(messageId, currentGameState, client.database);

            // Check if exiled player is hunter/wolf king and can shoot
            const { triggerShootAbility } = require('../../utils/HunterShootHelper');
            await triggerShootAbility(client, channel, messageId, currentGameState, pendingDeathList, async () => {
                // After shooting (or if no shooting), check win condition
                const latestGameState = WerewolfGame.getGame(messageId, client.database);
                if (!latestGameState) return;

                const winner = WerewolfGame.checkWinCondition(latestGameState);

                // Check for ANY win condition (villager or werewolf victory)
                if (winner) {
                    const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                    await handleGameEnd(client, channel, messageId, latestGameState, winner);
                    return;
                }

                // No winner, proceed to night
                await channel.send({
                    content: `🌙 **準備進入夜晚...**`,
                    components: [{
                        type: 1,
                        components: [{
                            type: 2,
                            custom_id: `start-night-${messageId}`,
                            label: '🌙 開始夜晚',
                            style: 1 // Blue
                        }]
                    }]
                });
            });
        } catch (error) {
            console.error('Error in last words timeout:', error);
        }
    }, 60000);

    // Store timer info globally for cancellation
    if (!global.lastWordsTimers) global.lastWordsTimers = new Map();
    global.lastWordsTimers.set(messageId, { interval: timerInterval, timeout: timeoutId });
}

/**
 * Continue exile flow after 白痴 decision or normal exile
 */
async function continueAfterExile(client, channel, messageId, gameState, exiledPlayerId, exiledDisplay, maxVotes, fullVoteSummary) {
    const deathList = [{
        playerId: exiledPlayerId,
        reason: '被放逐'
    }];

    // Check win condition BEFORE last words
    const winner = WerewolfGame.checkWinCondition(gameState);

    // If game is over, announce result and end game
    if (winner) {
        await channel.send({
            content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票`
        });

        const { handleGameEnd } = require('../../utils/DayPhaseHelper');
        await handleGameEnd(client, channel, messageId, gameState, winner);
        return;
    }

    // Game continues, show last words
    const lastWordsMessage = await channel.send({
        content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票\n\n💬 ${exiledDisplay} 可以發表遺言...\n\n⏱️ **剩餘時間：3 分鐘**`,
        components: [{
            type: 1,
            components: [{
                type: 2,
                custom_id: `finish-last-words-${messageId}`,
                label: '✅ 遺言完畢',
                style: 3 // Green
            }]
        }]
    });

    // Store death list for later use (for hunter/wolf king shoot)
    gameState.pendingExileShoot = deathList;
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Start 180 second (3 minute) timer for last words
    let timeLeft = 180;
    const timerInterval = setInterval(async () => {
        timeLeft -= 1;
        if (timeLeft > 0) {
            try {
                const minutesLeft = Math.floor(timeLeft / 60);
                const secondsLeft = timeLeft % 60;
                const timeDisplay = minutesLeft > 0
                    ? `${minutesLeft} 分 ${secondsLeft} 秒`
                    : `${secondsLeft} 秒`;

                await lastWordsMessage.edit({
                    content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票\n\n💬 ${exiledDisplay} 可以發表遺言...\n\n⏱️ **剩餘時間：${timeDisplay}**`
                });
            } catch (error) {
                clearInterval(timerInterval);
            }
        }
    }, 1000);

    // Set timeout to auto-finish last words after 180 seconds (3 minutes)
    const timeoutId = setTimeout(async () => {
        clearInterval(timerInterval);

        // Clear timer from global map
        if (global.lastWordsTimers) {
            global.lastWordsTimers.delete(messageId);
        }

        try {
            // Update message to remove button
            await lastWordsMessage.edit({
                content: `${fullVoteSummary}\n\n🗳️ **${exiledDisplay} 被放逐了！**\n票數：${maxVotes} 票\n\n💬 ${exiledDisplay} 可以發表遺言...\n\n⏱️ **時間到！**`,
                components: []
            });

            // Get updated game state
            const currentGameState = WerewolfGame.getGame(messageId, client.database);
            if (!currentGameState) return;

            // Get pending exile shoot data
            const pendingDeathList = currentGameState.pendingExileShoot || [];
            delete currentGameState.pendingExileShoot;
            WerewolfGame.saveGame(messageId, currentGameState, client.database);

            // Check if exiled player is hunter/wolf king and can shoot
            const { triggerShootAbility } = require('../../utils/HunterShootHelper');
            await triggerShootAbility(client, channel, messageId, currentGameState, pendingDeathList, async () => {
                // After shooting (or if no shooting), check win condition
                const latestGameState = WerewolfGame.getGame(messageId, client.database);
                if (!latestGameState) return;

                const winner = WerewolfGame.checkWinCondition(latestGameState);

                // Check for ANY win condition (villager or werewolf victory)
                if (winner) {
                    const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                    await handleGameEnd(client, channel, messageId, latestGameState, winner);
                    return;
                }

                // No winner, proceed to night
                await channel.send({
                    content: `🌙 **準備進入夜晚...**`,
                    components: [{
                        type: 1,
                        components: [{
                            type: 2,
                            custom_id: `start-night-${messageId}`,
                            label: '🌙 開始夜晚',
                            style: 1 // Blue
                        }]
                    }]
                });
            });
        } catch (error) {
            console.error('Error in last words timeout:', error);
        }
    }, 180000);

    // Store timer info globally for cancellation
    if (!global.lastWordsTimers) global.lastWordsTimers = new Map();
    global.lastWordsTimers.set(messageId, { interval: timerInterval, timeout: timeoutId });
}

// Export functions for use in other modules
module.exports.processVotingResults = processVotingResults;
module.exports.continueAfterExile = continueAfterExile;
