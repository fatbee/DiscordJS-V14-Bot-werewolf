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

/**
 * Helper function to trigger day phase
 */
async function triggerDayPhase(client, interaction, messageId, gameState) {
    // Process deaths from night actions
    const deathList = [];

    // Check werewolf kill
    const werewolfKillTarget = gameState.nightActions.werewolfKill;
    const witchAction = gameState.nightActions.witchAction;
    const witchAntidoteTarget = gameState.nightActions.witchAntidoteTarget;
    const witchPoisonTarget = gameState.nightActions.witchPoisonTarget;

    // If witch used antidote on werewolf kill victim, they survive
    if (werewolfKillTarget && witchAction !== 'antidote') {
        deathList.push({
            playerId: werewolfKillTarget,
            reason: '被狼人殺死'
        });
    }

    // If witch used poison, add to death list
    if (witchAction === 'poison' && witchPoisonTarget) {
        deathList.push({
            playerId: witchPoisonTarget,
            reason: '被女巫毒死'
        });
    }

    // Process deaths
    for (const death of deathList) {
        WerewolfGame.killPlayer(gameState, death.playerId, death.reason);
    }

    // Update game phase to day
    gameState.phase = 'day';
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Build death announcement (don't reveal death reasons, randomize order)
    let deathAnnouncement = '';
    if (deathList.length === 0) {
        deathAnnouncement = '🎉 **昨晚是平安夜，沒有人死亡！**';
    } else {
        // Randomize death list order to prevent guessing who was killed by werewolf vs witch
        const shuffledDeaths = [...deathList].sort(() => Math.random() - 0.5);

        deathAnnouncement = `💀 **昨晚死亡的玩家：**\n\n`;
        for (const death of shuffledDeaths) {
            const player = gameState.players[death.playerId];
            const isTestPlayer = death.playerId.startsWith('test-');
            let playerDisplay;
            if (isTestPlayer) {
                const testNumber = death.playerId.split('-')[2];
                playerDisplay = `測試玩家 ${testNumber}`;
            } else {
                playerDisplay = `<@${death.playerId}>`;
            }
            // Only show player name, not death reason
            deathAnnouncement += `• ${playerDisplay}\n`;
        }
    }

    // Get main channel
    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);

    // Send day announcement
    await channel.send({
        content: `☀️ **天亮了！第 ${gameState.round} 天**\n\n${deathAnnouncement}\n\n準備進入討論階段...`,
        components: [{
            type: 1,
            components: [{
                type: 2,
                custom_id: `start-discussion-${messageId}`,
                label: '💬 開始討論',
                style: 1 // Blue
            }]
        }]
    });
}

/**
 * OLD - Helper function to trigger seer action (DEPRECATED)
 */
async function triggerSeerAction_OLD(client, interaction, messageId, gameState) {
    const seerPlayer = Object.values(gameState.players).find(p => p.alive && p.role === '預言家');

    if (!seerPlayer || seerPlayer.id.startsWith('test-')) {
        // No seer or seer is test player, skip to day phase
        gameState.nightActions.seerCheck = 'skip';
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // TODO: Trigger day phase transition
        console.log('Night actions complete, ready for day phase');
        return;
    }

    try {
        // In test mode, send to owner; otherwise send to actual seer
        const notifyUserId = config.werewolf.testMode ? config.users.ownerId : seerPlayer.id;
        const user = await client.users.fetch(notifyUserId);
        
        // Get alive players (excluding seer)
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState).filter(p => p.id !== seerPlayer.id);
        
        // Build target selection options
        const targetOptions = alivePlayers.map(player => {
            const isTestPlayer = player.id.startsWith('test-');
            if (isTestPlayer) {
                const testNumber = player.id.split('-')[2];
                return {
                    label: `測試玩家 ${testNumber}`,
                    value: player.id,
                    description: `查驗此玩家的身份`
                };
            } else {
                return {
                    label: `玩家 ${player.id}`,
                    value: player.id,
                    description: `查驗此玩家的身份`,
                    emoji: '🔍'
                };
            }
        });

        if (targetOptions.length > 0) {
            const testModeText = config.werewolf.testMode ? '\n\n🎮 **測試模式** - 你正在扮演預言家' : '';
            await user.send({
                content: `🔮 **預言家請睜眼！**\n\n請選擇一名玩家查驗身份：${testModeText}`,
                components: [{
                    type: 1,
                    components: [{
                        type: 3, // String Select Menu
                        custom_id: `seer-check-${messageId}`,
                        placeholder: '選擇要查驗的玩家',
                        min_values: 1,
                        max_values: 1,
                        options: targetOptions.slice(0, 25) // Discord limit: 25 options
                    }]
                }]
            });
        }
    } catch (error) {
        console.error(`Failed to send DM to seer:`, error);
        
        // If seer can't receive DM, auto-skip
        gameState.nightActions.seerCheck = 'skip';
        WerewolfGame.saveGame(messageId, gameState, client.database);
        
        // TODO: Trigger day phase transition
        console.log('Night actions complete, ready for day phase');
    }
}

