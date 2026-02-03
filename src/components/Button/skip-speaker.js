const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const SpeakingTimer = require("../../utils/SpeakingTimer");
const config = require("../../config");
const { hasHostPermission } = require("../../utils/WerewolfPermissions");

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

        // Check if user has host permission (bot owner, admin, or 狼GM role)
        if (!hasHostPermission(interaction)) {
            return await interaction.reply({
                content: '❌ 只有主持人、管理員或擁有「狼GM」身份組可以跳過發言者！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if this is PK speaking phase or normal speaking phase
        const isPKPhase = gameState.pkSpeaking && gameState.pkSpeaking.current >= 0;

        let currentSpeakerId;
        let currentSpeakerDisplay;

        if (isPKPhase) {
            // PK speaking phase
            const pkOrder = gameState.pkSpeaking.order;
            const currentIndex = gameState.pkSpeaking.current;
            currentSpeakerId = pkOrder[currentIndex];
        } else {
            // Normal speaking phase
            currentSpeakerId = gameState.speaking.order[gameState.speaking.current];
        }

        // Build speaker display
        const isTestPlayer = currentSpeakerId.startsWith('test-');
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

        // Delete the speaking message
        try {
            await interaction.message.delete();
        } catch (error) {
            console.error('Failed to delete speaking message:', error);
        }

        // Use the appropriate auto-advance function
        if (isPKPhase) {
            const { autoAdvanceToNextPKSpeaker } = require('./finish-pk-speaking');
            await autoAdvanceToNextPKSpeaker(client, interaction.channel, messageId);
        } else {
            const { autoAdvanceToNextSpeaker } = require('./finish-speaking');
            await autoAdvanceToNextSpeaker(client, interaction.channel, messageId);
        }
    }
}).toJSON();

