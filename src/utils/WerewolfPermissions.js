const config = require('../config');
const { PermissionFlagsBits } = require('discord.js');

/**
 * Check if user has permission to use admin/host functions
 * @param {Interaction} interaction - Discord interaction
 * @returns {boolean} - True if user has permission
 */
function hasHostPermission(interaction) {
    const userId = interaction.user.id;

    // Check if user is bot owner
    const isOwner = userId === config.users.ownerId;
    if (isOwner) return true;

    // Check if user is server admin
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (isAdmin) return true;

    // Check if user has "狼GM" role (ONLY 狼GM has admin functions, NOT 狼來了)
    const hasGMRole = interaction.member?.roles?.cache?.some(role => role.name === '狼GM');
    if (hasGMRole) return true;

    return false;
}

/**
 * Check if user can use role-specific actions (with test mode override)
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} gameState - Game state
 * @param {string} requiredRole - Required role (optional)
 * @returns {boolean} - True if user has permission
 */
function canUseRoleAction(interaction, gameState, requiredRole = null) {
    const userId = interaction.user.id;
    
    // Test mode: bot owner can use any role action
    if (config.werewolf.testMode && userId === config.users.ownerId) {
        return true;
    }
    
    // Check if user is in the game
    const userPlayer = gameState.players[userId];
    if (!userPlayer) return false;
    
    // Check if user is alive
    if (!userPlayer.alive) return false;
    
    // If specific role is required, check it
    if (requiredRole && userPlayer.role !== requiredRole) {
        return false;
    }
    
    return true;
}

module.exports = {
    hasHostPermission,
    canUseRoleAction
};

