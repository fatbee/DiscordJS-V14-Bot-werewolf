const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'guard-protect-target',
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

        // Check if user is the guard (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;

        // Find the actual guard player
        const guardPlayer = Object.values(gameState.players).find(p => p.alive && p.role === '守衛');
        const userPlayer = gameState.players[userId];

        if (!isOwner && (!userPlayer || !userPlayer.alive || userPlayer.role !== '守衛')) {
            return await interaction.reply({
                content: '❌ 你不是守衛！',
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

        // Save guard protection to night actions
        gameState.nightActions.guardProtect = targetId;
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

        // Update the ephemeral message to confirm selection
        await interaction.update({
            content: `✅ **守護成功！**\n\n你選擇守護：${targetDisplay}\n\n今晚這名玩家將不會被狼人殺死（但仍可能被女巫毒死）。\n\n⏱️ 你可以在計時器結束前更改選擇`,
            components: [{
                type: 1,
                components: [{
                    type: 3,
                    custom_id: `guard-protect-target-${messageId}`,
                    placeholder: `已選擇：${targetDisplay}`,
                    min_values: 1,
                    max_values: 1,
                    options: interaction.message.components[0].components[0].options.map(opt => ({
                        ...opt,
                        default: opt.value === targetId
                    }))
                }]
            }]
        });
    }
}).toJSON();

