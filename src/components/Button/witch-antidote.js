const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'witch-antidote',
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

        // Find the actual witch player
        const witchPlayer = Object.values(gameState.players).find(p => p.alive && p.role === '女巫');
        const userPlayer = gameState.players[userId];

        if (!isOwner && (!userPlayer || !userPlayer.alive || userPlayer.role !== '女巫')) {
            return await interaction.reply({
                content: '❌ 你不是女巫！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Use witch player's ID for potion check (or owner's ID if in test mode)
        const witchId = isOwner && witchPlayer ? witchPlayer.id : userId;

        // Check if witch has antidote
        if (!gameState.witchPotions[witchId]?.antidote) {
            return await interaction.reply({
                content: '❌ 女巫已經使用過解藥了！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Use antidote to save the victim
        const victimId = gameState.nightActions.werewolfKill;

        // Build victim display for witch to see
        let victimDisplay;
        const isTestPlayer = victimId.startsWith('test-');
        if (isTestPlayer) {
            const testNumber = victimId.split('-')[2];
            victimDisplay = `測試玩家 ${testNumber}`;
        } else {
            victimDisplay = `<@${victimId}>`;
        }

        // Check if it's first night and witch is the victim and rule forbids self-save
        const isFirstNight = gameState.round === 1;
        const witchIsVictim = victimId === witchId;
        const canSaveSelfFirstNight = gameState.gameRules?.witchCanSaveSelfFirstNight !== false;

        if (isFirstNight && witchIsVictim && !canSaveSelfFirstNight) {
            return await interaction.reply({
                content: `❌ **遊戲規則禁止女巫在第一夜自救！**\n\n今晚被狼人殺死的是：${victimDisplay}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Show dropdown asking witch to confirm save or not
        await interaction.reply({
            content: `💊 **解藥選擇：**\n\n今晚被狼人殺死的是：${victimDisplay}\n\n請選擇是否要救這名玩家：\n\n⏱️ 你可以在計時器結束前更改選擇`,
            components: [{
                type: 1,
                components: [{
                    type: 3, // String Select Menu
                    custom_id: `witch-antidote-confirm-${messageId}`,
                    placeholder: '選擇是否使用解藥',
                    min_values: 1,
                    max_values: 1,
                    options: [
                        {
                            label: '使用解藥救人',
                            value: 'save',
                            description: `救活 ${victimDisplay}`,
                            emoji: '💊'
                        },
                        {
                            label: '不使用解藥',
                            value: 'no-save',
                            description: '不救這名玩家',
                            emoji: '❌'
                        }
                    ]
                }]
            }],
            flags: MessageFlags.Ephemeral
        });

        // Note: The actual save action will be handled by witch-antidote-confirm select menu
    }
}).toJSON();