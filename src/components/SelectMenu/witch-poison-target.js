const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'witch-poison-target',
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

        // Use witch player's ID for potion tracking
        const witchId = isOwner && witchPlayer ? witchPlayer.id : userId;

        // Check if witch already used antidote this night
        if (gameState.nightActions.witchAction === 'antidote') {
            return await interaction.reply({
                content: '❌ **你已經使用了解藥，不能再使用毒藥！**',
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

        // Use poison
        gameState.nightActions.witchAction = 'poison';
        gameState.nightActions.witchPoisonTarget = targetId;
        gameState.witchPotions[witchId].poison = false; // Mark poison as used

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

        // Build werewolf victim display
        const victimId = gameState.nightActions.werewolfKill;
        let victimDisplay;
        const isVictimTestPlayer = victimId.startsWith('test-');
        if (isVictimTestPlayer) {
            const testNumber = victimId.split('-')[2];
            victimDisplay = `測試玩家 ${testNumber}`;
        } else {
            victimDisplay = `<@${victimId}>`;
        }

        // Send confirmation to witch via ephemeral reply (show both who died and who was poisoned)
        await interaction.update({
            content: `☠️ **你使用了毒藥！**\n\n今晚被狼人殺死的是：${victimDisplay}\n你毒殺了：${targetDisplay}\n\n⏱️ 請等待計時器結束...\n\n💡 你可以在計時器結束前更改選擇`,
            components: interaction.message.components
        });

        // Note: Timer will handle updating main channel message and proceeding to day phase
        // Don't update main channel message or trigger day phase here
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

