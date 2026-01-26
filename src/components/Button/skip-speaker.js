const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const SpeakingTimer = require("../../utils/SpeakingTimer");
const config = require("../../config");

module.exports = new Component({
    customId: 'skip-speaker',
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

        // Check if user is bot owner (only owner can skip speakers)
        const userId = interaction.user.id;
        if (userId !== config.users.ownerId) {
            return await interaction.reply({
                content: '❌ 只有主持人可以跳過發言者！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get current speaker
        const currentSpeakerId = gameState.speaking.order[gameState.speaking.current];
        const isTestPlayer = currentSpeakerId.startsWith('test-');
        let currentSpeakerDisplay;
        if (isTestPlayer) {
            const testNumber = currentSpeakerId.split('-')[2];
            currentSpeakerDisplay = `測試玩家 ${testNumber}`;
        } else {
            currentSpeakerDisplay = `<@${currentSpeakerId}>`;
        }

        // Cancel current speaker's timer
        SpeakingTimer.cancelTimer(messageId);

        // Send notification that speaker was skipped
        await interaction.reply({
            content: `⏭️ **主持人跳過了 ${currentSpeakerDisplay} 的發言**`,
            flags: MessageFlags.Ephemeral
        });

        // Remove buttons from current message
        await interaction.message.edit({
            components: []
        });

        // Use the auto-advance function to move to next speaker
        const { autoAdvanceToNextSpeaker } = require('./finish-speaking');
        await autoAdvanceToNextSpeaker(client, interaction.channel, messageId);
    }
}).toJSON();

