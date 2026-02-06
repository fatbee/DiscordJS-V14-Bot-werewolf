const { ChatInputCommandInteraction, MessageFlags, ApplicationCommandOptionType } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const PlayerStats = require("../../utils/PlayerStats");

module.exports = new ApplicationCommand({
    command: {
        name: 'leaderboard',
        description: '查看玩家排行榜',
        type: 1,
        options: [
            {
                name: 'category',
                description: '選擇排行榜類別',
                type: ApplicationCommandOptionType.String,
                required: false,
                choices: [
                    { name: '🏆 總勝場數', value: 'wins' },
                    { name: '📊 總場次', value: 'games' },
                    { name: '📈 勝率', value: 'winrate' },
                    { name: '🖤 存活率', value: 'survival' },
                    { name: '🐺 狼人勝利', value: 'werewolf_wins' },
                    { name: '👥 村民勝利', value: 'villager_wins' }
                ]
            },
            {
                name: 'order',
                description: '排序方式',
                type: ApplicationCommandOptionType.String,
                required: false,
                choices: [
                    { name: '⬇️ 倒數（從高到低）', value: 'desc' },
                    { name: '⬆️ 順數（從低到高）', value: 'asc' }
                ]
            },
            {
                name: 'limit',
                description: '顯示前幾名（預設：10）',
                type: ApplicationCommandOptionType.Integer,
                required: false,
                min_value: 5,
                max_value: 25
            }
        ]
    },
    options: {
        cooldown: 5000
    },
    /**
     * @param {DiscordBot} client
     * @param {ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        const category = interaction.options.getString('category') || 'wins';
        const order = interaction.options.getString('order') || 'desc';
        const limit = interaction.options.getInteger('limit') || 10;

        // Get all player stats from database
        const allStats = [];
        const allEntries = client.database.entries();

        for (const [key, stats] of allEntries) {
            if (key.startsWith('player-stats-')) {
                const playerId = key.replace('player-stats-', '');

                // Skip players with no games
                if (stats.totalGames === 0) continue;

                // Calculate derived stats
                const winRate = stats.totalGames > 0 ? (stats.wins / stats.totalGames) * 100 : 0;
                const survivalRate = stats.totalGames > 0 ? (stats.survived / stats.totalGames) * 100 : 0;

                // Calculate team-specific games
                const werewolfGames = (stats.roles?.['狼王'] || 0) + (stats.roles?.['狼人'] || 0) + (stats.roles?.['隱狼'] || 0);
                const villagerGames = (stats.roles?.['預言家'] || 0) + (stats.roles?.['女巫'] || 0) + (stats.roles?.['獵人'] || 0) + (stats.roles?.['騎士'] || 0) + (stats.roles?.['熊'] || 0) + (stats.roles?.['村民'] || 0);

                // Filter based on category
                if (category === 'werewolf_wins' && werewolfGames === 0) continue;
                if (category === 'villager_wins' && villagerGames === 0) continue;

                allStats.push({
                    playerId,
                    totalGames: stats.totalGames,
                    wins: stats.wins,
                    winRate,
                    survivalRate,
                    werewolfWins: stats.werewolfWins,
                    villagerWins: stats.villagerWins,
                    werewolfGames,
                    villagerGames
                });
            }
        }

        // Check if there are any stats
        if (allStats.length === 0) {
            return await interaction.reply({
                content: '❌ 目前還沒有任何玩家統計數據！',
                flags: MessageFlags.Ephemeral
            });
        }

        // Sort based on category
        let sortKey;
        let categoryName;
        let valueFormatter;

        switch (category) {
            case 'wins':
                sortKey = 'wins';
                categoryName = '🏆 總勝場數';
                valueFormatter = (v) => `${v} 勝`;
                break;
            case 'games':
                sortKey = 'totalGames';
                categoryName = '📊 總場次';
                valueFormatter = (v) => `${v} 場`;
                break;
            case 'winrate':
                sortKey = 'winRate';
                categoryName = '📈 勝率';
                valueFormatter = (v) => `${v.toFixed(1)}%`;
                break;
            case 'survival':
                sortKey = 'survivalRate';
                categoryName = '🖤 存活率';
                valueFormatter = (v) => `${v.toFixed(1)}%`;
                break;
            case 'werewolf_wins':
                sortKey = 'werewolfWins';
                categoryName = '🐺 狼人勝利';
                valueFormatter = (v) => `${v} 勝`;
                break;
            case 'villager_wins':
                sortKey = 'villagerWins';
                categoryName = '👥 村民勝利';
                valueFormatter = (v) => `${v} 勝`;
                break;
        }

        // Sort players
        allStats.sort((a, b) => {
            if (order === 'desc') {
                return b[sortKey] - a[sortKey];
            } else {
                return a[sortKey] - b[sortKey];
            }
        });

        // Take top N players
        const topPlayers = allStats.slice(0, limit);

        // Build leaderboard display
        const orderText = order === 'desc' ? '⬇️ 倒數（從高到低）' : '⬆️ 順數（從低到高）';

        let leaderboard = `📊 **狼人殺排行榜**\n\n`;
        leaderboard += `**類別：** ${categoryName}\n`;
        leaderboard += `**排序：** ${orderText}\n`;
        leaderboard += `**總玩家數：** ${allStats.length} 人\n\n`;
        leaderboard += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Add each player to leaderboard
        for (let i = 0; i < topPlayers.length; i++) {
            const player = topPlayers[i];
            const rank = i + 1;

            // Medal emojis for top 3
            let rankDisplay;
            if (rank === 1) rankDisplay = '🥇';
            else if (rank === 2) rankDisplay = '🥈';
            else if (rank === 3) rankDisplay = '🥉';
            else rankDisplay = `${rank}.`;

            const value = valueFormatter(player[sortKey]);

            // Show team-specific games for team categories
            let gamesInfo;
            if (category === 'werewolf_wins') {
                gamesInfo = `(${player.werewolfGames} 場)`;
            } else if (category === 'villager_wins') {
                gamesInfo = `(${player.villagerGames} 場)`;
            } else {
                gamesInfo = `(${player.totalGames} 場)`;
            }

            leaderboard += `${rankDisplay} <@${player.playerId}>\n`;
            leaderboard += `   └ ${value} ${gamesInfo}\n\n`;
        }

        leaderboard += `━━━━━━━━━━━━━━━━━━━━\n`;
        leaderboard += `💡 使用 \`/stats\` 查看個人詳細統計`;

        await interaction.reply({
            content: leaderboard,
            allowedMentions: { users: [] } // Don't ping users in leaderboard
        });
    }
}).toJSON();

