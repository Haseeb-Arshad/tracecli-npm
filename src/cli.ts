import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import figlet from 'figlet';
import Table from 'cli-table3';
import logUpdate from 'log-update';
import {
    initDb,
    getCategoryBreakdown,
    getAppBreakdown,
    getDailyStats,
    getStatsRange,
    upsertDailyStats,
    queryActivities,
    querySearches,
    queryBrowserUrls,
    getFocusStats,
    upsertAppUsageHistory,
    insertSearch,
    insertBrowserUrl,
    getAppAnalytics,
    getAppHistory,
    getAllTrackedApps,
    getTopMemoryApps,
    getTopCpuApps,
    getSnapshotCount,
    getDomainBreakdown,
    getProductivityHeatmapData,
    getStreakInfo,
    queryFocusSessions,
    getDailyAppUsageByHour,
    getDailyActivityTimeline,
    getAppUsageDistribution
} from './database.js';
import { ActivityTracker } from './tracker.js';
import { SystemMonitor, getSystemInfo, getRunningProcesses } from './monitor.js';
import { isProductive, getAppRole, getCategoryEmoji } from './categorizer.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import * as autostart from './autostart.js';
import * as config from './config.js';
import * as ai from './ai.js';
import { FocusMonitor, PomodoroTimer } from './focus.js';
import { extractSearches, extractFullHistory } from './browser.js';

const BANNER = `
 ████████╗██████╗  █████╗  ██████╗███████╗ ██████╗██╗     ██╗
 ╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝██╔════╝██║     ██║
    ██║   ██████╔╝███████║██║     █████╗  ██║     ██║     ██║
    ██║   ██╔══██╗██╔══██║██║     ██╔══╝  ██║     ██║     ██║
    ██║   ██║  ██║██║  ██║╚██████╗███████╗╚██████╗███████╗██║
    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝ ╚═════╝╚══════╝╚═╝
`;

const program = new Command();
const monitor = new SystemMonitor(30000);
const tracker = new ActivityTracker(1000, 2, monitor);

// --- Helpers ---

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return `${m}m ${s}s`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

function formatMemory(mb: number): string {
    if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

function printBanner() {
    console.log(chalk.cyan.bold(BANNER));
    console.log(chalk.dim("  The terminal's black box for your digital life\n"));
}

// --- Dashboard ---

function showDashboard() {
    printBanner();
    initDb();
    upsertDailyStats();

    const stats = getDailyStats();
    const today = new Date().toDateString();

    const total = stats?.total_seconds || 0;
    const prod = stats?.productive_seconds || 0;
    const score = total > 0 ? (prod / total) * 100 : 0;
    const topApp = stats?.top_app || "None";

    const autoEnabled = autostart.isAutostartEnabled();
    const autoStatus = autoEnabled ? chalk.green("Enabled") : chalk.dim("Disabled");
    const autoIcon = autoEnabled ? "🟢" : "⚪";

    const scoreStyle = score >= 70 ? chalk.green : score >= 40 ? chalk.yellow : chalk.red;
    const barLen = Math.round(score / 5);
    const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);

    let dashboardText = `${chalk.white.bold(`📅 ${today}`)}\n\n`;
    dashboardText += `${chalk.dim('  ⏱️  Total Tracked:    ')} ${chalk.cyan.bold(formatDuration(total))}\n`;
    dashboardText += `${chalk.dim('  🧠 Productive Time:  ')} ${chalk.green.bold(formatDuration(prod))}\n`;
    dashboardText += `${chalk.dim('  🏆 Top App:          ')} ${chalk.white(topApp)}\n`;
    dashboardText += `${chalk.dim('  🚀 Auto-Start:       ')} ${autoIcon} ${autoStatus}\n\n`;
    dashboardText += `${chalk.bold('  Productivity Score:')}\n  ${scoreStyle(bar)} ${score.toFixed(0)}%`;

    console.log(boxen(dashboardText, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: '📊 Daily Summary',
        titleAlignment: 'center'
    }));

    const commandsTable = new (Table as any)({
        chars: {
            'top': '', 'top-mid': '', 'top-left': '', 'top-right': ''
            , 'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': ''
            , 'left': '', 'left-mid': '', 'mid': '', 'mid-mid': ''
            , 'right': '', 'right-mid': '', 'middle': ' '
        },
        style: { 'padding-left': 2, 'padding-right': 2 }
    });

    commandsTable.push(
        [chalk.cyan('tracecli start'), chalk.dim('Start activity tracking (use -b for background)')],
        [chalk.cyan('tracecli ask'), chalk.dim('Ask AI about your data')],
        [chalk.cyan('tracecli insights'), chalk.dim('Get AI-powered productivity digest')],
        [chalk.cyan('tracecli focus'), chalk.dim('Start a timed focus session')],
        [chalk.cyan('tracecli pomodoro'), chalk.dim('Start a 25/5 Pomodoro cycle')],
        [chalk.cyan('tracecli report'), chalk.dim('Detailed daily report')],
        [chalk.cyan('tracecli timeline'), chalk.dim('Hourly activity breakdown')],
        [chalk.cyan('tracecli heatmap'), chalk.dim('Productivity heatmap grid')],
        [chalk.cyan('tracecli app'), chalk.dim('Deep analytics for an app')],
        [chalk.cyan('tracecli week'), chalk.dim('Weekly productivity summary')],
        [chalk.cyan('tracecli live'), chalk.dim('Live real-time activity feed')]
    );

    console.log(chalk.dim('\nCore Commands:'));
    console.log(commandsTable.toString());
    console.log(chalk.dim('Use ' + chalk.bold.white('tracecli --help') + ' for advanced auditing commands.\n'));
}

