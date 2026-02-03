const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'witch-skip',
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

        // Check if user is the witch (or bot owner in test mode)
        const userId = interaction.user.id;
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;
        const userPlayer = gameState.players[userId];
        const witchPlayer = Object.values(gameState.players).find(p => p.role === '女巫');

        if (!isOwner && (!userPlayer || !userPlayer.alive || userPlayer.role !== '女巫')) {
            return await interaction.reply({
                content: '❌ 你不是女巫！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if witch already made a choice
        if (gameState.nightActions.witchAction && gameState.nightActions.witchAction !== 'skip') {
            return await interaction.reply({
                content: '❌ 你已經做出選擇，不能更改！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get victim information to show witch
        const victimId = gameState.nightActions.werewolfKill;
        let victimDisplay = '無人';
        if (victimId) {
            const isTestPlayer = victimId.startsWith('test-');
            if (isTestPlayer) {
                const testNumber = victimId.split('-')[2];
                victimDisplay = `測試玩家 ${testNumber}`;
            } else {
                victimDisplay = `<@${victimId}>`;
            }
        }

        // Record skip action
        gameState.nightActions.witchAction = 'skip';
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Send confirmation to witch (show who was killed)
        await interaction.reply({
            content: `⏭️ **你選擇不使用任何藥水**\n\n今晚被狼人殺死的是：${victimDisplay}\n\n⏱️ 請等待計時器結束...`,
            flags: MessageFlags.Ephemeral
        });

        // Note: Timer will handle proceeding to day phase after 25 seconds
    }
}).toJSON();


