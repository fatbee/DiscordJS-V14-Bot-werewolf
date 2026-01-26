const { ChatInputCommandInteraction, ApplicationCommandOptionType, MessageFlags, PermissionFlagsBits } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const GameState = require("../../utils/GameState");

module.exports = new ApplicationCommand({
    command: {
        name: 'kick-player',
        description: '踢出AFK玩家（遊戲開始前）',
        type: 1,
        options: [
            {
                name: 'player',
                description: '要踢出的玩家',
                type: ApplicationCommandOptionType.User,
                required: true
            },
            {
                name: 'message_id',
                description: '遊戲消息ID（可選，不填則使用最近的消息）',
                type: ApplicationCommandOptionType.String,
                required: false
            }
        ],
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
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
        const targetUser = interaction.options.getUser('player');
        let messageId = interaction.options.getString('message_id');

        // If no message ID provided, find the most recent game setup message
        if (!messageId) {
            // Fetch recent messages in the channel
            const messages = await interaction.channel.messages.fetch({ limit: 50 });
            
            // Find the most recent message with game setup buttons
            const gameMessage = messages.find(msg => 
                msg.author.id === client.user.id && 
                msg.content.includes('準備開始遊戲！') &&
                msg.components.length > 0
            );

            if (!gameMessage) {
                return await interaction.reply({
                    content: '❌ 找不到遊戲設置消息！請提供消息ID或確保有正在進行的遊戲設置。',
                    flags: MessageFlags.Ephemeral
                });
            }

            messageId = gameMessage.id;
        }

        // Get player list from database
        const players = GameState.getPlayers(messageId);

        if (!players || players.size === 0) {
            return await interaction.reply({
                content: '❌ 這個遊戲沒有任何玩家！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if target player is in the game
        if (!players.has(targetUser.id)) {
            return await interaction.reply({
                content: `❌ ${targetUser} 不在遊戲中！`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Remove player from the list
        players.delete(targetUser.id);

        // Save to database
        GameState.savePlayers(messageId, players);

        // Build player list display
        let playerListText = '';
        if (players.size === 0) {
            playerListText = '_無玩家_';
        } else {
            let index = 1;
            for (const playerId of players) {
                playerListText += `${index}. <@${playerId}>\n`;
                index++;
            }
        }

        // Update the game message
        try {
            const gameMessage = await interaction.channel.messages.fetch(messageId);
            await gameMessage.edit({
                content: `準備開始遊戲！\n\n**玩家列表：** (${players.size} 人)\n${playerListText}`,
                components: gameMessage.components
            });
        } catch (error) {
            console.error('Failed to update game message:', error);
        }

        // Reply with confirmation
        await interaction.reply({
            content: `✅ 已將 ${targetUser} 踢出遊戲！\n\n剩餘玩家：${players.size} 人`,
            flags: MessageFlags.Ephemeral
        });

        // Send public notification
        await interaction.channel.send({
            content: `👢 **${targetUser} 已被 ${interaction.user} 踢出遊戲（AFK）**`
        });
    }
}).toJSON();