// --- CLI Commands ---

program
    .name('tracecli')
    .description('TraceCLI: AI-powered activity tracker (Node.js Port)')
    .version('0.1.0')
    .action(() => {
        if (process.argv.length <= 2) {
            showDashboard();
        }
    });

program
    .command('start')
    .description('Start tracking activity')
    .option('-b, --background', 'Run silently in background')
    .action(async (options) => {
        if (options.background) {
            autostart.launchInBackground();
            return;
        }

        printBanner();
        initDb();

        await monitor.start();
        await tracker.start();

        console.log(chalk.green('✔ Tracker started!'));
        console.log(chalk.dim('  Press Ctrl+C to stop tracking.\n'));

        const updateUI = () => {
            const current = tracker.getCurrent();
            const sys = monitor.getLatestInfo();

            if (!current) {
                logUpdate(chalk.dim('  Waiting for window activity...'));
                return;
            }

            const cat = current.category;
            const catStyle = isProductive(cat) ? chalk.green : cat.includes('Distraction') ? chalk.red : chalk.yellow;

            let ui = '';
            ui += `  ${chalk.dim('App:')}       ${chalk.bold.white(current.app_name)}\n`;
            ui += `  ${chalk.dim('Window:')}    ${chalk.white(current.window_title.substring(0, 60))}\n`;
            ui += `  ${chalk.dim('Category:')}  ${catStyle.bold(cat)}\n`;
            ui += `  ${chalk.dim('Duration:')}  ${chalk.cyan(formatDuration(current.duration_seconds || 0))}\n`;
            ui += `  ${chalk.dim('Memory:')}    ${chalk.yellow(formatMemory(current.memory_mb))}\n`;
            ui += `  ${chalk.dim('CPU:')}       ${chalk.yellow(current.cpu_percent.toFixed(1) + '%')}\n\n`;

            if (sys) {
                ui += chalk.dim('  ─── System ───\n');
                ui += `  ${chalk.dim('RAM:')}  ${sys.used_ram_gb}/${sys.total_ram_gb} GB (${sys.ram_percent}%)\n`;
                ui += `  ${chalk.dim('CPU:')}  ${sys.cpu_percent}%\n`;
            }

            logUpdate(boxen(ui, {
                title: chalk.bold.cyan('⚡ TraceCLI Live'),
                titleAlignment: 'left',
                padding: 1,
                borderColor: 'blue',
                borderStyle: 'round'
            }));
        };

        const uiInterval = setInterval(updateUI, 1000);

        // Browser History Sync (every 5 mins)
        const browserSync = () => {
            try {
                const searches = extractSearches(10);
                for (const s of searches) insertSearch(s);
                const urls = extractFullHistory(10);
                for (const u of urls) insertBrowserUrl(u);
            } catch (e) { }
        };
        browserSync();
        const syncInterval = setInterval(browserSync, 300000);

        process.on('SIGINT', () => {
            clearInterval(uiInterval);
            clearInterval(syncInterval);
            tracker.stop();
            monitor.stop();
            upsertDailyStats();
            upsertAppUsageHistory();
            console.log(chalk.green('\n✔ All data saved. Session complete.'));
            process.exit(0);
        });
    });

