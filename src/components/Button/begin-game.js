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

        // Clear all "狼死人" roles before starting new game
        const { clearAllDeadRoles } = require('../../utils/DeadPlayerRole');
        await clearAllDeadRoles(interaction.guild);

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

        // TEST MODE: Always assign bot owner as 女巫 if test mode is enabled
        if (config.werewolf.testMode) {
            const ownerInGame = playerArray.includes(config.users.ownerId);
            const hasWitch = rolePool.includes('女巫');

            if (ownerInGame && hasWitch) {
                // Find 女巫 in rolePool and assign to owner
                const witchIndex = rolePool.indexOf('女巫');
                roleAssignments[config.users.ownerId] = '女巫';

                // Remove 女巫 from rolePool
                rolePool.splice(witchIndex, 1);

                // Remove owner from playerArray for normal assignment
                const ownerIndex = playerArray.indexOf(config.users.ownerId);
                playerArray.splice(ownerIndex, 1);
            }
        }

        // Assign remaining roles to remaining players
        playerArray.forEach((playerId, index) => {
            roleAssignments[playerId] = rolePool[index];
        });
        
        // Get werewolf players for DM notification
        const werewolfPlayers = [];
        for (const [playerId, role] of Object.entries(roleAssignments)) {
            if (role === '狼王' || role === '狼人') {
                werewolfPlayers.push(playerId);
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

        // Build role assignment display for testing (only in test mode)
        let roleDisplay = '';
        if (config.werewolf.testMode) {
            roleDisplay = '\n\n**角色分配（測試用）：**\n';
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
        }

        // Get game rules for witch DM
        const gameRules = gameState.gameRules || {};
        const witchCanSaveSelfFirstNight = gameRules.witchCanSaveSelfFirstNight !== false;

        // Send DMs and track results
        let successCount = 0;
        let failCount = 0;

        // Send DMs asynchronously (don't wait for them)
        // This prevents interaction timeout
        const dmPromise = (async () => {
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
                            let dmContent = `(測試玩家 ${testNumber})\n角色：**${role}**\n\n請保密你的角色，遊戲即將開始！`;

                            // Add werewolf team info for werewolf players (狼王, 狼人)
                            // Note: 狼王 and 狼人 do NOT know about 隱狼
                            if (role === '狼王' || role === '狼人') {
                                dmContent += `\n\n🐺 **狼人陣營成員：**\n`;
                                for (const wPlayerId of werewolfPlayers) {
                                    const wIsTestPlayer = wPlayerId.startsWith('test-');
                                    if (wIsTestPlayer) {
                                        const wTestNumber = wPlayerId.split('-')[2];
                                        const wRole = roleAssignments[wPlayerId];
                                        dmContent += `• 測試玩家 ${wTestNumber} - ${wRole}\n`;
                                    } else {
                                        const wRole = roleAssignments[wPlayerId];
                                        dmContent += `• <@${wPlayerId}> - ${wRole}\n`;
                                    }
                                }
                                dmContent += `\n夜晚時，你們將在主頻道投票選擇殺人目標！`;
                            }

                            // Add werewolf team info for hidden werewolf (隱狼)
                            // 隱狼 knows who 狼王 and 狼人 are, but they don't know about 隱狼
                            if (role === '隱狼') {
                                dmContent += `\n\n🌑 **你是隱狼！**\n\n`;
                                dmContent += `🐺 **狼人陣營成員（他們不知道你的存在）：**\n`;
                                for (const [wPlayerId, wRole] of Object.entries(roleAssignments)) {
                                    if (wRole === '狼王' || wRole === '狼人') {
                                        const wIsTestPlayer = wPlayerId.startsWith('test-');
                                        if (wIsTestPlayer) {
                                            const wTestNumber = wPlayerId.split('-')[2];
                                            dmContent += `• 測試玩家 ${wTestNumber} - ${wRole}\n`;
                                        } else {
                                            dmContent += `• <@${wPlayerId}> - ${wRole}\n`;
                                        }
                                    }
                                }
                                dmContent += `\n📜 **特殊規則：**\n`;
                                dmContent += `• 你不參與夜晚狼人投票\n`;
                                dmContent += `• 預言家查驗你時，只要有狼王或狼人存活，你會顯示為好人陣營\n`;
                                dmContent += `• 當所有狼王和狼人都死亡後，你會被預言家查出，並開始夜晚殺人\n`;
                                dmContent += `• 狼王和狼人不知道你的存在！`;
                            }

                            // Add witch rule info for witch
                            if (role === '女巫') {
                                dmContent += `\n\n📜 **遊戲規則：**\n女巫能否自救：${witchCanSaveSelfFirstNight ? '✅ 允許' : '❌ 禁止'}`;
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
                    let dmContent = `你的角色是：**${role}**\n請保密你的角色，遊戲即將開始！`;

                    // Add werewolf team info for werewolf players (狼王, 狼人)
                    // Note: 狼王 and 狼人 do NOT know about 隱狼
                    if (role === '狼王' || role === '狼人') {
                        dmContent += `\n\n🐺 **狼人陣營成員：**\n`;
                        for (const wPlayerId of werewolfPlayers) {
                            const wIsTestPlayer = wPlayerId.startsWith('test-');
                            if (wIsTestPlayer) {
                                const wTestNumber = wPlayerId.split('-')[2];
                                const wRole = roleAssignments[wPlayerId];
                                dmContent += `• 測試玩家 ${wTestNumber} - ${wRole}\n`;
                            } else {
                                const wRole = roleAssignments[wPlayerId];
                                dmContent += `• <@${wPlayerId}> - ${wRole}\n`;
                            }
                        }
                        dmContent += `\n夜晚時，你們將在主頻道投票選擇殺人目標！`;
                    }

                    // Add werewolf team info for hidden werewolf (隱狼)
                    // 隱狼 knows who 狼王 and 狼人 are, but they don't know about 隱狼
                    if (role === '隱狼') {
                        dmContent += `\n\n🌑 **你是隱狼！**\n\n`;
                        dmContent += `🐺 **狼人陣營成員（他們不知道你的存在）：**\n`;
                        for (const [wPlayerId, wRole] of Object.entries(roleAssignments)) {
                            if (wRole === '狼王' || wRole === '狼人') {
                                const wIsTestPlayer = wPlayerId.startsWith('test-');
                                if (wIsTestPlayer) {
                                    const wTestNumber = wPlayerId.split('-')[2];
                                    dmContent += `• 測試玩家 ${wTestNumber} - ${wRole}\n`;
                                } else {
                                    dmContent += `• <@${wPlayerId}> - ${wRole}\n`;
                                }
                            }
                        }
                        dmContent += `\n📜 **特殊規則：**\n`;
                        dmContent += `• 你不參與夜晚狼人投票\n`;
                        dmContent += `• 預言家查驗你時，只要有狼王或狼人存活，你會顯示為好人陣營\n`;
                        dmContent += `• 當所有狼王和狼人都死亡後，你會被預言家查出，並開始夜晚殺人\n`;
                        dmContent += `• 狼王和狼人不知道你的存在！`;
                    }

                    // Add witch rule info for witch
                    if (role === '女巫') {
                        dmContent += `\n\n📜 **遊戲規則：**\n女巫能否自救：${witchCanSaveSelfFirstNight ? '✅ 允許' : '❌ 禁止'}`;
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
        })();

        // Wait for DMs to complete
        await dmPromise;

        // Build test mode indicator
        const testModeText = config.werewolf.testMode ? ' **(testmode: true)**' : '';

        // Build game rules display
        const rulesDisplay = `\n\n**遊戲規則：**\n女巫能否自救：${witchCanSaveSelfFirstNight ? '✅ 允許' : '❌ 禁止'}`;

        // Build DM sending result
        const dmResultText = failCount > 0
            ? `\n\n📨 **私訊發送結果：**\n✅ 成功：${successCount} 人\n❌ 失敗：${failCount} 人`
            : `\n\n📨 **私訊發送結果：**\n✅ 全部成功：${successCount} 人`;

        // Send new message to channel (appears at bottom)
        const gameStartMessage = await interaction.channel.send({
            content: `🎮 **遊戲已開始！${testModeText}**\n\n✅ 角色私訊已發送\n${testPlayerCount > 0 ? `🤖 ${testPlayerCount} 位測試玩家\n` : ''}\n所有真實玩家請檢查私訊以查看你的角色！${roleDisplay}${rulesDisplay}${dmResultText}`,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            custom_id: `start-night-${messageId}`,
                            label: '🌙 開始第一夜',
                            style: 1 // Blue
                        },
                        {
                            type: 2,
                            custom_id: `view-my-role-${messageId}`,
                            label: '🎭 查看我的角色',
                            style: 2 // Gray
                        }
                    ]
                }
            ]
        });

        // Add reaction to the message
        await gameStartMessage.react('✅');

        // Clean up player, character, and game rules data, but keep channel ID and game state for gameplay
        client.database.delete(`game-players-${messageId}`);
        client.database.delete(`game-characters-${messageId}`);
        client.database.delete(`game-rules-${messageId}`);
    }
}).toJSON();

