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
        // Page 2: Villager roles (預言家, 女巫, 獵人, 騎士) + buttons
        await interaction.channel.send({
            content: `✅ 玩家數量: **${playerCount}** 人\n\n**玩家列表：**\n${playerListText}\n請選擇角色配置：`,
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
                        custom_id: `character-select-女巫-${messageId}-${playerCount}`,
                        placeholder: `女巫 ${selections['女巫'] || 0} 個`,
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `🧙 女巫 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['女巫'] || 0)
                        }))
                    }]
                },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `character-select-獵人-${messageId}-${playerCount}`,
                        placeholder: `獵人 ${selections['獵人'] || 0} 個`,
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `🔫 獵人 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['獵人'] || 0)
                        }))
                    }]
                },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `character-select-騎士-${messageId}-${playerCount}`,
                        placeholder: `騎士 ${selections['騎士'] || 0} 個`,
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `⚔️ 騎士 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['騎士'] || 0)
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
                            custom_id: `show-game-rules-${messageId}-${playerCount}`,
                            label: '遊戲規則 ▶',
                            style: 1 // Blue
                        },
                        {
                            type: 2,
                            custom_id: `confirm-characters-${messageId}-${playerCount}`,
                            label: '✅ 確認角色配置',
                            style: 3 // Green
                        }
                    ]
                }
            ]
        });
    }
}).toJSON();