program
    .command('report')
    .description('Show productivity report for today')
    .option('-d, --date <date>', 'Date (YYYY-MM-DD)')
    .action((options) => {
        initDb();
        const date = options.date;
        const stats = getDailyStats(date);
        const catBreakdown = getCategoryBreakdown(date);
        const appBreakdown = getAppBreakdown(date);

        if (catBreakdown.length === 0) {
            console.log(chalk.yellow('\nNo data logged for this date yet.'));
            return;
        }

        console.log(chalk.bold.cyan(`\nActivity Report — ${date || 'Today'}\n`));

        const catTable = new (Table as any)({
            head: ['Category', 'Duration', '% of Day', 'Sessions'],
            style: { head: ['cyan', 'bold'] }
        });

        const totalSec = stats?.total_seconds || 1;
        catBreakdown.forEach((row: any) => {
            const pct = (row.total_seconds / totalSec) * 100;
            const color = isProductive(row.category) ? chalk.green : row.category.includes('Distraction') ? chalk.red : chalk.yellow;
            const bar = color("█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5)));
            catTable.push([row.category, formatDuration(row.total_seconds), `${bar} ${pct.toFixed(1)}%`, row.switch_count]);
        });
        console.log(catTable.toString());

        const appTable = new (Table as any)({
            head: ['App', 'Duration', 'Sessions', 'Avg RAM', 'Avg CPU'],
            style: { head: ['cyan', 'bold'] }
        });

        appBreakdown.slice(0, 10).forEach((row: any) => {
            appTable.push([
                row.app_name,
                formatDuration(row.total_seconds),
                row.switch_count,
                formatMemory(row.avg_memory_mb),
                `${row.avg_cpu_percent.toFixed(1)}%`
            ]);
        });
        console.log(chalk.bold.white('\n🏆 Top Applications'));
        console.log(appTable.toString());
    });

program
    .command('stats')
    .description('Show last 7 days productivity')
    .action(() => {
        initDb();
        upsertDailyStats();
        const records = getStatsRange(7);

        const table = new (Table as any)({
            head: ['Date', 'Total', 'Productive', 'Score', 'Top App'],
            style: { head: ['cyan', 'bold'] }
        });

        records.reverse().forEach((r: any) => {
            const score = (r.productive_seconds / r.total_seconds) * 100 || 0;
            const scoreStyle = score >= 70 ? chalk.green : score >= 40 ? chalk.yellow : chalk.red;
            const bar = scoreStyle("█".repeat(Math.round(score / 10)) + "░".repeat(10 - Math.round(score / 10)));

            table.push([
                r.date,
                formatDuration(r.total_seconds),
                formatDuration(r.productive_seconds),
                `${bar} ${score.toFixed(0)}%`,
                r.top_app
            ]);
        });
        console.log(chalk.bold.cyan('\n📈 Productivity Trends (Last 7 Days)\n'));
        console.log(table.toString());
    });

program
    .command('timeline')
    .description('Show chronological activity timeline')
    .option('-d, --date <date>', 'Date (YYYY-MM-DD)')
    .action((options) => {
        initDb();
        const date = options.date || new Date().toISOString().split('T')[0];
        const acts = getDailyActivityTimeline(date);

        if (acts.length === 0) {
            console.log(chalk.yellow('\nNo activities found for this date.'));
            return;
        }

        console.log(boxen(
            chalk.bold.whiteBright(`⏳ Activity Timeline — ${date}`),
            { padding: 0.5, borderColor: 'magenta', borderStyle: 'round' }
        ));

        const table = new (Table as any)({
            head: ['Time', 'Duration', 'Application', 'Activity / Window Title'],
            style: { head: ['cyan', 'bold'] },
            colWidths: [12, 12, 20, 50]
        });

        acts.forEach(act => {
            const time = new Date(act.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const duration = formatDuration(act.duration_seconds);
            const app = chalk.bold.cyan(act.app_name);
            const title = act.window_title.length > 47 ? act.window_title.substring(0, 44) + '...' : act.window_title;

            table.push([time, duration, app, title]);
        });

        console.log(table.toString());
        console.log();
    });

program
    .command('ask <question...>')
    .description('Ask AI about your activity data')
    .action(async (question) => {
        initDb();
        await ai.handleAsk(question.join(' '));
    });

program
    .command('insights')
    .description('Get AI-powered productivity insights')
    .action(async () => {
        initDb();
        await ai.generateWeeklyInsights();
    });

program
    .command('focus <minutes>')
    .description('Start a timed focus session')
    .option('-g, --goal <goal>', 'Goal label', 'Deep Work')
    .action(async (minutes, options) => {
        const monitor = new FocusMonitor(parseInt(minutes), options.goal);
        await monitor.start();

        process.on('SIGINT', () => {
            monitor.stop();
            console.log(chalk.yellow('\n\nFocus session interrupted. Saving progress...'));
            process.exit(0);
        });
    });

program
    .command('pomodoro')
    .description('Start a Pomodoro cycle (25m focus / 5m break)')
    .action(async () => {
        const timer = new PomodoroTimer();
        await timer.start();

        process.on('SIGINT', () => {
            timer.stop();
            console.log(chalk.yellow('\n\nPomodoro session stopped.'));
            process.exit(0);
        });
    });

const configCmd = program.command('config').description('Manage configuration');

configCmd.command('setup')
    .description('Interactive AI configuration wizard')
    .action(async () => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query: string) => new Promise<string>(resolve => rl.question(query, resolve));

        console.log(chalk.bold.cyan('\n🚀 TraceCLI AI Setup Wizard\n'));

        const provider = (await question(`Select AI Provider (${chalk.green('gemini')}, openai, claude) [gemini]: `) as string).toLowerCase() || 'gemini';
        const apiKey = await question(`Enter your ${chalk.bold(provider.toUpperCase())} API Key: `);
        const model = await question(`Enter specific model (optional) [default]: `);

        config.saveConfig({
            provider: provider as any,
            apiKey: apiKey as string,
            model: model as string || undefined
        });

        console.log(chalk.bold.green('\n✔ Configuration saved successfully!'));
        console.log(chalk.dim('You can now use "tracecli ask" and "tracecli insights".\n'));
        rl.close();
    });

