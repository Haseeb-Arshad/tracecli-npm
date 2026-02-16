export const CATEGORIES = {
    DEVELOPMENT: "💻 Development",
    BROWSING: "🌐 Browsing",
    RESEARCH: "📚 Research",
    COMMUNICATION: "💬 Communication",
    PRODUCTIVITY: "📝 Productivity",
    DISTRACTION: "🎮 Distraction",
    OTHER: "❓ Other",
};

export const DEV_PROCESSES = new Set([
    "code.exe", "code - insiders.exe", "idea64.exe", "webstorm64.exe", "pycharm64.exe",
    "windowsterminal.exe", "powershell.exe", "cmd.exe", "wt.exe", "terminal.exe"
]);

export const BROWSER_PROCESSES = new Set([
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe", "arc.exe"
]);

export const COMMUNICATION_PROCESSES = new Set([
    "slack.exe", "discord.exe", "teams.exe", "zoom.exe", "skype.exe", "thunderbird.exe", "outlook.exe", "telegram.exe", "signal.exe"
]);

export const PRODUCTIVITY_PROCESSES = new Set([
    "winword.exe", "excel.exe", "powerpnt.exe", "onenote.exe", "notion.exe", "obsidian.exe", "typora.exe", "figma.exe", "acrobat.exe", "acrord32.exe"
]);

export const DISTRACTION_PROCESSES = new Set([
    "spotify.exe", "vlc.exe", "wmplayer.exe", "netflix.exe", "steam.exe", "epicgameslauncher.exe", "battle.net.exe", "tiktok.exe", "whatsapp.exe"
]);

const RESEARCH_PATTERNS = [
    /stack\s*overflow/i, /github\.com/i, /documentation/i, /\bdocs\b/i, /pypi\.org/i, /npmjs\.com/i, /chatgpt/i, /claude/i, /google\..*search/i
];

const DISTRACTION_PATTERNS = [
    /youtube/i, /netflix/i, /twitch\.tv/i, /\breddit\b/i, /twitter|x\.com/i, /facebook/i, /instagram/i, /discord/i
];

export function categorize(appName: string, windowTitle: string): string {
    const appLower = appName.toLowerCase();

    if (DEV_PROCESSES.has(appLower)) return CATEGORIES.DEVELOPMENT;

    if (BROWSER_PROCESSES.has(appLower)) {
        for (const pattern of DISTRACTION_PATTERNS) {
            if (pattern.test(windowTitle)) return CATEGORIES.DISTRACTION;
        }
        for (const pattern of RESEARCH_PATTERNS) {
            if (pattern.test(windowTitle)) return CATEGORIES.RESEARCH;
        }
        return CATEGORIES.BROWSING;
    }

    if (COMMUNICATION_PROCESSES.has(appLower)) return CATEGORIES.COMMUNICATION;
    if (PRODUCTIVITY_PROCESSES.has(appLower)) return CATEGORIES.PRODUCTIVITY;
    if (DISTRACTION_PROCESSES.has(appLower)) return CATEGORIES.DISTRACTION;

    return CATEGORIES.OTHER;
}

export const APP_ROLES: Record<string, string> = {
    "code.exe": "Text Editor & IDE (Visual Studio Code)",
    "chrome.exe": "Web Browser (Google Chrome)",
    "msedge.exe": "Web Browser (Microsoft Edge)",
    "firefox.exe": "Web Browser (Mozilla Firefox)",
    "slack.exe": "Team Messaging (Slack)",
    "discord.exe": "Chat & Voice (Discord)",
    "spotify.exe": "Music Streaming (Spotify)",
    "explorer.exe": "File Manager (Windows Explorer)",
    "taskmgr.exe": "System Monitor (Task Manager)",
    // Add more as needed or keep it generic
};

export function getAppRole(appName: string): string {
    const appLower = appName.toLowerCase().trim();
    if (APP_ROLES[appLower]) return APP_ROLES[appLower];

    if (DEV_PROCESSES.has(appLower)) return "Development Tool";
    if (BROWSER_PROCESSES.has(appLower)) return "Web Browser";
    if (COMMUNICATION_PROCESSES.has(appLower)) return "Communication App";
    if (PRODUCTIVITY_PROCESSES.has(appLower)) return "Productivity App";
    if (DISTRACTION_PROCESSES.has(appLower)) return "Entertainment / Media";

    return appLower.endsWith('.exe') ? "Application" : "Unknown Process";
}

export function isProductive(category: string): boolean {
    return [CATEGORIES.DEVELOPMENT, CATEGORIES.RESEARCH, CATEGORIES.PRODUCTIVITY].includes(category);
}

export function getCategoryEmoji(category: string): string {
    return category.split(' ')[0] || '❓';
}
