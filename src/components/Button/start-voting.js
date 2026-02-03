const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { hasHostPermission } = require("../../utils/WerewolfPermissions");

module.exports = new Component({
    customId: 'start-voting',
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
                content: '❌ 只有主持人、管理員或擁有「狼GM」身份組可以開始投票！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Remove button
        await interaction.update({
            components: []
        });

        // Start voting phase
        await startVoting(client, interaction, messageId, gameState);
    }
}).toJSON();

/**
 * Start voting phase
 */
async function startVoting(client, interaction, messageId, gameState) {
    // Reset day votes
    gameState.dayVotes = {};
    WerewolfGame.saveGame(messageId, gameState, client.database);

    // Get alive players
    const alivePlayers = WerewolfGame.getAlivePlayers(gameState);

    // Build voting options with speaking order numbers
    const voteOptions = [];
    for (const player of alivePlayers) {
        const isTestPlayer = player.id.startsWith('test-');

        // Find player's position in speaking order
        const speakingOrderIndex = gameState.speaking.order.indexOf(player.id);
        const orderNumber = speakingOrderIndex + 1;

        if (isTestPlayer) {
            const testNumber = player.id.split('-')[2];
            voteOptions.push({
                label: `${orderNumber}號 - 測試玩家 ${testNumber}`,
                value: player.id,
                description: `投票放逐此玩家`
            });
        } else {
            // Try to get nickname (or username if no nickname)
            let displayName = `玩家${orderNumber}`;
            try {
                const member = await interaction.guild.members.fetch(player.id);
                displayName = member.displayName; // This returns nickname if set, otherwise username
            } catch (error) {
                console.error(`Failed to fetch member ${player.id}:`, error);
            }

            voteOptions.push({
                label: `${orderNumber}號 - ${displayName}`,
                value: player.id,
                description: `投票放逐此玩家`,
                emoji: '🗳️'
            });
        }
    }

    // Add abstain option
    voteOptions.push({
        label: '棄票',
        value: 'abstain',
        description: '選擇不投票給任何人',
        emoji: '🚫'
    });

    // Add clear vote option
    voteOptions.push({
        label: '清除投票',
        value: 'clear-vote',
        description: '清除你的投票，重新選擇',
        emoji: '🔄'
    });

    // Send voting message
    const votingMessage = await interaction.channel.send({
        content: `🗳️ **投票階段開始！**\n\n所有存活玩家請投票選擇要放逐的玩家（或選擇棄票）：\n\n存活玩家：${alivePlayers.length} 人\n\n⏱️ **剩餘時間：25 秒**`,
        components: [{
            type: 1,
            components: [{
                type: 3, // String Select Menu
                custom_id: `day-vote-${messageId}`,
                placeholder: '選擇要放逐的玩家或棄票',
                min_values: 1,
                max_values: 1,
                options: voteOptions.slice(0, 25) // Discord limit: 25 options
            }]
        }]
    });

    // Start 25 second timer
    let timeLeft = 25;
    const timerInterval = setInterval(async () => {
        timeLeft -= 1;
        if (timeLeft > 0) {
            try {
                await votingMessage.edit({
                    content: `🗳️ **投票階段進行中...**\n\n所有存活玩家請投票選擇要放逐的玩家（或選擇棄票）：\n\n存活玩家：${alivePlayers.length} 人\n\n⏱️ **剩餘時間：${timeLeft} 秒**`,
                    components: votingMessage.components
                });
            } catch (error) {
                clearInterval(timerInterval);
            }
        }
    }, 1000);

    // Store interval ID globally for cancellation
    if (!global.votingTimers) global.votingTimers = new Map();
    global.votingTimers.set(messageId, { interval: timerInterval, timeout: null });

    // Set timeout for when timer expires
    const timeoutId = setTimeout(async () => {
        clearInterval(timerInterval);
        if (global.votingTimers) global.votingTimers.delete(messageId);

        // Reload game state
        const currentGameState = WerewolfGame.getGame(messageId, client.database);

        // Always process voting results after 25 seconds
        await votingMessage.edit({
            content: `🗳️ **投票時間結束！**\n\n⏱️ **時間到！處理投票結果...**`,
            components: []
        });

        // Process voting results
        const { processVotingResults } = require('../SelectMenu/day-vote');
        await processVotingResults(client, interaction.channel, messageId, currentGameState);
    }, 25000);

    // Store timeout ID
    if (global.votingTimers.has(messageId)) {
        global.votingTimers.get(messageId).timeout = timeoutId;
    }
}

