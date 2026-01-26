const { ButtonInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");

module.exports = new Component({
    customId: 'end-game',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract messageId from custom_id (format: end-game-{messageId})
        const messageId = interaction.customId.split('-').pop();

        // Get werewolf channel ID from database
        const werewolfChannelId = client.database.get(`game-werewolf-channel-${messageId}`);

        let channelDeleted = false;
        if (werewolfChannelId) {
            try {
                const channel = await interaction.guild.channels.fetch(werewolfChannelId);
                if (channel) {
                    await channel.delete('遊戲結束');
                    channelDeleted = true;
                }
            } catch (error) {
                console.error('Failed to delete werewolf channel:', error);
            }

            // Clean up channel ID from database
            client.database.delete(`game-werewolf-channel-${messageId}`);
        }

        // Remove the "結束遊戲" button
        await interaction.update({
            components: []
        });

        // Send confirmation message
        await interaction.channel.send({
            content: `🏁 **遊戲已結束！**\n\n${channelDeleted ? '✅ 狼人頻道已刪除\n' : ''}感謝各位的參與！`
        });

        // Auto-start new game (like /startgame)
        const GameState = require("../../utils/GameState");
        const newGameMessage = await interaction.channel.send({
            content: `準備開始遊戲！\n\n**玩家列表：** (0 人)\n_無玩家_`,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 2, // Button
                            custom_id: 'join-game-button',
                            label: '加入遊戲',
                            style: 1 // Blue button (Primary style)
                        },
                        {
                            type: 2, // Button
                            custom_id: 'leave-game-button',
                            label: '離開遊戲',
                            style: 2 // Gray button (Secondary style)
                        },
                        {
                            type: 2, // Button
                            custom_id: 'start-game-button',
                            label: '開始遊戲',
                            style: 3 // Green button (Success style)
                        }
                    ]
                }
            ]
        });

        // Initialize empty player list for this message and save to database
        GameState.savePlayers(newGameMessage.id, new Set());
    }
}).toJSON();

