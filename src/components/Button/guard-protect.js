const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'guard-protect',
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

        // Check if user is the guard (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;

        // Find the actual guard player
        const guardPlayer = Object.values(gameState.players).find(p => p.alive && p.role === '守衛');
        const userPlayer = gameState.players[userId];

        if (!isOwner && (!userPlayer || !userPlayer.alive || userPlayer.role !== '守衛')) {
            return await interaction.reply({
                content: '❌ 你不是守衛！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get alive players (guard can protect anyone including themselves)
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState);

        // Get last night's protection target (guard cannot protect same person 2 nights in a row)
        const lastProtectTarget = gameState.guardLastProtect || null;

        // Build target options with speaking order numbers
        const targetOptions = [];
        const speakingOrder = client.database.get(`game-speaking-order-${messageId}`) || [];

        for (const playerId of speakingOrder) {
            const player = gameState.players[playerId];
            if (player && player.alive) {
                const isTestPlayer = playerId.startsWith('test-');

                // Find player's position in fixed speaking order
                const speakingOrderIndex = gameState.fixedSpeakingOrder.indexOf(playerId);
                const orderNumber = speakingOrderIndex !== -1 ? speakingOrderIndex + 1 : 0;

                let playerDisplay;
                if (isTestPlayer) {
                    const testNumber = playerId.split('-')[2];
                    playerDisplay = `${orderNumber}號 - 測試玩家 ${testNumber}`;
                } else {
                    // Try to get nickname (or username if no nickname)
                    let displayName = `玩家${orderNumber}`;
                    try {
                        const member = await interaction.guild.members.fetch(playerId);
                        displayName = member.displayName;
                    } catch (error) {
                        console.error(`Failed to fetch member ${playerId}:`, error);
                    }
                    playerDisplay = `${orderNumber}號 - ${displayName}`;
                }

                // Check if this player was protected last night
                const wasProtectedLastNight = lastProtectTarget === playerId;

                // Only add to options if NOT protected last night
                if (!wasProtectedLastNight) {
                    targetOptions.push({
                        label: playerDisplay,
                        value: playerId,
                        description: playerId === (guardPlayer?.id || userId) ? '守護自己' : '守護此玩家',
                        emoji: isTestPlayer ? undefined : '👤'
                    });
                }
            }
        }

        if (targetOptions.length === 0) {
            return await interaction.reply({
                content: '❌ 沒有可以守護的目標！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Build last protect info message
        let lastProtectInfo = '';
        if (lastProtectTarget) {
            const isTestPlayer = lastProtectTarget.startsWith('test-');
            let lastProtectDisplay;
            if (isTestPlayer) {
                const testNumber = lastProtectTarget.split('-')[2];
                lastProtectDisplay = `測試玩家 ${testNumber}`;
            } else {
                lastProtectDisplay = `<@${lastProtectTarget}>`;
            }
            lastProtectInfo = `\n\n⚠️ **上一晚守護了：${lastProtectDisplay}**\n（不能連續2晚守護同一人）`;
        }

        // Show protection selection via ephemeral reply (only guard can see)
        await interaction.reply({
            content: `🛡️ **選擇要守護的玩家：**\n\n請從下方選單選擇一名玩家進行守護：${lastProtectInfo}\n\n⏱️ 你可以在計時器結束前更改選擇`,
            components: [{
                type: 1,
                components: [{
                    type: 3, // String Select Menu
                    custom_id: `guard-protect-target-${messageId}`,
                    placeholder: '選擇要守護的玩家',
                    min_values: 1,
                    max_values: 1,
                    options: targetOptions.slice(0, 25) // Discord limit: 25 options
                }]
            }],
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();

