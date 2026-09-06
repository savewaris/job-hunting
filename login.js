const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
    console.log('========================================================');
    console.log('  Facebook Interactive Terminal Login');
    console.log('========================================================');

    const userDataDir = path.join(process.cwd(), 'user_data', 'chrome_profile');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const executablePath = fs.existsSync(chromePath) ? chromePath : (fs.existsSync(edgePath) ? edgePath : undefined);

    console.log(`Launching browser: ${executablePath || 'Bundled Chromium'}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        executablePath,
        args: ['--disable-notifications', '--start-maximized']
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    console.log('Navigating to https://www.facebook.com/...');
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
    console.log('>>> Please log into Facebook in the opened browser window.');

    const checkInterval = setInterval(async () => {
        try {
            if (page.isClosed()) {
                clearInterval(checkInterval);
                console.log('Browser closed. Saving session...');
                process.exit(0);
            }

            const cookies = await context.cookies('https://www.facebook.com');
            const cUser = cookies.find(c => c.name === 'c_user');

            if (cUser) {
                console.log(`✓ Authentication detected! Logged in as User ID: ${cUser.value}`);
                fs.writeFileSync('.facebook_session.json', JSON.stringify({ lastUpdated: new Date().toISOString(), cookies }, null, 2), 'utf-8');
                fs.writeFileSync('facebook_cookies.json', JSON.stringify(cookies, null, 2), 'utf-8');
                console.log('✓ Cookies saved to .facebook_session.json and facebook_cookies.json!');
            }
        } catch {
            clearInterval(checkInterval);
            process.exit(0);
        }
    }, 3000);
}

main().catch(console.error);
