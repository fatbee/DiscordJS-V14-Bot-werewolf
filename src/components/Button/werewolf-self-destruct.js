const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const SpeakingTimer = require("../../utils/SpeakingTimer");
const { triggerShootAbility } = require("../../utils/HunterShootHelper");
const { getRoleDisplay } = require("../../utils/WerewolfRoles");
const config = require("../../config");

module.exports = new Component({
    customId: 'werewolf-self-destruct',
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

        // Check if current player can self-destruct
        // 狼王, 狼人 can always self-destruct
        // 隱狼 can only self-destruct when activated (all 狼王/狼人 are dead)
        const canSelfDestruct = currentPlayer.role === '狼王' || currentPlayer.role === '狼人';
        
        // Check if 隱狼 is activated
        let hiddenWerewolfActivated = false;
        if (currentPlayer.role === '隱狼') {
            const otherWerewolves = Object.values(gameState.players).filter(p => 
                (p.role === '狼王' || p.role === '狼人') && p.alive
            );
            hiddenWerewolfActivated = otherWerewolves.length === 0;
        }

        if (!isOwner && !canSelfDestruct && !(currentPlayer.role === '隱狼' && hiddenWerewolfActivated)) {
            return await interaction.reply({
                content: '❌ 只有狼王、狼人、或已激活的隱狼可以自爆！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Cancel speaking timer
        SpeakingTimer.cancelTimer(messageId);

        // Build display
        const isTestPlayer = currentSpeakerId.startsWith('test-');
        let playerDisplay;
        if (isTestPlayer) {
            const testNumber = currentSpeakerId.split('-')[2];
            playerDisplay = `測試玩家 ${testNumber}`;
        } else {
            playerDisplay = `<@${currentSpeakerId}>`;
        }

        // Update button message
        await interaction.update({
            components: []
        });

        // Announce self-destruct
        await interaction.channel.send({
            content: `💣 **${playerDisplay} 自爆了！**\n\n身份：${getRoleDisplay(currentPlayer.role)}\n\n${currentPlayer.role === '狼王' ? '狼王可以開槍！' : '直接進入夜晚...'}`
        });

        // Kill the player
        const deathList = [{
            playerId: currentSpeakerId,
            reason: '自爆'
        }];
        WerewolfGame.killPlayer(gameState, currentSpeakerId, '自爆');
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // If wolf king, trigger shoot ability
        await triggerShootAbility(client, interaction.channel, messageId, gameState, deathList, async () => {
            // After shooting (or if no shooting), check win condition then show start night button
            const winner = WerewolfGame.checkWinCondition(gameState);
            if (winner) {
                const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                await handleGameEnd(client, interaction.channel, messageId, gameState, winner);
                return;
            }

            // Show start night button (same as after voting)
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
    }
}).toJSON();

