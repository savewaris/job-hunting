const { log, sleep } = require('./utils');
const fs = require('fs');
const path = require('path');

const SESSION_FILE_PATH = path.join(process.cwd(), '.facebook_session.json');
const COOKIES_EXPORT_PATH = path.join(process.cwd(), 'facebook_cookies.json');

class AuthManager {
    constructor(browserManager) {
        this.bm = browserManager;
    }

    // Check if Facebook session is currently authenticated
    async checkAuthStatus(onLog) {
        if (this.bm.isLoginInProgress) {
            log(onLog, 'Status check skipped because login window is active.', 'info');
            return {
                isLoggedIn: false,
                isLoginInProgress: true,
                message: 'Login window is currently active. Waiting for user login...'
            };
        }

        let tempContext = false;
        try {
            if (!this.bm.context) {
                log(onLog, 'Initializing headless browser for session verification...');
                await this.bm.initContext({ headless: true, onLog });
                tempContext = true;
            }

            log(onLog, 'Navigating to https://www.facebook.com/ to check session...');
            const response = await this.bm.page.goto('https://www.facebook.com/', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            log(onLog, `Facebook home response status: ${response ? response.status() : 'N/A'}`);
            await sleep(2500);

            const currentUrl = this.bm.page.url();
            log(onLog, `Current Page URL: ${currentUrl}`);

            const loginEmailInput = await this.bm.page.$('input[name="email"], input[id="email"]');
            const isLoggedOut = !!loginEmailInput || currentUrl.includes('/login');

            let userId = null;
            let profileUrl = null;
            let accountName = null;
            let username = null;
            let avatarUrl = null;
            let cookies = [];

            if (!isLoggedOut) {
                cookies = await this.bm.context.cookies('https://www.facebook.com');
                const cUserCookie = cookies.find(c => c.name === 'c_user');
                if (cUserCookie) {
                    userId = cUserCookie.value;
                    log(onLog, `Found c_user session cookie: ${userId}`, 'success');
                }

                try {
                    log(onLog, 'Navigating to https://www.facebook.com/me for profile details...');
                    await this.bm.page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 15000 });
                    profileUrl = this.bm.page.url();
                    
                    if (profileUrl.includes('facebook.com/')) {
                        const handle = profileUrl.split('facebook.com/')[1]?.split('?')[0]?.replace(/\/$/, '');
                        if (handle && !handle.includes('profile.php')) {
                            username = '@' + handle;
                            const cleanParts = handle.replace(/\.\d+$/, '').split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1));
                            accountName = cleanParts.join(' ');
                        }
                    }

                    const title = await this.bm.page.title();
                    if (!accountName && title && title !== 'Facebook' && !title.includes('Chats')) {
                        accountName = title.replace(/\s*\|.*$/, '').replace(/^\(\d+\)\s*/, '').trim();
                    }

                    // Extract Avatar Image URL
                    const avatarImgs = await this.bm.page.$$('svg image, img[alt*="profile"], img[alt*="Profile"], img[src*="scontent"]');
                    for (const img of avatarImgs) {
                        const src = await img.getAttribute('src').catch(() => null) || await img.getAttribute('xlink:href').catch(() => null);
                        if (src && src.includes('scontent')) {
                            avatarUrl = src;
                            break;
                        }
                    }
                } catch (e) {
                    log(onLog, `Profile metadata extraction warning: ${e.message}`, 'warn');
                    profileUrl = userId ? `https://www.facebook.com/profile.php?id=${userId}` : 'https://www.facebook.com/me';
                }

                // Save cookies to files
                if (cookies.length > 0) {
                    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify({ lastUpdated: new Date().toISOString(), cookies }, null, 2), 'utf-8');
                    fs.writeFileSync(COOKIES_EXPORT_PATH, JSON.stringify(cookies, null, 2), 'utf-8');
                    log(onLog, `Persisted ${cookies.length} session cookies to disk (.facebook_session.json).`, 'success');
                }
            }

            const status = {
                isLoggedIn: !isLoggedOut,
                fullName: accountName || (userId ? `Facebook User` : null),
                username: username || (userId ? `@user_${userId}` : null),
                userId,
                profileUrl: profileUrl || `https://www.facebook.com/profile.php?id=${userId}`,
                avatarUrl: avatarUrl || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
                currentUrl,
                cookieCount: cookies.length,
                cookies: cookies.map(c => ({ name: c.name, domain: c.domain, path: c.path, expires: c.expires })),
                userDataDir: this.bm.userDataDir
            };

            if (!isLoggedOut) {
                log(onLog, `Facebook session ACTIVE: ${status.fullName} (${status.username} | ID: ${userId})`, 'success');
            } else {
                log(onLog, 'Facebook session is NOT logged in. Click "Launch Chrome Login Window" to log in.', 'warn');
            }
            return status;
        } catch (err) {
            log(onLog, `Error checking auth status: ${err.message}`, 'error');
            return { isLoggedIn: false, error: err.message };
        } finally {
            if (tempContext && !this.bm.isLoginInProgress) {
                await this.bm.closeContext(onLog);
            }
        }
    }

    // Launch a visible browser window for one-time manual user login
    async launchLoginBrowser(onLog) {
        if (this.bm.isLoginInProgress) {
            log(onLog, 'Login browser window is already open. Please complete login in the opened window.', 'warn');
            return { success: true, message: 'Login window is already active on your screen.' };
        }

        this.bm.isLoginInProgress = true;
        log(onLog, 'Starting visible Chrome window launch procedure...', 'info');

        try {
            await this.bm.initContext({ headless: false, onLog });

            log(onLog, 'Navigating visible browser to https://www.facebook.com/...', 'info');
            await this.bm.page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            log(onLog, 'Please log into Facebook in the opened browser window.', 'important');

            return new Promise((resolve) => {
                const checkInterval = setInterval(async () => {
                    try {
                        if (!this.bm.context || this.bm.page.isClosed()) {
                            clearInterval(checkInterval);
                            this.bm.isLoginInProgress = false;
                            log(onLog, 'Login browser window closed by user.', 'info');
                            resolve({ success: true, message: 'Browser session saved successfully.' });
                        } else {
                            const cookies = await this.bm.context.cookies('https://www.facebook.com').catch(() => []);
                            const hasAuthCookie = cookies.some(c => c.name === 'c_user' || c.name === 'xs');

                            if (hasAuthCookie) {
                                const cUser = cookies.find(c => c.name === 'c_user');
                                log(onLog, `Login detected! Authenticated as User ID: ${cUser ? cUser.value : 'Detected'}`, 'success');
                                
                                fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify({ lastUpdated: new Date().toISOString(), cookies }, null, 2), 'utf-8');
                                fs.writeFileSync(COOKIES_EXPORT_PATH, JSON.stringify(cookies, null, 2), 'utf-8');
                                log(onLog, 'Session cookies saved to .facebook_session.json and profile!', 'success');
                            }
                        }
                    } catch (e) {
                        clearInterval(checkInterval);
                        this.bm.isLoginInProgress = false;
                        log(onLog, `Session listener finished: ${e.message}`, 'info');
                        resolve({ success: true, message: 'Session setup finished.' });
                    }
                }, 2500);
            });
        } catch (err) {
            this.bm.isLoginInProgress = false;
            const fullError = `Failed to launch login window: ${err.message}`;
            log(onLog, fullError, 'error');
            return { success: false, error: fullError };
        }
    }
}

module.exports = AuthManager;
