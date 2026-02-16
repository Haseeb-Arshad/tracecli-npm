import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';

const DATA_DIR = path.join(os.homedir(), '.tracecli');
const VBS_PATH = path.join(DATA_DIR, 'silent_start.vbs');
const REG_KEY_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const REG_VALUE_NAME = 'TraceCLI';

function getTraceCLIPath(): string {
    try {
        // Find the absolute path to tracecli
        const which = os.platform() === 'win32' ? 'where.exe' : 'which';
        const output = execSync(`${which} tracecli`).toString().split('\n')[0].trim();
        return output;
    } catch {
        return 'tracecli';
    }
}

function getVBSContent(tracecliPath: string) {
    return `' TraceCLI Silent Launcher
' Launches tracecli start in background with no visible console window.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${tracecliPath}"" start", 0, False
Set WshShell = Nothing
`;
}

export function isAutostartEnabled(): boolean {
    if (os.platform() !== 'win32') return false;
    try {
        const output = execSync(`reg query "${REG_KEY_PATH}" /v ${REG_VALUE_NAME}`, { stdio: 'pipe' }).toString();
        return output.includes(REG_VALUE_NAME);
    } catch {
        return false;
    }
}

export function enableAutostart(): { success: boolean, message: string } {
    if (os.platform() !== 'win32') {
        return { success: false, message: 'Autostart is only supported on Windows.' };
    }

    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const tracecliPath = getTraceCLIPath();
        const vbsContent = getVBSContent(tracecliPath);

        // Write VBS
        fs.writeFileSync(VBS_PATH, vbsContent);

        // Set Registry Key
        execSync(`reg add "${REG_KEY_PATH}" /v ${REG_VALUE_NAME} /t REG_SZ /d "wscript.exe \\"${VBS_PATH}\\"" /f`);

        return {
            success: true,
            message: `Auto-start enabled!\n  Registry: ${REG_KEY_PATH}\\${REG_VALUE_NAME}\n  Script: ${VBS_PATH}`
        };
    } catch (err: any) {
        return { success: false, message: `Failed to enable autostart: ${err.message}` };
    }
}

export function disableAutostart(): { success: boolean, message: string } {
    if (os.platform() !== 'win32') return { success: false, message: 'Autostart is only supported on Windows.' };

    try {
        // Delete Registry Key
        try {
            execSync(`reg delete "${REG_KEY_PATH}" /v ${REG_VALUE_NAME} /f`, { stdio: 'pipe' });
        } catch { }

        // Delete VBS
        if (fs.existsSync(VBS_PATH)) {
            fs.unlinkSync(VBS_PATH);
        }

        return { success: true, message: 'Auto-start disabled.' };
    } catch (err: any) {
        return { success: false, message: `Failed to disable autostart: ${err.message}` };
    }
}

export function launchInBackground() {
    if (os.platform() !== 'win32') {
        console.log('Background mode is only supported on Windows.');
        return;
    }

    if (!fs.existsSync(VBS_PATH)) {
        enableAutostart();
    }

    console.log('🚀 Launching TraceCLI in background...');
    try {
        // Use wscript to run the VBS (which runs tracecli start)
        spawn('wscript.exe', [VBS_PATH], {
            detached: true,
            stdio: 'ignore'
        }).unref();

        console.log('Process started! You can now close this terminal.');
        console.log("Use 'tracecli report' or 'tracecli' to verify activity.");
    } catch (err: any) {
        console.log(`Failed to launch background process: ${err.message}`);
    }
}
