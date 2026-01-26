const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'knight-duel',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract messageId from custom_id
        const messageId = interaction.customId.split('-').pop();
        
        // Get game state
        const gameState = WerewolfGame.getGame(messageId, client.database);
        
        if (!gameState) {
            return await interaction.reply({
                content: '❌ 找不到遊戲數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if it's the current speaker's turn (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;
        const currentSpeakerId = gameState.speaking.order[gameState.speaking.current];
        const currentPlayer = gameState.players[currentSpeakerId];

        if (!isOwner && userId !== currentSpeakerId) {
            return await interaction.reply({
                content: '❌ 現在不是你的發言時間！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if current player is a knight
        if (!isOwner && currentPlayer.role !== '騎士') {
            return await interaction.reply({
                content: '❌ 只有騎士可以使用決鬥能力！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get all alive players except the knight
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState);
        const targetOptions = [];

        for (const player of alivePlayers) {
            if (player.id === currentSpeakerId) continue; // Skip self

            const isTestPlayer = player.id.startsWith('test-');
            
            // Find player's position in speaking order
            const speakingOrderIndex = gameState.speaking.order.indexOf(player.id);
            const orderNumber = speakingOrderIndex + 1;

            if (isTestPlayer) {
                const testNumber = player.id.split('-')[2];
                targetOptions.push({
                    label: `${orderNumber}號 - 測試玩家 ${testNumber}`,
                    value: player.id,
                    description: config.werewolf.testMode ? `角色：${player.role}` : `選擇此玩家`
                });
            } else {
                // Try to get nickname
                let displayName = `玩家${orderNumber}`;
                try {
                    const member = await interaction.guild.members.fetch(player.id);
                    displayName = member.displayName;
                } catch (error) {
                    console.error(`Failed to fetch member ${player.id}:`, error);
                }

                targetOptions.push({
                    label: `${orderNumber}號 - ${displayName}`,
                    value: player.id,
                    description: config.werewolf.testMode ? `角色：${player.role}` : `選擇此玩家`,
                    emoji: '👤'
                });
            }
        }

        // Reply with target selection
        await interaction.reply({
            content: '⚔️ **選擇決鬥目標**\n\n請選擇你要決鬥的玩家：',
            components: [{
                type: 1,
                components: [{
                    type: 3, // String Select Menu
                    custom_id: `knight-duel-target-${messageId}`,
                    placeholder: '選擇決鬥目標',
                    min_values: 1,
                    max_values: 1,
                    options: targetOptions.slice(0, 25) // Discord limit: 25 options
                }]
            }],
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();

