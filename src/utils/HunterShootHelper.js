const WerewolfGame = require('./WerewolfGame');
const { getRole } = require('./WerewolfRoles');

/**
 * Check if a player can use shoot ability when dying
 * @param {Object} player - Player object
 * @param {string} deathReason - Reason for death
 * @returns {boolean}
 */
function canShoot(player, deathReason) {
    // Check if player exists
    if (!player) {
        console.log('[HunterShootHelper] Player is null or undefined');
        return false;
    }

    const role = getRole(player.role);

    // Check if role has shoot ability
    if (!role || !role.deathAbility || role.deathAbility !== 'shoot') {
        //console.log(`[HunterShootHelper] Player role ${player.role} cannot shoot - no deathAbility`);
        return false;
    }

    // Hunter and Wolf King cannot shoot if poisoned by witch
    if ((player.role === '獵人' || player.role === '狼王') && deathReason === '被女巫毒死') {
        //console.log(`[HunterShootHelper] ${player.role} cannot shoot - poisoned by witch`);
        return false;
    }

    //console.log(`[HunterShootHelper] ${player.role} can shoot! Death reason: ${deathReason}`);
    return true;
}

/**
 * Trigger hunter/wolf king shoot ability
 * @param {Object} client - Discord client
 * @param {Object} channel - Discord channel
 * @param {string} messageId - Game message ID
 * @param {Object} gameState - Game state
 * @param {Array} deathList - List of players who died
 * @param {Function} onComplete - Callback after shooting is complete
 */
async function triggerShootAbility(client, channel, messageId, gameState, deathList, onComplete) {
    // Check win condition BEFORE allowing shooting
    // If game is already over (e.g., hunter is last god to die), don't allow shooting
    const winner = WerewolfGame.checkWinCondition(gameState);
    if (winner) {
        // Game already ended, skip shooting and proceed to onComplete
        if (onComplete) await onComplete();
        return;
    }

    // Find players who can shoot
    const shooters = deathList.filter(death => {
        const player = gameState.players[death.playerId];
        return canShoot(player, death.reason);
    });

    if (shooters.length === 0) {
        // No one can shoot, proceed to next phase
        if (onComplete) await onComplete();
        return;
    }

    // Process shooters one by one
    await processNextShooter(client, channel, messageId, gameState, shooters, 0, onComplete);
}

/**
 * Process next shooter in the queue
 */
async function processNextShooter(client, channel, messageId, gameState, shooters, index, onComplete) {
    if (index >= shooters.length) {
        // All shooters processed, proceed to next phase
        if (onComplete) await onComplete();
        return;
    }
    
    const shooter = shooters[index];
    const shooterPlayer = gameState.players[shooter.playerId];
    
    // Build shooter display
    const isTestPlayer = shooter.playerId.startsWith('test-');
    let shooterDisplay;
    if (isTestPlayer) {
        const testNumber = shooter.playerId.split('-')[2];
        shooterDisplay = `測試玩家 ${testNumber}`;
    } else {
        shooterDisplay = `<@${shooter.playerId}>`;
    }
    
    // Get alive players as targets
    const alivePlayers = WerewolfGame.getAlivePlayers(gameState);
    
    if (alivePlayers.length === 0) {
        // No targets available, skip to next shooter
        await processNextShooter(client, channel, messageId, gameState, shooters, index + 1, onComplete);
        return;
    }
    
    // Build target options with speaking order numbers
    const targetOptions = [];
    for (const player of alivePlayers) {
        const isTestPlayer = player.id.startsWith('test-');

        // Find player's position in speaking order
        const speakingOrderIndex = gameState.speaking.order.indexOf(player.id);
        const orderNumber = speakingOrderIndex + 1;

        if (isTestPlayer) {
            const testNumber = player.id.split('-')[2];
            targetOptions.push({
                label: `${orderNumber}號 - 測試玩家 ${testNumber}`,
                value: player.id,
                description: '射殺此玩家'
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
                description: '射殺此玩家',
                emoji: '🎯'
            });
        }
    }
    
    // Send shoot selection message
    await channel.send({
        content: `**${shooterDisplay} 發動技能！**\n\n請選擇要射殺的玩家：`,
        components: [{
            type: 1,
            components: [{
                type: 3, // String Select Menu
                custom_id: `hunter-shoot-${messageId}-${index}`,
                placeholder: '選擇要射殺的玩家',
                min_values: 1,
                max_values: 1,
                options: targetOptions.slice(0, 25) // Discord limit: 25 options
            }]
        }]
    });
    
    // Store shooter info in game state for the select menu handler
    if (!gameState.pendingShooters) {
        gameState.pendingShooters = [];
    }
    gameState.pendingShooters = shooters;
    gameState.currentShooterIndex = index;
    gameState.shootOnComplete = onComplete ? 'stored' : null;
    WerewolfGame.saveGame(messageId, gameState, client.database);
}

module.exports = {
    canShoot,
    triggerShootAbility,
    processNextShooter
};

