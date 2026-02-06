const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const PlayerStats = require("../../utils/PlayerStats");
const config = require("../../config");

module.exports = new Component({
    customId: 'witch-antidote-confirm',
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

        // Get selected action
        const action = interaction.values[0];

        // Build victim display with speaking order number
        const victimId = gameState.nightActions.werewolfKill;
        let victimDisplay;
        const isTestPlayer = victimId.startsWith('test-');

        // Find victim's position in fixed speaking order
        const speakingOrderIndex = gameState.fixedSpeakingOrder.indexOf(victimId);
        const orderNumber = speakingOrderIndex !== -1 ? speakingOrderIndex + 1 : 0;

        if (isTestPlayer) {
            const testNumber = victimId.split('-')[2];
            victimDisplay = `${orderNumber}號 - 測試玩家 ${testNumber}`;
        } else {
            // Try to get nickname (or username if no nickname)
            let displayName = `玩家${orderNumber}`;
            try {
                const member = await interaction.guild.members.fetch(victimId);
                displayName = member.displayName;
            } catch (error) {
                console.error(`Failed to fetch member ${victimId}:`, error);
            }
            victimDisplay = `${orderNumber}號 - ${displayName}`;
        }

        if (action === 'save') {
            // Check if witch already used poison this night
            const previousAction = gameState.nightActions.witchAction;
            
            // Use antidote to save werewolf kill victim
            // If poison was selected before, override it with antidote
            gameState.nightActions.witchAction = 'antidote';
            gameState.nightActions.witchAntidoteTarget = victimId;
            gameState.witchPotions[witchId].antidote = false; // Mark antidote as used
            
            // If poison was selected before, restore poison availability and clear poison target
            if (previousAction === 'poison') {
                gameState.witchPotions[witchId].poison = true; // Restore poison
                gameState.nightActions.witchPoisonTarget = null; // Clear poison target
            }

            WerewolfGame.saveGame(messageId, gameState, client.database);

            // Record witch save statistics (skip test players)
            if (!userId.startsWith('test-')) {
                PlayerStats.recordWitchSave(userId);
            }

            // Send confirmation to witch via ephemeral reply (show who was saved)
            const overrideMessage = previousAction === 'poison' ? '\n\n⚠️ 你之前選擇的毒藥已被取消' : '';
            await interaction.update({
                content: `💊 **你使用了解藥！**\n\n今晚被狼人殺死的是：${victimDisplay}\n\n你救活了這名玩家。${overrideMessage}\n\n⏱️ 請等待計時器結束...`,
                components: []
            });
        } else if (action === 'no-save') {
            // Witch chose not to use antidote
            // Don't mark antidote as used, just skip
            await interaction.update({
                content: `❌ **你選擇不使用解藥**\n\n今晚被狼人殺死的是：${victimDisplay}\n\n⏱️ 請等待計時器結束...`,
                components: []
            });
        }

        // Note: Timer will handle updating message and proceeding to day phase
        // Don't update main channel message or trigger day phase here
    }
}).toJSON();

