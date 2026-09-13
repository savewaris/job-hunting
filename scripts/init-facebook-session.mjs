#!/usr/bin/env node

/**
 * CareerPulse AI — Facebook Session Initializer
 * Opens a real visible Chrome window for the user to log into Facebook securely.
 * All cookies and login state are saved permanently into `.browser-sessions/facebook-profile`.
 * No passwords are ever stored or seen in code.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sessionDir = path.join(rootDir, '.browser-sessions', 'facebook-profile');

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

async function initSession() {
  console.log(`\n======================================================`);
  console.log(`🔐 [Facebook Session Setup] Launching Secure Browser...`);
  console.log(`Storage Dir: ${sessionDir}`);
  console.log(`Instructions: Please log into your Facebook account in the opened browser window.`);
  console.log(`======================================================\n`);

  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: null,
    slowMo: 100,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  });

  const page = await context.newPage();

  // Inject visual helper banner
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const banner = document.createElement('div');
      banner.id = 'careerpulse-auth-banner';
      banner.style.position = 'fixed';
      banner.style.top = '0';
      banner.style.left = '0';
      banner.style.width = '100%';
      banner.style.backgroundColor = '#0b0f17';
      banner.style.color = '#38bdf8';
      banner.style.padding = '12px 20px';
      banner.style.fontSize = '13px';
      banner.style.fontFamily = 'monospace';
      banner.style.fontWeight = 'bold';
      banner.style.borderBottom = '2px solid #38bdf8';
      banner.style.zIndex = '99999999';
      banner.style.display = 'flex';
      banner.style.justifyContent = 'space-between';
      banner.style.alignItems = 'center';
      banner.style.boxShadow = '0 4px 20px rgba(0,0,0,0.8)';
      banner.innerHTML = `
        <span>🔐 CareerPulse AI — Please Log In to Facebook</span>
        <span style="color: #34d399;">Once logged in, the browser will auto-save your session!</span>
      `;
      document.body.appendChild(banner);
      document.body.style.paddingTop = '50px';
    });
  });

  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });

  console.log(`Waiting for user login detection (up to 3 minutes)...`);
  
  // Polling to detect if user has logged in
  let isLoggedIn = false;
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000);
    
    // Check if feed, search, or user navigation elements are present
    const hasNavOrFeed = await page.evaluate(() => {
      return Boolean(
        document.querySelector('div[role="feed"]') ||
        document.querySelector('div[role="navigation"]') ||
        document.querySelector('[aria-label="Facebook"][role="link"]') ||
        document.querySelector('a[href*="/me"]') ||
        document.querySelector('[aria-label="Your profile"]') ||
        document.querySelector('[aria-label="โปรไฟล์ของคุณ"]')
      );
    }).catch(() => false);

    const currentUrl = page.url();
    const isAwayFromLogin = !currentUrl.includes('/login') && !currentUrl.includes('/recover') && currentUrl.includes('facebook.com');

    if (hasNavOrFeed && isAwayFromLogin) {
      isLoggedIn = true;
      console.log(`\n🎉 [Login Detected!] Active Facebook session identified.`);
      break;
    }
  }

  if (isLoggedIn) {
    // Write session indicator file
    const metaFile = path.join(sessionDir, 'session-info.json');
    fs.writeFileSync(metaFile, JSON.stringify({
      connected: true,
      connectedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`✅ Session saved permanently to: ${sessionDir}`);
    await page.waitForTimeout(2000);
  } else {
    console.log(`⚠️ Login timed out or window closed.`);
  }

  await context.close();
  console.log(`\nBrowser closed. Ready for autonomous feed scrolling!`);
}

initSession().catch(console.error);
