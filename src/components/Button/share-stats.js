const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const PlayerStats = require("../../utils/PlayerStats");

module.exports = new Component({
    customId: 'share-stats',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract playerId from custom_id (format: share-stats-{playerId})
        const playerId = interaction.customId.split('-').pop();
        
        // Check if user is sharing their own stats
        const userId = interaction.user.id;
        if (userId !== playerId) {
            return await interaction.reply({
                content: '❌ 你只能分享自己的統計數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get stats display
        const statsDisplay = PlayerStats.getStatsDisplay(playerId);

        // Send stats to channel (public)
        await interaction.channel.send({
            content: `<@${playerId}> 分享了他們的統計數據：\n\n${statsDisplay}`
        });

        // Confirm to user
        await interaction.reply({
            content: '✅ 統計數據已分享到頻道！',
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();

