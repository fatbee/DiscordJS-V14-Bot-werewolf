const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { processNextShooter } = require("../../utils/HunterShootHelper");
const config = require("../../config");

module.exports = new Component({
    customId: 'hunter-shoot',
    type: 'select',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {StringSelectMenuInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract messageId and shooter index from custom_id (format: hunter-shoot-{messageId}-{index})
        const parts = interaction.customId.split('-');
        const shooterIndex = parseInt(parts.pop());
        const messageId = parts.pop();
        
        // Get game state
        const gameState = WerewolfGame.getGame(messageId, client.database);
        
        if (!gameState) {
            return await interaction.reply({
                content: '❌ 找不到遊戲數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get current shooter
        const shooters = gameState.pendingShooters || [];
        if (shooterIndex >= shooters.length) {
            return await interaction.reply({
                content: '❌ 無效的射擊者！',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const shooter = shooters[shooterIndex];
        const shooterPlayer = gameState.players[shooter.playerId];
        
        // Check if user is the shooter (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;
        
        if (!isOwner && userId !== shooter.playerId) {
            return await interaction.reply({
                content: '❌ 你不是當前射擊者！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get selected target
        const targetId = interaction.values[0];
        const targetPlayer = gameState.players[targetId];

        if (!targetPlayer || !targetPlayer.alive) {
            return await interaction.reply({
                content: '❌ 無效的目標！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Build target display
        const isTestPlayer = targetId.startsWith('test-');
        let targetDisplay;
        if (isTestPlayer) {
            const testNumber = targetId.split('-')[2];
            targetDisplay = `測試玩家 ${testNumber}`;
        } else {
            targetDisplay = `<@${targetId}>`;
        }

        // Kill the target (被射殺，沒有遺言)
        WerewolfGame.killPlayer(gameState, targetId, '被射殺');
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Update message to show result
        await interaction.update({
            content: `${interaction.message.content}\n\n✅ **已射殺：${targetDisplay}**\n\n💀 ${targetDisplay} 被射殺，沒有遺言。`,
            components: []
        });

        // Process next shooter or complete
        const nextIndex = shooterIndex + 1;
        
        if (nextIndex < shooters.length) {
            // Process next shooter
            await processNextShooter(
                client,
                interaction.channel,
                messageId,
                gameState,
                shooters,
                nextIndex,
                null // onComplete will be retrieved from gameState
            );
        } else {
            // All shooters processed, trigger the stored completion callback
            // The completion callback is context-dependent (dawn phase or voting phase)
            // We'll handle this in the DayPhaseHelper and voting handler

            // Check if we're in dawn phase or voting phase
            if (gameState.phase === 'day' && gameState.speaking.current === -1) {
                // Dawn phase - proceed to discussion (check ALL win conditions)
                const { triggerDiscussionPhase } = require('../../utils/DayPhaseHelper');
                await triggerDiscussionPhase(client, interaction.channel, messageId, gameState);
            } else if (gameState.phase === 'day' && gameState.speaking.current >= 0) {
                // After voting - check for ANY win condition
                const winner = WerewolfGame.checkWinCondition(gameState);

                if (winner) {
                    // Game ended - trigger game end
                    const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                    await handleGameEnd(client, interaction.channel, messageId, gameState, winner);
                } else {
                    // No winner - proceed to night
                    await interaction.channel.send({
                        content: `🌙 **準備進入夜晚...**`,
                        components: [{
                            type: 1,
                            components: [{
                                type: 2,
                                custom_id: `start-night-${messageId}`,
                                label: '🌙 開始夜晚',
                                style: 1 // Blue
                            }]
                        }]
                    });
                }
            }

            // Clear pending shooters
            delete gameState.pendingShooters;
            delete gameState.currentShooterIndex;
            delete gameState.shootOnComplete;
            WerewolfGame.saveGame(messageId, gameState, client.database);
        }
    }
}).toJSON();

