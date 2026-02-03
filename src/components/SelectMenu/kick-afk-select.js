const { StringSelectMenuInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");
const { hasHostPermission } = require("../../utils/WerewolfPermissions");

module.exports = new Component({
    customId: 'kick-afk-select',
    type: 'select',
    /**
     *
     * @param {DiscordBot} client
     * @param {StringSelectMenuInteraction} interaction
     */
    run: async (client, interaction) => {
        // Check if user has host permission (bot owner, admin, or 狼GM role)
        if (!hasHostPermission(interaction)) {
            return await interaction.reply({
                content: '❌ 只有主持人、管理員或擁有「狼GM」身份組可以踢出玩家！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Extract messageId from custom_id
        const messageId = interaction.customId.split('-').pop();

        // Get selected player
        const targetUserId = interaction.values[0];

        // Get player list from database
        const players = GameState.getPlayers(messageId);

        if (!players || players.size === 0) {
            return await interaction.update({
                content: '❌ 沒有玩家可以踢出！',
                components: []
            });
        }

        // Check if target player is in the game
        if (!players.has(targetUserId)) {
            return await interaction.update({
                content: '❌ 該玩家不在遊戲中！',
                components: []
            });
        }

        // Get target user display
        let targetDisplay;
        try {
            const targetMember = await interaction.guild.members.fetch(targetUserId);
            targetDisplay = targetMember.displayName;
        } catch (error) {
            targetDisplay = `<@${targetUserId}>`;
        }

        // Remove player from the list
        players.delete(targetUserId);

        // Save to database
        GameState.savePlayers(messageId, players);

        // Build player list display
        let playerListText = '';
        if (players.size === 0) {
            playerListText = '_無玩家_';
        } else {
            let index = 1;
            for (const playerId of players) {
                playerListText += `${index}. <@${playerId}>\n`;
                index++;
            }
        }

        // Update the game message
        try {
            const gameMessage = await interaction.channel.messages.fetch(messageId);
            await gameMessage.edit({
                content: `準備開始遊戲！\n\n**玩家列表：** (${players.size} 人)\n${playerListText}`,
                components: gameMessage.components
            });
        } catch (error) {
            console.error('Failed to update game message:', error);
        }

        // Update the ephemeral message
        await interaction.update({
            content: `✅ 已將 **${targetDisplay}** 踢出遊戲！\n\n剩餘玩家：${players.size} 人`,
            components: []
        });

        // Send public notification
        await interaction.channel.send({
            content: `👢 **${targetDisplay} 已被 ${interaction.user} 踢出遊戲（AFK）**`
        });
    }
}).toJSON();

