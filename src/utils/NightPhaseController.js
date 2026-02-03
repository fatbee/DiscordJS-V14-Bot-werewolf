const WerewolfGame = require('./WerewolfGame');
const { getRole, getNightActionOrder } = require('./WerewolfRoles');
const NightActionTimer = require('./NightActionTimer');
const config = require('../config');

/**
 * Night Phase Controller
 * Centralized control flow for night actions
 * Makes it easy to add new roles without modifying multiple files
 */
class NightPhaseController {
    /**
     * Start the night phase and process all night actions in order
     * @param {DiscordBot} client
     * @param {Channel} channel - Main game channel
     * @param {string} messageId
     * @param {object} gameState
     */
    static async startNightPhase(client, channel, messageId, gameState) {
        // Get night action order from role configuration
        const nightActionOrder = getNightActionOrder();
        
        // Process each role in order
        await this.processNextRole(client, channel, messageId, gameState, nightActionOrder, 0);
    }

    /**
     * Process the next role in the night action sequence
     * @param {DiscordBot} client
     * @param {Channel} channel
     * @param {string} messageId
     * @param {object} gameState
     * @param {Array<string>} roleOrder - Array of role names in order
     * @param {number} currentIndex - Current position in roleOrder
     */
    static async processNextRole(client, channel, messageId, gameState, roleOrder, currentIndex) {
        // If we've processed all roles, proceed to day phase
        if (currentIndex >= roleOrder.length) {
            const { triggerDayPhase } = require('./DayPhaseHelper');
            const currentGameState = WerewolfGame.getGame(messageId, client.database);
            await triggerDayPhase(client, channel, messageId, currentGameState);
            return;
        }

        const roleName = roleOrder[currentIndex];
        const role = getRole(roleName);

        if (!role || !role.nightAction) {
            // Skip roles without night actions
            await this.processNextRole(client, channel, messageId, gameState, roleOrder, currentIndex + 1);
            return;
        }

        // Get the callback for next role
        const onComplete = async () => {
            const currentGameState = WerewolfGame.getGame(messageId, client.database);
            await this.processNextRole(client, channel, messageId, currentGameState, roleOrder, currentIndex + 1);
        };

        // Trigger the appropriate action based on role type
        switch (role.nightActionType) {
            case 'werewolf-kill':
                await this.handleWerewolfKill(client, channel, messageId, gameState, onComplete);
                break;
            case 'seer-check':
                await this.handleSeerCheck(client, channel, messageId, gameState, onComplete);
                break;
            case 'witch-action':
                await this.handleWitchAction(client, channel, messageId, gameState, onComplete);
                break;
            default:
                // Unknown action type, skip
                await onComplete();
                break;
        }
    }

    /**
     * Handle werewolf kill action
     * Note: This is triggered from start-night button, not here
     * This method is a placeholder for future refactoring
     */
    static async handleWerewolfKill(client, channel, messageId, gameState, onComplete) {
        // Werewolf kill is handled in start-night.js
        // This is called after werewolf makes selection in werewolf-kill.js
        // Just call onComplete to proceed to next role
        await onComplete();
    }

    /**
     * Handle seer check action
     */
    static async handleSeerCheck(client, channel, messageId, gameState, onComplete) {
        const seerPlayer = Object.values(gameState.players).find(p => p.role === '預言家');

        // If seer is not in the game, skip this phase entirely
        if (!seerPlayer) {
            await onComplete();
            return;
        }

        const seerIsAlive = seerPlayer.alive;

        // If seer is dead, show action phase but skip
        if (!seerIsAlive) {
            const skipMessage = await channel.send({
                content: `🔮 **預言家請睜眼！**\n\n⏱️ **剩餘時間：25 秒**`
            });

            NightActionTimer.startTimer(
                skipMessage,
                `🔮 **預言家請睜眼！**`,
                25,
                async () => {
                    await skipMessage.edit({
                        content: `🔮 **預言家已完成查驗**\n\n✅ 預言家請閉眼...`
                    });
                    await onComplete();
                },
                `seer-${messageId}`
            );
            return;
        }

        // Seer is alive, send action menu
        // Show all alive players (including seer)
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState);

