import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR = path.join(os.homedir(), '.tracecli');
export const DB_PATH = path.join(DATA_DIR, 'trace.db');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

let db: Database.Database;

export function getDb() {
    if (!db) {
        ensureDataDir();
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
    }
    return db;
}

export function initDb() {
    const sqlite = getDb();

    sqlite.exec(`
    -- Core activity tracking
    CREATE TABLE IF NOT EXISTS activity_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name        TEXT    NOT NULL,
        window_title    TEXT    NOT NULL,
        start_time      TEXT    NOT NULL,
        end_time        TEXT    NOT NULL,
        duration_seconds REAL   NOT NULL,
        category        TEXT    NOT NULL DEFAULT 'Other',
        memory_mb       REAL    DEFAULT 0,
        cpu_percent     REAL    DEFAULT 0,
        pid             INTEGER DEFAULT 0
    );

    -- Search query extraction
    CREATE TABLE IF NOT EXISTS search_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   TEXT    NOT NULL,
        browser     TEXT    NOT NULL,
        query       TEXT    NOT NULL,
        url         TEXT    NOT NULL,
        source      TEXT    NOT NULL DEFAULT 'Unknown'
    );

    -- Daily productivity summary
    CREATE TABLE IF NOT EXISTS daily_stats (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        date                TEXT    NOT NULL UNIQUE,
        total_seconds       REAL    NOT NULL DEFAULT 0,
        productive_seconds  REAL    NOT NULL DEFAULT 0,
        distraction_seconds REAL    NOT NULL DEFAULT 0,
        top_app             TEXT    NOT NULL DEFAULT '',
        top_category        TEXT    NOT NULL DEFAULT '',
        session_count       INTEGER NOT NULL DEFAULT 0
    );

    -- System-wide process snapshots
    CREATE TABLE IF NOT EXISTS process_snapshots (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   TEXT    NOT NULL,
        app_name    TEXT    NOT NULL,
        pid         INTEGER NOT NULL,
        memory_mb   REAL    NOT NULL DEFAULT 0,
        cpu_percent REAL    NOT NULL DEFAULT 0,
        status      TEXT    NOT NULL DEFAULT 'running',
        num_threads INTEGER NOT NULL DEFAULT 0
    );

    -- Per-app daily aggregate analytics
    CREATE TABLE IF NOT EXISTS app_usage_history (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        date                TEXT    NOT NULL,
        app_name            TEXT    NOT NULL,
        total_duration      REAL    NOT NULL DEFAULT 0,
        total_memory_avg_mb REAL    NOT NULL DEFAULT 0,
        total_cpu_avg       REAL    NOT NULL DEFAULT 0,
        launch_count        INTEGER NOT NULL DEFAULT 0,
        category            TEXT    NOT NULL DEFAULT 'Other',
        role                TEXT    NOT NULL DEFAULT '',
        UNIQUE(date, app_name)
    );

    -- Full browser URL history
    CREATE TABLE IF NOT EXISTS browser_urls (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp       TEXT    NOT NULL,
        browser         TEXT    NOT NULL,
        url             TEXT    NOT NULL,
        title           TEXT    NOT NULL DEFAULT '',
        visit_duration  REAL    NOT NULL DEFAULT 0,
        domain          TEXT    NOT NULL DEFAULT ''
    );

    -- Focus session tracking
    CREATE TABLE IF NOT EXISTS focus_sessions (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time          TEXT    NOT NULL,
        end_time            TEXT    NOT NULL,
        target_minutes      INTEGER NOT NULL DEFAULT 25,
        actual_focus_seconds REAL   NOT NULL DEFAULT 0,
        interruption_count  INTEGER NOT NULL DEFAULT 0,
        focus_score         REAL    NOT NULL DEFAULT 0,
        goal_label          TEXT    NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_activity_start ON activity_log(start_time);
    CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_log(category);
    CREATE INDEX IF NOT EXISTS idx_activity_app ON activity_log(app_name);
    CREATE INDEX IF NOT EXISTS idx_search_timestamp ON search_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_stats(date);
    CREATE INDEX IF NOT EXISTS idx_snapshot_timestamp ON process_snapshots(timestamp);
    CREATE INDEX IF NOT EXISTS idx_snapshot_app ON process_snapshots(app_name);
    CREATE INDEX IF NOT EXISTS idx_app_usage_date ON app_usage_history(date);
    CREATE INDEX IF NOT EXISTS idx_app_usage_name ON app_usage_history(app_name);
    CREATE INDEX IF NOT EXISTS idx_browser_urls_timestamp ON browser_urls(timestamp);
    CREATE INDEX IF NOT EXISTS idx_browser_urls_domain ON browser_urls(domain);
    CREATE INDEX IF NOT EXISTS idx_focus_start ON focus_sessions(start_time);
  `);
}

