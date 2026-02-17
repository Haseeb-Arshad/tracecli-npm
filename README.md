# TraceCLI

A privacy-first, local-only activity tracker and productivity assistant for developers. TraceCLI runs in your terminal, monitoring your active window to provide detailed insights into your work habits without ever sending your data to the cloud.

## Features

- **Privacy-First Architecture**: All activity data is stored locally in a SQLite database on your machine. No data is ever uploaded to external servers.
- **Contextual Focus Mode**: A smart focus timer that locks to your specific work context (e.g., a specific project in VS Code or a documentation page in Chrome). Switching to unrelated applications or browser tabs is flagged as a distraction.
- **Agentic AI Assistant**: Use the `ask` command to query your data in natural language or request productivity actions. The AI runs locally aware (via API) but respects your data privacy by only processing the necessary context.
- **Pomodoro Timer**: Integrated Pomodoro technique support with customizable work/break intervals and strict distraction blocking.
- **Browser Insights**: Automatically extracts and categorizes search queries and specific documentation pages to distinguish between "Research" and "Distraction".

## Installation

### From NPM (Recommended)

*Note: Once the package is available on the registry.*

```bash
npm install -g tracecli
```

### From GitHub

You can install the latest version directly from the GitHub repository:

```bash
npm install -g Haseeb-Arshad/tracecli-npm
```

### Local Installation (For Developers)

If you have the repository cloned locally, you can use `npm link` to make the `tracecli` command available globally:

1.  Navigate to the project directory:
    ```bash
    cd trace-cli-node
    ```
2.  Install dependencies and build:
    ```bash
    npm install
    npm run build
    ```
3.  Link the package:
    ```bash
    npm link
    ```

After linking, you can use the `tracecli` command anywhere in your terminal.

## Quick Start

1.  **Start the background tracker**:
    ```bash
    tracecli start
    ```
    This will launch the daemon process that monitors your active window.

2.  **View your status**:
    ```bash
    tracecli status
    ```

3.  **Generate a daily report**:
    ```bash
    tracecli report
    ```

## Usage

### Activity Tracking

-   `tracecli start` - Start the background tracking daemon.
-   `tracecli stop` - Stop the background tracker.
-   `tracecli status` - Check if the tracker is running and view current session stats.

### Productivity & Focus

-   `tracecli focus <minutes> --goal "Your Goal"`
    Starts a focus session. The system will lock to your current application (Context Lock). If you switch to an unrelated app or website, it will be recorded as a distraction.
    
    *Example:* `tracecli focus 45 --goal "Refactoring API"`

-   `tracecli pomodoro`
    Starts a standard Pomodoro timer (25 minutes work, 5 minutes break). Cycles automatically.

### Data & Insights

-   `tracecli report`
    Shows a summary of today's activity, including top apps, categories, and productivity score.

-   `tracecli report --date YYYY-MM-DD`
    View a report for a specific date.

-   `tracecli export`
    Export your activity data to a CSV or JSON file for external analysis.

### AI Assistant

-   `tracecli ask "Question"`
    Ask natural language questions about your productivity or request actions.
    
    *Examples:*
    - "How much time did I spend on VS Code yesterday?"
    - "What were my top distractions this week?"
    - "Export my focus sessions to CSV."

-   `tracecli config setup`
    Configure your AI provider (Gemini, OpenAI, or Claude) and API key. This is required for the `ask` command and advanced distraction detection in Focus Mode.

## Configuration

TraceCLI stores its configuration and database in your home directory under `.tracecli`.

-   **Database**: `~/.tracecli/trace_data.db` (SQLite)
-   **Config**: `~/.tracecli/config.json`

## Development

To build and run TraceCLI locally:

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the project:
    ```bash
    npm run build
    ```
4.  Run the CLI:
    ```bash
    node dist/index.js <command>
    ```

## License

MIT License. See [LICENSE](LICENSE) for details.