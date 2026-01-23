const { StringSelectMenuInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");

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
    }
}).toJSON();

