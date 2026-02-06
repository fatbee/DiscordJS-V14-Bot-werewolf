const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { getRoleDisplay } = require("../../utils/WerewolfRoles");
const config = require("../../config");
const { hasHostPermission } = require("../../utils/WerewolfPermissions");

module.exports = new Component({
    customId: 'start-night',
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

        // Check if user has host permission (bot owner, admin, or 狼GM role)
        if (!hasHostPermission(interaction)) {
            return await interaction.reply({
                content: '❌ 只有主持人、管理員或擁有「狼GM」身份組可以開始夜晚！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Update game phase to night and increment round
        gameState.phase = 'night';
        gameState.round++; // Increment day/round counter
        gameState.nightActions = {}; // Reset night actions
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Remove button from original message
        await interaction.update({
            components: []
        });

        // Get werewolf channel
        const werewolfChannelId = client.database.get(`game-werewolf-channel-${messageId}`);
        let werewolfChannel = null;
        if (werewolfChannelId) {
            try {
                werewolfChannel = await interaction.guild.channels.fetch(werewolfChannelId);
            } catch (error) {
                console.error('Failed to fetch werewolf channel:', error);
            }
        }

        // Build alive players list
        const alivePlayers = WerewolfGame.getAlivePlayers(gameState);
        let aliveListText = '';

        // Only show roles in test mode
        if (config.werewolf.testMode) {
            for (const player of alivePlayers) {
                const isTestPlayer = player.id.startsWith('test-');
                if (isTestPlayer) {
                    const testNumber = player.id.split('-')[2];
                    aliveListText += `• 測試玩家 ${testNumber} - ${getRoleDisplay(player.role)}\n`;
                } else {
                    aliveListText += `• <@${player.id}> - ${getRoleDisplay(player.role)}\n`;
                }
            }
        } 

        // Send DM to all players notifying night has started
        for (const [playerId, player] of Object.entries(gameState.players)) {
            const isTestPlayer = playerId.startsWith('test-');
            if (!isTestPlayer) {
                try {
                    const user = await client.users.fetch(playerId);
                    const statusEmoji = player.alive ? '✅' : '💀';
                    const statusText = player.alive ? '存活' : '已死亡';

                    await user.send({
                        content: `🌙 **第 ${gameState.round} 夜降臨...**\n\n天黑請閉眼，所有玩家請停止發言。\n\n你的角色：**${player.role}**\n狀態：${statusEmoji} **${statusText}**\n\n各角色請開始行動...`
                    });
                } catch (error) {
                    console.error(`Failed to send night DM to player ${playerId}:`, error);
                }
            }
        }

        // Send night announcement to main channel
        await interaction.channel.send({
            content: `🌙 **第 ${gameState.round} 夜降臨...**\n\n天黑請閉眼，所有玩家請停止發言。\n\n**存活玩家：** (${alivePlayers.length} 人)\n${aliveListText}\n各角色請開始行動...`
        });

        // Initialize werewolf votes
        gameState.werewolfVotes = {};
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Check win condition before starting night actions
        const aliveWerewolves = WerewolfGame.getAliveWerewolves(gameState);
        const aliveVillagers = WerewolfGame.getAliveVillagers(gameState);

        // Check if there are no villagers (werewolves won)
        if (aliveVillagers.length === 0) {
            // No villagers left, werewolves win
            const winner = WerewolfGame.checkWinCondition(gameState);
            if (winner === 'werewolf') {
                const { handleGameEnd } = require('../../utils/DayPhaseHelper');
                await handleGameEnd(client, interaction.channel, messageId, gameState, winner);
                return;
            }
        }

        // Start night phase using NightPhaseController (starts from first role: guard)
        const NightPhaseController = require('../../utils/NightPhaseController');
        await NightPhaseController.startNightPhase(client, interaction.channel, messageId, gameState);

        // TEST MODE: Send summary to bot owner
        if (config.werewolf.testMode) {
            try {
                const owner = await client.users.fetch(config.users.ownerId);
                await owner.send({
                    content: `🎮 **測試模式 - 夜晚階段開始**\n\n你可以扮演所有角色進行操作：\n\n🛡️ **守衛**：在主頻道選擇守護目標\n🐺 **狼人投票**：在主頻道選擇殺人目標\n🔮 **預言家**：在主頻道選擇查驗目標\n🧙‍♀️ **女巫**：在主頻道選擇行動\n\n當前存活玩家：${alivePlayers.length} 人`
                });
            } catch (error) {
                console.error(`Failed to send test mode summary to owner:`, error);
            }
        }
    }
}).toJSON();

