const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const SpeakingTimer = require("../../utils/SpeakingTimer");
const config = require("../../config");

module.exports = new Component({
    customId: 'finish-pk-speaking',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
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

        // Get current PK speaker
        const currentIndex = gameState.pkSpeaking?.current ?? -1;
        const pkOrder = gameState.pkSpeaking?.order ?? [];
        
        if (currentIndex < 0 || currentIndex >= pkOrder.length) {
            return await interaction.reply({
                content: '❌ 無效的PK發言狀態！',
                flags: MessageFlags.Ephemeral
            });
        }

        const currentSpeakerId = pkOrder[currentIndex];
        const currentSpeaker = gameState.players[currentSpeakerId];

        // Check if user is the current speaker (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;
        
        if (!isOwner && userId !== currentSpeakerId) {
            return await interaction.reply({
                content: '❌ 你不是當前PK發言者！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Cancel current speaker's timer
        SpeakingTimer.cancelTimer(messageId);

        // Move to next PK speaker
        gameState.pkSpeaking.current++;

        // Check if all PK players have spoken
        if (gameState.pkSpeaking.current >= pkOrder.length) {
            // All PK players have spoken, show start PK voting button
            delete gameState.pkSpeaking;
            WerewolfGame.saveGame(messageId, gameState, client.database);

            await interaction.update({
                components: []
            });

            // Send message with start PK voting button
            await interaction.channel.send({
                content: `✅ **所有PK玩家發言完畢！**\n\n準備開始PK投票階段。\n\n請點擊下方按鈕開始投票：`,
                components: [{
                    type: 1,
                    components: [{
                        type: 2,
                        custom_id: `start-pk-voting-${messageId}`,
                        label: '🗳️ 開始PK投票',
                        style: 1 // Blue
                    }]
                }]
            });
            return;
        }

        // Get next PK speaker
        const nextSpeakerId = pkOrder[gameState.pkSpeaking.current];
        const nextSpeaker = gameState.players[nextSpeakerId];

        // Build next speaker display
        const isTestPlayer = nextSpeakerId.startsWith('test-');
        let nextSpeakerDisplay;
        if (isTestPlayer) {
            const testNumber = nextSpeakerId.split('-')[2];
            nextSpeakerDisplay = `測試玩家 ${testNumber}`;
        } else {
            nextSpeakerDisplay = `<@${nextSpeakerId}>`;
        }

        // Save game state
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Update message to remove button
        // Delete old PK speaking message
        try {
            await interaction.message.delete();
        } catch (error) {
            console.error('Failed to delete old PK speaking message:', error);
        }

        // Acknowledge the interaction
        await interaction.deferUpdate().catch(() => {});

        // Send DM to next PK speaker
        const isTestSpeaker = nextSpeakerId.startsWith('test-');
        if (!isTestSpeaker) {
            try {
                const speakerUser = await client.users.fetch(nextSpeakerId);
                await speakerUser.send({
                    content: `🎤 **輪到你PK發言了！**\n\n現在是你的PK發言時間，請在主頻道發言。\n\n⏱️ 發言時間：**5 分鐘**\n發言完畢後，請點擊「✅ 完成PK發言」按鈕。`
                });
            } catch (error) {
                console.error(`Failed to send DM to PK speaker ${nextSpeakerId}:`, error);
            }
        }

        // Send message notifying next PK speaker (with mention for real players)
        const mentionText = isTestSpeaker ? '' : `<@${nextSpeakerId}> `;

        await interaction.channel.send({
            content: `🎤 ${mentionText}**PK發言 - 現在輪到：${nextSpeakerDisplay}**\n\n⏱️ 發言時間：**5 分鐘**\n每 1 分鐘會提醒一次\n\n發言完畢後，請點擊下方按鈕。`,
            components: [{
                type: 1,
                components: [
                    {
                        type: 2,
                        custom_id: `finish-pk-speaking-${messageId}`,
                        label: '✅ 完成PK發言',
                        style: 3 // Green
                    },
                    {
                        type: 2,
                        custom_id: `skip-speaker-${messageId}`,
                        label: '⏭️ 跳過發言者',
                        style: 2 // Gray
                    },
                    {
                        type: 2,
                        custom_id: `pause-speaking-timer-${messageId}`,
                        label: '⏸️ 暫停計時器',
                        style: 2 // Gray
                    }
                ]
            }]
        });

        // Start timer for next PK speaker with auto-advance callback
        SpeakingTimer.startTimer(
            interaction.channel,
            messageId,
            nextSpeakerId,
            gameState,
            async () => {
                // Auto-advance to next PK speaker when time is up
                await autoAdvanceToNextPKSpeaker(client, interaction.channel, messageId);
            }
        );
    }
}).toJSON();

/**
 * Start PK voting phase
 */
async function startPKVoting(client, interaction, messageId, gameState) {
    // Reset day votes for PK round
    gameState.dayVotes = {};
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Get PK players
    const pkPlayers = gameState.pkPlayers || [];

    // Build PK voting options
    const voteOptions = pkPlayers.map(playerId => {
        const isTestPlayer = playerId.startsWith('test-');
        if (isTestPlayer) {
            const testNumber = playerId.split('-')[2];
            return {
                label: `測試玩家 ${testNumber}`,
                value: playerId,
                description: `投票放逐此玩家`
            };
        } else {
            return {
                label: `玩家 ${playerId}`,
                value: playerId,
                description: `投票放逐此玩家`,
                emoji: '🗳️'
            };
        }
    });

    // Add abstain option
    voteOptions.push({
        label: '棄票',
        value: 'abstain',
        description: '選擇不投票給任何人',
        emoji: '🚫'
    });

    // Get alive players count
    const alivePlayers = WerewolfGame.getAlivePlayers(gameState);

    // Send PK voting message
    const votingMessage = await interaction.channel.send({
        content: `🗳️ **PK投票階段開始！**\n\n所有存活玩家請投票選擇要放逐的玩家（或選擇棄票）：\n\n存活玩家：${alivePlayers.length} 人\n\n⏱️ **剩餘時間：25 秒**`,
        components: [{
            type: 1,
            components: [{
                type: 3, // String Select Menu
                custom_id: `day-vote-${messageId}`,
                placeholder: '選擇要放逐的玩家或棄票',
                min_values: 1,
                max_values: 1,
                options: voteOptions.slice(0, 25) // Discord limit: 25 options
            }]
        }]
    });

    // Start 25 second timer
    let timeLeft = 25;
    const timerInterval = setInterval(async () => {
        timeLeft -= 1;
        if (timeLeft > 0) {
            try {
                await votingMessage.edit({
                    content: `🗳️ **PK投票階段進行中...**\n\n所有存活玩家請投票選擇要放逐的玩家（或選擇棄票）：\n\n存活玩家：${alivePlayers.length} 人\n\n⏱️ **剩餘時間：${timeLeft} 秒**`,
                    components: votingMessage.components
                });
            } catch (error) {
                clearInterval(timerInterval);
            }
        }
    }, 1000);

    // Store interval ID globally for cancellation
    if (!global.votingTimers) global.votingTimers = new Map();
    global.votingTimers.set(messageId, { interval: timerInterval, timeout: null });

    // Set timeout for when timer expires
    const timeoutId = setTimeout(async () => {
        clearInterval(timerInterval);
        if (global.votingTimers) global.votingTimers.delete(messageId);

        // Reload game state
        const currentGameState = WerewolfGame.getGame(messageId, client.database);

        // Always process voting results after 25 seconds
        await votingMessage.edit({
            content: `🗳️ **PK投票時間結束！**\n\n⏱️ **時間到！處理投票結果...**`,
            components: []
        });

        // Process voting results
        const { processVotingResults } = require('../SelectMenu/day-vote');
        await processVotingResults(client, interaction.channel, messageId, currentGameState);
    }, 25000);

    // Store timeout ID
    if (global.votingTimers.has(messageId)) {
        global.votingTimers.get(messageId).timeout = timeoutId;
    }
}

/**
 * Auto-advance to next PK speaker when time is up
 */
async function autoAdvanceToNextPKSpeaker(client, channel, messageId) {
    const gameState = WerewolfGame.getGame(messageId, client.database);

    if (!gameState) {
        return;
    }

    // Get current PK speaker
    const currentIndex = gameState.pkSpeaking?.current ?? -1;
    const pkOrder = gameState.pkSpeaking?.order ?? [];

    if (currentIndex < 0 || currentIndex >= pkOrder.length) {
        return;
    }

    // Move to next PK speaker
    gameState.pkSpeaking.current++;

    // Check if all PK players have spoken
    if (gameState.pkSpeaking.current >= pkOrder.length) {
        // All PK players have spoken, show start PK voting button
        delete gameState.pkSpeaking;
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Send message with start PK voting button
        await channel.send({
            content: `✅ **所有PK玩家發言完畢！**\n\n準備開始PK投票階段。\n\n請點擊下方按鈕開始投票：`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `start-pk-voting-${messageId}`,
                    label: '🗳️ 開始PK投票',
                    style: 1 // Blue
                }]
            }]
        });
        return;
    }

    // Get next PK speaker
    const nextSpeakerId = pkOrder[gameState.pkSpeaking.current];
    const nextSpeaker = gameState.players[nextSpeakerId];

    // Build next speaker display
    const isTestPlayer = nextSpeakerId.startsWith('test-');
    let nextSpeakerDisplay;
    if (isTestPlayer) {
        const testNumber = nextSpeakerId.split('-')[2];
        nextSpeakerDisplay = `測試玩家 ${testNumber}`;
    } else {
        nextSpeakerDisplay = `<@${nextSpeakerId}>`;
    }

    // Save game state
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Send DM to next PK speaker
    const isTestSpeaker = nextSpeakerId.startsWith('test-');
    if (!isTestSpeaker) {
        try {
            const speakerUser = await client.users.fetch(nextSpeakerId);
            await speakerUser.send({
                content: `🎤 **輪到你PK發言了！**\n\n現在是你的PK發言時間，請在主頻道發言。\n\n⏱️ 發言時間：**5 分鐘**\n發言完畢後，請點擊「✅ 完成PK發言」按鈕。`
            });
        } catch (error) {
            console.error(`Failed to send DM to PK speaker ${nextSpeakerId}:`, error);
        }
    }

    // Send message notifying next PK speaker (with mention for real players)
    const mentionText = isTestSpeaker ? '' : `<@${nextSpeakerId}> `;

    await channel.send({
        content: `🎤 ${mentionText}**PK發言 - 現在輪到：${nextSpeakerDisplay}**\n\n⏱️ 發言時間：**5 分鐘**\n每 1 分鐘會提醒一次\n\n發言完畢後，請點擊下方按鈕。`,
        components: [{
            type: 1,
            components: [
                {
                    type: 2,
                    custom_id: `finish-pk-speaking-${messageId}`,
                    label: '✅ 完成PK發言',
                    style: 3 // Green
                },
                {
                    type: 2,
                    custom_id: `skip-speaker-${messageId}`,
                    label: '⏭️ 跳過發言者',
                    style: 2 // Gray
                },
                {
                    type: 2,
                    custom_id: `pause-speaking-timer-${messageId}`,
                    label: '⏸️ 暫停計時器',
                    style: 2 // Gray
                }
            ]
        }]
    });

    // Start timer for next PK speaker with auto-advance callback
    SpeakingTimer.startTimer(
        channel,
        messageId,
        nextSpeakerId,
        gameState,
        async () => {
            await autoAdvanceToNextPKSpeaker(client, channel, messageId);
        }
    );
}

// Export the auto-advance function for use in other files
module.exports.autoAdvanceToNextPKSpeaker = autoAdvanceToNextPKSpeaker;
