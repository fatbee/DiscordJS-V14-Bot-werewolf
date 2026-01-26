const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'hidden-werewolf-kill',
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

        // Check if user is the hidden werewolf (or bot owner in test mode)
        const userId = interaction.user.id;
        const userPlayer = gameState.players[userId];
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;

        if (!isOwner && (!userPlayer || !userPlayer.alive || userPlayer.role !== '隱狼')) {
            return await interaction.reply({
                content: '❌ 你不是存活的隱狼！',
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

        // Save hidden werewolf kill action
        gameState.nightActions.werewolfKill = targetId;
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Build target display
        const isTestPlayer = targetId.startsWith('test-');
        let targetDisplay;
        if (isTestPlayer) {
            const testNumber = targetId.split('-')[2];
            targetDisplay = `測試玩家 ${testNumber}`;
        } else {
            targetDisplay = `<@${targetId}>`;
        }

        // Update message to show selection
        await interaction.update({
            content: `🌑🐺 **隱狼已選擇目標！**\n\n目標：${targetDisplay}\n\n✅ 隱狼請閉眼，等待其他角色行動...`,
            components: []
        });

        // Trigger seer action
        const { triggerSeerAction } = require('./werewolf-kill');
        await triggerSeerAction(client, interaction.channel, messageId, gameState, targetId);
    }
}).toJSON();

