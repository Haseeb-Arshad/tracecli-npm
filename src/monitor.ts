import si from 'systeminformation';
import { bulkInsertSnapshots } from './database.js';

export interface SystemInfo {
    total_ram_gb: number;
    used_ram_gb: number;
    ram_percent: number;
    cpu_percent: number;
    cpu_count: number;
}

export interface ProcessInfo {
    pid: number;
    app_name: string;
    memory_mb: number;
    cpu_percent: number;
    status: string;
    num_threads: number;
}

export class SystemMonitor {
    private interval: number;
    private topN: number;
    private intervalId: NodeJS.Timeout | null = null;
    private latestInfo: SystemInfo | null = null;
    private latestProcesses: ProcessInfo[] = [];

    constructor(interval = 30000, topN = 50) {
        this.interval = interval;
        this.topN = topN;
    }

    async start() {
        this.intervalId = setInterval(() => this.tick(), this.interval);
        await this.tick(); // Immediate first snapshot
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    getLatestInfo() { return this.latestInfo; }
    getLatestTopProcesses() { return this.latestProcesses; }

    private async tick() {
        try {
            const [mem, cpu, processes] = await Promise.all([
                si.mem(),
                si.currentLoad(),
                si.processes()
            ]);

            this.latestInfo = {
                total_ram_gb: parseFloat((mem.total / (1024 ** 3)).toFixed(2)),
                used_ram_gb: parseFloat((mem.used / (1024 ** 3)).toFixed(2)),
                ram_percent: parseFloat(((mem.used / mem.total) * 100).toFixed(2)),
                cpu_percent: parseFloat(cpu.currentLoad.toFixed(2)),
                cpu_count: cpu.cpus.length
            };

            this.latestProcesses = processes.list
                .sort((a, b) => b.memRss - a.memRss)
                .slice(0, this.topN)
                .map(p => ({
                    pid: p.pid,
                    app_name: p.name,
                    memory_mb: parseFloat((p.memRss / (1024 * 1024)).toFixed(2)) || 0,
                    cpu_percent: parseFloat(p.cpu.toFixed(2)) || 0,
                    status: p.state,
                    num_threads: (p as any).threads || 0
                }));

            // Bulk insert to DB
            const timestamp = new Date().toISOString();
            const snapshots = this.latestProcesses.map(p => [
                timestamp, p.app_name, p.pid, p.memory_mb, p.cpu_percent, p.status, p.num_threads
            ]);

            bulkInsertSnapshots(snapshots);
        } catch (err) {
            // Quiet fail in background
        }
    }

    async getProcessResource(pid: number): Promise<Partial<ProcessInfo> | null> {
        try {
            const proc = await si.processes();
            const p = proc.list.find(x => x.pid === pid);
            if (!p) return null;
            return {
                memory_mb: parseFloat((p.memRss / (1024 * 1024)).toFixed(2)),
                cpu_percent: parseFloat(p.cpu.toFixed(2)),
                num_threads: (p as any).threads || 0,
                status: p.state
            };
        } catch (err) {
            return null;
        }
    }
}

export async function getSystemInfo(): Promise<SystemInfo & { disk_used_gb: number, disk_total_gb: number, disk_percent: number }> {
    const [mem, cpu, disk] = await Promise.all([
        si.mem(),
        si.currentLoad(),
        si.fsSize()
    ]);

    const primaryDisk = disk[0] || { used: 0, size: 0 };
    return {
        total_ram_gb: parseFloat((mem.total / (1024 ** 3)).toFixed(2)),
        used_ram_gb: parseFloat((mem.used / (1024 ** 3)).toFixed(2)),
        ram_percent: parseFloat(((mem.used / mem.total) * 100).toFixed(2)),
        cpu_percent: parseFloat(cpu.currentLoad.toFixed(2)),
        cpu_count: cpu.cpus.length,
        disk_used_gb: parseFloat((primaryDisk.used / (1024 ** 3)).toFixed(2)),
        disk_total_gb: parseFloat((primaryDisk.size / (1024 ** 3)).toFixed(2)),
        disk_percent: parseFloat((primaryDisk.use || 0).toFixed(2))
    };
}

export async function getRunningProcesses(sortBy: 'memory' | 'cpu' = 'memory'): Promise<ProcessInfo[]> {
    const processes = await si.processes();
    return processes.list
        .map(p => ({
            pid: p.pid,
            app_name: p.name,
            memory_mb: parseFloat((p.memRss / (1024 * 1024)).toFixed(2)) || 0,
            cpu_percent: parseFloat(p.cpu.toFixed(2)) || 0,
            status: p.state,
            num_threads: (p as any).threads || 0
        }))
        .sort((a, b) => sortBy === 'memory' ? b.memory_mb - a.memory_mb : b.cpu_percent - a.cpu_percent);
}
