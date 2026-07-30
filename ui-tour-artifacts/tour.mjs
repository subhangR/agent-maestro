import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://127.0.0.1:4571';
const ART = '/home/ubuntu/agent-maestro/ui-tour-artifacts';
const SCREENS = `${ART}/screens`;
const VIDEO = `${ART}/video`;
fs.mkdirSync(SCREENS, { recursive: true });
fs.mkdirSync(VIDEO, { recursive: true });

let n = 0;
const log = [];
const pad = (i) => String(i).padStart(2, '0');

async function shot(page, name) {
  n += 1;
  const file = `${pad(n)}-${name}.png`;
  try {
    await page.screenshot({ path: `${SCREENS}/${file}`, fullPage: false });
    log.push(`${file}  — captured`);
    console.log('shot', file);
  } catch (e) {
    log.push(`${file}  — FAILED: ${e.message}`);
    console.log('shot FAILED', file, e.message);
  }
}

// Click first matching locator if present+visible; returns true if clicked
async function clickIf(page, locator, label) {
  try {
    const el = typeof locator === 'string' ? page.locator(locator).first() : locator.first();
    if (await el.count() === 0) { console.log('absent:', label); return false; }
    await el.waitFor({ state: 'visible', timeout: 4000 });
    await el.click({ timeout: 4000 });
    console.log('clicked:', label);
    await page.waitForTimeout(900);
    return true;
  } catch (e) {
    console.log('clickIf miss:', label, '-', e.message.split('\n')[0]);
    return false;
  }
}

