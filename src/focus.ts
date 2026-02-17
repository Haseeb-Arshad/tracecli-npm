import activeWin from 'active-win';
import chalk from 'chalk';
import logUpdate from 'log-update';
import boxen from 'boxen';
import { isProductive, categorize } from './categorizer.js';
import { getDb } from './database.js';
import { checkRelevance } from './ai.js';
import { getAIParams } from './config.js';
import fs from 'fs';
import path from 'path';

export class FocusMonitor {
    protected targetMinutes: number;
    protected startTime: string;
    protected endTime: string | null = null;
    protected actualFocusSeconds: number = 0;
    protected distractionSeconds: number = 0;
    protected interruptionCount: number = 0;
    protected intervalId: NodeJS.Timeout | null = null;
    protected isPaused: boolean = false;
    protected goalLabel: string;
    protected whitelist: Set<string> = new Set([
        'explorer.exe', 'searchhost.exe', 'shellexperiencehost.exe', 'taskmgr.exe',
        'cmd.exe', 'powershell.exe', 'windowsterminal.exe', 'wt.exe',
        'windows command processor', 'windows explorer', 'task manager', 'system settings',
        'trace-cli', 'terminal', 'powershell', 'cmd', 'antigravity', 'system'
    ]);

    private lockFile = path.join(process.env.USERPROFILE || '', '.tracecli', 'focus.lock');

    // Context Lock
    protected lockedApp: string | null = null;
    protected lockedTitle: string | null = null;
    protected lastTitle: string | null = null;
    protected relevanceCache: Map<string, boolean> = new Map();
    protected aiConfigured: boolean = true;

    constructor(minutes: number, goalLabel: string = 'Deep Work') {
        this.targetMinutes = minutes;
        this.goalLabel = goalLabel;
        this.startTime = new Date().toISOString();
        const [, key] = getAIParams();
        this.aiConfigured = !!key;
    }

    async start() {
        if (this.acquireLock()) {
            console.log(chalk.cyan.bold(`\n🔥 Focus Session Started: ${this.goalLabel}`));
            console.log(chalk.dim(`   Goal: ${this.targetMinutes} minutes. Stay focused!\n`));
            console.log(chalk.yellow(`   💡 Switch to your work window to lock context.\n`));

            this.intervalId = setInterval(() => this.tick(), 1000);
        } else {
            console.log(chalk.red.bold('\n⚠️  Another focus or pomodoro session is already running!'));
            console.log(chalk.dim('Please stop it before starting a new one.\n'));
            process.exit(1);
        }
    }

    private acquireLock(): boolean {
        if (fs.existsSync(this.lockFile)) {
            // Check if process is still alive (crude check)
            const stats = fs.statSync(this.lockFile);
            const now = Date.now();
            if (now - stats.mtimeMs > 1000 * 60 * 60) { // 1 hour old lock is likely dead
                fs.unlinkSync(this.lockFile);
            } else {
                return false;
            }
        }
        fs.writeFileSync(this.lockFile, process.pid.toString());
        return true;
    }

    private releaseLock() {
        if (fs.existsSync(this.lockFile)) {
            fs.unlinkSync(this.lockFile);
        }
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.endTime = new Date().toISOString();
        this.releaseLock();
        this.saveSession();
    }

