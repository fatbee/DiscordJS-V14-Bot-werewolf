const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");
const config = require("../../config");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'start-game-button',
    type: 'button',
    /**
     *
     * @param {DiscordBot} client
     * @param {ButtonInteraction} interaction
     */
    run: async (client, interaction) => {
        // Use the original message ID (from /startgame)
        const messageId = interaction.message.id;

        // Get player list from database
        const players = GameState.getPlayers(messageId);

        if (!players || players.size === 0) {
            return await interaction.reply({
                content: '❌ 沒有玩家加入遊戲！請先點擊「加入遊戲」按鈕。',
                flags: MessageFlags.Ephemeral
            });
        }

        const playerCount = players.size;

        // Initialize character selections for this message and save to database (if not exists)
        const existingSelections = GameState.getCharacterSelections(messageId);
        if (!existingSelections || Object.keys(existingSelections).length === 0) {
            GameState.saveCharacterSelections(messageId, {});
        }

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

        // Remove buttons from original message
        await interaction.update({
            components: []
        });

        // Build test mode indicator
        const testModeText = config.werewolf.testMode ? ' **(testmode: true)**' : '';

        // Send new message to channel (appears at bottom)
        await interaction.channel.send({
            content: `✅ **準備開始遊戲！${testModeText}**\n\n**玩家列表：** (${playerCount} 人)\n${playerListText}\n請選擇角色配置：`,
            components: [
                {
                    type: 1,
                    components: [{
                        type: 3, // String Select Menu
                        custom_id: `character-select-狼王-${messageId}-${playerCount}`,
                        placeholder: '狼王 0 個',
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `狼王 ${i} 個`,
                            value: `${i}`,
                            default: i === 0
                        }))
                    }]
                },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `character-select-狼人-${messageId}-${playerCount}`,
                        placeholder: '狼人 0 個',
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `狼人 ${i} 個`,
                            value: `${i}`,
                            default: i === 0
                        }))
                    }]
                },

                {
                    type: 1,
                    components: [{
                        type: 2, // Button
                        custom_id: `show-more-characters-${messageId}-${playerCount}`,
                        label: '更多角色 ▼',
                        style: 1 // Blue
                    }]
                }
            ]
        });

    }
}).toJSON();

