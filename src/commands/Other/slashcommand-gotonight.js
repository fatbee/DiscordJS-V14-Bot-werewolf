const { ChatInputCommandInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const config = require("../../config");

module.exports = new ApplicationCommand({
    command: {
        name: 'gotonight',
        description: '顯示進入夜晚按鈕（僅限主持人）',
        type: 1,
        options: []
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
        // Check if user is bot owner
        const userId = interaction.user.id;
        if (userId !== config.users.ownerId) {
            return await interaction.reply({
                content: '❌ 只有主持人可以使用此指令！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get the most recent game messageId from the channel
        // We'll use a simple approach: look for the most recent game in the database
        let gameMessageId = null;
        
        // Try to find a game by checking recent messages
        const messages = await interaction.channel.messages.fetch({ limit: 50 });
        for (const [msgId, message] of messages) {
            if (client.database.has(`werewolf-game-${msgId}`)) {
                gameMessageId = msgId;
                break;
            }
        }

        if (!gameMessageId) {
            return await interaction.reply({
                content: '❌ 在此頻道找不到進行中的遊戲！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Send the "Go to Night" button
        await interaction.reply({
            content: `🌙 **主持人控制面板**\n\n點擊下方按鈕強制進入夜晚階段：`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `start-night-${gameMessageId}`,
                    label: '🌙 開始夜晚',
                    style: 1 // Blue
                }]
            }]
        });
    }
}).toJSON();

