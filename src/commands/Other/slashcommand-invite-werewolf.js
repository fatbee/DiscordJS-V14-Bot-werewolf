const { ChatInputCommandInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");

module.exports = new ApplicationCommand({
    command: {
        name: 'invite-werewolf',
        description: '顯示「我要玩狼人」按鈕，讓玩家獲得「狼來了」身份組',
        type: 1,
        options: []
    },
    options: {
        cooldown: 10000
    },
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ChatInputCommandInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Send message with "我要玩狼人" button
        await interaction.reply({
            content: '🐺 **狼人殺遊戲邀請**\n\n想要參加狼人殺遊戲嗎？\n點擊下方按鈕獲得「狼來了」身份組，即可以到狼村加入遊戲！',
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: 'get-werewolf-role',
                    label: '🐺 我要玩狼人',
                    style: 1 // Blue/Primary
                }]
            }]
        });
    }
}).toJSON();


