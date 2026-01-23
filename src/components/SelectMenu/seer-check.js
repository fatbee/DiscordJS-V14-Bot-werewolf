const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { isWerewolf } = require("../../utils/WerewolfRoles");
const config = require("../../config");

module.exports = new Component({
    customId: 'seer-check',
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

        // Check if user is the seer (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;
        const userPlayer = gameState.players[userId];

        if (!isOwner && (!userPlayer || !userPlayer.alive || userPlayer.role !== '預言家')) {
            return await interaction.reply({
                content: '❌ 你不是預言家！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if seer already made a choice (cannot change)
        if (gameState.nightActions.seerCheck && gameState.nightActions.seerCheck !== 'skip') {
            return await interaction.reply({
                content: '❌ 你已經做出選擇，不能更改！',
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

        // Check target's identity
        const targetRole = targetPlayer.role;
        const isWerewolfTeam = isWerewolf(targetRole);

        // Save seer check action
        gameState.nightActions.seerCheck = targetId;
        gameState.nightActions.seerResult = isWerewolfTeam ? 'werewolf' : 'villager';
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Don't disable dropdown or update message - let timer handle it
        // This keeps the screen unchanged until timer expires

        // Build target display
        const isTestPlayer = targetId.startsWith('test-');
        let targetDisplay;
        if (isTestPlayer) {
            const testNumber = targetId.split('-')[2];
            targetDisplay = `測試玩家 ${testNumber}`;
        } else {
            targetDisplay = `<@${targetId}>`;
        }

        // Build result message
        const resultEmoji = isWerewolfTeam ? '🐺' : '👤';
        const resultText = isWerewolfTeam ? '**狼人陣營**' : '**好人陣營**';

        // Send result to seer via ephemeral reply (only seer can see)
        await interaction.reply({
            content: `🔮 **查驗結果**\n\n你查驗了：${targetDisplay}\n\n${resultEmoji} 此玩家是：${resultText}\n\n⏱️ 請等待計時器結束...`,
            flags: MessageFlags.Ephemeral
        });

        // Note: Timer will handle proceeding to witch action after 25 seconds
        // Dropdown is already disabled above
    }
}).toJSON();