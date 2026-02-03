const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const SpeakingTimer = require("../../utils/SpeakingTimer");
const { triggerShootAbility } = require("../../utils/HunterShootHelper");
const { getRoleDisplay } = require("../../utils/WerewolfRoles");
const PlayerStats = require("../../utils/PlayerStats");
const config = require("../../config");

module.exports = new Component({
    customId: 'knight-duel-target',
    type: 'select',
    /**
     *
     * @param {DiscordBot} client
     * @param {StringSelectMenuInteraction} interaction
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

        // Get selected target
        const targetId = interaction.values[0];
        const targetPlayer = gameState.players[targetId];

        if (!targetPlayer || !targetPlayer.alive) {
            return await interaction.reply({
                content: '❌ 無效的目標！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Cancel speaking timer
        SpeakingTimer.cancelTimer(messageId);

        // Build displays
        const isKnightTestPlayer = currentSpeakerId.startsWith('test-');
        let knightDisplay;
        if (isKnightTestPlayer) {
            const testNumber = currentSpeakerId.split('-')[2];
            knightDisplay = `測試玩家 ${testNumber}`;
        } else {
            knightDisplay = `<@${currentSpeakerId}>`;
        }

        const isTargetTestPlayer = targetId.startsWith('test-');
        let targetDisplay;
        if (isTargetTestPlayer) {
            const testNumber = targetId.split('-')[2];
            targetDisplay = `測試玩家 ${testNumber}`;
        } else {
            targetDisplay = `<@${targetId}>`;
        }

        // Check if target is a werewolf (狼王, 狼人, 隱狼)
        const isWerewolf = targetPlayer.role === '狼王' || targetPlayer.role === '狼人' || targetPlayer.role === '隱狼';

        // Update ephemeral message
        await interaction.update({
            content: `⚔️ **決鬥目標已選擇！**\n\n目標：${targetDisplay}`,
            components: []
        });

        // Record knight duel statistics (skip test players)
        if (!currentSpeakerId.startsWith('test-')) {
            PlayerStats.recordKnightDuel(currentSpeakerId);
        }

        if (isWerewolf) {
            // Knight wins - target dies
            await interaction.channel.send({
                content: `⚔️ **${knightDisplay} (騎士) 對 ${targetDisplay} 發起決鬥！**\n\n💀 ${targetDisplay} 是 ${getRoleDisplay(targetPlayer.role)}，被騎士殺死！\n\n🌙 **立即進入黑夜階段...**`
            });

            // Kill target
            const deathList = [{
                playerId: targetId,
                reason: '被騎士決鬥'
            }];
            WerewolfGame.killPlayer(gameState, targetId, '被騎士決鬥', interaction.guild);
            WerewolfGame.saveGame(messageId, gameState, client.database);

            // Check if target is wolf king - trigger shoot ability
            await triggerShootAbility(client, interaction.channel, messageId, gameState, deathList, async () => {
                // After shooting (or if no shooting), check win condition then start night
                const winner = WerewolfGame.checkWinCondition(gameState);
                if (winner) {
                    const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                    await handleGameEnd(client, interaction.channel, messageId, gameState, winner);
                    return;
                }

                // Start night phase
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
            });
        } else {
            // Knight loses - knight dies
            await interaction.channel.send({
                content: `⚔️ **${knightDisplay} (騎士) 對 ${targetDisplay} 發起決鬥！**\n\n💀 ${targetDisplay} 不是狼人，騎士以死謝罪！\n\n☀️ **白天階段繼續進行...**`
            });

            // Kill knight
            WerewolfGame.killPlayer(gameState, currentSpeakerId, '決鬥失敗', interaction.guild);
            WerewolfGame.saveGame(messageId, gameState, client.database);

            // Check win condition
            const winner = WerewolfGame.checkWinCondition(gameState);
            if (winner) {
                const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                await handleGameEnd(client, interaction.channel, messageId, gameState, winner);
                return;
            }

            // Continue with next speaker (auto-advance)
            const { autoAdvanceToNextSpeaker } = require('../Button/finish-speaking');
            await autoAdvanceToNextSpeaker(client, interaction.channel, messageId);
        }
    }
}).toJSON();

