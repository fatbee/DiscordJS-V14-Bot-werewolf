const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const SpeakingTimer = require("../../utils/SpeakingTimer");
const config = require("../../config");

module.exports = new Component({
    customId: 'finish-speaking',
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

        // Check if it's the current speaker's turn (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;
        const currentSpeakerId = gameState.speaking.order[gameState.speaking.current];

        if (!isOwner && userId !== currentSpeakerId) {
            return await interaction.reply({
                content: '❌ 現在不是你的發言時間！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Cancel current speaker's timer
        SpeakingTimer.cancelTimer(messageId);

        // Mark current speaker as having spoken
        if (gameState.players[currentSpeakerId]) {
            gameState.players[currentSpeakerId].hasSpoken = true;
        }

        // Move to next speaker
        gameState.speaking.current++;

        // Check if all players have spoken
        if (gameState.speaking.current >= gameState.speaking.order.length) {
            // All players have spoken, show start voting button
            WerewolfGame.saveGame(messageId, gameState, client.database);

            await interaction.update({
                components: []
            });

            // Send message with start voting button
            await interaction.channel.send({
                content: `✅ **所有玩家發言完畢！**\n\n準備開始投票階段。\n\n請點擊下方按鈕開始投票：`,
                components: [{
                    type: 1,
                    components: [{
                        type: 2,
                        custom_id: `start-voting-${messageId}`,
                        label: '🗳️ 開始投票',
                        style: 1 // Blue
                    }]
                }]
            });
            return;
        }

        // Get next speaker
        const nextSpeakerId = gameState.speaking.order[gameState.speaking.current];
        const nextPlayer = gameState.players[nextSpeakerId];

        const isTestPlayer = nextSpeakerId.startsWith('test-');
        let nextPlayerDisplay;
        if (isTestPlayer) {
            const testNumber = nextSpeakerId.split('-')[2];
            nextPlayerDisplay = `測試玩家 ${testNumber}`;
        } else {
            nextPlayerDisplay = `<@${nextSpeakerId}>`;
        }

        // Save game state
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Remove button from old message
        await interaction.update({
            components: []
        });

        // Always show all three buttons for all players (to hide knight/werewolf identity)
        const components = [{
            type: 1,
            components: [
                {
                    type: 2,
                    custom_id: `werewolf-self-destruct-${messageId}`,
                    label: '💣 自爆',
                    style: 4 // Red/Danger
                },
                {
                    type: 2,
                    custom_id: `knight-duel-${messageId}`,
                    label: '⚔️ 決鬥',
                    style: 4 // Red/Danger
                },
                {
                    type: 2,
                    custom_id: `finish-speaking-${messageId}`,
                    label: '✅ 完成發言',
                    style: 3 // Green
                }
            ]
        }];

        // Send new message for next speaker
        await interaction.channel.send({
            content: `🎤 **現在輪到：${nextPlayerDisplay} 發言**\n\n⏱️ 發言時間：**3 分鐘**\n每 1 分鐘會提醒一次\n\n發言完畢後，請點擊下方按鈕。`,
            components: components
        });

        // Start timer for next speaker with auto-advance callback
        SpeakingTimer.startTimer(
            interaction.channel,
            messageId,
            nextSpeakerId,
            gameState,
            async () => {
                // Auto-advance to next speaker when time is up
                await autoAdvanceToNextSpeaker(client, interaction.channel, messageId);
            }
        );
    }
}).toJSON();

/**
 * Start voting phase
 */
async function startVoting(client, interaction, messageId, gameState) {
    // Reset day votes
    gameState.dayVotes = {};
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Get alive players
    const alivePlayers = WerewolfGame.getAlivePlayers(gameState);

    // Build voting options
    const voteOptions = alivePlayers.map(player => {
        const isTestPlayer = player.id.startsWith('test-');
        if (isTestPlayer) {
            const testNumber = player.id.split('-')[2];
            return {
                label: `測試玩家 ${testNumber}`,
                value: player.id,
                description: `投票放逐此玩家`
            };
        } else {
            return {
                label: `玩家 ${player.id}`,
                value: player.id,
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

    // Send voting message
    const votingMessage = await interaction.channel.send({
        content: `🗳️ **投票階段開始！**\n\n所有存活玩家請投票選擇要放逐的玩家（或選擇棄票）：\n\n存活玩家：${alivePlayers.length} 人\n\n⏱️ **剩餘時間：25 秒**`,
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
                    content: `🗳️ **投票階段進行中...**\n\n所有存活玩家請投票選擇要放逐的玩家（或選擇棄票）：\n\n存活玩家：${alivePlayers.length} 人\n\n⏱️ **剩餘時間：${timeLeft} 秒**`,
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
            content: `🗳️ **投票時間結束！**\n\n⏱️ **時間到！處理投票結果...**`,
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
 * Auto-advance to next speaker when time is up
 */
async function autoAdvanceToNextSpeaker(client, channel, messageId) {
    const gameState = WerewolfGame.getGame(messageId, client.database);

    if (!gameState) {
        return;
    }

    // Mark current speaker as having spoken
    const currentSpeakerId = gameState.speaking.order[gameState.speaking.current];
    if (gameState.players[currentSpeakerId]) {
        gameState.players[currentSpeakerId].hasSpoken = true;
    }

    // Move to next speaker
    gameState.speaking.current++;

    // Check if all players have spoken
    if (gameState.speaking.current >= gameState.speaking.order.length) {
        // All players have spoken, show start voting button
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Send message with start voting button
        await channel.send({
            content: `✅ **所有玩家發言完畢！**\n\n準備開始投票階段。\n\n請點擊下方按鈕開始投票：`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `start-voting-${messageId}`,
                    label: '🗳️ 開始投票',
                    style: 1 // Blue
                }]
            }]
        });
        return;
    }

    // Get next speaker
    const nextSpeakerId = gameState.speaking.order[gameState.speaking.current];
    const nextPlayer = gameState.players[nextSpeakerId];

    const isTestPlayer = nextSpeakerId.startsWith('test-');
    let nextPlayerDisplay;
    if (isTestPlayer) {
        const testNumber = nextSpeakerId.split('-')[2];
        nextPlayerDisplay = `測試玩家 ${testNumber}`;
    } else {
        nextPlayerDisplay = `<@${nextSpeakerId}>`;
    }

    // Save game state
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Always show all three buttons for all players (to hide knight/werewolf identity)
    const components = [{
        type: 1,
        components: [
            {
                type: 2,
                custom_id: `werewolf-self-destruct-${messageId}`,
                label: '💣 自爆',
                style: 4 // Red/Danger
            },
            {
                type: 2,
                custom_id: `knight-duel-${messageId}`,
                label: '⚔️ 決鬥',
                style: 4 // Red/Danger
            },
            {
                type: 2,
                custom_id: `finish-speaking-${messageId}`,
                label: '✅ 完成發言',
                style: 3 // Green
            }
        ]
    }];

    // Send new message for next speaker
    await channel.send({
        content: `🎤 **現在輪到：${nextPlayerDisplay} 發言**\n\n⏱️ 發言時間：**3 分鐘**\n每 1 分鐘會提醒一次\n\n發言完畢後，請點擊下方按鈕。`,
        components: components
    });

    // Start timer for next speaker with auto-advance callback
    SpeakingTimer.startTimer(
        channel,
        messageId,
        nextSpeakerId,
        gameState,
        async () => {
            await autoAdvanceToNextSpeaker(client, channel, messageId);
        }
    );
}

// Export the auto-advance function for use in other files
module.exports.autoAdvanceToNextSpeaker = autoAdvanceToNextSpeaker;