configCmd.command('set-key <key>')
    .description('Set AI API Key')
    .action((key) => {
        config.saveConfig({ apiKey: key });
        console.log(chalk.green('API Key updated!'));
    });

configCmd.command('set-provider <provider>')
    .description('Set AI Provider (gemini, openai, claude)')
    .action((provider) => {
        config.saveConfig({ provider });
        console.log(chalk.green(`Provider set to ${provider}`));
    });

configCmd.command('set-model <model>')
    .description('Set specific AI Model')
    .action((model) => {
        config.saveConfig({ model });
        console.log(chalk.green(`Model set to ${model}`));
    });

configCmd.command('list')
    .description('Show current config')
    .action(() => {
        const cfg = config.loadConfig();
        console.log(chalk.bold.cyan('\nTraceCLI Configuration:'));
        console.log(`  Provider: ${chalk.yellow(cfg.provider)}`);
        console.log(`  Model:    ${chalk.yellow(cfg.model || 'default')}`);
        console.log(`  API Key:  ${cfg.apiKey ? chalk.green('********') : chalk.red('Not set')}\n`);
    });

const autoCmd = program.command('autostart').description('Manage Windows auto-start');

autoCmd.command('enable').action(() => {
    const res = autostart.enableAutostart();
    console.log(res.success ? chalk.green(res.message) : chalk.red(res.message));
});

autoCmd.command('disable').action(() => {
    const res = autostart.disableAutostart();
    console.log(res.success ? chalk.green(res.message) : chalk.red(res.message));
});

program
    .command('status')
    .description('Check CLI and Database status')
    .action(() => {
        initDb();
        console.log(chalk.bold.cyan('\nTraceCLI System Status'));
        console.log(`  Version:     ${chalk.white('0.1.0')}`);
        console.log(`  Platform:    ${chalk.white(process.platform)}`);
        console.log(`  Database:    ${chalk.white('~/.tracecli/trace.db')}`);

        const stats = getDailyStats();
        console.log(`  Data Logged: ${stats ? chalk.green('Yes') : chalk.yellow('No data for today')}`);

        const auto = autostart.isAutostartEnabled();
        console.log(`  Auto-start:  ${auto ? chalk.green('Enabled') : chalk.dim('Disabled')}`);

        try {
            const sqlite = (initDb() as any); // Small hack since initDb doesn't return but we can call it
            const size = fs.statSync(path.join(process.env.USERPROFILE || '', '.tracecli', 'trace.db')).size / (1024 * 1024);
            console.log(`  DB Size:     ${chalk.white(size.toFixed(2) + ' MB')}`);
        } catch (e) { }
        console.log();
    });

program
    .command('urls')
    .description('Show full browser URL history and domain breakdown')
    .option('-d, --date <date>', 'Date (YYYY-MM-DD)')
    .option('-n, --limit <number>', 'Max URLs to show', '50')
    .action((options) => {
        initDb();
        const date = options.date;
        const limit = parseInt(options.limit);
        const domains = getDomainBreakdown(date);
        const urls = queryBrowserUrls(date, limit);

        if (domains.length > 0) {
            console.log(chalk.bold.cyan(`\n🌐 Domain Breakdown — ${date || 'Today'}\n`));
            const domainTable = new (Table as any)({
                head: ['#', 'Domain', 'Visits', 'Total Time'],
                style: { head: ['magenta', 'bold'] }
            });
            domains.slice(0, 15).forEach((d, i) => {
                domainTable.push([i + 1, d.domain, d.visit_count, formatDuration(d.total_duration)]);
            });
            console.log(domainTable.toString());
        }

        if (urls.length > 0) {
            console.log(chalk.bold.cyan(`\n📋 Recent URLs — ${date || 'Today'}\n`));
            const urlTable = new (Table as any)({
                head: ['Time', 'Title', 'Domain', 'Browser'],
                style: { head: ['magenta', 'bold'] }
            });
            urls.forEach(u => {
                urlTable.push([
                    new Date(u.timestamp).toLocaleTimeString(),
                    (u.title || '').substring(0, 40),
                    u.domain,
                    u.browser
                ]);
            });
            console.log(urlTable.toString());
        } else {
            console.log(chalk.yellow('\nNo browser URLs recorded for this date.'));
        }
        console.log();
    });

