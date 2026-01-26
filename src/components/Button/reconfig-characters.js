const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");
const config = require("../../config");

module.exports = new Component({
    customId: 'reconfig-characters',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract messageId and playerCount from custom_id (format: reconfig-characters-{messageId}-{playerCount})
        const parts = interaction.customId.split('-');
        const playerCount = parseInt(parts.pop());
        const messageId = parts.pop();

        // Get player list from database
        const players = GameState.getPlayers(messageId);

        if (!players || players.size === 0) {
            return await interaction.reply({
                content: '❌ 找不到玩家數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get the speaking order (already shuffled) for display
        const speakingOrder = GameState.getSpeakingOrder(messageId);
        const displayOrder = speakingOrder.length > 0 ? speakingOrder : Array.from(players);

        // Build player list display
        let playerListText = '';
        let index = 1;
        for (const playerId of displayOrder) {
            // Check if it's a test player
            if (playerId.startsWith('test-')) {
                const testNumber = playerId.split('-')[2];
                playerListText += `${index}. 測試玩家 ${testNumber}\n`;
            } else {
                playerListText += `${index}. <@${playerId}>\n`;
            }
            index++;
        }

        // Get current selections from database
        const selections = GameState.getCharacterSelections(messageId);

        // Remove buttons from original message
        await interaction.update({
            components: []
        });

        // Build test mode indicator
        const testModeText = config.werewolf.testMode ? ' **(testmode: true)**' : '';

        // Send new message to channel (appears at bottom) with character selection menus
        // Page 1: Werewolf roles (狼王, 狼人, 隱狼) + button
        await interaction.channel.send({
            content: `🔄 **重新配置角色${testModeText}**\n\n**玩家列表：** (${playerCount} 人)\n${playerListText}\n請選擇角色配置：`,
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
                            label: `🐺👑 狼王 ${i} 個`,
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
                            label: `🐺 狼人 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['狼人'] || 0)
                        }))
                    }]
                },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `character-select-隱狼-${messageId}-${playerCount}`,
                        placeholder: `隱狼 ${selections['隱狼'] || 0} 個`,
                        min_values: 0,
                        max_values: 1,
                        options: Array.from({ length: playerCount + 1 }, (_, i) => ({
                            label: `🌑🐺 隱狼 ${i} 個`,
                            value: `${i}`,
                            default: i === (selections['隱狼'] || 0)
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

