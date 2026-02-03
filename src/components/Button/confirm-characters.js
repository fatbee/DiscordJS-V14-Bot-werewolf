const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");
const config = require("../../config");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'confirm-characters',
    type: 'button',
    /**
     *
     * @param {DiscordBot} client
     * @param {ButtonInteraction} interaction
     */
    run: async (client, interaction) => {
        // Extract messageId and playerCount from custom_id (format: confirm-characters-{messageId}-{playerCount})
        const parts = interaction.customId.split('-');
        const playerCount = parseInt(parts.pop());
        const messageId = parts.pop();

        // Get stored selections from database
        const selections = GameState.getCharacterSelections(messageId);

        const characters = {
            '狼王': selections['狼王'] || 0,
            '狼人': selections['狼人'] || 0,
            '隱狼': selections['隱狼'] || 0,
            '預言家': selections['預言家'] || 0,
            '女巫': selections['女巫'] || 0,
            '獵人': selections['獵人'] || 0,
            '騎士': selections['騎士'] || 0,
            '熊': selections['熊'] || 0
        };

        // Calculate total special characters
        const totalSpecialCharacters = Object.values(characters).reduce((sum, count) => sum + count, 0);

        // Validate that special characters don't exceed player count
        if (totalSpecialCharacters > playerCount) {
            return await interaction.reply({
                content: `❌ 角色總數 (${totalSpecialCharacters}) 不能超過玩家數量 (${playerCount})！`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Calculate villagers (remainder)
        const villagerCount = playerCount - totalSpecialCharacters;
        characters['村民'] = villagerCount;

        // Get player list from database
        const players = GameState.getPlayers(messageId);

        // Debug: Log player count
        console.log(`[DEBUG] confirm-characters: messageId=${messageId}, players.size=${players.size}, playerCount=${playerCount}`);
        console.log(`[DEBUG] confirm-characters: players=`, Array.from(players));

        // Shuffle player order for speaking order (only if not already shuffled)
        const speakingOrder = GameState.getSpeakingOrder(messageId);
        if (!speakingOrder || speakingOrder.length === 0) {
            // Convert Set to Array and shuffle
            const playerArray = Array.from(players);
            console.log(`[DEBUG] confirm-characters: Creating new speaking order, playerArray.length=${playerArray.length}`);
            for (let i = playerArray.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [playerArray[i], playerArray[j]] = [playerArray[j], playerArray[i]];
            }
            // Save shuffled order to database
            GameState.saveSpeakingOrder(messageId, playerArray);
        }

        // Get the shuffled speaking order for display
        const displayOrder = GameState.getSpeakingOrder(messageId);
        console.log(`[DEBUG] confirm-characters: displayOrder.length=${displayOrder.length}`, displayOrder);

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

        // Build character list display
        let characterList = '**角色配置：**\n';
        for (const [name, count] of Object.entries(characters)) {
            if (count > 0) {
                characterList += `${name}: ${count} 個\n`;
            }
        }

        // Get game rules
        const gameRules = GameState.getGameRules(messageId) || {};
        const witchCanSaveSelfFirstNight = gameRules.witchCanSaveSelfFirstNight !== false; // Default to true

        // Build game rules display
        const rulesDisplay = `\n**遊戲規則：**\n女巫能否自救：${witchCanSaveSelfFirstNight ? '✅ 允許' : '❌ 禁止'}`;

        // Save the final character selections to database (including villagers)
        characters['村民'] = villagerCount;
        GameState.saveCharacterSelections(messageId, characters);

        // Remove buttons from original message
        await interaction.update({
            components: []
        });

        // Build test mode indicator
        const testModeText = config.werewolf.testMode ? ' **(testmode: true)**' : '';

        // Send new message to channel (appears at bottom)
        await interaction.channel.send({
            content: `✅ **遊戲準備完成！${testModeText}** 🎮\n\n**玩家列表：** (${playerCount} 人)\n${playerListText}\n${characterList}${rulesDisplay}`,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 2, // Button
                            custom_id: `begin-game-${messageId}`,
                            label: '開始遊戲',
                            style: 3 // Green (Success)
                        },
                        {
                            type: 2, // Button
                            custom_id: `reconfig-characters-${messageId}-${playerCount}`,
                            label: '更改角色配置',
                            style: 1 // Blue (Primary)
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

