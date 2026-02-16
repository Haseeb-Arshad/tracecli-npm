import path from 'path';
import os from 'os';
import fs from 'fs';

const CONFIG_DIR = path.join(os.homedir(), '.tracecli');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const RULES_PATH = path.join(CONFIG_DIR, 'user_rules.json');

export interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
}

export interface UserRules {
    productive_processes: string[];
    distraction_processes: string[];
    productive_keywords: string[];
    distraction_keywords: string[];
}

const DEFAULT_CONFIG: AIConfig = {
    provider: 'gemini',
    apiKey: '',
    model: ''
};

const DEFAULT_RULES: UserRules = {
    productive_processes: [],
    distraction_processes: [],
    productive_keywords: [],
    distraction_keywords: []
};

function ensureDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

export function loadConfig(): AIConfig {
    ensureDir();
    if (!fs.existsSync(CONFIG_PATH)) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4));
        return DEFAULT_CONFIG;
    }
    try {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        return { ...DEFAULT_CONFIG, ...data };
    } catch {
        return DEFAULT_CONFIG;
    }
}

export function saveConfig(cfg: Partial<AIConfig>) {
    const current = loadConfig();
    const updated = { ...current, ...cfg };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 4));
}

export function loadRules(): UserRules {
    ensureDir();
    if (!fs.existsSync(RULES_PATH)) {
        return DEFAULT_RULES;
    }
    try {
        const data = JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
        return { ...DEFAULT_RULES, ...data };
    } catch {
        return DEFAULT_RULES;
    }
}

export function saveRules(rules: UserRules) {
    ensureDir();
    fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 4));
}

export function getAIParams(): [string, string, string] {
    const cfg = loadConfig();
    return [cfg.provider, cfg.apiKey, cfg.model];
}
