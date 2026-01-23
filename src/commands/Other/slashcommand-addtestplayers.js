const { ChatInputCommandInteraction, ApplicationCommandOptionType, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const GameState = require("../../utils/GameState");

module.exports = new ApplicationCommand({
    command: {
        name: 'addtestplayers',
        description: '添加測試玩家到最近的遊戲（僅用於開發測試）',
        type: 1,
        options: [
            {
                name: 'count',
                description: '要添加的測試玩家數量',
                type: ApplicationCommandOptionType.Integer,
                required: true,
                min_value: 1,
                max_value: 20
            },
            {
                name: 'message_id',
                description: '遊戲消息ID（可選，不填則使用最近的消息）',
                type: ApplicationCommandOptionType.String,
                required: false
            }
        ]
    },
    options: {
        botDevelopers: false
    },
    /**
     *
     * @param {DiscordBot} client
     * @param {ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        const count = interaction.options.getInteger('count');
        let messageId = interaction.options.getString('message_id');

        // If no message ID provided, try to find the most recent game message
        if (!messageId) {
            try {
                const messages = await interaction.channel.messages.fetch({ limit: 50 });
                const gameMessage = messages.find(msg => 
                    msg.author.id === client.user.id && 
                    msg.content.includes('準備開始遊戲') || 
                    msg.content.includes('玩家列表')
                );
                
                if (!gameMessage) {
                    return await interaction.reply({
                        content: '❌ 找不到遊戲消息！請先使用 `/startgame` 或提供消息ID。',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                messageId = gameMessage.id;
            } catch (error) {
                return await interaction.reply({
                    content: '❌ 無法獲取頻道消息！請提供消息ID。',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Get current players
        const players = GameState.getPlayers(messageId);

        // Generate fake player IDs
        const fakePlayerIds = [];
        for (let i = 1; i <= count; i++) {
            // Generate a fake ID with "test-" prefix to easily identify test players
            const fakeId = `test-${Date.now()}-${i}`;
            fakePlayerIds.push(fakeId);
            players.add(fakeId);
        }

        // Save updated player list
        GameState.savePlayers(messageId, players);

        // Build player list display
        let playerListText = '';
        let index = 1;
        for (const playerId of players) {
            // Check if it's a test player (has "test-" prefix)
            if (playerId.startsWith('test-')) {
                const testNumber = playerId.split('-')[2];
                playerListText += `${index}. 測試玩家 ${testNumber}\n`;
            } else {
                playerListText += `${index}. <@${playerId}>\n`;
            }
            index++;
        }

        // Try to update the game message
        try {
            const gameMessage = await interaction.channel.messages.fetch(messageId);
            await gameMessage.edit({
                content: `準備開始遊戲！\n\n**玩家列表：** (${players.size} 人)\n${playerListText}`,
                components: gameMessage.components
            });

            await interaction.reply({
                content: `✅ 已添加 ${count} 個測試玩家到遊戲！\n總玩家數：${players.size} 人`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            await interaction.reply({
                content: `✅ 已添加 ${count} 個測試玩家到數據庫！\n總玩家數：${players.size} 人\n\n⚠️ 無法更新消息顯示，但數據已保存。`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
}).toJSON();

