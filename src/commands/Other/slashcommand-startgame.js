const { ChatInputCommandInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const GameState = require("../../utils/GameState");

// Initialize game state
GameState.initialize();

module.exports = new ApplicationCommand({
    command: {
        name: 'startgame',
        description: '顯示開始遊戲按鈕',
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
        // Check if user has "狼來了" role
        const hasWerewolfRole = interaction.member.roles.cache.some(role => role.name === '狼來了');

        if (!hasWerewolfRole) {
            return await interaction.reply({
                content: '❌ 你需要擁有「狼來了」身份組才能使用此指令！\n請先點擊「加入遊戲」按鈕來獲得身份組。',
                flags: MessageFlags.Ephemeral
            });
        }

        // Clear all "狼死人" roles before starting new game
        const { clearAllDeadRoles } = require('../../utils/DeadPlayerRole');
        await clearAllDeadRoles(interaction.guild);

        // Reply first
        await interaction.reply({
            content: `準備開始遊戲！\n\n**玩家列表：** (0 人)\n_無玩家_`,
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
                        },
                        {
                            type: 2, // Button
                            custom_id: 'refresh-player-list-button',
                            label: '🔄 刷新列表',
                            style: 2 // Gray button (Secondary style)
                        },
                        {
                            type: 2, // Button
                            custom_id: 'kick-afk-player',
                            label: '👢 踢AFK',
                            style: 4 // Red button (Danger style)
                        }
                    ]
                }
            ]
        });

        // Fetch the reply to get message ID
        const reply = await interaction.fetchReply();

        // Initialize empty player list for this message and save to database
        GameState.savePlayers(reply.id, new Set());
    }
}).toJSON();

