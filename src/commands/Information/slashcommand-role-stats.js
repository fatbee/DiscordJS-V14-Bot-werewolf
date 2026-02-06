const { ChatInputCommandInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const PlayerStats = require("../../utils/PlayerStats");

module.exports = new ApplicationCommand({
    command: {
        name: 'role-stats',
        description: '查看每個角色的使用統計（誰用得最多）',
        type: 1,
        options: [
            {
                name: 'role',
                description: '要查看的角色（留空查看所有角色）',
                type: 3, // String type
                required: false,
                choices: [
                    { name: '狼王', value: '狼王' },
                    { name: '狼人', value: '狼人' },
                    { name: '隱狼', value: '隱狼' },
                    { name: '預言家', value: '預言家' },
                    { name: '女巫', value: '女巫' },
                    { name: '獵人', value: '獵人' },
                    { name: '騎士', value: '騎士' },
                    { name: '熊', value: '熊' },
                    { name: '村民', value: '村民' },
                    { name: '白痴', value: '白痴' },
                    { name: '守衛', value: '守衛' }
                ]
            }
        ]
    },
    options: {
        botDevelopers: false
    },
    /**
     *
     * @param {DiscordBot} client
     * @param {ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        // Defer reply to prevent timeout
        await interaction.deferReply();

        const targetRole = interaction.options.getString('role');

        if (targetRole) {
            // Show stats for specific role
            const roleStats = await PlayerStats.getRoleStats(targetRole, client, interaction.guild);
            await interaction.editReply({
                content: roleStats
            });
        } else {
            // Show stats for all roles
            const allRoleStats = await PlayerStats.getAllRoleStats(client, interaction.guild);
            await interaction.editReply({
                content: allRoleStats
            });
        }
    }
}).toJSON();


