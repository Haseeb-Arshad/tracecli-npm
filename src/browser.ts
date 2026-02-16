import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

export interface BrowserSearch {
    timestamp: string;
    browser: string;
    query: string;
    url: string;
    source: string;
}

export interface BrowserUrl {
    timestamp: string;
    browser: string;
    url: string;
    title: string;
    visit_duration: number;
    domain: string;
}

const BROWSER_PATHS = {
    "Chrome": path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default", "History"),
    "Edge": path.join(os.homedir(), "AppData", "Local", "Microsoft", "Edge", "User Data", "Default", "History"),
    "Brave": path.join(os.homedir(), "AppData", "Local", "BraveSoftware", "Brave-Browser", "User Data", "Default", "History")
};

const SEARCH_PATTERNS = [
    { name: "Google", pattern: /google\..*[\?&]q=([^&]+)/i },
    { name: "Bing", pattern: /bing\.com.*[\?&]q=([^&]+)/i },
    { name: "YouTube", pattern: /youtube\.com\/results.*[\?&]search_query=([^&]+)/i },
    { name: "DuckDuckGo", pattern: /duckduckgo\.com.*[\?&]q=([^&]+)/i },
    { name: "GitHub", pattern: /github\.com\/search.*[\?&]q=([^&]+)/i },
    { name: "StackOverflow", pattern: /stackoverflow\.com\/search.*[\?&]q=([^&]+)/i }
];

function chromeTimeToIso(chromeTimestamp: number): string {
    // Chrome timestamp: microseconds since 1601-01-01
    const msSince1601 = chromeTimestamp / 1000;
    const msSince1970 = msSince1601 - 11644473600000;
    return new Date(msSince1970).toISOString();
}

function parseSearch(url: string): { query: string, source: string } | null {
    for (const engine of SEARCH_PATTERNS) {
        const match = url.match(engine.pattern);
        if (match) {
            try {
                const query = decodeURIComponent(match[1].replace(/\+/g, ' '));
                if (query.trim()) return { query, source: engine.name };
            } catch { /* ignore decode errors */ }
        }
    }
    return null;
}

export function extractSearches(sinceMinutes: number = 60): BrowserSearch[] {
    const results: BrowserSearch[] = [];
    const tmpDir = path.join(os.tmpdir(), `tracecli_browser_${Date.now()}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    for (const [name, historyPath] of Object.entries(BROWSER_PATHS)) {
        if (!fs.existsSync(historyPath)) continue;

        const tmpDb = path.join(tmpDir, `${name}_History`);
        try {
            fs.copyFileSync(historyPath, tmpDb);
            const db = new Database(tmpDb, { readonly: true });

            const cutoff = (Date.now() + 11644473600000) * 1000 - (sinceMinutes * 60 * 1000 * 1000);

            const rows = db.prepare(`
                SELECT url, title, last_visit_time 
                FROM urls 
                WHERE last_visit_time > ? 
                ORDER BY last_visit_time DESC 
                LIMIT 500
            `).all(cutoff) as any[];

            for (const row of rows) {
                const parsed = parseSearch(row.url);
                if (parsed) {
                    results.push({
                        timestamp: chromeTimeToIso(row.last_visit_time),
                        browser: name,
                        query: parsed.query,
                        url: row.url,
                        source: parsed.source
                    });
                }
            }
            db.close();
        } catch (e) {
            // console.error(`Failed to extract from ${name}:`, e);
        }
    }

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    return results;
}

export function extractFullHistory(sinceMinutes: number = 60): BrowserUrl[] {
    const results: BrowserUrl[] = [];
    const tmpDir = path.join(os.tmpdir(), `tracecli_urls_${Date.now()}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    for (const [name, historyPath] of Object.entries(BROWSER_PATHS)) {
        if (!fs.existsSync(historyPath)) continue;

        const tmpDb = path.join(tmpDir, `${name}_History`);
        try {
            fs.copyFileSync(historyPath, tmpDb);
            const db = new Database(tmpDb, { readonly: true });

            const cutoff = (Date.now() + 11644473600000) * 1000 - (sinceMinutes * 60 * 1000 * 1000);

            const rows = db.prepare(`
                SELECT url, title, last_visit_time 
                FROM urls 
                WHERE last_visit_time > ? 
                ORDER BY last_visit_time DESC 
                LIMIT 1000
            `).all(cutoff) as any[];

            for (const row of rows) {
                if (row.url.startsWith('chrome://') || row.url.startsWith('edge://') || row.url.startsWith('about:')) continue;

                let domain = '';
                try { domain = new URL(row.url).hostname.replace('www.', ''); } catch { }

                results.push({
                    timestamp: chromeTimeToIso(row.last_visit_time),
                    browser: name,
                    url: row.url,
                    title: row.title || '',
                    visit_duration: 0,
                    domain: domain
                });
            }
            db.close();
        } catch (e) { }
    }

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    return results;
}

export function extractSearchFromTitle(windowTitle: string, appName: string): Partial<BrowserSearch> | null {
    const appLower = appName.toLowerCase();
    if (!['chrome.exe', 'msedge.exe', 'brave.exe', 'firefox.exe'].includes(appLower)) return null;

    const enginePatterns = [
        { pattern: /(.+?) - Google Search/i, source: "Google" },
        { pattern: /(.+?) - Bing/i, source: "Bing" },
        { pattern: /(.+?) - Search/i, source: "Search" }
    ];

    for (const ep of enginePatterns) {
        const match = windowTitle.match(ep.pattern);
        if (match) {
            return {
                timestamp: new Date().toISOString(),
                browser: appName.split('.')[0],
                query: match[1].trim(),
                url: '',
                source: ep.source
            };
        }
    }
    return null;
}
