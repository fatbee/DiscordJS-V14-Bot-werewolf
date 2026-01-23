const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");

// Initialize game state
GameState.initialize();

module.exports = new Component({
    customId: 'join-game-button',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        const messageId = interaction.message.id;

        // Get player list from database
        const players = GameState.getPlayers(messageId);
        const userId = interaction.user.id;

        // Check if player already joined
        if (players.has(userId)) {
            return await interaction.reply({
                content: '❌ 你已經加入遊戲了！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Add player to the list
        players.add(userId);

        // Save to database
        GameState.savePlayers(messageId, players);
        
        // Build player list display
        let playerListText = '';
        let index = 1;
        for (const playerId of players) {
            playerListText += `${index}. <@${playerId}>\n`;
            index++;
        }
        
        // Update the message with new player list
        await interaction.update({
            content: `準備開始遊戲！\n\n**玩家列表：** (${players.size} 人)\n${playerListText}`,
            components: interaction.message.components
        });
    }
}).toJSON();

