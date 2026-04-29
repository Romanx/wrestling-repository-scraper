import { chromium } from 'playwright';
import { normalizeText, sortRoster } from '../util';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = 'https://www.wwe.com/superstars';
const dropdownSelector = '[data-drupal-selector="edit-field-superstar-type-target-id"]';
const pagerSelector = '[data-drupal-views-infinite-scroll-pager="automatic"]';
const invalidOptions = ['ALL SUPERSTARS', 'CURRENT SUPERSTARS'];

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(dropdownSelector);

// Extract champions
const rawChampions = await page.locator('.championship-details').evaluateAll(els =>
    els.map(el => ({
        champion: el.querySelector('h1')?.textContent ?? null,
        title: el.querySelector('p')?.textContent ?? null,
    }))
);

// Get valid dropdown options (skip catch-all entries)
const options = await page.locator(`${dropdownSelector} option`).evaluateAll((opts, invalid) =>
    opts
        .map(el => <HTMLOptionElement>el)
        .filter(o => !invalid.includes((o.innerText ?? '').toUpperCase()))
        .map(o => ({ text: o.textContent?.trim() ?? '', value: o.value })),
    invalidOptions
);

// Iterate each roster section via dropdown
const rawRoster: { title: string; superstars: (string | null)[] }[] = [];

for (const option of options) {
    const loadRequest = waitForResponses(page, [
        'views/ajax?_wrapper_format=drupal_ajax',
        'superstar/talent'
    ]);

    
    await page.selectOption(dropdownSelector, option.value);
    await loadRequest;

    const nextSelector = `${pagerSelector} [rel=next]`;

    while (await page.locator(nextSelector).count().then(c => c > 0)) {
        const next = page.locator(nextSelector).first();
        
        // Wait for DOM to settle after previous AJAX response
        await next.waitFor({ state: 'attached' });
        await next
            .dispatchEvent('click', {}, { timeout: 1000 });
        
        await waitForResponses(page, ['views/ajax?_wrapper_format=drupal_ajax']);
    }

    const superstars = await page
        .locator('.current-superstar-views-rows-wrapper .views-row .views-field-title')
        .evaluateAll(els => els.map(el => el.textContent ?? null));

    rawRoster.push({ title: option.text, superstars });
}

await browser.close();

// Normalize on the Node.js side using shared util.ts
const champions = rawChampions
    .map<Champion>(c => ({
        name: normalizeText(c.champion ?? '') ?? '',
        title: normalizeText(c.title ?? '') ?? '',
    }))
    .filter(c => c.name && c.title)

const sections = rawRoster.map<Section>(section => ({
    name: section.title,
    members: section.superstars
        .map<Wrestler>(s => ({
            name: normalizeText(s ?? '') ?? '',
        }))
        .filter(s => s.name)
}));

// Validate before writing
if (champions.length === 0 && sections.length === 0) {
    console.error('ERROR: No data scraped — page may not have loaded');
    process.exit(1);
}

const output = sortRoster({ champions, sections });
const outputPath = join(__dirname, '../../rosters/wwe-roster.json');
writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');

async function waitForResponses(page : Page, urls : string[]) : Promise<Response[]> {
    return Promise.all(urls.map(u => page.waitForResponse(resp => resp.url().includes(u))));
}