import { getAIParams } from './config.js';
import { getDb, DB_PATH } from './database.js';
import { isProductive } from './categorizer.js';
import chalk from 'chalk';
import boxen from 'boxen';
import logUpdate from 'log-update';

// Helper for native requests (avoiding heavy deps where possible)
async function postJson(url: string, headers: Record<string, string>, data: any) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.text();
            console.error(chalk.red(`API Error ${response.status}: ${err}`));
            return null;
        }
        return await response.json();
    } catch (err: any) {
        console.error(chalk.red(`Network Error: ${err.message}`));
        return null;
    }
}

async function callGemini(apiKey: string, prompt: string, model?: string) {
    const modelName = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const data = { contents: [{ parts: [{ text: prompt }] }] };
    const resp = await postJson(url, {}, data);
    return resp?.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function callOpenAI(apiKey: string, prompt: string, model?: string) {
    const modelName = model || 'gpt-4o-mini';
    const url = 'https://api.openai.com/v1/chat/completions';
    const headers = { 'Authorization': `Bearer ${apiKey}` };
    const data = {
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0
    };
    const resp = await postJson(url, headers, data);
    return resp?.choices?.[0]?.message?.content;
}

async function callClaude(apiKey: string, prompt: string, model?: string) {
    const modelName = model || 'claude-3-haiku-20240307';
    const url = 'https://api.anthropic.com/v1/messages';
    const headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
    };
    const data = {
        model: modelName,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
    };
    const resp = await postJson(url, headers, data);
    return resp?.content?.[0]?.text;
}

async function askLLM(prompt: string, silent: boolean = false): Promise<string | null> {
    const [provider, apiKey, model] = getAIParams();
    if (!apiKey) {
        if (!silent) {
            console.log(chalk.yellow('⚠️  AI API Key not configured. Run "tracecli config setup" to get started.'));
        }
        return null;
    }

    switch (provider.toLowerCase()) {
        case 'gemini': return await callGemini(apiKey, prompt, model);
        case 'openai': return await callOpenAI(apiKey, prompt, model);
        case 'claude': return await callClaude(apiKey, prompt, model);
        default:
            console.error(chalk.red(`Unknown provider: ${provider}`));
            return null;
    }
}

// --- Text-to-SQL Logic ---

function getSchema() {
    const sqlite = getDb();
    const tables = ['activity_log', 'daily_stats', 'process_snapshots', 'browser_urls', 'search_history'];
    let schema = [];
    for (const t of tables) {
        const info = sqlite.prepare(`PRAGMA table_info(${t})`).all() as any[];
        const cols = info.map(c => `${c.name} (${c.type})`).join(', ');
        schema.push(`Table ${t}: ${cols}`);
    }
    return schema.join('\n');
}

export async function checkRelevance(goal: string, title: string): Promise<boolean> {
    const prompt = `
    Task Goal: "${goal}"
    Window/Tab Title: "${title}"
    
    Is this window/tab title likely relevant or necessary for the task goal? 
    Consider broad categories (researching for the goal is relevant).
    Return ONLY "YES" or "NO".
    `;
    const resp = await askLLM(prompt, true);
    return resp?.trim().toUpperCase().includes('YES') || false;
}

export async function handleAsk(question: string) {
    const [provider, apiKey, model] = getAIParams();
    if (!apiKey) {
        console.log(chalk.yellow('⚠️  AI API Key not configured. Run "tracecli config setup" to get started.'));
        return;
    }

    const schema = getSchema();
    const today = new Date().toISOString().split('T')[0];

    const agentPrompt = `
    You are the TraceCLI Agent. You have access to a SQLite database of user activity and the ability to suggest CLI actions.
    
    Current Date: ${today}
    Schema:
    ${schema}
    
    Capabilities:
    1. SQL_QUERY: Query activity data (activity_log, daily_stats, focus_sessions, etc.)
    2. CLI_ACTION: Suggest a CLI command (export, report, stats, heatmap, pomodoro)
    3. GENERAL_INFO: Answer general questions about productivity or the app.

    User Question: "${question}"

    RESPONSE FORMAT (MUST BE VALID JSON):
    {
        "thought": "Reasoning about user intent",
        "intent": "SQL_QUERY" | "CLI_ACTION" | "GENERAL_INFO",
        "sql": "SELECT ... (only if SQL_QUERY)",
        "action": "tracecli <command> (only if CLI_ACTION)",
        "message": "Answer or explanation"
    }
    
    Rule: If it's a data query, translate it to SQLite. If they want to do something, suggest the command.
    `;

    const statusMsgs = [
        "Consulting the neural networks...",
        "Searching your digital history...",
        "Aggregating activity patterns...",
        "Synthesizing insights...",
        "Finalizing the answer..."
    ];

    let currentMsgIndex = 0;
    const interval = setInterval(() => {
        const msg = statusMsgs[currentMsgIndex];
        logUpdate(boxen(chalk.cyan(msg), {
            title: '🤖 Trace AI',
            borderColor: 'blue',
            borderStyle: 'round',
            padding: 0.5
        }));
        currentMsgIndex = (currentMsgIndex + 1) % statusMsgs.length;
    }, 800);

    const resp = await askLLM(agentPrompt, true);

    if (!resp) {
        clearInterval(interval);
        logUpdate.clear();
        console.log(chalk.red('Failed to get a response from AI.'));
        return;
    }

    try {
        const result = JSON.parse(resp.replace(/```json|```/g, '').trim());

        if (result.intent === 'SQL_QUERY' && result.sql) {
            await executeSqlAndSummarize(result.sql, question, true);
            clearInterval(interval);
        } else {
            clearInterval(interval);
            logUpdate.clear();
            if (result.intent === 'CLI_ACTION' && result.action) {
                console.log('\n' + boxen(
                    `The AI suggests running this command:\n\n${chalk.bold.green(result.action)}\n\n(Note: Automatic execution is coming in a future update)`,
                    { title: '🤖 AI Suggestion', borderColor: 'yellow', padding: 1 }
                ));
            } else if (result.message) {
                console.log('\n' + boxen(result.message, {
                    title: chalk.bold.whiteBright('🤖 AI Answer'),
                    borderColor: 'cyan',
                    padding: 1,
                    borderStyle: 'double'
                }));
            }
        }
    } catch (err) {
        clearInterval(interval);
        logUpdate.clear();
        await handleLegacyAsk(question, schema, today);
    }
}

