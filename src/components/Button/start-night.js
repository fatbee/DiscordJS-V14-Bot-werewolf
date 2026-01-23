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
        for (const player of alivePlayers) {
            const isTestPlayer = player.id.startsWith('test-');
            if (isTestPlayer) {
                const testNumber = player.id.split('-')[2];
                aliveListText += `• 測試玩家 ${testNumber} - ${getRoleDisplay(player.role)}\n`;
            } else {
                aliveListText += `• <@${player.id}> - ${getRoleDisplay(player.role)}\n`;
            }
        }

        // Send night announcement to main channel
        await interaction.channel.send({
            content: `🌙 **第 ${gameState.round} 夜降臨...**\n\n天黑請閉眼，所有玩家請停止發言。\n\n**存活玩家：** (${alivePlayers.length} 人)\n${aliveListText}\n各角色請開始行動...`
        });

        // Send waiting message to main channel
        await interaction.channel.send({
            content: `⏳ **等待狼人行動中...**\n\n狼人請前往私密頻道討論並選擇目標。`
        });

        // Send werewolf action prompt to werewolf channel
        if (werewolfChannel) {
            const aliveWerewolves = WerewolfGame.getAliveWerewolves(gameState);
            const aliveVillagers = WerewolfGame.getAliveVillagers(gameState);
            
            // Build target selection options
            const targetOptions = aliveVillagers.map(player => {
                const isTestPlayer = player.id.startsWith('test-');
                if (isTestPlayer) {
                    const testNumber = player.id.split('-')[2];
                    return {
                        label: `測試玩家 ${testNumber}`,
                        value: player.id,
                        description: config.werewolf.testMode ? `角色：${player.role}` : `選擇此玩家`
                    };
                } else {
                    return {
                        label: `玩家 ${player.id}`,
                        value: player.id,
                        description: config.werewolf.testMode ? `角色：${player.role}` : `選擇此玩家`,
                        emoji: '👤'
                    };
                }
            });

            if (aliveWerewolves.length > 0 && targetOptions.length > 0) {
                const werewolfMessage = await werewolfChannel.send({
                    content: `🐺 **狼人請睜眼！**\n\n請討論並選擇今晚要殺死的目標：\n\n⏱️ **剩餘時間：25 秒**`,
                    components: [{
                        type: 1,
                        components: [{
                            type: 3, // String Select Menu
                            custom_id: `werewolf-kill-${messageId}`,
                            placeholder: '選擇要殺死的玩家',
                            min_values: 1,
                            max_values: 1,
                            options: targetOptions.slice(0, 25) // Discord limit: 25 options
                        }]
                    }]
                });

                // Store timer info in game state for cancellation
                gameState.werewolfTimer = {
                    messageId: werewolfMessage.id,
                    channelId: werewolfChannel.id
                };
                WerewolfGame.saveGame(messageId, gameState, client.database);

                // Start 25 second timer
                let timeLeft = 25;
                const timerInterval = setInterval(async () => {
                    timeLeft -= 1;
                    if (timeLeft > 0) {
                        try {
                            await werewolfMessage.edit({
                                content: `🐺 **狼人請睜眼！**\n\n請討論並選擇今晚要殺死的目標：\n\n⏱️ **剩餘時間：${timeLeft} 秒**`
                            });
                        } catch (error) {
                            clearInterval(timerInterval);
                        }
                    }
                }, 1000);

                // Store interval ID globally for cancellation
                if (!global.werewolfTimers) global.werewolfTimers = new Map();
                global.werewolfTimers.set(messageId, { interval: timerInterval, timeout: null });

                // After 25 seconds, check if werewolves made a choice
                const timeoutId = setTimeout(async () => {
                    clearInterval(timerInterval);

                    // Clean up timer storage
                    if (global.werewolfTimers) {
                        global.werewolfTimers.delete(messageId);
                    }

                    // Reload game state to check if action was taken
                    const currentGameState = WerewolfGame.getGame(messageId, client.database);
                    if (!currentGameState.nightActions.werewolfKill) {
                        // No choice made, randomly select a victim
                        const randomVictim = aliveVillagers[Math.floor(Math.random() * aliveVillagers.length)];
                        currentGameState.nightActions.werewolfKill = randomVictim.id;
                        WerewolfGame.saveGame(messageId, currentGameState, client.database);

                        // Build victim display
                        const isTestPlayer = randomVictim.id.startsWith('test-');
                        let victimDisplay;
                        if (isTestPlayer) {
                            const testNumber = randomVictim.id.split('-')[2];
                            victimDisplay = `測試玩家 ${testNumber}`;
                        } else {
                            victimDisplay = `<@${randomVictim.id}>`;
                        }

                        // Update werewolf channel
                        await werewolfMessage.edit({
                            content: `🐺 **狼人已選擇目標！**\n\n目標：${victimDisplay}\n\n⏱️ **時間到！系統隨機選擇**\n\n✅ 狼人請閉眼，等待其他角色行動...`,
                            components: []
                        });

                        // Get main channel and trigger seer action
                        const mainChannel = await client.channels.fetch(client.database.get(`game-channel-${messageId}`));
                        const { triggerSeerAction } = require('../SelectMenu/werewolf-kill');
                        await triggerSeerAction(client, mainChannel, messageId, currentGameState, randomVictim.id);
                    }
                }, 25000);

                // Store timeout ID
                if (global.werewolfTimers.has(messageId)) {
                    global.werewolfTimers.get(messageId).timeout = timeoutId;
                }
            }
        }

        // TEST MODE: Send summary to bot owner
        if (config.werewolf.testMode) {
            try {
                const owner = await client.users.fetch(config.users.ownerId);
                await owner.send({
                    content: `🎮 **測試模式 - 夜晚階段開始**\n\n你可以扮演所有角色進行操作：\n\n🐺 **狼人頻道**：前往狼人頻道選擇殺人目標\n🔮 **預言家**：等待狼人行動後在主頻道選擇查驗目標\n🧙‍♀️ **女巫**：等待預言家行動後在主頻道選擇行動\n\n當前存活玩家：${alivePlayers.length} 人`
                });
            } catch (error) {
                console.error(`Failed to send test mode summary to owner:`, error);
            }
        }
    }
}).toJSON();

