const { ButtonInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'show-more-characters',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract messageId and playerCount from custom_id (format: show-more-characters-{messageId}-{playerCount})
        const parts = interaction.customId.split('-');
        const playerCount = parseInt(parts.pop());
        const messageId = parts.pop();

        // Get current selections from database
        const selections = GameState.getCharacterSelections(messageId);

        // Remove buttons from original message
        await interaction.update({
            components: []
        });

        // Send new message to channel (appears at bottom)
        // Page 2: Villager roles (預言家, 熊) + button
        await interaction.channel.send({
            content: `✅ 玩家數量: **${playerCount}** 人\n\n請選擇角色配置：`,
            components: [
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `character-select-預言家-${messageId}-${playerCount}`,
                        placeholder: `預言家 ${selections['預言家'] || 0} 個`,
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `🔮 預言家 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['預言家'] || 0)
                        }))
                    }]
                },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `character-select-熊-${messageId}-${playerCount}`,
                        placeholder: `熊 ${selections['熊'] || 0} 個`,
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `🐻 熊 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['熊'] || 0)
                        }))
                    }]
                },
                {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            custom_id: `show-less-characters-${messageId}-${playerCount}`,
                            label: '◀ 返回',
                            style: 2 // Gray
                        },
                        {
                            type: 2,
                            custom_id: `show-more-characters-2-${messageId}-${playerCount}`,
                            label: '更多角色 ▼',
                            style: 1 // Blue
                        },
                        {
                            type: 2, // Button
                            custom_id: `cancel-setup-${messageId}`,
                            label: '❌ 取消遊戲',
                            style: 4 // Red (Danger)
                        }
                    ]
                }
            ]
        });
    }
}).toJSON();

