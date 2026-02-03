/**
 * Dead Player Role Management
 * Manages the "狼死人" role for dead players
 */

const DEAD_ROLE_NAME = '狼死人';

/**
 * Add "狼死人" role to a dead player
 * @param {Guild} guild - Discord guild
 * @param {string} playerId - Player's user ID
 */
async function addDeadRole(guild, playerId) {
    // Skip test players
    if (playerId.startsWith('test-')) {
        return;
    }

    try {
        // Get or create the "狼死人" role
        let deadRole = guild.roles.cache.find(role => role.name === DEAD_ROLE_NAME);
        
        if (!deadRole) {
            // Create the role if it doesn't exist
            deadRole = await guild.roles.create({
                name: DEAD_ROLE_NAME,
                color: 0x808080, // Gray color
                reason: '狼人殺遊戲 - 死亡玩家標記'
            });
            console.log(`Created "${DEAD_ROLE_NAME}" role`);
        }

        // Get the member
        const member = await guild.members.fetch(playerId);
        
        // Add the role if they don't have it
        if (!member.roles.cache.has(deadRole.id)) {
            await member.roles.add(deadRole);
            console.log(`Added "${DEAD_ROLE_NAME}" role to ${member.displayName}`);
        }
    } catch (error) {
        console.error(`Failed to add "${DEAD_ROLE_NAME}" role to ${playerId}:`, error);
    }
}

/**
 * Remove "狼死人" role from all members in the guild
 * @param {Guild} guild - Discord guild
 */
async function clearAllDeadRoles(guild) {
    try {
        // Find the "狼死人" role
        const deadRole = guild.roles.cache.find(role => role.name === DEAD_ROLE_NAME);
        
        if (!deadRole) {
            console.log(`"${DEAD_ROLE_NAME}" role not found, nothing to clear`);
            return;
        }

        // Get all members with the role
        const membersWithRole = deadRole.members;
        
        if (membersWithRole.size === 0) {
            console.log(`No members have "${DEAD_ROLE_NAME}" role`);
            return;
        }

        // Remove the role from all members
        let removedCount = 0;
        for (const [memberId, member] of membersWithRole) {
            try {
                await member.roles.remove(deadRole);
                removedCount++;
                console.log(`Removed "${DEAD_ROLE_NAME}" role from ${member.displayName}`);
            } catch (error) {
                console.error(`Failed to remove "${DEAD_ROLE_NAME}" role from ${member.displayName}:`, error);
            }
        }

        console.log(`Cleared "${DEAD_ROLE_NAME}" role from ${removedCount} members`);
    } catch (error) {
        console.error(`Failed to clear "${DEAD_ROLE_NAME}" roles:`, error);
    }
}

/**
 * Remove "狼死人" role from a specific player
 * @param {Guild} guild - Discord guild
 * @param {string} playerId - Player's user ID
 */
async function removeDeadRole(guild, playerId) {
    // Skip test players
    if (playerId.startsWith('test-')) {
        return;
    }

    try {
        // Find the "狼死人" role
        const deadRole = guild.roles.cache.find(role => role.name === DEAD_ROLE_NAME);
        
        if (!deadRole) {
            return;
        }

        // Get the member
        const member = await guild.members.fetch(playerId);
        
        // Remove the role if they have it
        if (member.roles.cache.has(deadRole.id)) {
            await member.roles.remove(deadRole);
            console.log(`Removed "${DEAD_ROLE_NAME}" role from ${member.displayName}`);
        }
    } catch (error) {
        console.error(`Failed to remove "${DEAD_ROLE_NAME}" role from ${playerId}:`, error);
    }
}

module.exports = {
    addDeadRole,
    clearAllDeadRoles,
    removeDeadRole,
    DEAD_ROLE_NAME
};

