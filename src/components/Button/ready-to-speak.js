const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const SpeakingTimer = require("../../utils/SpeakingTimer");

module.exports = new Component({
    customId: 'ready-to-speak',
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

        // Remove button from original message
        await interaction.update({
            components: []
        });

        // Get first speaker
        const firstSpeakerId = gameState.speaking.order[0];
        const firstPlayer = gameState.players[firstSpeakerId];
        const isTestPlayer = firstSpeakerId.startsWith('test-');
        let firstSpeakerDisplay;
        if (isTestPlayer) {
            const testNumber = firstSpeakerId.split('-')[2];
            firstSpeakerDisplay = `測試玩家 ${testNumber}`;
        } else {
            firstSpeakerDisplay = `<@${firstSpeakerId}>`;
        }

        // Always show all three buttons for all players (to hide knight/werewolf identity)
        const components = [{
            type: 1,
            components: [
                {
                    type: 2,
                    custom_id: `werewolf-self-destruct-${messageId}`,
                    label: '💣 自爆',
                    style: 4 // Red/Danger
                },
                {
                    type: 2,
                    custom_id: `knight-duel-${messageId}`,
                    label: '⚔️ 決鬥',
                    style: 4 // Red/Danger
                },
                {
                    type: 2,
                    custom_id: `finish-speaking-${messageId}`,
                    label: '✅ 完成發言',
                    style: 3 // Green
                }
            ]
        }];

        // Send message notifying first speaker
        const speakingMessage = await interaction.channel.send({
            content: `🎤 **現在輪到：${firstSpeakerDisplay} 發言**\n\n⏱️ 發言時間：**3 分鐘**\n每 1 分鐘會提醒一次\n\n發言完畢後，請點擊下方按鈕。`,
            components: components
        });

        // Start 3-minute timer with auto-advance callback
        SpeakingTimer.startTimer(
            interaction.channel,
            messageId,
            firstSpeakerId,
            gameState,
            async () => {
                // Auto-advance to next speaker when time is up
                const { autoAdvanceToNextSpeaker } = require('./finish-speaking');
                await autoAdvanceToNextSpeaker(client, interaction.channel, messageId);
            }
        );
    }
}).toJSON();

