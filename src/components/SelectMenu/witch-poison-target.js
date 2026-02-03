const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const PlayerStats = require("../../utils/PlayerStats");
const config = require("../../config");

module.exports = new Component({
    customId: 'witch-poison-target',
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

        // Use witch player's ID for potion tracking
        const witchId = isOwner && witchPlayer ? witchPlayer.id : userId;

        // Check if witch already used antidote this night
        if (gameState.nightActions.witchAction === 'antidote') {
            return await interaction.reply({
                content: '❌ **你已經使用了解藥，不能再使用毒藥！**',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get selected target
        const targetId = interaction.values[0];
        const targetPlayer = gameState.players[targetId];

        if (!targetPlayer || !targetPlayer.alive) {
            return await interaction.reply({
                content: '❌ 無效的目標！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Use poison
        gameState.nightActions.witchAction = 'poison';
        gameState.nightActions.witchPoisonTarget = targetId;
        gameState.witchPotions[witchId].poison = false; // Mark poison as used

        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Record witch poison statistics (skip test players)
        if (!userId.startsWith('test-')) {
            PlayerStats.recordWitchPoison(userId);
        }

        // Build target display
        const isTestPlayer = targetId.startsWith('test-');
        let targetDisplay;
        if (isTestPlayer) {
            const testNumber = targetId.split('-')[2];
            targetDisplay = `測試玩家 ${testNumber}`;
        } else {
            targetDisplay = `<@${targetId}>`;
        }

        // Build werewolf victim display
        const victimId = gameState.nightActions.werewolfKill;
        let victimDisplay;
        const isVictimTestPlayer = victimId.startsWith('test-');
        if (isVictimTestPlayer) {
            const testNumber = victimId.split('-')[2];
            victimDisplay = `測試玩家 ${testNumber}`;
        } else {
            victimDisplay = `<@${victimId}>`;
        }

        // Send confirmation to witch via ephemeral reply (show both who died and who was poisoned)
        await interaction.update({
            content: `☠️ **你使用了毒藥！**\n\n今晚被狼人殺死的是：${victimDisplay}\n你毒殺了：${targetDisplay}\n\n⏱️ 請等待計時器結束...\n\n💡 你可以在計時器結束前更改選擇`,
            components: interaction.message.components
        });

        // Note: Timer will handle updating main channel message and proceeding to day phase
        // Don't update main channel message or trigger day phase here
    }
}).toJSON();