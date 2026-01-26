const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { triggerShootAbility } = require("../../utils/HunterShootHelper");
const config = require("../../config");

module.exports = new Component({
    customId: 'finish-last-words',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract messageId and playerId from custom_id (format: finish-last-words-{messageId}-{playerId})
        const parts = interaction.customId.split('-');
        const playerId = parts.pop();
        const messageId = parts.pop();
        
        // Get game state
        const gameState = WerewolfGame.getGame(messageId, client.database);
        
        if (!gameState) {
            return await interaction.reply({
                content: '❌ 找不到遊戲數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if user is the exiled player (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;
        
        if (!isOwner && userId !== playerId) {
            return await interaction.reply({
                content: '❌ 你不是被放逐的玩家！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Clear last words timer if exists
        if (global.lastWordsTimers && global.lastWordsTimers.has(messageId)) {
            const timer = global.lastWordsTimers.get(messageId);
            if (timer.interval) clearInterval(timer.interval);
            if (timer.timeout) clearTimeout(timer.timeout);
            global.lastWordsTimers.delete(messageId);
        }

        // Update message to remove button
        await interaction.update({
            components: []
        });

        // Get pending exile shoot data
        const deathList = gameState.pendingExileShoot || [];
        delete gameState.pendingExileShoot;
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Check if exiled player is hunter/wolf king and can shoot
        await triggerShootAbility(client, interaction.channel, messageId, gameState, deathList, async () => {
            // After shooting (or if no shooting), check win condition
            // Reload game state to get latest data after shooting
            const currentGameState = WerewolfGame.getGame(messageId, client.database);
            if (!currentGameState) return;

            const winner = WerewolfGame.checkWinCondition(currentGameState);

            // Check for ANY win condition (villager or werewolf victory)
            if (winner) {
                const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                await handleGameEnd(client, interaction.channel, messageId, currentGameState, winner);
                return;
            }

            // No winner, proceed to night
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

