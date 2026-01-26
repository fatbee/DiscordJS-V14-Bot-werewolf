const { ButtonInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'show-game-rules',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract messageId and playerCount from custom_id (format: show-game-rules-{messageId}-{playerCount})
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

        // Get current game rules from database
        const gameRules = GameState.getGameRules(messageId) || {
            witchCanSaveSelfFirstNight: true
        };

        // Remove buttons from original message
        await interaction.update({
            components: []
        });

        // Send new message to channel (appears at bottom)
        await interaction.channel.send({
            content: `✅ 玩家數量: **${playerCount}** 人\n\n**玩家列表：**\n${playerListText}\n請設置遊戲規則：`,
            components: [
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `game-rule-select-witchCanSaveSelfFirstNight-${messageId}-${playerCount}`,
                        placeholder: `女巫第一夜自救：${gameRules.witchCanSaveSelfFirstNight ? '允許' : '禁止'}`,
                        min_values: 1,
                        max_values: 1,
                        options: [
                            {
                                label: '允許女巫第一夜自救',
                                value: 'true',
                                description: '女巫可以在第一夜使用解藥救自己',
                                emoji: '✅',
                                default: gameRules.witchCanSaveSelfFirstNight === true
                            },
                            {
                                label: '禁止女巫第一夜自救',
                                value: 'false',
                                description: '女巫不能在第一夜使用解藥救自己',
                                emoji: '❌',
                                default: gameRules.witchCanSaveSelfFirstNight === false
                            }
                        ]
                    }]
                },
                {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            custom_id: `show-more-characters-${messageId}-${playerCount}`,
                            label: '◀ 返回角色配置',
                            style: 2 // Gray
                        },
                        {
                            type: 2,
                            custom_id: `confirm-characters-${messageId}-${playerCount}`,
                            label: '確認並開始遊戲',
                            style: 3 // Green
                        }
                    ]
                }
            ]
        });
    }
}).toJSON();


