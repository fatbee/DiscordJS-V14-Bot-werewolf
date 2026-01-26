const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { getRoleDisplay } = require("../../utils/WerewolfRoles");
const config = require("../../config");

module.exports = new Component({
    customId: 'start-night',
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

        // Update game phase to night
        gameState.phase = 'night';
        gameState.nightActions = {}; // Reset night actions
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Remove button from original message
        await interaction.update({
            components: []
        });

        // Get werewolf channel
        const werewolfChannelId = client.database.get(`game-werewolf-channel-${messageId}`);
        let werewolfChannel = null;
        if (werewolfChannelId) {
            try {
                werewolfChannel = await interaction.guild.channels.fetch(werewolfChannelId);
            } catch (error) {
                console.error('Failed to fetch werewolf channel:', error);
            }
        }

        // Build alive players list
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState);
        let aliveListText = '';

        // Only show roles in test mode
        if (config.werewolf.testMode) {
            for (const player of alivePlayers) {
                const isTestPlayer = player.id.startsWith('test-');
                if (isTestPlayer) {
                    const testNumber = player.id.split('-')[2];
                    aliveListText += `• 測試玩家 ${testNumber} - ${getRoleDisplay(player.role)}\n`;
                } else {
                    aliveListText += `• <@${player.id}> - ${getRoleDisplay(player.role)}\n`;
                }
            }
        } 

        // Send night announcement to main channel
        await interaction.channel.send({
            content: `🌙 **第 ${gameState.round} 夜降臨...**\n\n天黑請閉眼，所有玩家請停止發言。\n\n**存活玩家：** (${alivePlayers.length} 人)\n${aliveListText}\n各角色請開始行動...`
        });

        // Initialize werewolf votes
        gameState.werewolfVotes = {};
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Send werewolf voting prompt to main channel
        const aliveWerewolves = WerewolfGame.getAliveWerewolves(gameState);
        const aliveVillagers = WerewolfGame.getAliveVillagers(gameState);

        // Check if hidden werewolf should be activated
        // Hidden werewolf activates when all 狼王 and 狼人 are dead
        const hiddenWerewolf = Object.values(gameState.players).find(p => p.role === '隱狼' && p.alive);
        const otherWerewolves = Object.values(gameState.players).filter(p =>
            (p.role === '狼王' || p.role === '狼人') && p.alive
        );
        const hiddenWerewolfActivated = hiddenWerewolf && otherWerewolves.length === 0;

        // Check if there are no villagers (werewolves won)
        if (aliveVillagers.length === 0) {
            // No villagers left, werewolves win
            const winner = WerewolfGame.checkWinCondition(gameState);
            if (winner === 'werewolf') {
                const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                await handleGameEnd(client, interaction.channel, messageId, gameState, winner);
                return;
            }
        }

        // Check if we should use hidden werewolf or normal werewolves
        if ((aliveWerewolves.length > 0 || hiddenWerewolfActivated) && aliveVillagers.length > 0) {
            // Build target selection options with speaking order numbers
            const targetOptions = [];
            for (const player of aliveVillagers) {
                const isTestPlayer = player.id.startsWith('test-');

                // Find player's position in speaking order
                const speakingOrderIndex = gameState.speaking.order.indexOf(player.id);
                const orderNumber = speakingOrderIndex + 1;

                if (isTestPlayer) {
                    const testNumber = player.id.split('-')[2];
                    targetOptions.push({
                        label: `${orderNumber}號 - 測試玩家 ${testNumber}`,
                        value: player.id,
                        description: config.werewolf.testMode ? `角色：${player.role}` : `選擇此玩家`
                    });
                } else {
                    // Try to get nickname (or username if no nickname)
                    let displayName = `玩家${orderNumber}`;
                    try {
                        const member = await interaction.guild.members.fetch(player.id);
                        displayName = member.displayName; // This returns nickname if set, otherwise username
                    } catch (error) {
                        console.error(`Failed to fetch member ${player.id}:`, error);
                    }

                    targetOptions.push({
                        label: `${orderNumber}號 - ${displayName}`,
                        value: player.id,
                        description: config.werewolf.testMode ? `角色：${player.role}` : `選擇此玩家`,
                        emoji: '👤'
                    });
                }
            }

            const testModeText = config.werewolf.testMode ? '\n\n🎮 **測試模式**' : '';

            // Use different custom_id and message for hidden werewolf
            const customId = hiddenWerewolfActivated ? `hidden-werewolf-kill-${messageId}` : `werewolf-kill-${messageId}`;
            const messageContent = hiddenWerewolfActivated
                ? `🌑🐺 **隱狼請睜眼！**\n\n隱狼請選擇今晚要殺死的目標：${testModeText}\n\n⏱️ **剩餘時間：25 秒**`
                : `🐺 **狼人請睜眼！**\n\n狼人請投票選擇今晚要殺死的目標：${testModeText}\n\n⏱️ **剩餘時間：25 秒**`;

            const werewolfMessage = await interaction.channel.send({
                content: messageContent,
                components: [{
                    type: 1,
                    components: [{
                        type: 3, // String Select Menu
                        custom_id: customId,
                        placeholder: '選擇要殺死的玩家',
                        min_values: 1,
                        max_values: 1,
                        options: targetOptions.slice(0, 25) // Discord limit: 25 options
                    }]
                }]
            });

            // Start 25 second timer
            let timeLeft = 25;
            const baseMessage = hiddenWerewolfActivated
                ? `🌑🐺 **隱狼請睜眼！**\n\n隱狼請選擇今晚要殺死的目標：${testModeText}`
                : `🐺 **狼人請睜眼！**\n\n狼人請投票選擇今晚要殺死的目標：${testModeText}`;

            const timerInterval = setInterval(async () => {
                timeLeft -= 1;
                if (timeLeft > 0) {
                    try {
                        await werewolfMessage.edit({
                            content: `${baseMessage}\n\n⏱️ **剩餘時間：${timeLeft} 秒**`
                        });
                    } catch (error) {
                        clearInterval(timerInterval);
                    }
                }
            }, 1000);

            // Store interval ID globally for cancellation
            if (!global.werewolfTimers) global.werewolfTimers = new Map();
            global.werewolfTimers.set(messageId, { interval: timerInterval, timeout: null });

            // After 25 seconds, process votes
            const timeoutId = setTimeout(async () => {
                clearInterval(timerInterval);

                // Clean up timer storage
                if (global.werewolfTimers) {
                    global.werewolfTimers.delete(messageId);
                }

                // Reload game state to check votes
                const currentGameState = WerewolfGame.getGame(messageId, client.database);
                const votes = currentGameState.werewolfVotes || {};

                let targetId = null;

                if (Object.keys(votes).length === 0) {
                    // No votes, randomly select a victim
                    const randomVictim = aliveVillagers[Math.floor(Math.random() * aliveVillagers.length)];
                    targetId = randomVictim.id;
                } else {
                    // Count votes
                    const voteCounts = {};
                    const voteOrder = []; // Track order of first vote for each target

                    for (const [voter, target] of Object.entries(votes)) {
                        if (!voteCounts[target]) {
                            voteCounts[target] = 0;
                            voteOrder.push(target);
                        }
                        voteCounts[target]++;
                    }

                    // Find max votes
                    const maxVotes = Math.max(...Object.values(voteCounts));
                    const topTargets = Object.keys(voteCounts).filter(t => voteCounts[t] === maxVotes);

                    // If tie, select first voted target
                    if (topTargets.length > 1) {
                        targetId = voteOrder.find(t => topTargets.includes(t));
                    } else {
                        targetId = topTargets[0];
                    }
                }

                // Save kill action
                currentGameState.nightActions.werewolfKill = targetId;
                WerewolfGame.saveGame(messageId, currentGameState, client.database);

                // Build victim display
                const isTestPlayer = targetId.startsWith('test-');
                let victimDisplay;
                if (isTestPlayer) {
                    const testNumber = targetId.split('-')[2];
                    victimDisplay = `測試玩家 ${testNumber}`;
                } else {
                    victimDisplay = `<@${targetId}>`;
                }

                // Update message
                const completionMessage = hiddenWerewolfActivated
                    ? `🌑🐺 **隱狼已選擇目標！**\n\n目標：${victimDisplay}\n\n✅ 隱狼請閉眼，等待其他角色行動...`
                    : `🐺 **狼人已選擇目標！**\n\n目標：${victimDisplay}\n\n✅ 狼人請閉眼，等待其他角色行動...`;

                await werewolfMessage.edit({
                    content: completionMessage,
                    components: []
                });

                // Continue night phase with NightPhaseController
                const NightPhaseController = require('../../utils/NightPhaseController');
                const { getNightActionOrder } = require('../../utils/WerewolfRoles');
                const nightActionOrder = getNightActionOrder();

                // Find index of next role after werewolf
                const werewolfIndex = nightActionOrder.findIndex(role => role === '狼王' || role === '狼人');
                const nextIndex = werewolfIndex + 1;

                // Continue with next role in sequence
                await NightPhaseController.processNextRole(client, interaction.channel, messageId, currentGameState, nightActionOrder, nextIndex);
            }, 25000);

            // Store timeout ID
            if (global.werewolfTimers.has(messageId)) {
                global.werewolfTimers.get(messageId).timeout = timeoutId;
            }
        }

        // TEST MODE: Send summary to bot owner
        if (config.werewolf.testMode) {
            try {
                const owner = await client.users.fetch(config.users.ownerId);
                await owner.send({
                    content: `🎮 **測試模式 - 夜晚階段開始**\n\n你可以扮演所有角色進行操作：\n\n🐺 **狼人投票**：在主頻道選擇殺人目標\n🔮 **預言家**：等待狼人行動後在主頻道選擇查驗目標\n🧙‍♀️ **女巫**：等待預言家行動後在主頻道選擇行動\n\n當前存活玩家：${alivePlayers.length} 人`
                });
            } catch (error) {
                console.error(`Failed to send test mode summary to owner:`, error);
            }
        }
    }
}).toJSON();

