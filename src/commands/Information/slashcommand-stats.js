const { ChatInputCommandInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const PlayerStats = require("../../utils/PlayerStats");

module.exports = new ApplicationCommand({
    command: {
        name: 'stats',
        description: '查看玩家統計數據',
        type: 1,
        options: [
            {
                name: 'player',
                description: '要查看的玩家（留空查看自己）',
                type: 6, // User type
                required: false
            }
        ]
    },
    options: {
        botDevelopers: false
    },
    /**
     *
     * @param {DiscordBot} client
     * @param {ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        // Get target player (default to command user)
        const targetUser = interaction.options.getUser('player') || interaction.user;
        const playerId = targetUser.id;

        // Get stats display
        const statsDisplay = PlayerStats.getStatsDisplay(playerId);

        // Reply with stats and share button
        await interaction.reply({
            content: `<@${playerId}> 的統計數據：\n\n${statsDisplay}`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `share-stats-${playerId}`,
                    label: '📤 分享統計',
                    style: 1 // Blue
                }]
            }],
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();

