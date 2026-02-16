import activeWin from 'active-win';
import { categorize } from './categorizer.js';
import { extractSearchFromTitle } from './browser.js';
import { insertActivity, insertSearch } from './database.js';
import { SystemMonitor } from './monitor.js';

export class ActivityTracker {
    private pollInterval: number;
    private minDuration: number;
    private currentActivity: any | null = null;
    private intervalId: NodeJS.Timeout | null = null;
    private monitor: SystemMonitor | null = null;

    public totalLogged = 0;
    public totalSwitches = 0;

    constructor(pollInterval = 1000, minDuration = 5, monitor: SystemMonitor | null = null) {
        this.pollInterval = pollInterval;
        this.minDuration = minDuration;
        this.monitor = monitor;
    }

    async start() {
        this.intervalId = setInterval(() => this.tick(), this.pollInterval);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.flush();
    }

    getCurrent() { return this.currentActivity; }

    private async tick() {
        try {
            const window = await activeWin();
            if (!window) return;

            const { owner, title } = window;
            const appName = owner.name;
            const pid = owner.processId;

            if (!this.currentActivity) {
                this.currentActivity = await this.createRecord(appName, title, pid);
                return;
            }

            if (this.currentActivity.app_name === appName && this.currentActivity.window_title === title) {
                // Still in same window - update resource usage occasionally
                if (this.monitor && Math.random() < 0.1) {
                    const res = await this.monitor.getProcessResource(pid);
                    if (res) {
                        this.currentActivity.memory_mb = res.memory_mb;
                        this.currentActivity.cpu_percent = res.cpu_percent;
                    }
                }
                return;
            }

            // Window switch
            this.flush();
            this.currentActivity = await this.createRecord(appName, title, pid);
            this.totalSwitches++;
        } catch (err) {
            // Ignore errors in polling loop
        }
    }

    private async createRecord(appName: string, windowTitle: string, pid: number) {
        const search = extractSearchFromTitle(windowTitle, appName);
        if (search) {
            try {
                insertSearch(search);
            } catch (err) { }
        }

        let memory_mb = 0;
        let cpu_percent = 0;

        if (this.monitor) {
            const res = await this.monitor.getProcessResource(pid);
            if (res) {
                memory_mb = res.memory_mb || 0;
                cpu_percent = res.cpu_percent || 0;
            }
        }

        return {
            app_name: appName,
            window_title: windowTitle,
            start_time: new Date().toISOString(),
            category: categorize(appName, windowTitle),
            pid: pid,
            memory_mb: memory_mb,
            cpu_percent: cpu_percent,
            duration_seconds: 0
        };
    }

    private flush() {
        if (!this.currentActivity) return;

        const endTime = new Date();
        const startTime = new Date(this.currentActivity.start_time);
        const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

        if (durationSeconds >= this.minDuration) {
            insertActivity({
                ...this.currentActivity,
                end_time: endTime.toISOString(),
                duration_seconds: durationSeconds,
            });
            this.totalLogged++;
        }
        this.currentActivity = null;
    }
}
