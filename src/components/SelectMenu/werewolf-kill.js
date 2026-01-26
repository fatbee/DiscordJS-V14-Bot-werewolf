const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const { getRoleDisplay } = require("../../utils/WerewolfRoles");
const config = require("../../config");

module.exports = new Component({
    customId: 'werewolf-kill',
    type: 'select',
    /**
     *
     * @param {DiscordBot} client
     * @param {StringSelectMenuInteraction} interaction
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

        // Check if user is a werewolf (or bot owner in test mode)
        // Note: 隱狼 uses a different component (hidden-werewolf-kill)
        const userId = interaction.user.id;
        const userPlayer = gameState.players[userId];
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;

        if (!isOwner && (!userPlayer || !userPlayer.alive || (userPlayer.role !== '狼王' && userPlayer.role !== '狼人'))) {
            return await interaction.reply({
                content: '❌ 你不是存活的狼人！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get selected target
        const targetId = interaction.values[0];
        const targetPlayer = gameState.players[targetId];

        if (!targetPlayer || !targetPlayer.alive) {
            return await interaction.reply({
                content: '❌ 無效的目標！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Initialize werewolf votes if not exists
        if (!gameState.werewolfVotes) {
            gameState.werewolfVotes = {};
        }

        // Save this werewolf's vote
        gameState.werewolfVotes[userId] = targetId;
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Build target display
        const isTestPlayer = targetId.startsWith('test-');
        let targetDisplay;
        if (isTestPlayer) {
            const testNumber = targetId.split('-')[2];
            targetDisplay = `測試玩家 ${testNumber}`;
        } else {
            targetDisplay = `<@${targetId}>`;
        }

        // Reply to voter
        await interaction.reply({
            content: `✅ 你已投票給：${targetDisplay}`,
            flags: MessageFlags.Ephemeral
        });

        // Send DM to other werewolves
        const aliveWerewolves = WerewolfGame.getAliveWerewolves(gameState);
        for (const werewolf of aliveWerewolves) {
            if (werewolf.id !== userId && !werewolf.id.startsWith('test-')) {
                try {
                    const werewolfUser = await client.users.fetch(werewolf.id);

                    // Build voter display
                    const voterIsTestPlayer = userId.startsWith('test-');
                    let voterDisplay;
                    if (voterIsTestPlayer) {
                        const voterTestNumber = userId.split('-')[2];
                        voterDisplay = `測試玩家 ${voterTestNumber}`;
                    } else {
                        voterDisplay = `<@${userId}>`;
                    }

                    await werewolfUser.send({
                        content: `🐺 **狼人投票通知**\n\n${voterDisplay} 投票給了：${targetDisplay}`
                    });
                } catch (error) {
                    console.error(`Failed to send DM to werewolf ${werewolf.id}:`, error);
                }
            }
        }

        // Send DM to bot owner in test mode for test player votes
        if (config.werewolf.testMode && userId.startsWith('test-')) {
            try {
                const owner = await client.users.fetch(config.users.ownerId);
                const voterTestNumber = userId.split('-')[2];
                await owner.send({
                    content: `🐺 **狼人投票通知** (測試玩家 ${voterTestNumber})\n\n測試玩家 ${voterTestNumber} 投票給了：${targetDisplay}`
                });
            } catch (error) {
                console.error(`Failed to send test vote DM to owner:`, error);
            }
        }
    }
}).toJSON();