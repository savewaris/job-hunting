#!/usr/bin/env node

/**
 * CareerPulse AI — Dedicated Standalone Facebook Job Sourcing CLI
 * 
 * Usage:
 *   1. Direct Post Mode:
 *      npm run scrape:fb -- --url https://www.facebook.com/...
 * 
 *   2. Interactive Feed Mode:
 *      npm run scrape:fb
 *      (Opens visible browser with your session. Scroll anywhere, press [Enter] in terminal to capture visible jobs!)
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sessionDir = path.join(rootDir, '.browser-sessions', 'facebook-profile');
const jobsFile = path.join(rootDir, 'src', 'domain', 'jobs', 'jobs.json');

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

// Parse CLI flags
function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

const directUrl = getArg('--url');

// Tech hiring keywords
const JOB_KEYWORDS = [
  'รับสมัคร', 'หาคน', 'developer', 'programmer', 'software engineer',
  'frontend', 'backend', 'full stack', 'fullstack', 'react', 'next.js', 'nextjs',
  'typescript', 'javascript', 'python', 'golang', 'node.js', 'nodejs',
  'เงินเดือน', 'salary', 'บาท', 'thb', 'wfh', 'hybrid', 'ส่ง resume', 'portfolio'
];

function isJobPost(text) {
  if (!text || text.length < 30) return false;
  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of JOB_KEYWORDS) {
    if (lower.includes(kw)) matches++;
  }
  return matches >= 2;
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
    id: `fb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
    author: author || 'Facebook Recruiter',
    createdAt: new Date().toISOString()
  };
}

function saveJobToDatabase(job) {
  let jobs = [];
  try {
    if (fs.existsSync(jobsFile)) {
      jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
    }
  } catch (e) {}

  // Deduplicate by text content or URL
  const existingIdx = jobs.findIndex(j => 
    (j.jobUrl && j.jobUrl === job.jobUrl && !job.jobUrl.includes('sample')) ||
    (j.rawPostContent && j.rawPostContent === job.rawPostContent)
  );

  if (existingIdx >= 0) {
    jobs[existingIdx] = { ...jobs[existingIdx], ...job };
  } else {
    jobs.unshift(job);
  }

  fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2), 'utf-8');
  return jobs.length;
}

async function main() {
  console.log(`\n================================================================`);
  console.log(`🚀 [CareerPulse AI] Standalone Facebook Job Sourcing CLI`);
  console.log(`================================================================`);
  console.log(`• Mode: STRICTLY NON-HEADLESS (Real visible Chrome window)`);
  console.log(`• Session: ${sessionDir}`);
  if (directUrl) {
    console.log(`• Target: Single Post -> ${directUrl}`);
  } else {
    console.log(`• Target: Interactive Feed Mode -> Scroll anywhere & capture!`);
  }
  console.log(`================================================================\n`);

  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: null,
    slowMo: 80,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  });

  const page = await context.newPage();

  // Inject visible banner HUD
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const banner = document.createElement('div');
      banner.id = 'careerpulse-cli-banner';
      banner.style.position = 'fixed';
      banner.style.top = '0';
      banner.style.left = '0';
      banner.style.width = '100%';
      banner.style.backgroundColor = '#0b0f17';
      banner.style.color = '#38bdf8';
      banner.style.padding = '10px 20px';
      banner.style.fontSize = '12px';
      banner.style.fontFamily = 'monospace';
      banner.style.fontWeight = 'bold';
      banner.style.borderBottom = '2px solid #38bdf8';
      banner.style.zIndex = '99999999';
      banner.style.display = 'flex';
      banner.style.justifyContent = 'space-between';
      banner.style.alignItems = 'center';
      banner.style.boxShadow = '0 4px 20px rgba(0,0,0,0.8)';
      banner.innerHTML = `
        <span>🤖 CareerPulse AI — Standalone Facebook Scraper</span>
        <span id="careerpulse-cli-status" style="color: #34d399;">Ready • Press [Enter] in terminal to capture visible posts</span>
      `;
      document.body.appendChild(banner);
      document.body.style.paddingTop = '45px';
    });
  });

  const updateHud = async (msg, color = '#38bdf8') => {
    await page.evaluate(({ text, col }) => {
      const el = document.getElementById('careerpulse-cli-status');
      if (el) {
        el.innerText = text;
        el.style.color = col;
      }
    }, { text: msg, col: color }).catch(() => {});
  };

  if (directUrl) {
    // -------------------------------------------------------------
    // MODE 1: DIRECT SINGLE POST
    // -------------------------------------------------------------
    console.log(`Navigating to post: ${directUrl}...`);
    await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);

    await updateHud('Scanning post content...', '#38bdf8');

    // Click "See more" if present
    try {
      const seeMore = await page.$('div[role="button"]:has-text("See more"), div[role="button"]:has-text("ดูเพิ่มเติม")');
      if (seeMore) await seeMore.click();
    } catch (e) {}

    await page.waitForTimeout(1000);

    // Grab post text
    let postText = '';
    const messageEl = await page.$('div[data-ad-preview="message"], div[dir="auto"], [data-testid="post_message"]');
    if (messageEl) {
      postText = (await messageEl.innerText()).trim();
      await messageEl.evaluate(el => {
        el.style.border = '3px solid #38bdf8';
        el.style.boxShadow = '0 0 20px rgba(56,189,248,0.6)';
        el.style.borderRadius = '8px';
      });
    }

    if (!postText) {
      postText = await page.innerText('body');
    }

    // Grab author
    let author = '';
    const authorEl = await page.$('h3, h4, strong, a[role="link"]');
    if (authorEl) author = (await authorEl.innerText()).trim();

    const job = parseJobText(postText, directUrl, author);
    const totalCount = saveJobToDatabase(job);

    await updateHud(`✓ Captured: ${job.jobTitle} (${job.companyName})!`, '#34d399');
    console.log(`\n================================================================`);
    console.log(`✅ [Job Captured & Saved to Dashboard!]`);
    console.log(`   Title:   ${job.jobTitle}`);
    console.log(`   Company: ${job.companyName}`);
    console.log(`   Salary:  ${job.salaryRange}`);
    console.log(`   Stack:   ${job.requirements.join(', ')}`);
    console.log(`   Contact: ${job.contactMethod?.type?.toUpperCase()}: ${job.contactMethod?.value}`);
    console.log(`   URL:     ${job.jobUrl}`);
    console.log(`   Total Jobs in DB: ${totalCount}`);
    console.log(`================================================================\n`);

    await page.waitForTimeout(3000);
    await context.close();
    process.exit(0);

  } else {
    // -------------------------------------------------------------
    // MODE 2: INTERACTIVE FEED MODE
    // -------------------------------------------------------------
    const initialFeed = 'https://www.facebook.com/groups/feed/';
    console.log(`Opening Facebook Groups Feed: ${initialFeed}`);
    await page.goto(initialFeed, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});

    console.log(`\n----------------------------------------------------------------`);
    console.log(`🎮 [Interactive Mode Active]`);
    console.log(`The visible Chrome window is open. You can browse freely:`);
    console.log(`  • Scroll down your feed or navigate to any group.`);
    console.log(`  • Press [Enter] or type 's' to scan & capture all visible jobs.`);
    console.log(`  • Type 'q' or 'done' to save and close the browser.`);
    console.log(`----------------------------------------------------------------\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'CareerPulse (press [Enter] to scan, q to quit) > '
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const cmd = line.trim().toLowerCase();

      if (cmd === 'q' || cmd === 'quit' || cmd === 'exit' || cmd === 'done') {
        console.log(`Closing browser session...`);
        rl.close();
        await context.close();
        console.log(`✓ Browser closed. Check your dashboard at http://localhost:3001!`);
        process.exit(0);
      }

      // Scan Visible Posts
      console.log(`Scanning visible posts on screen...`);
      await updateHud('Scanning visible feed posts for tech jobs...', '#38bdf8');

      // Click visible "See more" buttons
      try {
        await page.evaluate(() => {
          const seeMores = Array.from(document.querySelectorAll('div[role="button"]')).filter(b => {
            const t = (b.innerText || '').toLowerCase();
            return t.includes('see more') || t.includes('ดูเพิ่มเติม');
          });
          seeMores.forEach(b => b.click());
        });
      } catch (e) {}

      await page.waitForTimeout(600);

      // Extract visible posts matching keywords
      const captured = await page.evaluate((keywords) => {
        const results = [];
        const postContainers = document.querySelectorAll('div[data-ad-preview="message"], div[dir="auto"], div[role="article"]');
        
        postContainers.forEach((el) => {
          const text = (el.innerText || '').trim();
          if (text.length > 50) {
            const lower = text.toLowerCase();
            let matches = 0;
            for (const kw of keywords) {
              if (lower.includes(kw)) matches++;
            }

            if (matches >= 2) {
              // Highlight in Cyan
              el.style.border = '3px solid #38bdf8';
              el.style.boxShadow = '0 0 25px rgba(56,189,248,0.7)';
              el.style.borderRadius = '8px';

              // Find link
              let postLink = window.location.href;
              const linkEl = el.closest('div[role="article"]')?.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="facebook.com/"]');
              if (linkEl && linkEl.href) postLink = linkEl.href;

              // Find author
              let author = '';
              const authorEl = el.closest('div[role="article"]')?.querySelector('h3, h4, strong, a[role="link"]');
              if (authorEl) author = (authorEl.innerText || '').trim();

              results.push({ text, postLink, author });
            }
          }
        });

        return results;
      }, JOB_KEYWORDS);

      if (captured.length === 0) {
        console.log(`No tech hiring posts detected in current view. Scroll down and press [Enter] again!`);
        await updateHud('No tech jobs in current view • Scroll down & press [Enter] again', '#f59e0b');
      } else {
        console.log(`\n🎉 Found ${captured.length} tech hiring post(s) on screen!`);
        for (const p of captured) {
          const job = parseJobText(p.text, p.postLink, p.author);
          const count = saveJobToDatabase(job);
          console.log(`  ✓ Saved: "${job.jobTitle}" at ${job.companyName} (${job.salaryRange})`);
          console.log(`    Link: ${job.jobUrl}`);
          await updateHud(`✓ Captured: ${job.jobTitle} (${job.companyName})!`, '#34d399');
        }
        console.log(`All saved to src/domain/jobs/jobs.json! (Total in DB: ${captured.length})\n`);
      }

      rl.prompt();
    });

    // Handle browser window closed by user
    page.on('close', () => {
      console.log(`\nBrowser window closed. Exiting CLI.`);
      process.exit(0);
    });
  }
}

main().catch(err => {
  console.error(`CLI Error:`, err);
  process.exit(1);
});
