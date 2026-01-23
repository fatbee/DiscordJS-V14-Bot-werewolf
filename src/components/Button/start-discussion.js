const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { getRoleDisplay } = require("../../utils/WerewolfRoles");

module.exports = new Component({
    customId: 'start-discussion',
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

        // Check win condition before starting discussion
        const winner = WerewolfGame.checkWinCondition(gameState);
        if (winner) {
            await handleGameEnd(client, interaction, messageId, gameState, winner);
            return;
        }

        // Initialize speaking order
        WerewolfGame.initializeSpeakingOrder(gameState);
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Remove button from original message
        await interaction.update({
            components: []
        });

        // Get alive players
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState);
        
        // Build speaking order display
        let speakingOrderText = '';
        for (let i = 0; i < gameState.speaking.order.length; i++) {
            const playerId = gameState.speaking.order[i];
            const player = gameState.players[playerId];
            const isTestPlayer = playerId.startsWith('test-');
            
            let playerDisplay;
            if (isTestPlayer) {
                const testNumber = playerId.split('-')[2];
                playerDisplay = `測試玩家 ${testNumber}`;
            } else {
                playerDisplay = `<@${playerId}>`;
            }
            
            const isCurrent = i === 0;
            speakingOrderText += `${i + 1}. ${playerDisplay}${isCurrent ? ' 👈 **當前發言**' : ''}\n`;
        }

        // Send discussion start message
        await interaction.channel.send({
            content: `💬 **討論階段開始！**\n\n存活玩家：${alivePlayers.length} 人\n\n**發言順序：**\n${speakingOrderText}\n請按順序發言，發言完畢後點擊下方按鈕。`,
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
 * Handle game end
 */
async function handleGameEnd(client, interaction, messageId, gameState, winner) {
    // Remove button
    await interaction.update({
        components: []
    });

    // Build final results
    let resultsText = '**最終結果：**\n\n';
    
    for (const [playerId, player] of Object.entries(gameState.players)) {
        const isTestPlayer = playerId.startsWith('test-');
        let playerDisplay;
        if (isTestPlayer) {
            const testNumber = playerId.split('-')[2];
            playerDisplay = `測試玩家 ${testNumber}`;
        } else {
            playerDisplay = `<@${playerId}>`;
        }
        
        const status = player.alive ? '✅ 存活' : '💀 死亡';
        resultsText += `${playerDisplay} - ${getRoleDisplay(player.role)} - ${status}\n`;
    }

    // Determine winner message
    const winnerEmoji = winner === 'werewolf' ? '🐺' : '👥';
    const winnerText = winner === 'werewolf' ? '**狼人陣營勝利！**' : '**村民陣營勝利！**';

    // Send game end message
    await interaction.channel.send({
        content: `🎉 **遊戲結束！**\n\n${winnerEmoji} ${winnerText}\n\n${resultsText}`,
        components: [{
            type: 1,
            components: [{
                type: 2,
                custom_id: `end-game-${messageId}`,
                label: '🏁 結束遊戲',
                style: 4 // Red
            }]
        }]
    });

    // Update game state
    gameState.phase = 'ended';
    WerewolfGame.saveGame(messageId, gameState, client.database);
}

