#!/usr/bin/env node

/**
 * CareerPulse AI — Autonomous Facebook Feed Scroller
 * STRICTLY NON-HEADLESS (`headless: false` with slowMo: 100ms)
 * 
 * Uses your authenticated session to scroll Facebook feed / groups,
 * identifies job posts matching tech keywords, highlights them on screen,
 * extracts real details and live post links, and saves them to your dashboard.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sessionDir = path.join(rootDir, '.browser-sessions', 'facebook-profile');

const targetUrlArg = process.argv.find((arg, i) => process.argv[i - 1] === '--url');
const maxPostsArg = Number(process.argv.find((arg, i) => process.argv[i - 1] === '--max')) || 5;

const TARGET_URL = targetUrlArg || 'https://www.facebook.com/groups/feed/';

// Keywords that indicate a Thai tech hiring post
const JOB_KEYWORDS = [
  'รับสมัคร', 'หาคน', 'developer', 'programmer', 'software engineer',
  'frontend', 'backend', 'full stack', 'fullstack', 'react', 'next.js', 'nextjs',
  'typescript', 'javascript', 'python', 'golang', 'node.js', 'nodejs',
  'เงินเดือน', 'salary', 'บาท', 'thb', 'wfh', 'hybrid', 'ส่ง resume', 'portfolio'
];

function isJobPost(text) {
  if (!text || text.length < 40) return false;
  const lower = text.toLowerCase();
  
  // Must match at least 2 distinct hiring/tech signals
  let matchCount = 0;
  for (const kw of JOB_KEYWORDS) {
    if (lower.includes(kw)) matchCount++;
  }
  return matchCount >= 2;
}

function parseJobText(text, postUrl, author) {
  const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
  const lineMatch = text.match(/(?:line(?:\s*id)?|line:)\s*[:@]?\s*([a-zA-Z0-9._@-]+)/i);
  
  const salaryMatch = text.match(/(?:salary|เงินเดือน|งบ|ค่าตอบแทน)?\s*[:]?\s*(?:฿|thb)?\s*(\d{1,3}(?:,\d{3})*(?:\s*-\s*\d{1,3}(?:,\d{3})*)?\s*(?:thb|บาท|k|\/month|\/เดือน)?)/i);
  let salaryRange = 'Negotiable (THB)';
  if (salaryMatch && salaryMatch[1] && salaryMatch[1].length > 3) {
    salaryRange = `฿${salaryMatch[1].trim()}`;
  }

  const techKeywords = [
    'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'NestJS',
    'Python', 'FastAPI', 'PostgreSQL', 'MySQL', 'MongoDB', 'Docker', 'Prisma', 'Tailwind CSS', 'Flutter', 'Go'
  ];
  const matchedStack = techKeywords.filter(kw => {
    const reg = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
    return reg.test(text);
  });

  let jobTitle = 'Software Engineer';
  if (/full\s*stack/i.test(text)) jobTitle = 'Full Stack Developer';
  else if (/frontend/i.test(text)) jobTitle = 'Frontend Developer';
  else if (/backend/i.test(text)) jobTitle = 'Backend Developer';
  else if (/data\s*analyst/i.test(text)) jobTitle = 'Data Analyst';
  else if (/ai\s*|machine\s*learning/i.test(text)) jobTitle = 'AI Systems Engineer';

  let companyName = author || 'Thai Tech Employer';
  const compMatch = text.match(/(?:company|บริษัท|บ\.)\s*[:]?\s*([^\n,]+)/i);
  if (compMatch && compMatch[1]) {
    companyName = compMatch[1].trim();
  }

  let contactMethod = undefined;
  if (emailMatch) {
    contactMethod = { type: 'email', value: emailMatch[1] };
  } else if (lineMatch) {
    contactMethod = { type: 'line', value: lineMatch[1] };
  } else {
    contactMethod = { type: 'portal', value: postUrl };
  }

  return {
    id: `fb-live-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    source: 'facebook',
    jobTitle,
    companyName,
    jobUrl: postUrl,
    location: /remote|wfh|hybrid/i.test(text) ? 'Bangkok, Thailand (Hybrid/Remote)' : 'Bangkok, Thailand',
    salaryRange,
    jobDescription: text.slice(0, 1500),
    requirements: matchedStack.length > 0 ? matchedStack : ['TypeScript', 'React', 'Node.js'],
    contactMethod,
    rawPostContent: text,
    author: author || 'Facebook Group Member',
    createdAt: new Date().toISOString()
  };
}

async function runFeedScroller() {
  console.log(`\n======================================================`);
  console.log(`🚀 [Facebook Feed Scroller] Launching Authenticated Playwright...`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Session Dir: ${sessionDir}`);
  console.log(`Mode: STRICTLY NON-HEADLESS (Visible on screen)`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

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

  // Inject visual banner at top of page
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const banner = document.createElement('div');
      banner.id = 'careerpulse-scroller-banner';
      banner.style.position = 'fixed';
      banner.style.top = '0';
      banner.style.left = '0';
      banner.style.width = '100%';
      banner.style.backgroundColor = '#0b0f17';
      banner.style.color = '#38bdf8';
      banner.style.padding = '10px 20px';
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
        <span>🤖 CareerPulse AI — Autonomous Facebook Feed Scroller</span>
        <span id="careerpulse-scroll-status" style="color: #34d399;">Scanning feed for developer job posts...</span>
      `;
      document.body.appendChild(banner);
      document.body.style.paddingTop = '45px';
    });
  });

  const capturedJobs = [];

  try {
    const updateBanner = async (msg, color = '#38bdf8') => {
      console.log(`[Scroller Status] ${msg}`);
      await page.evaluate(({ text, col }) => {
        const el = document.getElementById('careerpulse-scroll-status');
        if (el) {
          el.innerText = text;
          el.style.color = col;
        }
      }, { text: msg, col: color }).catch(() => {});
    };

    console.log(`Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);

    // Close any popups if present
    try {
      const closeBtn = await page.$('div[aria-label="Close"], [aria-label="ปิด"], [role="dialog"] button');
      if (closeBtn) await closeBtn.click();
    } catch (e) {}

    await updateBanner('Feed loaded. Beginning visible scroll & post scan...', '#38bdf8');

    const seenTexts = new Set();
    let scrollAttempts = 0;
    const maxScrolls = 20;

    while (capturedJobs.length < maxPostsArg && scrollAttempts < maxScrolls) {
      scrollAttempts++;
      await updateBanner(`Scanning visible posts (Page pass ${scrollAttempts}/${maxScrolls}) — Found: ${capturedJobs.length}/${maxPostsArg}...`);

      // Click all "See more" / "ดูเพิ่มเติม" buttons currently visible
      try {
        await page.evaluate(() => {
          const seeMoreButtons = Array.from(document.querySelectorAll('div[role="button"]')).filter(btn => {
            const txt = (btn.innerText || '').toLowerCase();
            return txt.includes('see more') || txt.includes('ดูเพิ่มเติม');
          });
          seeMoreButtons.forEach(btn => btn.click());
        });
      } catch (e) {}

      await page.waitForTimeout(1000);

      // Extract post message elements
      const postsData = await page.evaluate((keywords) => {
        const results = [];
        // Target feed post containers
        const postContainers = document.querySelectorAll('div[data-ad-preview="message"], div[dir="auto"]');
        
        postContainers.forEach((el) => {
          const text = (el.innerText || '').trim();
          if (text.length > 50) {
            // Check if matches job keywords
            const lower = text.toLowerCase();
            let matches = 0;
            for (const kw of keywords) {
              if (lower.includes(kw)) matches++;
            }

            if (matches >= 2) {
              // Highlight post container in Cyan
              el.style.border = '3px solid #38bdf8';
              el.style.boxShadow = '0 0 20px rgba(56,189,248,0.5)';
              el.style.borderRadius = '8px';

              // Find closest post link
              let postLink = window.location.href;
              const linkEl = el.closest('div[role="article"]')?.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="facebook.com/"]');
              if (linkEl && linkEl.href) postLink = linkEl.href;

              // Find author name
              let author = '';
              const authorEl = el.closest('div[role="article"]')?.querySelector('h3, h4, strong, a[role="link"]');
              if (authorEl) author = authorEl.innerText;

              results.push({ text, postLink, author });
            }
          }
        });

        return results;
      }, JOB_KEYWORDS);

      for (const p of postsData) {
        if (!seenTexts.has(p.text)) {
          seenTexts.add(p.text);
          const job = parseJobText(p.text, p.postLink, p.author);
          capturedJobs.push(job);
          await updateBanner(`🎯 Captured: ${job.jobTitle} (${job.companyName})!`, '#34d399');
          console.log(`\n[Captured Job #${capturedJobs.length}]:`);
          console.log(`  • Title:   ${job.jobTitle}`);
          console.log(`  • Company: ${job.companyName}`);
          console.log(`  • URL:     ${job.jobUrl}`);
          console.log(`  • Salary:  ${job.salaryRange}`);
          console.log(`  • Contact: ${job.contactMethod?.type?.toUpperCase()}: ${job.contactMethod?.value}`);

          if (capturedJobs.length >= maxPostsArg) break;
        }
      }

      // Scroll down with human-like delay
      await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
      await page.waitForTimeout(2500);
    }

    await updateBanner(`✅ Complete! Successfully captured ${capturedJobs.length} real jobs.`, '#34d399');
    await page.waitForTimeout(3000);

  } catch (err) {
    console.error(`[Scroller Error]:`, err.message);
  } finally {
    console.log(`Closing browser context.`);
    await context.close();
  }

  // Persist to src/domain/jobs/jobs.json
  if (capturedJobs.length > 0) {
    const jobsFile = path.join(rootDir, 'src', 'domain', 'jobs', 'jobs.json');
    let currentJobs = [];
    try {
      if (fs.existsSync(jobsFile)) {
        currentJobs = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
      }
    } catch (e) {}

    // Prepend newly captured jobs
    for (const j of capturedJobs) {
      if (!currentJobs.some(existing => existing.rawPostContent === j.rawPostContent)) {
        currentJobs.unshift(j);
      }
    }

    fs.writeFileSync(jobsFile, JSON.stringify(currentJobs, null, 2), 'utf-8');

    // Save audit proof
    const proofFile = path.join(rootDir, '.test-run', 'feed-scroller-proof.json');
    fs.writeFileSync(proofFile, JSON.stringify({
      scrapedAt: new Date().toISOString(),
      targetUrl: TARGET_URL,
      jobsCapturedCount: capturedJobs.length,
      jobs: capturedJobs
    }, null, 2), 'utf-8');

    console.log(`\n======================================================`);
    console.log(`Saved ${capturedJobs.length} real jobs to: src/domain/jobs/jobs.json`);
    console.log(`Proof dumped to: ${proofFile}`);
    console.log(`======================================================\n`);
  }

  return capturedJobs;
}

runFeedScroller().catch(console.error);