program
    .command('system')
    .description('Show system resource overview')
    .option('-l, --live-now', 'Show live snapshot of all running processes')
    .action(async (options) => {
        initDb();
        if (options.liveNow) {
            console.log(chalk.bold.cyan('\n💻 Live System Snapshot\n'));
            const sys = await getSystemInfo();
            console.log(`  ${chalk.dim('RAM:')} ${sys.used_ram_gb}/${sys.total_ram_gb} GB (${sys.ram_percent}%) │ ${chalk.dim('CPU:')} ${sys.cpu_percent}% (${sys.cpu_count} cores) │ ${chalk.dim('Disk:')} ${sys.disk_percent}%`);

            const processes = await getRunningProcesses('memory');
            const procTable = new (Table as any)({
                head: ['#', 'PID', 'Application', 'Role', 'Memory', 'CPU %', 'Status'],
                style: { head: ['cyan', 'bold'] }
            });

            processes.slice(0, 30).forEach((p, i) => {
                procTable.push([
                    i + 1, p.pid, p.app_name, getAppRole(p.app_name).substring(0, 25),
                    formatMemory(p.memory_mb), p.cpu_percent.toFixed(1) + '%', p.status
                ]);
            });
            console.log(procTable.toString());
            console.log(chalk.dim(`\nTotal processes: ${processes.length}\n`));
        } else {
            console.log(chalk.bold.cyan('\n💻 System Overview\n'));
            const topMem = getTopMemoryApps();
            const topCpu = getTopCpuApps();

            if (topMem.length > 0) {
                console.log(chalk.bold.white('💾 Top Memory Consumers (Daily Snapshots)'));
                const memTable = new (Table as any)({
                    head: ['App', 'Avg RAM', 'Peak RAM', 'Instances', 'Avg CPU'],
                    style: { head: ['cyan', 'bold'] }
                });
                topMem.forEach(p => {
                    memTable.push([p.app_name, formatMemory(p.avg_memory_mb), formatMemory(p.peak_memory_mb), p.instance_count, p.avg_cpu.toFixed(1) + '%']);
                });
                console.log(memTable.toString());
            }

            if (topCpu.length > 0) {
                console.log(chalk.bold.white('\n⚡ Top CPU Consumers (Daily Snapshots)'));
                const cpuTable = new (Table as any)({
                    head: ['App', 'Avg CPU', 'Peak CPU', 'Avg RAM', 'Instances'],
                    style: { head: ['cyan', 'bold'] }
                });
                topCpu.forEach(p => {
                    cpuTable.push([p.app_name, p.avg_cpu.toFixed(1) + '%', p.peak_cpu.toFixed(1) + '%', formatMemory(p.avg_memory_mb), p.instance_count]);
                });
                console.log(cpuTable.toString());
            }
        }
    });

program
    .command('app <name>')
    .description('Deep analytics for a specific application')
    .option('-d, --date <date>', 'Date (YYYY-MM-DD)')
    .action((name, options) => {
        initDb();
        const stats = getAppAnalytics(name, options.date);
        if (!stats) {
            console.log(chalk.yellow(`\nNo data for '${name}' on this date.`));
            return;
        }

        console.log(boxen(
            `${chalk.bold('🔍 App Analytics — ' + name)}\n${chalk.dim(getAppRole(name))}`,
            { padding: 1, borderColor: 'cyan', borderStyle: 'double' }
        ));

        const summaryTable = new (Table as any)({
            chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
            style: { 'padding-left': 2 }
        });
        summaryTable.push(
            [chalk.dim('Date'), stats.date],
            [chalk.dim('Total Time'), chalk.bold.cyan(formatDuration(stats.total_seconds))],
            [chalk.dim('Sessions'), stats.session_count],
            [chalk.dim('Category'), stats.category],
            [chalk.dim('Avg Memory'), formatMemory(stats.avg_memory_mb)],
            [chalk.dim('Avg CPU'), stats.avg_cpu.toFixed(1) + '%'],
            [chalk.dim('First Seen'), new Date(stats.first_seen).toLocaleTimeString()],
            [chalk.dim('Last Seen'), new Date(stats.last_seen).toLocaleTimeString()]
        );
        console.log(summaryTable.toString());

        if (stats.top_titles.length > 0) {
            console.log(chalk.bold.white('\n🪟 Window Titles (by time)'));
            const titleTable = new (Table as any)({
                head: ['#', 'Window Title', 'Duration', 'Count'],
                style: { head: ['cyan', 'bold'] }
            });
            stats.top_titles.slice(0, 10).forEach((t: any, i: number) => {
                titleTable.push([i + 1, t.window_title.substring(0, 50), formatDuration(t.total_seconds), t.count]);
            });
            console.log(titleTable.toString());
        }

        const history = getAppHistory(name);
        if (history.length > 1) {
            console.log(chalk.bold.white('\n📈 Usage History (last 14 days)'));
            const histTable = new (Table as any)({
                head: ['Date', 'Duration', 'Sessions', 'Avg RAM', 'Trend'],
                style: { head: ['cyan', 'bold'] }
            });
            const maxDur = Math.max(...history.map((h: any) => h.total_seconds));
            history.forEach((h: any) => {
                const barLen = Math.round((h.total_seconds / maxDur) * 20);
                const bar = chalk.blue("█".repeat(barLen) + "░".repeat(20 - barLen));
                histTable.push([h.date, formatDuration(h.total_seconds), h.session_count, formatMemory(h.avg_memory_mb), bar]);
            });
            console.log(histTable.toString());
        }
        console.log();
    });

