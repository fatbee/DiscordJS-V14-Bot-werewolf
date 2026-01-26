const { ButtonInteraction, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const WerewolfGame = require("../../utils/WerewolfGame");
const SpeakingTimer = require("../../utils/SpeakingTimer");
const config = require("../../config");

module.exports = new Component({
    customId: 'start-pk',
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

        // Check if user is bot owner in test mode or any alive player
        const userId = interaction.user.id;
        const userPlayer = gameState.players[userId];
        const isOwner = config.werewolf.testMode && userId === config.users.ownerId;
        
        if (!isOwner && (!userPlayer || !userPlayer.alive)) {
            return await interaction.reply({
                content: '❌ 你不是存活的玩家！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Get PK players
        const pkPlayers = gameState.pkPlayers || [];
        
        if (pkPlayers.length === 0) {
            return await interaction.reply({
                content: '❌ 沒有PK玩家！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Initialize PK speaking
        gameState.pkSpeaking = {
            order: pkPlayers,
            current: 0
        };
        WerewolfGame.saveGame(messageId, gameState, client.database);

        // Update button message
        await interaction.update({
            components: []
        });

        // Get first PK speaker
        const firstSpeakerId = pkPlayers[0];
        const firstSpeaker = gameState.players[firstSpeakerId];

        // Build speaker display
        const isTestPlayer = firstSpeakerId.startsWith('test-');
        let speakerDisplay;
        if (isTestPlayer) {
            const testNumber = firstSpeakerId.split('-')[2];
            speakerDisplay = `測試玩家 ${testNumber}`;
        } else {
            speakerDisplay = `<@${firstSpeakerId}>`;
        }

        // Send message notifying first PK speaker
        await interaction.channel.send({
            content: `🎤 **PK發言 - 現在輪到：${speakerDisplay}**\n\n⏱️ 發言時間：**3 分鐘**\n每 1 分鐘會提醒一次\n\n發言完畢後，請點擊下方按鈕。`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `finish-pk-speaking-${messageId}`,
                    label: '✅ 完成PK發言',
                    style: 3 // Green
                }]
            }]
        });

        // Start timer for first PK speaker with auto-advance callback
        SpeakingTimer.startTimer(
            interaction.channel,
            messageId,
            firstSpeakerId,
            gameState,
            async () => {
                // Auto-advance to next PK speaker when time is up
                const { autoAdvanceToNextPKSpeaker } = require('./finish-pk-speaking');
                await autoAdvanceToNextPKSpeaker(client, interaction.channel, messageId);
            }
        );
    }
}).toJSON();

