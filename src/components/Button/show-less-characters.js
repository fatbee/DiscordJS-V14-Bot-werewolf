const { ButtonInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'show-less-characters',
    type: 'button',
    /**
     *
     * @param {DiscordBot} client
     * @param {ButtonInteraction} interaction
     */
    run: async (client, interaction) => {
        // Extract messageId and playerCount from custom_id (format: show-less-characters-{messageId}-{playerCount})
        const parts = interaction.customId.split('-');
        const playerCount = parseInt(parts.pop());
        const messageId = parts.pop();

        // Get player list from database
        const players = GameState.getPlayers(messageId);
        let playerListText = '';
        let index = 1;
        for (const playerId of players) {
            playerListText += `${index}. <@${playerId}>\n`;
            index++;
        }

        // Get current selections from database
        const selections = GameState.getCharacterSelections(messageId);

        // Remove buttons from original message
        await interaction.update({
            components: []
        });

        // Send new message to channel (appears at bottom)
        await interaction.channel.send({
            content: `✅ 玩家數量: **${playerCount}** 人\n\n**玩家列表：**\n${playerListText}\n請選擇角色配置：`,
            components: [
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `character-select-狼王-${messageId}-${playerCount}`,
                        placeholder: `狼王 ${selections['狼王'] || 0} 個`,
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `狼王 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['狼王'] || 0)
                        }))
                    }]
                },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `character-select-狼人-${messageId}-${playerCount}`,
                        placeholder: `狼人 ${selections['狼人'] || 0} 個`,
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `狼人 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['狼人'] || 0)
                        }))
                    }]
                },
                {
                    type: 1,
                    components: [{
                        type: 2,
                        custom_id: `show-more-characters-${messageId}-${playerCount}`,
                        label: '更多角色 ▼',
                        style: 1 // Blue
                    }]
                }
            ]
        });
    }
}).toJSON();