const rail = (page, title) => page.locator(`button[title="${title}"]`);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } },
  });
  // Enable advanced (developer) rail items so Model profiles + Files show.
  await context.addInitScript(() => {
    try { localStorage.setItem('agents-ui-advanced-mode-v1', '1'); } catch (e) {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  console.log('goto', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // ---------- 0. LOGIN GATE ----------
  const pwField = page.locator('input[type="password"]').first();
  if (await pwField.count() && await pwField.isVisible().catch(() => false)) {
    await shot(page, 'login-gate');
    await pwField.fill('Itashi@sasuke.732.732');
    await page.waitForTimeout(300);
    await clickIf(page, page.getByRole('button', { name: /Sign in/i }), 'Sign in');
    await page.waitForTimeout(2500);
  }
  // ---------- 0b. FIRST-RUN ONBOARDING (theme + sound) ----------
  const welcome = page.getByText(/WELCOME TO MAESTRO/i).first();
  if (await welcome.count() && await welcome.isVisible().catch(() => false)) {
    await shot(page, 'onboarding-step1-theme');
    await clickIf(page, page.getByRole('button', { name: /^Next$/i }), 'onboarding:Next');
    await shot(page, 'onboarding-step2-sound');
    await clickIf(page, page.getByRole('button', { name: /Get Started/i }), 'onboarding:Get Started');
    await page.waitForTimeout(1500);
  }

  // wait for the app shell / rail to render
  try { await page.locator('button[title="Tasks"]').first().waitFor({ state: 'visible', timeout: 20000 }); }
  catch (e) { console.log('rail not visible yet:', e.message.split('\n')[0]); }
  await page.waitForTimeout(2500);
  await shot(page, 'dashboard-initial-load');

  // ---------- 1. RAISE A TASK ----------
  // Tasks panel is already open by default on load — do NOT click the rail
  // (clicking the active section collapses the panel).
  await shot(page, 'tasks-panel');
  // open create-task modal via "New task"
  const opened = await clickIf(page, page.getByRole('button', { name: /New task/i }), 'New task');
  if (opened) {
    await page.waitForTimeout(800);
    await shot(page, 'create-task-modal-empty');
    // fill title (autofocused title input)
    try {
      const title = page.locator('input.pn-mdl__titleinput').first();
      await title.waitFor({ state: 'visible', timeout: 4000 });
      await title.fill('UI Tour — Demo Task');
    } catch (e) {
      try { await page.keyboard.type('UI Tour — Demo Task'); } catch (_) {}
    }
    await page.waitForTimeout(400);
    // fill description
    const descSel = page.getByPlaceholder(/Describe the task/i).first();
    if (await descSel.count()) {
      await descSel.click().catch(() => {});
      await descSel.fill('A demonstration task created during the automated feature tour of the Maestro UI.').catch(() => {});
    }
    await page.waitForTimeout(500);
    await shot(page, 'create-task-modal-filled');
    // create without launching a live agent: "Save for later"
    const saved = await clickIf(page, page.getByRole('button', { name: /Save for later/i }), 'Save for later');
    if (!saved) {
      // fall back to closing the modal
      await clickIf(page, page.getByRole('button', { name: /^Cancel$/i }), 'Cancel');
    }
    await page.waitForTimeout(1500);
    await shot(page, 'tasks-after-create');
  }

  // ---------- 2. TASK SUB-TABS ----------
  await clickIf(page, page.locator('button[title="Active tasks"]'), 'subtab:Active');
  await shot(page, 'tasks-current');
  await clickIf(page, page.locator('button[title="Pinned tasks"]'), 'subtab:Pinned');
  await shot(page, 'tasks-pinned');
  await clickIf(page, page.locator('button[title="Completed tasks"]'), 'subtab:Completed');
  await shot(page, 'tasks-completed');
  await clickIf(page, page.locator('button[title="Archived tasks"]'), 'subtab:Archived');
  await shot(page, 'tasks-archived');

  // back to current + open a task detail overlay
  await clickIf(page, page.locator('button[title="Active tasks"]'), 'subtab:Active(again)');
  await page.waitForTimeout(600);
  const card = page.locator('.pn-tt__title, .pn-tt').first();
  if (await card.count()) {
    await card.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, 'task-detail-overlay');
    // close overlay
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
  } else {
    log.push('note: no task card found to open detail overlay');
  }

  // ---------- 3. LISTS ----------
  if (await clickIf(page, rail(page, 'Lists'), 'rail:Lists')) { await shot(page, 'lists-panel'); }

  // ---------- 4. TEAM ----------
  if (await clickIf(page, rail(page, 'Team'), 'rail:Team')) {
    await shot(page, 'team-members');
    await clickIf(page, page.locator('button[title="Teams"]'), 'subtab:Teams');
    await shot(page, 'team-teams');
    await clickIf(page, page.locator('button[title="Members"]'), 'subtab:Members');
  }

  // ---------- 5. SKILLS ----------
  if (await clickIf(page, rail(page, 'Skills'), 'rail:Skills')) { await shot(page, 'skills-panel'); }

  // ---------- 6. GRAPHS ----------
  if (await clickIf(page, rail(page, 'Graphs'), 'rail:Graphs')) { await page.waitForTimeout(1200); await shot(page, 'graphs-panel'); }

  // ---------- 7. COLLAB SPACE ----------
  if (await clickIf(page, rail(page, 'Collab Space'), 'rail:Collab')) { await shot(page, 'collab-space'); }

  // ---------- 8. TOKEN ANALYTICS ----------
  if (await clickIf(page, rail(page, 'Token analytics'), 'rail:Analytics')) { await page.waitForTimeout(1000); await shot(page, 'token-analytics'); }

  // ---------- 9. MODEL PROFILES (advanced) ----------
  if (await clickIf(page, rail(page, 'Model profiles'), 'rail:Profiles')) { await shot(page, 'model-profiles'); }

  // ---------- 10. FILES (advanced) ----------
  if (await clickIf(page, rail(page, 'Files'), 'rail:Files')) { await page.waitForTimeout(1000); await shot(page, 'files-panel'); }

  // ---------- 11. back to Tasks (final frame) ----------
  await clickIf(page, rail(page, 'Tasks'), 'rail:Tasks(final)');
  await shot(page, 'tour-end-tasks');

  await page.waitForTimeout(1500);
  // Close context to flush the video file.
  await context.close();
  await browser.close();

  // find the produced video
  const vids = fs.readdirSync(VIDEO).filter(f => f.endsWith('.webm'));
  fs.writeFileSync(`${ART}/tour-run.log`, log.join('\n') + `\n\nvideos: ${vids.join(', ')}\n`);
  console.log('DONE. screenshots:', n, 'videos:', vids);
})().catch((e) => { console.error('TOUR ERROR', e); process.exit(1); });
