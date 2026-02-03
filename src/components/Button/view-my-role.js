const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");

module.exports = new Component({
    customId: 'view-my-role',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
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

        const userId = interaction.user.id;
        const userPlayer = gameState.players[userId];

        // Check if user is in the game
        if (!userPlayer) {
            return await interaction.reply({
                content: '❌ 你不在這個遊戲中！',
                flags: MessageFlags.Ephemeral
            });
        }

        const role = userPlayer.role;
        const roleAssignments = gameState.roleAssignments;

        // Get werewolf players for team info
        const werewolfPlayers = [];
        for (const [playerId, playerRole] of Object.entries(roleAssignments)) {
            if (playerRole === '狼王' || playerRole === '狼人') {
                werewolfPlayers.push(playerId);
            }
        }

        // Get game rules
        const gameRules = gameState.gameRules || {};
        const witchCanSaveSelfFirstNight = gameRules.witchCanSaveSelfFirstNight !== false;

        // Build DM message (same logic as in begin-game.js)
        let dmContent = `🎭 **你的角色信息**\n\n你的角色是：**${role}**\n請保密你的角色！`;

        // Add werewolf team info for werewolf players (狼王, 狼人)
        if (role === '狼王' || role === '狼人') {
            dmContent += `\n\n🐺 **狼人陣營成員：**\n`;
            for (const wPlayerId of werewolfPlayers) {
                const wIsTestPlayer = wPlayerId.startsWith('test-');
                if (wIsTestPlayer) {
                    const wTestNumber = wPlayerId.split('-')[2];
                    const wRole = roleAssignments[wPlayerId];
                    dmContent += `• 測試玩家 ${wTestNumber} - ${wRole}\n`;
                } else {
                    const wRole = roleAssignments[wPlayerId];
                    dmContent += `• <@${wPlayerId}> - ${wRole}\n`;
                }
            }
            dmContent += `\n夜晚時，你們將在主頻道投票選擇殺人目標！`;
        }

        // Add werewolf team info for hidden werewolf (隱狼)
        if (role === '隱狼') {
            dmContent += `\n\n🌑 **你是隱狼！**\n\n`;
            dmContent += `🐺 **狼人陣營成員（他們不知道你的存在）：**\n`;
            for (const [wPlayerId, wRole] of Object.entries(roleAssignments)) {
                if (wRole === '狼王' || wRole === '狼人') {
                    const wIsTestPlayer = wPlayerId.startsWith('test-');
                    if (wIsTestPlayer) {
                        const wTestNumber = wPlayerId.split('-')[2];
                        dmContent += `• 測試玩家 ${wTestNumber} - ${wRole}\n`;
                    } else {
                        dmContent += `• <@${wPlayerId}> - ${wRole}\n`;
                    }
                }
            }
            dmContent += `\n📜 **特殊規則：**\n`;
            dmContent += `• 你不參與夜晚狼人投票\n`;
            dmContent += `• 預言家查驗你時，只要有狼王或狼人存活，你會顯示為好人陣營\n`;
            dmContent += `• 當所有狼王和狼人都死亡後，你會被預言家查出，並開始夜晚殺人\n`;
            dmContent += `• 狼王和狼人不知道你的存在！`;
        }

        // Add witch rule info for witch
        if (role === '女巫') {
            dmContent += `\n\n📜 **遊戲規則：**\n女巫自救：${witchCanSaveSelfFirstNight ? '✅ 允許' : '❌ 禁止'}`;
        }

        // Add alive/dead status
        const statusEmoji = userPlayer.alive ? '✅' : '💀';
        const statusText = userPlayer.alive ? '存活' : '已死亡';
        dmContent += `\n\n${statusEmoji} **狀態：** ${statusText}`;

        // Send ephemeral reply
        await interaction.reply({
            content: dmContent,
            flags: MessageFlags.Ephemeral
        });
    }
}).toJSON();



