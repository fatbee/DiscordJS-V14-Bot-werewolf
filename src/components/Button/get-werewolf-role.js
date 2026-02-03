const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");

module.exports = new Component({
    customId: 'get-werewolf-role',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        const userId = interaction.user.id;

        try {
            // Find or create the "狼來了" role
            let werewolfRole = interaction.guild.roles.cache.find(role => role.name === '狼來了');

            if (!werewolfRole) {
                // Create the role if it doesn't exist
                werewolfRole = await interaction.guild.roles.create({
                    name: '狼來了',
                    color: 0xFF6B6B, // Red color
                    reason: '狼人殺遊戲專用身份組'
                });
            }

            // Check if user already has the role
            const member = await interaction.guild.members.fetch(userId);
            if (member.roles.cache.has(werewolfRole.id)) {
                return await interaction.reply({
                    content: '✅ 你已經擁有「狼來了」身份組了！\n\n你可以到狼村加入遊戲並開始遊戲。',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Add role to the member
            await member.roles.add(werewolfRole);

            await interaction.reply({
                content: '🎉 **成功獲得「狼來了」身份組！**\n\n現在你可以：\n• 到狼村加入遊戲並使用 `/startgame` 指令開始新遊戲\n• 參與狼人殺遊戲的所有功能\n• 使用角色技能和投票\n\n💡 **提示：** 如需使用管理功能（開始夜晚、跳過發言者等），請聯繫管理員獲得「狼GM」身份組。\n\n祝你遊戲愉快！🐺',
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Failed to add 狼來了 role:', error);
            
            await interaction.reply({
                content: '❌ 無法添加「狼來了」身份組！\n\n可能的原因：\n• Bot 沒有管理身份組的權限\n• Bot 的身份組位置低於「狼來了」身份組\n\n請聯繫管理員解決此問題。',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}).toJSON();


