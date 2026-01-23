const { ButtonInteraction, ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const GameState = require("../../utils/GameState");
const WerewolfGame = require("../../utils/WerewolfGame");
const config = require("../../config");

module.exports = new Component({
    customId: 'begin-game',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {
        // Extract message ID from custom_id
        const messageId = interaction.customId.split('-').pop();
        
        // Get player list and character selections from database
        const players = GameState.getPlayers(messageId);
        const selections = GameState.getCharacterSelections(messageId);

        if (!players || players.size === 0) {
            return await interaction.reply({
                content: '❌ 找不到遊戲數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!selections) {
            return await interaction.reply({
                content: '❌ 找不到角色配置數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Use the character selections directly from database (already includes villagers)
        const characters = selections;
        
        // Create role pool
        const rolePool = [];
        for (const [role, count] of Object.entries(characters)) {
            for (let i = 0; i < count; i++) {
                rolePool.push(role);
            }
        }
        
        // Shuffle roles
        for (let i = rolePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
        }

        // Assign roles to players
        const playerArray = Array.from(players);
        const roleAssignments = {};

        // TEST MODE: Always assign bot owner as 狼王 if test mode is enabled
        if (config.werewolf.testMode) {
            const ownerInGame = playerArray.includes(config.users.ownerId);
            const hasWolfKing = rolePool.includes('狼王');

            if (ownerInGame && hasWolfKing) {
                // Find 狼王 in rolePool and assign to owner
                const wolfKingIndex = rolePool.indexOf('狼王');
                roleAssignments[config.users.ownerId] = '狼王';

                // Remove 狼王 from rolePool
                rolePool.splice(wolfKingIndex, 1);

                // Remove owner from playerArray for normal assignment
                const ownerIndex = playerArray.indexOf(config.users.ownerId);
                playerArray.splice(ownerIndex, 1);
            }
        }

        // Assign remaining roles to remaining players
        playerArray.forEach((playerId, index) => {
            roleAssignments[playerId] = rolePool[index];
        });
        
        // Create private channel for werewolves (狼王 and 狼人)
        const werewolfPlayers = [];
        for (const [playerId, role] of Object.entries(roleAssignments)) {
            if (role === '狼王' || role === '狼人') {
                const isTestPlayer = playerId.startsWith('test-');
                if (!isTestPlayer) {
                    werewolfPlayers.push(playerId);
                }
            }
        }

        let werewolfChannel = null;
        if (werewolfPlayers.length > 0) {
            try {
                // Create permission overwrites
                const permissionOverwrites = [
                    {
                        id: interaction.guild.id, // @everyone
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    ...werewolfPlayers.map(playerId => ({
                        id: playerId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    }))
                ];

                // Create the channel
                werewolfChannel = await interaction.guild.channels.create({
                    name: '🐺-狼人頻道',
                    type: ChannelType.GuildText,
                    permissionOverwrites: permissionOverwrites,
                    topic: '狼人陣營的私密頻道 - 只有狼王和狼人可以看到'
                });

                // Send welcome message
                await werewolfChannel.send({
                    content: '🐺 **狼人陣營頻道**\n\n這是狼人陣營的私密頻道。只有狼王和狼人可以看到此頻道。\n\n請在這裡討論策略！'
                });

                // Save channel ID to database for cleanup later
                client.database.set(`game-werewolf-channel-${messageId}`, werewolfChannel.id);
            } catch (error) {
                console.error('Failed to create werewolf channel:', error);
            }
        }

        // Remove buttons from original message FIRST (must respond within 3 seconds)
        await interaction.update({
            components: []
        });

        // Initialize complete game state BEFORE sending DMs
        const gameState = WerewolfGame.initializeGame(messageId, roleAssignments, client.database);

        // Save main game channel ID for later use
        client.database.set(`game-channel-${messageId}`, interaction.channel.id);

        // Count test players for display
        let testPlayerCount = 0;
        for (const playerId of Object.keys(roleAssignments)) {
            if (playerId.startsWith('test-')) {
                testPlayerCount++;
            }
        }

        // Build role assignment display for testing
        let roleDisplay = '\n\n**角色分配（測試用）：**\n';
        for (const [playerId, role] of Object.entries(roleAssignments)) {
            // Check if it's a test player (test players have "test-" prefix)
            const isTestPlayer = playerId.startsWith('test-');

            if (isTestPlayer) {
                // Extract test player number from ID (format: test-{timestamp}-{number})
                const testNumber = playerId.split('-')[2];
                roleDisplay += `測試玩家 ${testNumber}: ${role}\n`;
            } else {
                roleDisplay += `<@${playerId}>: ${role}\n`;
            }
        }

        // Get game rules for witch DM
        const gameRules = gameState.gameRules || {};
        const witchCanSaveSelfFirstNight = gameRules.witchCanSaveSelfFirstNight !== false;

        // Send DMs asynchronously (don't wait for them)
        // This prevents interaction timeout
        (async () => {
            let successCount = 0;
            let failCount = 0;

            for (const [playerId, role] of Object.entries(roleAssignments)) {
                // Check if it's a test player (test players have "test-" prefix)
                const isTestPlayer = playerId.startsWith('test-');

                if (isTestPlayer) {
                    // In test mode, send test player roles to bot owner
                    if (config.werewolf.testMode) {
                        try {
                            const owner = await client.users.fetch(config.users.ownerId);

                            // Extract test player number
                            const testNumber = playerId.split('-')[2];

                            // Build DM message for test player
                            let dmContent = `🎮 **狼人殺遊戲開始！** (測試玩家 ${testNumber})\n\n角色：**${role}**\n\n請保密你的角色，遊戲即將開始！`;

                            // Add werewolf channel info for werewolf players
                            if ((role === '狼王' || role === '狼人') && werewolfChannel) {
                                dmContent += `\n\n🐺 **狼人陣營頻道：** ${werewolfChannel}\n你可以在這個私密頻道與其他狼人溝通！`;
                            }

                            // Add witch rule info for witch
                            if (role === '女巫') {
                                dmContent += `\n\n📜 **遊戲規則：**\n女巫第一夜自救：${witchCanSaveSelfFirstNight ? '✅ 允許' : '❌ 禁止'}`;
                            }

                            await owner.send({
                                content: dmContent
                            });
                        } catch (error) {
                            console.error(`Failed to send test player role to owner:`, error);
                        }
                    }

                    continue; // Skip sending DM to test players themselves
                }

                try {
                    const user = await client.users.fetch(playerId);

                    // Build DM message
                    let dmContent = `🎮 **狼人殺遊戲開始！**\n\n你的角色是：**${role}**\n\n請保密你的角色，遊戲即將開始！`;

                    // Add werewolf channel info for werewolf players
                    if ((role === '狼王' || role === '狼人') && werewolfChannel) {
                        dmContent += `\n\n🐺 **狼人陣營頻道：** ${werewolfChannel}\n你可以在這個私密頻道與其他狼人溝通！`;
                    }

                    // Add witch rule info for witch
                    if (role === '女巫') {
                        dmContent += `\n\n📜 **遊戲規則：**\n女巫第一夜自救：${witchCanSaveSelfFirstNight ? '✅ 允許' : '❌ 禁止'}`;
                    }

                    await user.send({
                        content: dmContent
                    });
                    successCount++;
                } catch (error) {
                    console.error(`Failed to send DM to ${playerId}:`, error);
                    failCount++;
                }
            }

            console.log(`DM sending complete: ${successCount} success, ${failCount} failed`);
        })();

        // Build test mode indicator
        const testModeText = config.werewolf.testMode ? ' **(testmode: true)**' : '';

        // Build game rules display
        const rulesDisplay = `\n\n**遊戲規則：**\n女巫第一夜自救：${witchCanSaveSelfFirstNight ? '✅ 允許' : '❌ 禁止'}`;

        // Send new message to channel (appears at bottom)
        await interaction.channel.send({
            content: `🎮 **遊戲已開始！${testModeText}**\n\n✅ 角色私訊已發送\n${testPlayerCount > 0 ? `🤖 ${testPlayerCount} 位測試玩家\n` : ''}\n所有真實玩家請檢查私訊以查看你的角色！${roleDisplay}${rulesDisplay}`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    custom_id: `start-night-${messageId}`,
                    label: '🌙 開始第一夜',
                    style: 1 // Blue
                }]
            }]
        });

        // Clean up player, character, and game rules data, but keep channel ID and game state for gameplay
        client.database.delete(`game-players-${messageId}`);
        client.database.delete(`game-characters-${messageId}`);
        client.database.delete(`game-rules-${messageId}`);
    }
}).toJSON();

