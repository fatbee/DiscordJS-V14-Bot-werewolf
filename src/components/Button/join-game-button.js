const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'join-game-button',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        const messageId = interaction.message.id;

        // Get player list from database
        const players = GameState.getPlayers(messageId);
        const userId = interaction.user.id;

        console.log(`[DEBUG] join-game: userId=${userId}, messageId=${messageId}, players.size BEFORE=${players.size}`);
        console.log(`[DEBUG] join-game: players BEFORE=`, Array.from(players));

        // Check if player already joined
        if (players.has(userId)) {
            return await interaction.reply({
                content: '❌ 你已經加入遊戲了！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Add player to the list
        players.add(userId);

        console.log(`[DEBUG] join-game: players.size AFTER=${players.size}`);
        console.log(`[DEBUG] join-game: players AFTER=`, Array.from(players));

        // Add "狼來了" role to the player
        try {
            // Find or create the "狼來了" role
            let werewolfRole = interaction.guild.roles.cache.find(role => role.name === '狼來了');

            if (!werewolfRole) {
                // Create the role if it doesn't exist
                werewolfRole = await interaction.guild.roles.create({
                    name: '狼來了',
                    color: 0xFF6B6B, // Red color
                    reason: '狼人殺遊戲專用身份組'
                });
            }

            // Add role to the member
            const member = await interaction.guild.members.fetch(userId);
            if (!member.roles.cache.has(werewolfRole.id)) {
                await member.roles.add(werewolfRole);
            }
        } catch (error) {
            console.error('Failed to add 狼來了 role:', error);
            // Continue even if role assignment fails
        }

        // Build player list display
        let playerListText = '';
        let index = 1;
        for (const playerId of players) {
            playerListText += `${index}. <@${playerId}>\n`;
            index++;
        }

        // Delete the old message
        await interaction.message.delete();

        // Send new message to channel (appears at bottom)
        const newMessage = await interaction.channel.send({
            content: `準備開始遊戲！\n\n**玩家列表：** (${players.size} 人)\n${playerListText}`,
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

        // Save player list to new message ID
        GameState.savePlayers(newMessage.id, players);

        console.log(`[DEBUG] join-game: Saved players to newMessage.id=${newMessage.id}, players.size=${players.size}`);

        // Transfer speaking order if it exists
        const speakingOrder = GameState.getSpeakingOrder(messageId);
        if (speakingOrder && speakingOrder.length > 0) {
            GameState.saveSpeakingOrder(newMessage.id, speakingOrder);
            console.log(`[DEBUG] join-game: Transferred speaking order, length=${speakingOrder.length}`);
        }

        // Delete old data
        client.database.delete(`game-players-${messageId}`);
        client.database.delete(`game-speaking-order-${messageId}`);

        console.log(`[DEBUG] join-game: Deleted old data for messageId=${messageId}`);

        // Reply to acknowledge (ephemeral)
        await interaction.reply({
            content: '✅ 已加入遊戲！',
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();

