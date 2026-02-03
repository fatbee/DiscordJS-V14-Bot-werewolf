const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");
const { hasHostPermission } = require("../../utils/WerewolfPermissions");

module.exports = new Component({
    customId: 'kick-afk-player',
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
                content: '❌ 只有主持人、管理員或擁有「狼GM」身份組可以踢出玩家！',
                flags: MessageFlags.Ephemeral
            });
        }

        const messageId = interaction.message.id;

        // Get player list from database
        const players = GameState.getPlayers(messageId);

        if (!players || players.size === 0) {
            return await interaction.reply({
                content: '❌ 沒有玩家可以踢出！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Build player selection dropdown
        const playerOptions = [];
        for (const playerId of players) {
            try {
                const member = await interaction.guild.members.fetch(playerId);
                playerOptions.push({
                    label: member.displayName,
                    value: playerId,
                    description: `踢出 ${member.user.username}`,
                    emoji: '👢'
                });
            } catch (error) {
                console.error(`Failed to fetch member ${playerId}:`, error);
                playerOptions.push({
                    label: `玩家 ${playerId.substring(0, 8)}...`,
                    value: playerId,
                    description: '踢出此玩家',
                    emoji: '👢'
                });
            }
        }

        // Send dropdown to select player to kick
        await interaction.reply({
            content: '👢 **選擇要踢出的AFK玩家：**',
            components: [{
                type: 1,
                components: [{
                    type: 3, // String Select Menu
                    custom_id: `kick-afk-select-${messageId}`,
                    placeholder: '選擇要踢出的玩家',
                    min_values: 1,
                    max_values: 1,
                    options: playerOptions.slice(0, 25) // Discord limit: 25 options
                }]
            }],
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();

