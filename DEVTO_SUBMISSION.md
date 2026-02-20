---
title: TraceCLI - The Terminal's Black Box for Your Digital Life
published: true
tags: devchallenge, githubchallenge, cli, githubcopilot
---

*This is a submission for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github-2026-01-21)*

## What I Built

**TraceCLI** is a professional-grade, privacy-first productivity monitor designed for anyone who wants complete visibility into their digital life. Whether you are a student, a professional, or someone looking to improve your daily digital habits, TraceCLI provides the data you need to take control of your time.

It runs silently in the background, capturing a precise, second-by-second timeline of your workflow—applications, window titles, CPU usage, and browser history—without ever sending a single byte of data to the cloud. The project features a beautified, friendly UI inside the terminal, making complex metrics accessible and easy to understand for everyone.

Key features include:

*   **Intelligent Browsing Tracking**: TraceCLI doesn't just see that you are in a browser; it understands *what* you are doing. It captures window titles and URLs to distinguish between reading documentation on MDN, performing research on Google, or idling on social media.
*   **AI-Powered Productivity Scoring**: Using sophisticated regex and optional AI relevance checks (Gemini/OpenAI), the system automatically categorizes your time. It calculates a "Productivity Score" based on your actual engagement with work-related apps vs. distractions.
*   **Advanced Context Locking**: A smart focus timer (`tracecli focus`) that "locks" into your work window. If you switch to a distraction app or even an unrelated browser tab, the system catches it immediately and warns you through a beautiful terminal dashboard.
*   **Seamless Auto-Start**: Starts automatically with your system (Windows), ensuring every second of your day is captured perfectly without any manual effort. It’s like having a flight recorder for your computer.
*   **Privacy-First Architecture**: All data is stored in a secure, local SQLite database. Your personal habits stay on your machine—no accounts, no cloud sync, no tracking.
*   **Friendly AI Assistant**: A proactive `ask` command that speaks your language. Ask things like *"How much time did I spend on social media today?"* or *"Give me a summary of my most productive hours,"* and get clear, human-centric answers with SQL-backed accuracy.
*   **System Resource Intelligence**: TraceCLI monitors CPU and RAM usage and ties it directly to the active application. See not just *that* your computer is slow, but *which* distraction or work app is hogging resources during your focus sessions.

### Why I Built It
I wanted a tool that could provide an honest, transparent account of where my digital time goes, without the complexity or privacy risks of modern tracking apps. I believed that everyone—not just technical users—should have access to their own data. TraceCLI was designed to be a "black box" for your digital life: an always-on observer that empowers you to improve your digital wellness through clear, keyboard-friendly metrics and intelligent AI coaching.

## The Secret Sauce: How it Works

### 🌐 Deep Browser Integration
TraceCLI bridges the gap between the OS and the web. By monitoring browser titles, it intelligently extracts search queries and identifies specific domains. It knows the difference between `github.com` (Work) and `youtube.com/shorts` (Distraction), and it updates your productivity metrics every second to keep your streaks accurate.

### 🧠 Intelligent Goal-Aware Focus
When you start a focus session with `tracecli focus --goal "Study Biology"`, the AI relevance engine kicks in. If you switch to a tab about "Quantum Physics," TraceCLI uses LLM reasoning to determine if it's relevant to your biology goal. If it's not, you'll see your "Focus Score" dip, providing immediate feedback to keep you in the flow.

### 📊 Beautiful Data Visualization
The terminal shouldn't be boring. TraceCLI uses high-fidelity TUI components to render GitHub-style heatmaps, live status bars, and detailed app-usage tables. It turns raw SQLite data into a premium-feeling "OS Dashboard."

## Demo

Here is TraceCLI in action:

**(Add a GIF or video here showcasing the live dashboard and friendly UI)**

### 1. The Daily Dashboard (`tracecli status`)
*A friendly, high-resolution overview of your day, showing app usage, CPU stats, and productivity scores at a glance.*

### 2. Consistency Heatmap (`tracecli heatmap`)
*Track your digital engagement over months with a simple, visual grid. High-density green squares represent your "Deep Work" peaks.*

### 3. Smart Focus Mode (`tracecli focus`)
*Active monitoring that helps you avoid "rabbit holes." TraceCLI locks to your workspace and provides real-time distraction alerts.*

### 4. Natural Language Insights (`tracecli ask`)
*Interact with your database using natural language. No technical knowledge required to ask, "Export my focus history for this week to a clean CSV."*

## My Experience with GitHub Copilot CLI

Building a tool that makes complex data "friendly" for everyone was made possible through collaboration with GitHub Copilot CLI.

### 1. Designing Inclusive Categorization
Accurately identifying "Productive" vs. "Distracting" apps for diverse users (not just developers) required nuanced rules. Copilot helped suggest broad, inclusive categorization logic that recognizes everything from academic research to creative software.

### 2. Creating a Beautiful CLI Experience
I wanted the terminal to feel like a premium app, not a daunting technical tool. Copilot was instrumental in generating the UI layouts—helping me position tables, panels, and colors to create a dashboard that is both professional and welcoming.

### 3. Simplified Data Interaction
Translating raw database rows into friendly, human answers was a core goal. Copilot assisted in building the "reasoning" prompt for the AI assistant, ensuring that when a user asks a question, the answer sounds like a helpful productivity coach.

### 4. Robust Windows Integration
To ensure the "Black Box" never misses a beat, I had to handle various Windows system events. Copilot provided the platform-specific expertise needed to make the background tracking reliable and invisible to the user.

## Repositories & Installation

TraceCLI is optimized for Windows users and is available in two specialized versions to suit your needs:

*   **Feature-Rich Version (Python)**: [github.com/Haseeb-Arshad/trace-cli](https://github.com/Haseeb-Arshad/trace-cli)
    *   *Includes the full visual dashboard, heatmaps, and background tracking.*
*   **Modern AI Edition (Node.js)**: [github.com/Haseeb-Arshad/tracecli-npm](https://github.com/Haseeb-Arshad/tracecli-npm)
    *   *Focused on the intelligent focus experience and natural language questions.*
    *   *Quick Install:* `npm install -g Haseeb-Arshad/tracecli-npm`

TraceCLI turns the terminal into a powerful ally for anyone looking to master their digital time. GitHub Copilot CLI was the perfect partner in making that vision a reality.
