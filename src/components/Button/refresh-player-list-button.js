const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'refresh-player-list-button',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        const messageId = interaction.message.id;

        // Get player list from database
        const players = GameState.getPlayers(messageId);

        // Build player list display
        let playerListText = '';
        if (players.size === 0) {
            playerListText = '_無玩家_';
        } else {
            let index = 1;
            for (const playerId of players) {
                playerListText += `${index}. <@${playerId}>\n`;
                index++;
            }
        }

        // Delete the old message
        await interaction.message.delete();

        // Send new message to channel (appears at bottom)
        const newMessage = await interaction.channel.send({
            content: `準備開始遊戲！\n\n**玩家列表：** (${players.size} 人)\n${playerListText}`,
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
                        },
                        {
                            type: 2, // Button
                            custom_id: 'refresh-player-list-button',
                            label: '🔄 刷新列表',
                            style: 2 // Gray button (Secondary style)
                        },
                        {
                            type: 2, // Button
                            custom_id: 'kick-afk-player',
                            label: '👢 踢AFK',
                            style: 4 // Red button (Danger style)
                        }
                    ]
                }
            ]
        });

        // Save player list to new message ID
        GameState.savePlayers(newMessage.id, players);

        // Transfer speaking order if it exists
        const speakingOrder = GameState.getSpeakingOrder(messageId);
        if (speakingOrder && speakingOrder.length > 0) {
            GameState.saveSpeakingOrder(newMessage.id, speakingOrder);
        }

        // Delete old data
        client.database.delete(`game-players-${messageId}`);
        client.database.delete(`game-speaking-order-${messageId}`);

        // Reply to acknowledge (ephemeral)
        await interaction.reply({
            content: '✅ 已刷新列表！玩家列表已移到底部。',
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();


