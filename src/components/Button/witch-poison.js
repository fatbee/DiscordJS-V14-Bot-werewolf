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

        // Build victim display for error messages
        const victimId = gameState.nightActions.werewolfKill;
        let victimDisplay;
        const isTestPlayer = victimId.startsWith('test-');
        if (isTestPlayer) {
            const testNumber = victimId.split('-')[2];
            victimDisplay = `測試玩家 ${testNumber}`;
        } else {
            victimDisplay = `<@${victimId}>`;
        }

        // Check if witch already used antidote this night
        if (gameState.nightActions.witchAction === 'antidote') {
            return await interaction.reply({
                content: `❌ **你已經使用了解藥，不能再使用毒藥！**\n\n今晚被狼人殺死的是：${victimDisplay}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if witch has poison
        if (!gameState.witchPotions[witchId]?.poison) {
            return await interaction.reply({
                content: `❌ **女巫已經使用過毒藥了！**\n\n今晚被狼人殺死的是：${victimDisplay}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Get alive players (excluding witch and werewolf kill victim)
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState).filter(p =>
            p.id !== witchId && p.id !== victimId
        );

        // Build target selection options
        const targetOptions = alivePlayers.map(player => {
            const isTestPlayer = player.id.startsWith('test-');
            if (isTestPlayer) {
                const testNumber = player.id.split('-')[2];
                return {
                    label: `測試玩家 ${testNumber}`,
                    value: player.id,
                    description: `毒死此玩家`
                };
            } else {
                return {
                    label: `玩家 ${player.id}`,
                    value: player.id,
                    description: `毒死此玩家`,
                    emoji: '☠️'
                };
            }
        });

        if (targetOptions.length === 0) {
            return await interaction.reply({
                content: `❌ **沒有可以毒殺的目標！**\n\n今晚被狼人殺死的是：${victimDisplay}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Show poison selection via ephemeral reply (only witch can see)
        await interaction.reply({
            content: `☠️ **選擇要毒殺的目標：**\n\n今晚被狼人殺死的是：${victimDisplay}\n\n請從下方選單選擇一名玩家：\n\n⏱️ 你可以在計時器結束前更改選擇`,
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