    protected async tick() {
        if (this.isPaused) return;

        const win = await activeWin();
        if (!win) return;

        const appName = win.owner.name;
        const appLower = appName.toLowerCase();
        const appPath = win.owner.path?.toLowerCase() || '';
        const title = win.title;

        const cleanApp = appLower.replace('.exe', '');

        const onWhitelist = this.whitelist.has(appLower) ||
            this.whitelist.has(cleanApp) ||
            Array.from(this.whitelist).some(w => appPath.includes(w) || appLower.includes(w)) ||
            appLower.includes('terminal') || appLower.includes('powershell') ||
            appLower.includes('command processor') || appLower.includes('cmd');

        let status: 'FOCUSED' | 'DISTRACTED' | 'NEUTRAL' = 'NEUTRAL';

        if (onWhitelist) {
            status = 'NEUTRAL';
        } else {
            if (!this.lockedApp) {
                // First non-whitelisted window becomes the Locked Context
                this.lockedApp = appName;
                this.lockedTitle = title;
                status = 'FOCUSED';
            } else {
                const cleanLocked = this.lockedApp.toLowerCase().replace('.exe', '');
                if (cleanApp === cleanLocked) {
                    // Same app, check title if browser
                    const isBrowser = appLower.includes('chrome') || appLower.includes('edge') || appLower.includes('browser') || appLower.includes('firefox');
                    if (isBrowser && title !== this.lastTitle) {
                        if (this.relevanceCache.has(title)) {
                            status = this.relevanceCache.get(title) ? 'FOCUSED' : 'DISTRACTED';
                        } else {
                            this.checkRelevanceAsync(title);
                            status = 'FOCUSED';
                        }
                    } else if (isBrowser && this.relevanceCache.has(title)) {
                        status = this.relevanceCache.get(title) ? 'FOCUSED' : 'DISTRACTED';
                    } else {
                        status = 'FOCUSED';
                    }
                } else {
                    status = 'DISTRACTED';
                }
            }
        }

        // Apply time increments
        if (status === 'FOCUSED') {
            this.actualFocusSeconds += 1;
        } else if (status === 'DISTRACTED') {
            this.distractionSeconds += 1;
            if (this.lastTitle !== title) {
                this.interruptionCount += 1;
            }
        }
        // NEUTRAL doesn't count towards focus or distraction

        this.lastTitle = title;

        this.updateUI(appName, title, status);

        if (this.actualFocusSeconds >= this.targetMinutes * 60) {
            this.stop();
            this.onGoalReached();
        }
    }

    private async checkRelevanceAsync(title: string) {
        if (this.relevanceCache.size > 50) this.relevanceCache.clear();
        const relevant = await checkRelevance(this.goalLabel, title);
        this.relevanceCache.set(title, relevant);
    }

    protected onGoalReached() {
        console.log(chalk.green.bold('\n✨ Goal Reached! Focus session complete.'));
        process.exit(0);
    }

    protected updateUI(appName: string, title: string, status: 'FOCUSED' | 'DISTRACTED' | 'NEUTRAL') {
        const elapsed = this.actualFocusSeconds;
        const target = this.targetMinutes * 60;
        const progress = Math.min(100, (elapsed / target) * 100);
        const barLen = Math.round(progress / 5);
        const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);

        const score = this.calculateScore();
        const scoreStyle = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;

        let statusText = '';
        if (status === 'FOCUSED') statusText = chalk.green.bold('⭐ Focused');
        else if (status === 'DISTRACTED') statusText = chalk.red.bold('⚠️  Distracted');
        else statusText = chalk.yellow.bold('⏸  Neutral (System)');

        let ui = '';
        ui += `  ${chalk.dim('Goal:')}      ${chalk.bold.white(this.goalLabel)}\n`;
        ui += `  ${chalk.dim('Locked To:')}  ${this.lockedApp ? chalk.white(this.lockedApp) : chalk.yellow('Waiting for work window...')}\n`;
        ui += `  ${chalk.dim('Status:')}    ${statusText}\n`;
        ui += `  ${chalk.dim('Progress:')}  ${chalk.cyan(bar)} ${progress.toFixed(0)}%\n`;
        ui += `  ${chalk.dim('Focus Time:')} ${chalk.cyan(this.formatTime(elapsed))} / ${this.formatTime(target)}\n`;
        ui += `  ${chalk.dim('Score:')}      ${scoreStyle.bold(score.toFixed(0) + '%')}\n`;

