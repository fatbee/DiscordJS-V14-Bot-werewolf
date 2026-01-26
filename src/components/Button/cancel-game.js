const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const GameState = require("../../utils/GameState");
const config = require("../../config");

module.exports = new Component({
    customId: 'cancel-game',
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

        // Check if game has already started (night phase or later)
        if (gameState.phase !== 'setup') {
            return await interaction.reply({
                content: '❌ 遊戲已經開始，無法取消！請使用 `/endgame` 指令結束遊戲。',
                flags: MessageFlags.Ephemeral
            });
        }

        // Only allow bot owner or admin to cancel
        const userId = interaction.user.id;
        const isOwner = userId === config.users.ownerId;
        const isAdmin = interaction.memberPermissions?.has('Administrator');

        if (!isOwner && !isAdmin) {
            return await interaction.reply({
                content: '❌ 只有管理員或 Bot Owner 可以取消遊戲！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get player list from game state
        const players = new Set(Object.keys(gameState.players));
        
        // Build player list display
        let playerListText = '';
        let index = 1;
        for (const playerId of players) {
            // Check if it's a test player
            if (playerId.startsWith('test-')) {
                const testNumber = playerId.split('-')[2];
                playerListText += `${index}. 測試玩家 ${testNumber}\n`;
            } else {
                playerListText += `${index}. <@${playerId}>\n`;
            }
            index++;
        }

        // Get speaking order from old message ID
        const speakingOrder = GameState.getSpeakingOrder(messageId);

        // Delete game state
        client.database.delete(`werewolf-game-${messageId}`);
        client.database.delete(`game-channel-${messageId}`);
        client.database.delete(`game-speaking-order-${messageId}`);

        // Update message to remove buttons
        await interaction.update({
            components: []
        });

        // Build test mode indicator
        const testModeText = config.werewolf.testMode ? ' **(testmode: true)**' : '';

        // Send message to return to registration phase
        const newMessage = await interaction.channel.send({
            content: `❌ **遊戲已取消！${testModeText}**\n\n返回報名階段...\n\n**玩家列表：** (${players.size} 人)\n${playerListText}`,
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

        // Save player list to new message ID
        GameState.savePlayers(newMessage.id, players);

        // Save speaking order to new message ID
        if (speakingOrder && speakingOrder.length > 0) {
            GameState.saveSpeakingOrder(newMessage.id, speakingOrder);
        }

        // Delete old player list (if exists)
        client.database.delete(`game-players-${messageId}`);
    }
}).toJSON();

