const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { log } = require('./utils');

class BrowserManager {
    constructor(option = {}) {
        // Path where Chrome session cookies & login data will be saved
        this.userDataDir = option.userDataDir || path.join(process.cwd(), 'user_data', 'chrome_profile');
        this.context = null;
        this.page = null;
        this.isTaskRunning = false;
        this.isLoginInProgress = false;
        this.abortRequested = false;

        // Create user data directory if it doesn't exist yet
        if (!fs.existsSync(this.userDataDir)) {
            fs.mkdirSync(this.userDataDir, { recursive: true });
        }
    }

    // Detect system browser (Chrome or Edge) for Windows
    getSystemBrowserPath() {
        const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        const chromePathUser = path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe');
        const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
        
        if (fs.existsSync(chromePath)) return { path: chromePath, name: 'Google Chrome (Program Files)' };
        if (fs.existsSync(chromePathUser)) return { path: chromePathUser, name: 'Google Chrome (LocalAppData)' };
        if (fs.existsSync(edgePath)) return { path: edgePath, name: 'Microsoft Edge' };
        return { path: undefined, name: 'Bundled Chromium' };
    }

    // Clean stale profile locks if previous session was killed
    cleanStaleLocks(onLog) {
        try {
            const lockFilePath = path.join(this.userDataDir, 'lockfile');
            const singletonLockPath = path.join(this.userDataDir, 'SingletonLock');
            const singletonSocketPath = path.join(this.userDataDir, 'SingletonSocket');
            const singletonCookiePath = path.join(this.userDataDir, 'SingletonCookie');

            [lockFilePath, singletonLockPath, singletonSocketPath, singletonCookiePath].forEach((file) => {
                if (fs.existsSync(file)) {
                    try {
                        fs.unlinkSync(file);
                        log(onLog, `Removed stale profile lock: ${path.basename(file)}`, 'info');
                    } catch (e) {
                        // In use
                    }
                }
            });
        } catch (err) {
            log(onLog, `Warning while cleaning locks: ${err.message}`, 'warn');
        }
    }

    // Initialize Playwright Browser Context with persistent profile
    async initContext({ headless = true, onLog } = {}) {
        if (this.context) {
            try {
                await this.context.close();
            } catch (e) {
                log(onLog, `Note closing previous context: ${e.message}`, 'info');
            }
            this.context = null;
            this.page = null;
        }

        this.cleanStaleLocks(onLog);

        const browserInfo = this.getSystemBrowserPath();
        log(onLog, `Selected browser engine: ${browserInfo.name} (${headless ? 'Headless Background' : 'Visible Window'})`, 'info');

        try {
            // Launch Chromium / Chrome with persistent profile data directory
            this.context = await chromium.launchPersistentContext(this.userDataDir, {
                headless,
                executablePath: browserInfo.path,
                viewport: headless ? { width: 1280, height: 800 } : null,
                args: [
                    '--disable-notifications',
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--start-maximized',
                    '--no-default-browser-check'
                ]
            });

            this.context.on('close', () => {
                log(onLog, 'Browser context closed event triggered.', 'info');
            });

            const pages = this.context.pages();
            this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

            this.page.on('crash', () => {
                log(onLog, 'CRITICAL: Browser page crashed.', 'error');
            });

            // Hide navigator.webdriver flag to bypass simple anti-bot checks
            await this.page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            log(onLog, 'Browser initialized successfully.', 'success');
        } catch (err) {
            const errorMsg = `Failed to launch browser [${browserInfo.name}]: ${err.message}`;
            log(onLog, errorMsg, 'error');
            if (err.stack) {
                console.error(err.stack);
            }
            throw new Error(errorMsg);
        }
    }

    // Close Browser Context
    async closeContext(onLog) {
        if (this.isLoginInProgress) {
            log(onLog, 'Preserving open browser context because login is in progress.', 'info');
            return;
        }
        if (this.context) {
            try {
                await this.context.close();
                log(onLog, 'Browser context closed.', 'info');
            } catch (e) {
                log(onLog, `Error closing context: ${e.message}`, 'warn');
            }
            this.context = null;
            this.page = null;
        }
    }
}

module.exports = BrowserManager;