        if (status === 'DISTRACTED') {
            ui += `\n  ${chalk.red.italic(`Currently on: ${appName}`)}`;
        } else if (status === 'NEUTRAL' && !this.lockedApp) {
            ui += `\n  ${chalk.dim.italic('Timer paused. Locked to work app on switch.')}`;
        }

        if (!this.aiConfigured) {
            ui += `\n\n  ${chalk.yellow('⚠️  AI API Key not configured.')}\n  ${chalk.dim('   Run "tracecli config setup"')}`;
        }

        logUpdate(boxen(ui, {
            title: chalk.bold.magenta('🧘 Contextual Focus'),
            titleAlignment: 'left',
            padding: 1,
            borderColor: 'magenta',
            borderStyle: 'double'
        }));
    }

    protected calculateScore(): number {
        const total = this.actualFocusSeconds + this.distractionSeconds;
        if (total === 0) return 100;
        return (this.actualFocusSeconds / total) * 100;
    }

    protected formatTime(s: number): string {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}m ${sec}s`;
    }

    protected saveSession() {
        try {
            const sqlite = getDb();
            const score = this.calculateScore();
            sqlite.prepare(`
                INSERT INTO focus_sessions (start_time, end_time, target_minutes, actual_focus_seconds, interruption_count, focus_score, goal_label)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(this.startTime, this.endTime, this.targetMinutes, this.actualFocusSeconds, this.interruptionCount, score, this.goalLabel);
        } catch (e) { }
    }
}

export class PomodoroTimer extends FocusMonitor {
    private phase: 'WORK' | 'BREAK' = 'WORK';
    private sessionCount: number = 0;

    constructor() {
        super(25, 'Pomodoro Work');
    }

    async start() {
        console.clear();
        this.startTime = new Date().toISOString();
        this.intervalId = setInterval(() => this.tick(), 1000);
    }

    protected onGoalReached() {
        if (this.phase === 'WORK') {
            this.sessionCount++;
            const isLongBreak = this.sessionCount % 4 === 0;
            this.phase = 'BREAK';
            this.targetMinutes = isLongBreak ? 15 : 5;
            this.goalLabel = isLongBreak ? 'Long Break' : 'Short Break';
            this.actualFocusSeconds = 0;
            console.log(chalk.bold.green('\n\n🔔 WORK SESSION COMPLETE!'));
            console.log(chalk.cyan(`Time for a ${this.goalLabel} (${this.targetMinutes}m).`));
        } else {
            this.phase = 'WORK';
            this.targetMinutes = 25;
            this.goalLabel = 'Pomodoro Work';
            this.actualFocusSeconds = 0;
            console.log(chalk.bold.cyan('\n\n🔔 BREAK OVER!'));
            console.log(chalk.green('Let\'s get back to focus.'));
        }
    }

    protected updateUI(appName: string, title: string, status: 'FOCUSED' | 'DISTRACTED' | 'NEUTRAL') {
        if (this.phase === 'BREAK') {
            const elapsed = this.actualFocusSeconds;
            const target = this.targetMinutes * 60;
            const remaining = target - elapsed;
            const progress = (elapsed / target) * 100;
            const barLen = Math.round(progress / 5);
            const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);

            let ui = '';
            ui += `  ${chalk.bold.green('☕ Taking a break...')}\n\n`;
            ui += `  ${chalk.dim('Phase:')}    ${chalk.bold.white(this.goalLabel)}\n`;
            ui += `  ${chalk.dim('Remaining:')} ${chalk.cyan(this.formatTime(remaining))}\n`;
            ui += `  ${chalk.dim('Progress:')}  ${chalk.green(bar)} ${progress.toFixed(0)}%`;

            logUpdate(boxen(ui, {
                title: chalk.bold.green('🧘 Break Time'),
                padding: 1,
                borderColor: 'green',
                borderStyle: 'round'
            }));
            return;
        }

        super.updateUI(appName, title, status);
    }
}
