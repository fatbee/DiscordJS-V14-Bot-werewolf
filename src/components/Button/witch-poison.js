const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'witch-poison',
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

        // Check if user is the witch (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;

        // Find the actual witch player
        const witchPlayer = Object.values(gameState.players).find(p => p.alive && p.role === '女巫');
        const userPlayer = gameState.players[userId];

        if (!isOwner && (!userPlayer || !userPlayer.alive || userPlayer.role !== '女巫')) {
            return await interaction.reply({
                content: '❌ 你不是女巫！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Use witch player's ID for potion check (or owner's ID if in test mode)
        const witchId = isOwner && witchPlayer ? witchPlayer.id : userId;

        // Check if witch has antidote available
        const hasAntidote = gameState.witchPotions[witchId]?.antidote;

        // Build victim display for error messages (only if antidote is available)
        let victimDisplay = '';
        if (hasAntidote) {
            const victimId = gameState.nightActions.werewolfKill;
            const isTestPlayer = victimId.startsWith('test-');
            if (isTestPlayer) {
                const testNumber = victimId.split('-')[2];
                victimDisplay = `\n\n今晚被狼人殺死的是：測試玩家 ${testNumber}`;
            } else {
                victimDisplay = `\n\n今晚被狼人殺死的是：<@${victimId}>`;
            }
        }

        // Check if witch already used antidote this night
        if (gameState.nightActions.witchAction === 'antidote') {
            return await interaction.reply({
                content: `❌ **你已經使用了解藥，不能再使用毒藥！**${victimDisplay}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if witch has poison
        if (!gameState.witchPotions[witchId]?.poison) {
            return await interaction.reply({
                content: `❌ **女巫已經使用過毒藥了！**${victimDisplay}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Get alive players (excluding witch only, include werewolf kill victim)
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState).filter(p =>
            p.id !== witchId
        );

        // Build target selection options with speaking order numbers
        const targetOptions = [];
        for (const player of alivePlayers) {
            const isTestPlayer = player.id.startsWith('test-');

            // Find player's position in speaking order
            const speakingOrderIndex = gameState.speaking.order.indexOf(player.id);
            const orderNumber = speakingOrderIndex + 1;

            if (isTestPlayer) {
                const testNumber = player.id.split('-')[2];
                targetOptions.push({
                    label: `${orderNumber}號 - 測試玩家 ${testNumber}`,
                    value: player.id,
                    description: `毒死此玩家`
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
                    description: `毒死此玩家`,
                    emoji: '☠️'
                });
            }
        }

        if (targetOptions.length === 0) {
            return await interaction.reply({
                content: `❌ **沒有可以毒殺的目標！**${victimDisplay}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Show poison selection via ephemeral reply (only witch can see)
        // Only show victim if antidote is still available
        const poisonContent = hasAntidote
            ? `☠️ **選擇要毒殺的目標：**${victimDisplay}\n\n請從下方選單選擇一名玩家：\n\n⏱️ 你可以在計時器結束前更改選擇`
            : `☠️ **選擇要毒殺的目標：**\n\n請從下方選單選擇一名玩家：\n\n⏱️ 你可以在計時器結束前更改選擇`;

        await interaction.reply({
            content: poisonContent,
            components: [{
                type: 1,
                components: [{
                    type: 3, // String Select Menu
                    custom_id: `witch-poison-target-${messageId}`,
                    placeholder: '選擇要毒殺的玩家',
                    min_values: 1,
                    max_values: 1,
                    options: targetOptions.slice(0, 25) // Discord limit: 25 options
                }]
            }],
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();

