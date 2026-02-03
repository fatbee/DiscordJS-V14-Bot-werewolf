const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const SpeakingTimer = require("../../utils/SpeakingTimer");
const { hasHostPermission } = require("../../utils/WerewolfPermissions");

module.exports = new Component({
    customId: 'pause-speaking-timer',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Check if user has host permission (bot owner, admin, or 狼GM role)
        if (!hasHostPermission(interaction)) {
            return await interaction.reply({
                content: '❌ 只有主持人、管理員或擁有「狼GM」身份組可以暫停/恢復計時器！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Extract messageId from custom_id
        const messageId = interaction.customId.split('-').pop();

        // Check if timer exists
        const timerInfo = SpeakingTimer.getTimerInfo(messageId);
        if (!timerInfo) {
            return await interaction.reply({
                content: '❌ 沒有正在進行的計時器！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Toggle pause/resume
        const isPaused = SpeakingTimer.isPaused(messageId);
        
        if (isPaused) {
            // Resume timer
            SpeakingTimer.resumeTimer(messageId);
            
            // Update button to show "pause" state
            const components = interaction.message.components.map(row => {
                return {
                    type: row.type,
                    components: row.components.map(button => {
                        if (button.custom_id && button.custom_id.startsWith('pause-speaking-timer')) {
                            return {
                                ...button,
                                label: '⏸️ 暫停計時器'
                            };
                        }
                        return button;
                    })
                };
            });

            await interaction.update({
                components: components
            });

            await interaction.followUp({
                content: '▶️ **計時器已恢復！**',
                flags: MessageFlags.Ephemeral
            });
        } else {
            // Pause timer
            SpeakingTimer.pauseTimer(messageId);
            
            // Update button to show "resume" state
            const components = interaction.message.components.map(row => {
                return {
                    type: row.type,
                    components: row.components.map(button => {
                        if (button.custom_id && button.custom_id.startsWith('pause-speaking-timer')) {
                            return {
                                ...button,
                                label: '▶️ 恢復計時器'
                            };
                        }
                        return button;
                    })
                };
            });

            await interaction.update({
                components: components
            });

            await interaction.followUp({
                content: '⏸️ **計時器已暫停！**',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}).toJSON();

