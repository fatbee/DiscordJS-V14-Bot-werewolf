const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'force-day',
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

        // Only allow bot owner in test mode
        const userId = interaction.user.id;
        if (!config.werewolf.testMode || userId !== config.users.ownerId) {
            return await interaction.reply({
                content: '❌ 只有測試模式下的 Bot Owner 可以使用此功能！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if game is in night phase
        if (gameState.phase !== 'night') {
            return await interaction.reply({
                content: `❌ 當前階段不是夜晚！當前階段：${gameState.phase}`,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.reply({
            content: '⚠️ **強制觸發天亮...**',
            flags: MessageFlags.Ephemeral
        });

        // Trigger day phase manually
        const { triggerDayPhase } = require('../../utils/DayPhaseHelper');
        await triggerDayPhase(client, interaction.channel, messageId, gameState);
    }
}).toJSON();

