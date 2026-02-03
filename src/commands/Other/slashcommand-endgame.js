const { ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const WerewolfGame = require("../../utils/WerewolfGame");
const GameState = require("../../utils/GameState");
const config = require("../../config");
const { hasHostPermission } = require("../../utils/WerewolfPermissions");

module.exports = new ApplicationCommand({
    command: {
        name: 'endgame',
        description: '結束當前的狼人殺遊戲並清除所有計時器',
        type: 1,
        options: [],
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    options: {
        botDevelopers: false
    },
    /**
     * @param {DiscordBot} client
     * @param {ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        const userId = interaction.user.id;

        // Find active game in this channel by checking global variables
        let foundGame = false;
        let messageId = null;

        // Check global game players map
        if (global.gamePlayers) {
            for (const [msgId, players] of global.gamePlayers.entries()) {
                // Check if this game has a channel ID stored
                const channelId = client.database.get(`game-channel-${msgId}`);
                if (channelId === interaction.channelId && players.size > 0) {
                    messageId = msgId;
                    foundGame = true;
                    break;
                }
            }
        }

        if (!foundGame) {
            return await interaction.reply({
                content: '❌ 此頻道沒有進行中的遊戲！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get game state
        const gameState = WerewolfGame.getGame(messageId, client.database);

        if (!gameState) {
            return await interaction.reply({
                content: '❌ 找不到遊戲數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if user has host permission or is a player in the game
        const isHost = hasHostPermission(interaction);
        const isPlayer = gameState.players && gameState.players[userId];

        if (!isHost && !isPlayer) {
            return await interaction.reply({
                content: '❌ 只有主持人、管理員、擁有「狼GM」身份組或遊戲中的玩家可以使用此指令！',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.reply({
            content: '⚠️ **正在結束遊戲...**',
            flags: MessageFlags.Ephemeral
        });

        // Clear all "狼死人" roles when ending game
        const { clearAllDeadRoles } = require('../../utils/DeadPlayerRole');
        await clearAllDeadRoles(interaction.guild);

        // Clear all timers
        try {
            // Clear werewolf timers
            if (global.werewolfTimers && global.werewolfTimers.has(messageId)) {
                const timerData = global.werewolfTimers.get(messageId);
                if (timerData.interval) clearInterval(timerData.interval);
                if (timerData.timeout) clearTimeout(timerData.timeout);
                global.werewolfTimers.delete(messageId);
            }

            // Clear night action timers
            if (global.nightActionTimers && global.nightActionTimers.has(messageId)) {
                const timerData = global.nightActionTimers.get(messageId);
                if (timerData.interval) clearInterval(timerData.interval);
                if (timerData.timeout) clearTimeout(timerData.timeout);
                global.nightActionTimers.delete(messageId);
            }

            // Clear speaking timers
            if (global.speakingTimers && global.speakingTimers.has(messageId)) {
                const timerData = global.speakingTimers.get(messageId);
                if (timerData.interval) clearInterval(timerData.interval);
                if (timerData.timeout) clearTimeout(timerData.timeout);
                if (timerData.reminderTimeout) clearTimeout(timerData.reminderTimeout);
                global.speakingTimers.delete(messageId);
            }

            // Clear voting timers
            if (global.votingTimers && global.votingTimers.has(messageId)) {
                const timerData = global.votingTimers.get(messageId);
                if (timerData.interval) clearInterval(timerData.interval);
                if (timerData.timeout) clearTimeout(timerData.timeout);
                global.votingTimers.delete(messageId);
            }

            // Clear last words timers
            if (global.lastWordsTimers && global.lastWordsTimers.has(messageId)) {
                const timerData = global.lastWordsTimers.get(messageId);
                if (timerData.interval) clearInterval(timerData.interval);
                if (timerData.timeout) clearTimeout(timerData.timeout);
                global.lastWordsTimers.delete(messageId);
            }
        } catch (error) {
            console.error('Error clearing timers:', error);
        }

        // Delete all game data from database
        try {
            client.database.delete(`game-channel-${messageId}`);
            client.database.delete(`game-rules-${messageId}`);
            client.database.delete(`werewolf-game-${messageId}`);
            client.database.delete(`game-speaking-order-${messageId}`);
        } catch (error) {
            console.error('Error deleting game data:', error);
        }

        // Send confirmation message to channel
        await interaction.channel.send({
            content: `🛑 **遊戲已結束！**\n\n所有計時器已清除，遊戲數據已刪除。\n\n由 ${interaction.user} 執行結束指令。`
        });

        // Send new game setup message for players to join
        const newGameMessage = await interaction.channel.send({
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

        // Initialize empty player list for this message and save to database
        GameState.savePlayers(newGameMessage.id, new Set());
    }
}).toJSON();

