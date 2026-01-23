const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'finish-speaking',
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
        
        if (!isOwner && userId !== currentSpeakerId) {
            return await interaction.reply({
                content: '❌ 現在不是你的發言時間！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Mark current speaker as having spoken
        if (gameState.players[currentSpeakerId]) {
            gameState.players[currentSpeakerId].hasSpoken = true;
        }

        // Move to next speaker
        gameState.speaking.current++;

        // Check if all players have spoken
        if (gameState.speaking.current >= gameState.speaking.order.length) {
            // All players have spoken, start voting
            WerewolfGame.saveGame(messageId, gameState, client.database);
            
            await interaction.update({
                components: []
            });

            await startVoting(client, interaction, messageId, gameState);
            return;
        }

        // Get next speaker
        const nextSpeakerId = gameState.speaking.order[gameState.speaking.current];
        const nextPlayer = gameState.players[nextSpeakerId];
        
        const isTestPlayer = nextSpeakerId.startsWith('test-');
        let nextPlayerDisplay;
        if (isTestPlayer) {
            const testNumber = nextSpeakerId.split('-')[2];
            nextPlayerDisplay = `測試玩家 ${testNumber}`;
        } else {
            nextPlayerDisplay = `<@${nextSpeakerId}>`;
        }

        // Save game state
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Update message
        await interaction.update({
            content: `💬 **下一位發言者：${nextPlayerDisplay}**\n\n請發言，發言完畢後點擊下方按鈕。`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `finish-speaking-${messageId}`,
                    label: '✅ 完成發言',
                    style: 3 // Green
                }]
            }]
        });
    }
}).toJSON();

/**
 * Start voting phase
 */
async function startVoting(client, interaction, messageId, gameState) {
    // Reset day votes
    gameState.dayVotes = {};
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Get alive players
    const alivePlayers = WerewolfGame.getAlivePlayers(gameState);

    // Build voting options
    const voteOptions = alivePlayers.map(player => {
        const isTestPlayer = player.id.startsWith('test-');
        if (isTestPlayer) {
            const testNumber = player.id.split('-')[2];
            return {
                label: `測試玩家 ${testNumber}`,
                value: player.id,
                description: `投票放逐此玩家`
            };
        } else {
            return {
                label: `玩家 ${player.id}`,
                value: player.id,
                description: `投票放逐此玩家`,
                emoji: '🗳️'
            };
        }
    });

    // Send voting message
    await interaction.channel.send({
        content: `🗳️ **投票階段開始！**\n\n所有存活玩家請投票選擇要放逐的玩家：\n\n存活玩家：${alivePlayers.length} 人`,
        components: [{
            type: 1,
            components: [{
                type: 3, // String Select Menu
                custom_id: `day-vote-${messageId}`,
                placeholder: '選擇要放逐的玩家',
                min_values: 1,
                max_values: 1,
                options: voteOptions.slice(0, 25) // Discord limit: 25 options
            }]
        }]
    });
}

