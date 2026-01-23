const { StringSelectMenuInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'game-rule-select',
    type: 'select',
    /**
     *
     * @param {DiscordBot} client
     * @param {StringSelectMenuInteraction} interaction
     */
    run: async (client, interaction) => {
        // Extract rule name and messageId from custom_id (format: game-rule-select-{ruleName}-{messageId}-{playerCount})
        const parts = interaction.customId.split('-');
        const ruleName = parts[3];
        const messageId = parts[4];
        const selectedValue = interaction.values[0];

        // Get current game rules from database
        const gameRules = GameState.getGameRules(messageId) || {
            witchCanSaveSelfFirstNight: true
        };

        // Update rule (convert string to boolean)
        gameRules[ruleName] = selectedValue === 'true';

        // Save to database
        GameState.saveGameRules(messageId, gameRules);

        await interaction.deferUpdate();
    }
}).toJSON();


