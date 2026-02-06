/**
 * Werewolf Game Role Definitions
 * Centralized role configuration for easy expansion
 */

const ROLES = {
    // Werewolf Team (狼人陣營)
    '狼王': {
        name: '狼王',
        team: 'werewolf',
        description: '狼人陣營的領袖，被放逐時可以開槍帶走一人',
        nightAction: true,
        nightActionType: 'werewolf-kill',
        deathAbility: 'shoot', // Can shoot when dying
        emoji: '👑🐺'
    },
    '狼人': {
        name: '狼人',
        team: 'werewolf',
        description: '普通狼人，夜晚與狼王一起行動',
        nightAction: true,
        nightActionType: 'werewolf-kill',
        emoji: '🐺'
    },
    '隱狼': {
        name: '隱狼',
        team: 'werewolf',
        description: '隱藏的狼人，不參與夜晚行動。狼王和狼人都死後才會被預言家查出，並開始夜晚殺人',
        nightAction: false, // Only acts when all other werewolves are dead
        nightActionType: 'hidden-werewolf-kill',
        hidden: true, // Special property for hidden werewolf
        emoji: '🌑🐺'
    },

    // Villager Team (村民陣營)
    '女巫': {
        name: '女巫',
        team: 'villager',
        description: '擁有解藥和毒藥各一瓶',
        nightAction: true,
        nightActionType: 'witch-action',
        abilities: {
            antidote: { name: '解藥', uses: 1, description: '救活被狼人殺死的玩家' },
            poison: { name: '毒藥', uses: 1, description: '毒死一名玩家' }
        },
        emoji: '🧙‍♀️'
    },
    '預言家': {
        name: '預言家',
        team: 'villager',
        description: '每晚可以查驗一名玩家的身份',
        nightAction: true,
        nightActionType: 'seer-check',
        emoji: '🔮'
    },
    '獵人': {
        name: '獵人',
        team: 'villager',
        description: '被殺死時可以開槍帶走一人（被女巫毒死不能開槍）',
        nightAction: false,
        deathAbility: 'shoot', // Can shoot when dying (except poisoned)
        emoji: '🔫'
    },
    '騎士': {
        name: '騎士',
        team: 'villager',
        description: '在自己發言階段可以決鬥一名玩家。撞中狼人則狼人死亡並進入黑夜，撞錯則騎士死亡',
        nightAction: false,
        dayAbility: 'duel', // Can duel during speaking phase
        emoji: '⚔️'
    },
    '熊': {
        name: '熊',
        team: 'villager',
        description: '黑夜結束時，若左右兩旁的玩家中有至少一個狼人（狼王/狼人/已激活的隱狼），則熊會咆哮',
        nightAction: false,
        passiveAbility: 'bear-roar', // Passive ability that triggers at dawn
        emoji: '🐻'
    },
    '村民': {
        name: '村民',
        team: 'villager',
        description: '普通村民，沒有特殊能力',
        nightAction: false,
        emoji: '👨‍🌾'
    },
    '白痴': {
        name: '白痴',
        team: 'villager',
        description: '白天被放逐時可以翻牌免死，但之後失去投票權',
        nightAction: false,
        exileAbility: 'reveal', // Can reveal card when exiled
        emoji: '🃏'
    },
    '守衛': {
        name: '守衛',
        team: 'villager',
        description: '每晚可以守護一名玩家，被守護的玩家不會被狼人殺死（但仍會被毒死）',
        nightAction: true,
        nightActionType: 'guard-protect',
        emoji: '🛡️'
    }
};

/**
 * Get role configuration
 */
function getRole(roleName) {
    return ROLES[roleName];
}

/**
 * Get all roles
 */
function getAllRoles() {
    return ROLES;
}

/**
 * Get roles by team
 */
function getRolesByTeam(team) {
    return Object.values(ROLES).filter(role => role.team === team);
}

/**
 * Check if role is werewolf
 */
function isWerewolf(roleName) {
    const role = ROLES[roleName];
    return role && role.team === 'werewolf';
}

/**
 * Check if role has night action
 */
function hasNightAction(roleName) {
    const role = ROLES[roleName];
    return role && role.nightAction === true;
}

/**
 * Get night action order
 * Returns roles in the order they should act during night
 * Note: Only include one werewolf role since all werewolves act together
 */
function getNightActionOrder() {
    return [
        '守衛',      // Guard acts first (protects before werewolf kill)
        '狼人',      // Werewolves act second (狼王, 狼人, 隱狼 all use same handler)
        '預言家',    // Seer acts third
        '女巫'       // Witch acts fourth (needs to know who died)
    ];
}

/**
 * Get role display name with emoji
 */
function getRoleDisplay(roleName) {
    const role = ROLES[roleName];
    if (!role) return roleName;
    return `${role.emoji} ${role.name}`;
}

/**
 * Get role description
 */
function getRoleDescription(roleName) {
    const role = ROLES[roleName];
    return role ? role.description : '未知角色';
}

module.exports = {
    ROLES,
    getRole,
    getAllRoles,
    getRolesByTeam,
    isWerewolf,
    hasNightAction,
    getNightActionOrder,
    getRoleDisplay,
    getRoleDescription
};

