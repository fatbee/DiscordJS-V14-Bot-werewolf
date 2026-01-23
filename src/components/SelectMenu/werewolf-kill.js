const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { getRoleDisplay } = require("../../utils/WerewolfRoles");
const config = require("../../config");

module.exports = new Component({
    customId: 'werewolf-kill',
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

        // Check if user is a werewolf (or bot owner in test mode)
        const userId = interaction.user.id;
        const userPlayer = gameState.players[userId];
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;

        if (!isOwner && (!userPlayer || !userPlayer.alive || (userPlayer.role !== '狼王' && userPlayer.role !== '狼人'))) {
            return await interaction.reply({
                content: '❌ 你不是存活的狼人！',
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

        // Cancel werewolf timer if exists
        if (global.werewolfTimers && global.werewolfTimers.has(messageId)) {
            const timers = global.werewolfTimers.get(messageId);
            if (timers.interval) clearInterval(timers.interval);
            if (timers.timeout) clearTimeout(timers.timeout);
            global.werewolfTimers.delete(messageId);
        }

        // Save werewolf kill action
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

        // Update werewolf channel message to show selection
        await interaction.update({
            content: `🐺 **狼人已選擇目標！**\n\n目標：${targetDisplay}\n\n✅ 狼人請閉眼，等待其他角色行動...`,
            components: []
        });

        // Get main channel to send seer action
        const mainChannel = await client.channels.fetch(client.database.get(`game-channel-${messageId}`));

        // Trigger seer action (seer acts before witch now)
        await triggerSeerAction(client, mainChannel, messageId, gameState, targetId);
    }
}).toJSON();

/**
 * Helper function to trigger seer action
 * @param {DiscordBot} client
 * @param {Channel} channel - The main game channel
 * @param {string} messageId
 * @param {object} gameState
 * @param {string} werewolfKillTarget
 */
async function triggerSeerAction(client, channel, messageId, gameState, werewolfKillTarget) {
    const NightActionTimer = require('../../utils/NightActionTimer');
    const seerPlayer = Object.values(gameState.players).find(p => p.role === '預言家');
    const seerIsAlive = seerPlayer && seerPlayer.alive;

    // Always show seer action phase, even if seer is dead or not in game
    // If seer is dead or not in game, just show basic message and wait 25 seconds
    if (!seerPlayer || !seerIsAlive) {
        // Show basic message without revealing seer status
        const skipMessage = await channel.send({
            content: `🔮 **預言家請睜眼！**\n\n⏱️ **剩餘時間：25 秒**`
        });

        // Wait 25 seconds before proceeding
        NightActionTimer.startTimer(
            skipMessage,
            `🔮 **預言家請睜眼！**`,
            25,
            async () => {
                await skipMessage.edit({
                    content: `🔮 **預言家已完成查驗**\n\n✅ 預言家請閉眼...`
                });
                await triggerWitchAction(client, channel, messageId, gameState, werewolfKillTarget);
            },
            `seer-${messageId}`
        );
        return;
    }

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
        const testModeText = config.werewolf.testMode ? ' **(testmode: true)**' : '';
        const seerMessage = await channel.send({
            content: `🔮 **預言家請睜眼！**\n\n預言家請選擇一名玩家查驗身份：${testModeText}\n\n⏱️ **剩餘時間：25 秒**`,
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

        // Start 25 second timer - seer must wait full 25 seconds even if action taken
        NightActionTimer.startTimer(
            seerMessage,
            `🔮 **預言家請睜眼！**\n\n預言家請選擇一名玩家查驗身份：${testModeText}`,
            25,
            async () => {
                // After 25 seconds, disable the dropdown and proceed to witch
                await seerMessage.edit({
                    content: `🔮 **預言家已完成查驗**\n\n✅ 預言家請閉眼...`,
                    components: []
                });

                // Reload game state to check if seer made a choice
                const currentGameState = WerewolfGame.getGame(messageId, client.database);

                // Proceed to witch action
                await triggerWitchAction(client, channel, messageId, currentGameState, werewolfKillTarget);
            },
            `seer-${messageId}`
        );
    } else {
        // No valid targets, skip to witch
        gameState.nightActions.seerCheck = 'skip';
        WerewolfGame.saveGame(messageId, gameState, client.database);
        await triggerWitchAction(client, channel, messageId, gameState, werewolfKillTarget);
    }
}

/**
 * Helper function to trigger witch action
 * @param {DiscordBot} client
 * @param {Channel} channel - The main game channel
 * @param {string} messageId
 * @param {object} gameState
 * @param {string} werewolfKillTarget
 */
async function triggerWitchAction(client, channel, messageId, gameState, werewolfKillTarget) {
    const NightActionTimer = require('../../utils/NightActionTimer');
    const witchPlayer = Object.values(gameState.players).find(p => p.role === '女巫');
    const witchIsAlive = witchPlayer && witchPlayer.alive;

    // Always show witch action phase, even if witch is dead or not in game
    // If witch is dead or not in game, just show basic message and wait 25 seconds
    if (!witchPlayer || !witchIsAlive) {
        // Show basic message without revealing witch status
        const skipMessage = await channel.send({
            content: `🧙‍♀️ **女巫請睜眼！**\n\n⏱️ **剩餘時間：25 秒**`
        });

        // Wait 25 seconds before proceeding to day phase
        NightActionTimer.startTimer(
            skipMessage,
            `🧙‍♀️ **女巫請睜眼！**`,
            25,
            async () => {
                await skipMessage.edit({
                    content: `🧙‍♀️ **女巫已完成行動**\n\n✅ 女巫請閉眼...`
                });
                // TODO: Trigger day phase
                console.log('Night actions complete, ready for day phase');
            },
            `witch-${messageId}`
        );
        return;
    }

    // Witch is alive - show action in main channel but don't reveal who died
    // Only witch will see who died when they click the buttons
    const testModeText = config.werewolf.testMode ? ' **(testmode: true)**' : '';

    // Always show all 3 buttons to prevent others from guessing potion usage
    const components = [{
        type: 1,
        components: [
            {
                type: 2,
                custom_id: `witch-antidote-${messageId}`,
                label: '💊 使用解藥',
                style: 3 // Green
            },
            {
                type: 2,
                custom_id: `witch-poison-${messageId}`,
                label: '☠️ 使用毒藥',
                style: 4 // Red
            },
            {
                type: 2,
                custom_id: `witch-skip-${messageId}`,
                label: '⏭️ 不使用',
                style: 2 // Gray
            }
        ]
    }];

    // Don't reveal who died in main channel - witch will see it in ephemeral message
    const witchMessage = await channel.send({
        content: `🧙‍♀️ **女巫請睜眼！**\n\n女巫請選擇你的行動：${testModeText}\n\n⏱️ **剩餘時間：25 秒**`,
        components: components
    });

    // Start 25 second timer - witch must wait full 25 seconds even if action taken
    NightActionTimer.startTimer(
        witchMessage,
        `🧙‍♀️ **女巫請睜眼！**\n\n女巫請選擇你的行動：${testModeText}`,
        25,
        async () => {
            // After 25 seconds, disable the buttons and proceed to day phase
            await witchMessage.edit({
                content: `🧙‍♀️ **女巫已完成行動**\n\n✅ 女巫請閉眼...`,
                components: []
            });

            // TODO: Trigger day phase
            console.log('Night actions complete, ready for day phase');
        },
        `witch-${messageId}`
    );
}

// Export helper functions for use in other files
module.exports.triggerSeerAction = triggerSeerAction;
module.exports.triggerWitchAction = triggerWitchAction;