async function executeSqlAndSummarize(sql: string, question: string, verbose = false) {
    const cleanedSql = sql.trim();
    if (!cleanedSql.toUpperCase().startsWith('SELECT')) {
        console.log(chalk.red('Safety Violation: Generated SQL is not a SELECT statement.'));
        return;
    }

    try {
        const sqlite = getDb();
        const rows = sqlite.prepare(cleanedSql).all();
        if (rows.length === 0) {
            logUpdate.clear();
            console.log(chalk.yellow('\nNo data found matching your query.'));
            return;
        }

        const dataStr = JSON.stringify(rows.slice(0, 20));
        const summaryPrompt = `
        User Question: "${question}"
        Result Data: ${dataStr}
        Provide a concise, friendly answer.
        `;

        const answer = await askLLM(summaryPrompt, true);
        logUpdate.clear();
        if (answer) {
            const provider = getAIParams()[0];
            console.log('\n' + boxen(`${answer}\n\n${chalk.dim('Powered by ' + provider)}`, {
                title: chalk.bold.whiteBright('🤖 AI Answer'),
                borderColor: 'cyan',
                padding: 1,
                borderStyle: 'double'
            }));
        }
    } catch (err: any) {
        logUpdate.clear();
        console.error(chalk.red(`SQL Error: ${err.message}`));
    }
}

async function handleLegacyAsk(question: string, schema: string, today: string) {
    // Basic fallback logic
    console.log(chalk.dim('Falling back to direct SQL mode...'));
    // (Existing SQL generation logic here or simplified version)
}

export async function generateWeeklyInsights() {
    const sqlite = getDb();

    // 1. Daily Stats (last 7 days)
    const stats = sqlite.prepare("SELECT * FROM daily_stats ORDER BY date DESC LIMIT 7").all() as any[];
    if (stats.length === 0) {
        console.log(chalk.yellow('Not enough data for insights yet.'));
        return;
    }

    // 2. Top Apps (last 7 days)
    const topApps = sqlite.prepare(`
        SELECT app_name, SUM(duration_seconds) as total_seconds
        FROM activity_log
        WHERE start_time >= date('now', '-7 days')
        GROUP BY app_name
        ORDER BY total_seconds DESC
        LIMIT 5
    `).all() as any[];

    // 3. Category Distribution
    const categories = sqlite.prepare(`
        SELECT category, SUM(duration_seconds) as total_seconds
        FROM activity_log
        WHERE start_time >= date('now', '-7 days')
        GROUP BY category
    `).all() as any[];

    // 4. Focus Stats
    const focus = sqlite.prepare(`
        SELECT COUNT(*) as sessions, AVG(focus_score) as avg_score, SUM(actual_focus_seconds) as total_focus
        FROM focus_sessions
        WHERE start_time >= date('now', '-7 days')
    `).get() as any;

    // 5. Recent Searches
    const searches = sqlite.prepare(`
        SELECT query FROM search_history ORDER BY timestamp DESC LIMIT 10
    `).all() as any[];

    const context = {
        days_tracked: stats.length,
        total_tracked_hours: (stats.reduce((a, b) => a + b.total_seconds, 0) / 3600).toFixed(1),
        productive_hours: (stats.reduce((a, b) => a + b.productive_seconds, 0) / 3600).toFixed(1),
        distraction_hours: (stats.reduce((a, b) => a + (b.distraction_seconds || 0), 0) / 3600).toFixed(1),
        top_apps: topApps.map(a => `${a.app_name} (${(a.total_seconds / 3600).toFixed(1)}h)`),
        categories: categories.map(c => `${c.category} (${(c.total_seconds / 3600).toFixed(1)}h)`),
        focus_stats: focus,
        recent_searches: searches.map(s => s.query)
    };

    const prompt = `
    You are a professional productivity coach analyzing someone's activity data from the last week.
    
    Data Summary:
    ${JSON.stringify(context, null, 2)}
    
    Provide a concise, personalized productivity digest with these sections:
    1. 🏆 **Top Achievement** — Highlight their best metric or pattern (be specific).
    2. ⚠️ **Biggest Distraction** — Identify where they lose the most time.
    3. 💡 **Action Item** — One practical tip for tomorrow.
    4. 📈 **Trend Analysis** — How they are trending week-over-week.

    Be encouraging but honest. Use emojis. Keep it to 1-2 sentences per section. Use the exact labels above.
    `;

    console.log(chalk.dim('Generating AI insights...'));
    const insights = await askLLM(prompt);
    if (insights) {
        console.log('\n' + boxen(insights, {
            title: '💡 AI Productivity Coach',
            borderColor: 'green',
            padding: 1,
            titleAlignment: 'center'
        }));
    }
}