program
    .command('heatmap')
    .description('Display productivity heatmap')
    .option('-w, --weeks <number>', 'Number of weeks to show', '20')
    .option('-d, --day [date]', 'Show hourly heatmap for a specific day')
    .option('-a, --app <apps...>', 'Filter by specific apps (for --day view)')
    .action((options) => {
        initDb();

        if (options.day !== undefined) {
            const targetDate = options.day === true ? new Date().toISOString().split('T')[0] : options.day;
            showDailyHeatmap(targetDate, options.app);
            return;
        }

        const weeks = parseInt(options.weeks);
        const data = getProductivityHeatmapData(weeks);
        const streaks = getStreakInfo();

        const scoreMap: Record<string, number> = {};
        data.forEach(d => scoreMap[d.date] = d.score);

        const getColor = (score: number, hasData: boolean) => {
            if (!hasData) return chalk.dim;
            if (score >= 80) return chalk.green;
            if (score >= 60) return chalk.greenBright;
            if (score >= 40) return chalk.yellow;
            if (score >= 20) return chalk.redBright;
            return chalk.red;
        };

        console.log(chalk.bold.cyan(`\n📊 Productivity Heatmap\n`));

        const dayLabels = ["Mon", "   ", "Wed", "   ", "Fri", "   ", "Sun"];
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay() + 1 - (weeks - 1) * 7);

        // Header (Months)
        let monthLine = '    ';
        let prevMonth = -1;
        for (let w = 0; w < weeks; w++) {
            const d = new Date(start);
            d.setDate(start.getDate() + w * 7);
            if (d.getMonth() !== prevMonth) {
                const label = d.toLocaleString('default', { month: 'short' });
                monthLine += label.padEnd(3);
                prevMonth = d.getMonth();
            } else {
                monthLine += '  ';
            }
        }
        console.log(chalk.dim(monthLine));

        // Heatmap Grid
        for (let dIdx = 0; dIdx < 7; dIdx++) {
            let row = `${chalk.dim(dayLabels[dIdx])} `;
            for (let w = 0; w < weeks; w++) {
                const d = new Date(start);
                d.setDate(start.getDate() + w * 7 + dIdx);
                if (d > today) {
                    row += '  ';
                } else {
                    const dStr = d.toISOString().split('T')[0];
                    const hasData = dStr in scoreMap;
                    const score = scoreMap[dStr] || 0;
                    const style = getColor(score, hasData);
                    row += style("█ ");
                }
            }
            console.log(row);
        }

        console.log(`\n    Less ${chalk.dim("█ ")}${chalk.red("█ ")}${chalk.redBright("█ ")}${chalk.yellow("█ ")}${chalk.greenBright("█ ")}${chalk.green("█ ")} More`);

        console.log(`\n  ${chalk.dim('🔥 Current streak:')} ${chalk.bold.yellow(streaks.current_streak + ' days')}`);
        console.log(`  ${chalk.dim('🏆 Longest:       ')} ${chalk.bold.cyan(streaks.longest_streak + ' days')}`);
        console.log(`  ${chalk.dim('📅 Total Path:    ')} ${chalk.bold.white(streaks.total_days_tracked + ' days tracked')}\n`);
    });

