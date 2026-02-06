const { StringSelectMenuInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");
const WerewolfRoles = require("../../utils/WerewolfRoles");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'character-select',
    type: 'select',
    /**
     *
     * @param {DiscordBot} client
     * @param {StringSelectMenuInteraction} interaction
     */
    run: async (client, interaction) => {
        // Extract character name and messageId from custom_id (format: character-select-{name}-{messageId}-{playerCount})
        const parts = interaction.customId.split('-');
        const characterName = parts[2];
        const messageId = parts[3];
        const selectedValue = parseInt(interaction.values[0]);

        // Get current selections from database
        const selections = GameState.getCharacterSelections(messageId);

        // Update selection
        selections[characterName] = selectedValue;

        // Save to database
        GameState.saveCharacterSelections(messageId, selections);

        await interaction.deferUpdate();

        // Build selection summary message
        const roleOrder = ['狼王', '狼人', '隱狼', '預言家', '女巫', '獵人', '騎士', '熊', '守衛', '白痴', '村民'];
        let selectionText = '**當前角色配置：**\n';

        for (const roleName of roleOrder) {
            const count = selections[roleName] || 0;
            if (count > 0) {
                const roleInfo = WerewolfRoles.getRole(roleName);
                const emoji = roleInfo ? roleInfo.emoji : '';
                selectionText += `${emoji} ${roleName} ${count} 個\n`;
            }
        }

        // If no roles selected yet, show a message
        if (!roleOrder.some(role => (selections[role] || 0) > 0)) {
            selectionText += '（尚未選擇任何角色）\n';
        }

        // Send the selection summary to the channel
        await interaction.channel.send({
            content: selectionText
        });
    }
}).toJSON();