        if (alivePlayers.length === 0) {
            gameState.nightActions.seerCheck = 'skip';
            WerewolfGame.saveGame(messageId, gameState, client.database);
            await onComplete();
            return;
        }

        // Build target options with speaking order numbers
        const targetOptions = [];
        for (const player of alivePlayers) {
            const isTestPlayer = player.id.startsWith('test-');

            // Find player's position in fixed speaking order
            const speakingOrderIndex = gameState.fixedSpeakingOrder.indexOf(player.id);
            const orderNumber = speakingOrderIndex !== -1 ? speakingOrderIndex + 1 : 0;

            if (isTestPlayer) {
                const testNumber = player.id.split('-')[2];
                targetOptions.push({
                    label: `${orderNumber}號 - 測試玩家 ${testNumber}`,
                    value: player.id,
                    description: `查驗此玩家的身份`,
                    orderNumber: orderNumber
                });
            } else {
                // Try to get nickname (or username if no nickname)
                let displayName = `玩家${orderNumber}`;
                try {
                    const member = await channel.guild.members.fetch(player.id);
                    displayName = member.displayName; // This returns nickname if set, otherwise username
                } catch (error) {
                    console.error(`Failed to fetch member ${player.id}:`, error);
                }

                targetOptions.push({
                    label: `${orderNumber}號 - ${displayName}`,
                    value: player.id,
                    description: `查驗此玩家的身份`,
                    emoji: '🔍',
                    orderNumber: orderNumber
                });
            }
        }

        // Sort by order number (1, 2, 3, ...)
        targetOptions.sort((a, b) => a.orderNumber - b.orderNumber);

        const testModeText = config.werewolf.testMode ? '\n\n🎮 **測試模式**' : '';
        const seerMessage = await channel.send({
            content: `🔮 **預言家請睜眼！**\n\n預言家請選擇一名玩家查驗身份：${testModeText}\n\n⏱️ **剩餘時間：25 秒**`,
            components: [{
                type: 1,
                components: [{
                    type: 3,
                    custom_id: `seer-check-${messageId}`,
                    placeholder: '選擇要查驗的玩家',
                    min_values: 1,
                    max_values: 1,
                    options: targetOptions.slice(0, 25)
                }]
            }]
        });