program
    .command('app-dist <appName>')
    .description('Show typical application usage distribution')
    .option('-n, --days <number>', 'Analyze last N days', '30')
    .action((appName, options) => {
        initDb();
        const days = parseInt(options.days);
        const data = getAppUsageDistribution(appName, days);

        if (data.length === 0) {
            console.log(chalk.yellow(`\nNo data found for '${appName}' in the last ${days} days.`));
            return;
        }

        const hoursMap: Record<number, number> = {};
        data.forEach(d => hoursMap[parseInt(d.hour)] = d.avg_seconds);
        const maxAvg = Math.max(...Object.values(hoursMap), 1);

        console.log(boxen(
            chalk.bold.whiteBright(`📈 '${appName}' Usage Distribution (Avg over ${days} days)`),
            { padding: 0.5, borderColor: 'yellow', borderStyle: 'round' }
        ));

        const getDistColor = (val: number) => {
            const pct = val / maxAvg;
            if (pct > 0.8) return chalk.green;
            if (pct > 0.5) return chalk.greenBright;
            if (pct > 0.2) return chalk.yellow;
            if (pct > 0) return chalk.red;
            return chalk.gray;
        };

        let row = '    ';
        for (let h = 0; h < 24; h++) {
            const avg = hoursMap[h] || 0;
            const style = getDistColor(avg);
            row += style(avg > 0 ? "█ " : "░ ");
        }
        console.log(row);

        let labels = '    ';
        for (let h = 0; h < 24; h++) {
            labels += chalk.dim(h.toString().padStart(2, '0') + ' ');
        }
        console.log(labels);

        const peakHour = Object.keys(hoursMap).reduce((a, b) => hoursMap[parseInt(a)] > hoursMap[parseInt(b)] ? a : b);
        console.log(`\n  ${chalk.dim('Peak usage at:')} ${chalk.bold.white(peakHour.padStart(2, '0') + ':00')}\n`);
    });

program
    .command('week')
    .description('Show weekly productivity summary')
    .action(() => {
        initDb();
        const records = getStatsRange(7);
        if (records.length === 0) {
            console.log(chalk.yellow('\nNo data for the past week.'));
            return;
        }

        const stats = {
            total: records.reduce((a, b) => a + b.total_seconds, 0),
            prod: records.reduce((a, b) => a + b.productive_seconds, 0),
            dist: records.reduce((a, b) => a + b.distraction_seconds, 0),
            best: records.reduce((a, b) => a.productive_seconds > b.productive_seconds ? a : b)
        };

        console.log(boxen(
            `${chalk.bold.white('📅 Weekly Summary')}\n\n` +
            `${chalk.dim('Total Time:   ')} ${chalk.bold.cyan(formatDuration(stats.total))}\n` +
            `${chalk.dim('Productive:   ')} ${chalk.bold.green(formatDuration(stats.prod))}\n` +
            `${chalk.dim('Distraction:  ')} ${chalk.bold.red(formatDuration(stats.dist))}\n` +
            `${chalk.dim('Avg Score:    ')} ${chalk.bold.white(((stats.prod / stats.total) * 100).toFixed(0) + '%')}\n` +
            `${chalk.dim('Best Day:     ')} ${stats.best.date}`,
            { padding: 1, borderColor: 'cyan', borderStyle: 'round' }
        ));
        console.log();
    });

program
    .command('export')
    .description('Export activity data to CSV or JSON')
    .option('-d, --date <date>', 'Date (YYYY-MM-DD)')
    .option('-f, --format <format>', 'Export format (csv, json)', 'csv')
    .option('-o, --output <path>', 'Output file path')
    .action((options) => {
        initDb();
        const date = options.date || new Date().toISOString().split('T')[0];
        const acts = queryActivities(date, 10000);

        if (acts.length === 0) {
            console.log(chalk.yellow('\nNo data to export for this date.'));
            return;
        }

        const outPath = options.output || `tracecli_export_${date}.${options.format}`;

        if (options.format === 'json') {
            fs.writeFileSync(outPath, JSON.stringify(acts, null, 2));
        } else {
            const header = Object.keys(acts[0]).join(',');
            const rows = acts.map(a => Object.values(a).map(v => typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v).join(','));
            fs.writeFileSync(outPath, [header, ...rows].join('\n'));
        }

        console.log(chalk.bold.green(`\n✔ Exported ${acts.length} records to ${outPath}\n`));
    });

program
    .command('live')
    .description('Show live activity feed (read-only)')
    .action(() => {
        initDb();
        console.log(chalk.dim('\nShowing latest activity from database (refreshing every 2s)...'));
        console.log(chalk.dim('Press Ctrl+C to exit.\n'));

        const refresh = () => {
            const acts = queryActivities(undefined, 15);
            const table = new (Table as any)({
                head: ['Time', 'Duration', 'App', 'Window', 'RAM', 'Category'],
                style: { head: ['cyan', 'bold'] }
            });

            acts.forEach(a => {
                const color = isProductive(a.category) ? chalk.green : a.category.includes('Distraction') ? chalk.red : chalk.yellow;
                table.push([
                    new Date(a.start_time).toLocaleTimeString(),
                    formatDuration(a.duration_seconds),
                    a.app_name,
                    a.window_title.substring(0, 40),
                    formatMemory(a.memory_mb),
                    color(a.category)
                ]);
            });

            logUpdate(table.toString());
        };

        const interval = setInterval(refresh, 2000);
        process.on('SIGINT', () => {
            clearInterval(interval);
            console.log(chalk.dim('\nLive feed stopped.\n'));
            process.exit(0);
        });
    });

