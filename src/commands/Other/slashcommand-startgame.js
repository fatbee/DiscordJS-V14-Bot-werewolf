const { ChatInputCommandInteraction } = require("discord.js");
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