        NightActionTimer.startTimer(
            seerMessage,
            `🔮 **預言家請睜眼！**\n\n預言家請選擇一名玩家查驗身份：${testModeText}`,
            25,
            async () => {
                await seerMessage.edit({
                    content: `🔮 **預言家已完成查驗**\n\n✅ 預言家請閉眼...`,
                    components: []
                });
                await onComplete();
            },
            `seer-${messageId}`
        );
    }

    /**
     * Handle witch action
     */
    static async handleWitchAction(client, channel, messageId, gameState, onComplete) {
        const witchPlayer = Object.values(gameState.players).find(p => p.role === '女巫');

        // If witch is not in the game, skip this phase entirely
        if (!witchPlayer) {
            await onComplete();
            return;
        }

        const witchIsAlive = witchPlayer.alive;

        // If witch is dead, show action phase with buttons (to hide witch's death) but skip
        if (!witchIsAlive) {
            const testModeText = config.werewolf.testMode ? '\n\n🎮 **測試模式**' : '';

            // Show buttons even though witch is dead (to prevent revealing witch's status)
            const components = [];
            const buttons = [];
            buttons.push({
                type: 2,
                custom_id: `witch-antidote-${messageId}`,
                label: '💊 查看那位玩家被殺了',
                style: 3 // Green
            });
            buttons.push({
                type: 2,
                custom_id: `witch-poison-${messageId}`,
                label: '☠️ 使用毒藥',
                style: 4 // Red
            });
            components.push({ type: 1, components: buttons });

            const skipMessage = await channel.send({
                content: `🧙‍♀️ **女巫請睜眼！**\n\n女巫請選擇你的行動：${testModeText}\n\n⏱️ **剩餘時間：25 秒**`,
                components: components
            });

            NightActionTimer.startTimer(
                skipMessage,
                `🧙‍♀️ **女巫請睜眼！**\n\n女巫請選擇你的行動：${testModeText}`,
                25,
                async () => {
                    await skipMessage.edit({
                        content: `🧙‍♀️ **女巫已完成行動**\n\n✅ 女巫請閉眼...`,
                        components: []
                    });
                    await onComplete();
                },
                `witch-${messageId}`
            );
            return;
        }

        // Witch is alive, show action menu
        const werewolfKillTarget = gameState.nightActions.werewolfKill;
        const witchId = witchPlayer.id;

        // Send DM to witch with victim information
        const isTestWitch = witchId.startsWith('test-');
        if (!isTestWitch) {
            try {
                const witchUser = await client.users.fetch(witchId);

                // Build potion status
                const hasAntidote = gameState.witchPotions[witchId]?.antidote;
                const hasPoison = gameState.witchPotions[witchId]?.poison;
                const potionStatus = `💊 解藥：${hasAntidote ? '✅ 可用' : '❌ 已使用'}\n☠️ 毒藥：${hasPoison ? '✅ 可用' : '❌ 已使用'}`;

                // Only show victim if antidote is still available
                let dmContent;
                if (hasAntidote) {
                    // Build victim display
                    let victimDisplay = '無人';
                    if (werewolfKillTarget) {
                        const isTestPlayer = werewolfKillTarget.startsWith('test-');
                        if (isTestPlayer) {
                            const testNumber = werewolfKillTarget.split('-')[2];
                            victimDisplay = `測試玩家 ${testNumber}`;
                        } else {
                            victimDisplay = `<@${werewolfKillTarget}>`;
                        }
                    }
                    dmContent = `🧙‍♀️ **女巫階段**\n\n今晚被狼人殺死的是：${victimDisplay}\n\n${potionStatus}\n\n請在主頻道選擇你的行動。`;
                } else {
                    // Antidote already used, don't show victim
                    dmContent = `🧙‍♀️ **女巫階段**\n\n${potionStatus}\n\n請在主頻道選擇你的行動。`;
                }

                await witchUser.send({
                    content: dmContent
                });
            } catch (error) {
                console.error(`Failed to send DM to witch:`, error);
            }
        }

        const components = [];
        const testModeText = config.werewolf.testMode ? '\n\n🎮 **測試模式**' : '';

        // Add action buttons (always show all 3 buttons to prevent guessing)
        const buttons = [];
        buttons.push({
            type: 2,
            custom_id: `witch-antidote-${messageId}`,
            label: '💊 查看那位玩家被殺了',
            style: 3 // Green
        });
        buttons.push({
            type: 2,
            custom_id: `witch-poison-${messageId}`,
            label: '☠️ 使用毒藥',
            style: 4 // Red
        });
        components.push({ type: 1, components: buttons });

        const witchMessage = await channel.send({
            content: `🧙‍♀️ **女巫請睜眼！**\n\n女巫請選擇你的行動：${testModeText}\n\n⏱️ **剩餘時間：25 秒**`,
            components: components
        });

        NightActionTimer.startTimer(
            witchMessage,
            `🧙‍♀️ **女巫請睜眼！**\n\n女巫請選擇你的行動：${testModeText}`,
            25,
            async () => {
                await witchMessage.edit({
                    content: `🧙‍♀️ **女巫已完成行動**\n\n✅ 女巫請閉眼...`,
                    components: []
                });
                await onComplete();
            },
            `witch-${messageId}`
        );
    }
}

module.exports = NightPhaseController;