program
    .command('focus-history')
    .description('View past focus sessions')
    .option('-d, --date <date>', 'Filter by date (YYYY-MM-DD)')
    .action((options) => {
        initDb();
        const sessions = queryFocusSessions(options.date);
        const stats = getFocusStats();

        if (sessions.length === 0) {
            console.log(chalk.yellow('\nNo focus sessions found.'));
            return;
        }

        console.log(boxen(
            `${chalk.bold.white('📜 Focus History')}\n` +
            `${chalk.dim(stats.total_sessions + ' sessions | Avg score: ' + stats.avg_focus_score.toFixed(1) + '% | Best: ' + stats.best_score.toFixed(1) + '%')}`,
            { padding: 1, borderColor: 'magenta', borderStyle: 'round' }
        ));

        const table = new (Table as any)({
            head: ['Date', 'Time', 'Target', 'Focused', 'Score', 'Goal'],
            style: { head: ['magenta', 'bold'] }
        });

        sessions.forEach(s => {
            const score = s.focus_score;
            const scoreStyle = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
            table.push([
                s.start_time.substring(0, 10),
                new Date(s.start_time).toLocaleTimeString(),
                s.target_minutes + 'm',
                formatDuration(s.actual_focus_seconds),
                scoreStyle(score.toFixed(0) + '%'),
                s.goal_label || '—'
            ]);
        });
        console.log(table.toString() + '\n');
    });

program
    .command('searches')
    .description('Show recent search history')
    .action(() => {
        initDb();
        const results = querySearches();
        if (results.length === 0) {
            console.log(chalk.yellow('No searches found.'));
            return;
        }

        const table = new (Table as any)({
            head: ['Time', 'Query', 'Browser', 'Source'],
            style: { head: ['cyan', 'bold'] }
        });

        results.slice(0, 20).forEach(s => {
            table.push([new Date(s.timestamp).toLocaleTimeString(), s.query, s.browser, s.source]);
        });
        console.log(chalk.bold.magenta('\n🔎 Recent Searches\n'));
        console.log(table.toString());
    });

function showDailyHeatmap(targetDate: string, apps?: string[]) {
    const data = getDailyAppUsageByHour(targetDate, apps);

    if (data.length === 0) {
        console.log(chalk.yellow(`\nNo activity data for ${targetDate}.`));
        return;
    }

    const usageMap: Record<string, number[]> = {};
    const hoursTracked = new Set<number>();

    data.forEach(entry => {
        const app = entry.app_name;
        const hour = parseInt(entry.hour);
        const duration = entry.total_seconds;
        if (!usageMap[app]) usageMap[app] = Array(24).fill(0);
        usageMap[app][hour] = duration;
        hoursTracked.add(hour);
    });

    const sortedApps = Object.entries(usageMap)
        .sort((a, b) => b[1].reduce((sum, curr) => sum + curr, 0) - a[1].reduce((sum, curr) => sum + curr, 0))
        .slice(0, 15);

    console.log(boxen(
        chalk.bold.whiteBright(`📊 Hourly Activity Heatmap — ${targetDate}`),
        { padding: 0.5, borderColor: 'cyan', borderStyle: 'round' }
    ));

    // Header
    let header = ' '.repeat(22);
    for (let h = 0; h < 24; h++) {
        if (hoursTracked.has(h)) {
            header += chalk.dim(h.toString().padStart(2, '0') + ' ');
        } else {
            header += chalk.gray('.. ');
        }
    }
    console.log(header);

    const getDurationColor = (seconds: number) => {
        if (seconds === 0) return chalk.gray;
        if (seconds > 1800) return chalk.green;
        if (seconds > 900) return chalk.greenBright;
        if (seconds > 300) return chalk.yellow;
        return chalk.red;
    };

    sortedApps.forEach(([appName, hourlyStats]) => {
        let row = chalk.bold(appName.substring(0, 20).padEnd(20)) + '  ';
        hourlyStats.forEach(seconds => {
            const style = getDurationColor(seconds);
            row += style(seconds > 0 ? "█ " : "░ ");
        });
        console.log(row);
    });

    console.log(`\n  Legend: ${chalk.red('█')} <5m  ${chalk.yellow('█')} <15m  ${chalk.greenBright('█')} <30m  ${chalk.green('█')} >30m\n`);
}

export function run() {
    program.parse(process.argv);
}