// --- Insert Helpers ---

export function insertActivity(activity: any) {
    const sqlite = getDb();
    const stmt = sqlite.prepare(`
    INSERT INTO activity_log 
    (app_name, window_title, start_time, end_time, duration_seconds, category, memory_mb, cpu_percent, pid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    stmt.run(
        activity.app_name,
        activity.window_title,
        activity.start_time,
        activity.end_time,
        activity.duration_seconds,
        activity.category,
        activity.memory_mb || 0,
        activity.cpu_percent || 0,
        activity.pid || 0
    );
}

export function insertSearch(search: any) {
    const sqlite = getDb();
    const stmt = sqlite.prepare(`
    INSERT INTO search_history (timestamp, browser, query, url, source)
    VALUES (?, ?, ?, ?, ?)
  `);
    stmt.run(
        search.timestamp,
        search.browser,
        search.query,
        search.url || '',
        search.source || 'Unknown'
    );
}

export function insertBrowserUrl(u: any) {
    const sqlite = getDb();
    const stmt = sqlite.prepare(`
        INSERT INTO browser_urls (timestamp, browser, url, title, visit_duration, domain)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(u.timestamp, u.browser, u.url, u.title || '', u.visit_duration || 0, u.domain || '');
}

export function bulkInsertSnapshots(snapshots: any[]) {
    const sqlite = getDb();
    const stmt = sqlite.prepare(`
    INSERT INTO process_snapshots (timestamp, app_name, pid, memory_mb, cpu_percent, status, num_threads)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    const insertMany = sqlite.transaction((rows) => {
        for (const row of rows) stmt.run(row);
    });

    insertMany(snapshots);
}

// --- Aggregation Helpers ---

export function upsertDailyStats(targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];

    const PRODUCTIVE = ['💻 Development', '📚 Research', '📝 Productivity'];
    const DISTRACTION = ['🎮 Distraction'];

    const total = (sqlite.prepare("SELECT SUM(duration_seconds) as total FROM activity_log WHERE start_time LIKE ? || '%'").get(dateStr) as any)?.total || 0;

    const prodPlaceholders = PRODUCTIVE.map(() => '?').join(',');
    const productive = (sqlite.prepare(`SELECT SUM(duration_seconds) as prod FROM activity_log WHERE start_time LIKE ? || '%' AND category IN (${prodPlaceholders})`).get(dateStr, ...PRODUCTIVE) as any)?.prod || 0;

    const distPlaceholders = DISTRACTION.map(() => '?').join(',');
    const distraction = (sqlite.prepare(`SELECT SUM(duration_seconds) as dist FROM activity_log WHERE start_time LIKE ? || '%' AND category IN (${distPlaceholders})`).get(dateStr, ...DISTRACTION) as any)?.dist || 0;

    const topAppRow = sqlite.prepare("SELECT app_name FROM activity_log WHERE start_time LIKE ? || '%' GROUP BY app_name ORDER BY SUM(duration_seconds) DESC LIMIT 1").get(dateStr) as any;
    const topApp = topAppRow ? topAppRow.app_name : '';

    const topCatRow = sqlite.prepare("SELECT category FROM activity_log WHERE start_time LIKE ? || '%' GROUP BY category ORDER BY SUM(duration_seconds) DESC LIMIT 1").get(dateStr) as any;
    const topCategory = topCatRow ? topCatRow.category : '';

    const sessionCount = (sqlite.prepare("SELECT COUNT(*) as count FROM activity_log WHERE start_time LIKE ? || '%'").get(dateStr) as any)?.count || 0;

    sqlite.prepare(`
    INSERT INTO daily_stats (date, total_seconds, productive_seconds, distraction_seconds, top_app, top_category, session_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
        total_seconds = excluded.total_seconds,
        productive_seconds = excluded.productive_seconds,
        distraction_seconds = excluded.distraction_seconds,
        top_app = excluded.top_app,
        top_category = excluded.top_category,
        session_count = excluded.session_count
  `).run(dateStr, total, productive, distraction, topApp, topCategory, sessionCount);
}

export function upsertAppUsageHistory(targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];

    const apps = sqlite.prepare(`
        SELECT app_name, 
               SUM(duration_seconds) as total_duration, 
               AVG(memory_mb) as avg_mem, 
               AVG(cpu_percent) as avg_cpu,
               COUNT(*) as launches,
               category
        FROM activity_log
        WHERE start_time LIKE ? || '%'
        GROUP BY app_name
    `).all(dateStr) as any[];

    for (const app of apps) {
        sqlite.prepare(`
            INSERT INTO app_usage_history (date, app_name, total_duration, total_memory_avg_mb, total_cpu_avg, launch_count, category)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, app_name) DO UPDATE SET
                total_duration = excluded.total_duration,
                total_memory_avg_mb = excluded.total_memory_avg_mb,
                total_cpu_avg = excluded.total_cpu_avg,
                launch_count = excluded.launch_count
        `).run(dateStr, app.app_name, app.total_duration, app.avg_mem, app.avg_cpu, app.launches, app.category);
    }
}

// --- Query Helpers ---

export function getDailyStats(targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare("SELECT * FROM daily_stats WHERE date = ?").get(dateStr) as any;
}

export function getStatsRange(limit = 7) {
    const sqlite = getDb();
    return sqlite.prepare("SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?").all(limit) as any[];
}

export function queryActivities(targetDate?: string, limit = 100) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare(`
    SELECT * FROM activity_log 
    WHERE start_time LIKE ? || '%'
    ORDER BY start_time DESC
    LIMIT ?
  `).all(dateStr, limit) as any[];
}

export function getCategoryBreakdown(targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare(`
    SELECT category, SUM(duration_seconds) as total_seconds, COUNT(*) as switch_count
    FROM activity_log
    WHERE start_time LIKE ? || '%'
    GROUP BY category
    ORDER BY total_seconds DESC
  `).all(dateStr) as any[];
}

export function getAppBreakdown(targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare(`
    SELECT app_name, 
           SUM(duration_seconds) as total_seconds, 
           COUNT(*) as switch_count,
           AVG(memory_mb) as avg_memory_mb,
           AVG(cpu_percent) as avg_cpu_percent,
           MAX(memory_mb) as peak_memory_mb
    FROM activity_log
    WHERE start_time LIKE ? || '%'
    GROUP BY app_name
    ORDER BY total_seconds DESC
  `).all(dateStr) as any[];
}

export function getAppAnalytics(appName: string, targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];

    // Aggregate stats
    const stats = sqlite.prepare(`
        SELECT COUNT(*) as session_count,
               SUM(duration_seconds) as total_seconds,
               AVG(memory_mb) as avg_memory_mb,
               MAX(memory_mb) as peak_memory_mb,
               AVG(cpu_percent) as avg_cpu,
               MAX(cpu_percent) as peak_cpu,
               MIN(start_time) as first_seen,
               MAX(end_time) as last_seen,
               category
        FROM activity_log
        WHERE app_name = ? AND start_time LIKE ? || '%'
    `).get(appName, dateStr) as any;

    if (!stats || stats.session_count === 0) return null;

    // Top window titles
    const titles = sqlite.prepare(`
        SELECT window_title,
               SUM(duration_seconds) as total_seconds,
               COUNT(*) as count
        FROM activity_log
        WHERE app_name = ? AND start_time LIKE ? || '%'
        GROUP BY window_title
        ORDER BY total_seconds DESC
        LIMIT 15
    `).all(appName, dateStr) as any[];

    // Resource snapshots
    const snapshots = sqlite.prepare(`
        SELECT timestamp, memory_mb, cpu_percent, num_threads
        FROM process_snapshots
        WHERE app_name = ? AND timestamp LIKE ? || '%'
        ORDER BY timestamp ASC
    `).all(appName, dateStr) as any[];

    return { ...stats, top_titles: titles, resource_timeline: snapshots };
}

export function getAppHistory(appName: string, days = 14) {
    const sqlite = getDb();
    return sqlite.prepare(`
        SELECT date, total_duration as total_seconds, launch_count as session_count, total_memory_avg_mb as avg_memory_mb, total_cpu_avg as avg_cpu
        FROM app_usage_history
        WHERE app_name = ?
        ORDER BY date DESC
        LIMIT ?
    `).all(appName, days) as any[];
}

export function getAllTrackedApps() {
    const sqlite = getDb();
    return sqlite.prepare(`
        SELECT app_name, SUM(total_duration) as total_seconds
        FROM app_usage_history
        GROUP BY app_name
        ORDER BY total_seconds DESC
    `).all() as any[];
}

export function getTopMemoryApps(targetDate?: string, limit = 10) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare(`
        SELECT app_name, AVG(memory_mb) as avg_memory_mb, MAX(memory_mb) as peak_memory_mb, COUNT(DISTINCT pid) as instance_count, AVG(cpu_percent) as avg_cpu
        FROM process_snapshots
        WHERE timestamp LIKE ? || '%'
        GROUP BY app_name
        ORDER BY avg_memory_mb DESC
        LIMIT ?
    `).all(dateStr, limit) as any[];
}

export function getTopCpuApps(targetDate?: string, limit = 10) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare(`
        SELECT app_name, AVG(cpu_percent) as avg_cpu, MAX(cpu_percent) as peak_cpu, AVG(memory_mb) as avg_memory_mb, COUNT(DISTINCT pid) as instance_count
        FROM process_snapshots
        WHERE timestamp LIKE ? || '%'
        GROUP BY app_name
        ORDER BY avg_cpu DESC
        LIMIT ?
    `).all(dateStr, limit) as any[];
}

export function getSnapshotCount(targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return (sqlite.prepare("SELECT COUNT(DISTINCT timestamp) as count FROM process_snapshots WHERE timestamp LIKE ? || '%'").get(dateStr) as any)?.count || 0;
}

export function querySearches(targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare(`SELECT * FROM search_history WHERE timestamp LIKE ? || '%' ORDER BY timestamp DESC`).all(dateStr) as any[];
}

export function queryBrowserUrls(targetDate?: string, limit = 50) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare(`SELECT * FROM browser_urls WHERE timestamp LIKE ? || '%' ORDER BY timestamp DESC LIMIT ?`).all(dateStr, limit) as any[];
}

export function getFocusStats() {
    const sqlite = getDb();
    return sqlite.prepare(`
        SELECT COUNT(*) as total_sessions, 
               COALESCE(SUM(actual_focus_seconds), 0) as total_focus_seconds,
               COALESCE(AVG(focus_score), 0) as avg_focus_score,
               COALESCE(SUM(interruption_count), 0) as total_interruptions,
               COALESCE(MAX(focus_score), 0) as best_score
        FROM focus_sessions
    `).get() as any;
}

export function getDomainBreakdown(targetDate?: string) {
    const sqlite = getDb();
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    return sqlite.prepare(`
        SELECT domain, COUNT(*) as visit_count, SUM(visit_duration) as total_duration
        FROM browser_urls
        WHERE timestamp LIKE ? || '%' AND domain != ''
        GROUP BY domain
        ORDER BY visit_count DESC
        LIMIT 30
    `).all(dateStr) as any[];
}

export function getProductivityHeatmapData(weeks = 52) {
    const sqlite = getDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (weeks * 7));
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const rows = sqlite.prepare(`
        SELECT date, total_seconds, productive_seconds
        FROM daily_stats
        WHERE date >= ?
        ORDER BY date ASC
    `).all(cutoffStr) as any[];

    return rows.map(r => ({
        ...r,
        score: r.total_seconds > 0 ? Math.round((r.productive_seconds / r.total_seconds) * 100) : 0
    }));
}

export function getStreakInfo() {
    const sqlite = getDb();
    const rows = sqlite.prepare(`
        SELECT date FROM daily_stats
        WHERE total_seconds > 0
        ORDER BY date ASC
    `).all() as any[];

    if (rows.length === 0) return { current_streak: 0, longest_streak: 0, total_days_tracked: 0 };

    const dates = rows.map(r => new Date(r.date));
    let longest = 1;
    let current = 1;

    for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 3600 * 24);
        if (Math.round(diff) === 1) {
            current++;
            longest = Math.max(longest, current);
        } else {
            current = 1;
        }
    }

    // Current streak (counting back from today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let curStreak = 0;
    const dateSet = new Set(rows.map(r => r.date));

    let check = new Date(today);
    while (dateSet.has(check.toISOString().split('T')[0])) {
        curStreak++;
        check.setDate(check.getDate() - 1);
    }

    return {
        current_streak: curStreak,
        longest_streak: longest,
        total_days_tracked: rows.length
    };
}

export function queryFocusSessions(targetDate?: string, limit = 20) {
    const sqlite = getDb();
    if (targetDate) {
        return sqlite.prepare(`
            SELECT * FROM focus_sessions
            WHERE date(start_time) = ?
            ORDER BY start_time DESC
            LIMIT ?
        `).all(targetDate, limit) as any[];
    }
    return sqlite.prepare(`
        SELECT * FROM focus_sessions
        ORDER BY start_time DESC
        LIMIT ?
    `).all(limit) as any[];
}
