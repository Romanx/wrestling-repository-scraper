import { chromium, Page } from 'playwright';
import { normalizeText, sortRoster } from '../util';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = 'https://tnawrestling.com/roster/';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.champions-section');
await scrollUntilAllLoaded(page, '.roster-section #filterResults')

const rawChampions = await page.locator('.champions-section a').evaluateAll(els =>
    els.map(el => ({
        name: el.querySelector('h5')?.innerText ?? null,
        title: el.querySelector('h6')?.innerText ?? null,
    }))
);

const rawRoster = await page.locator('.roster-section #filterResults a').evaluateAll(els =>
    els.map(el => ({
        name: el.querySelector('h5')?.innerText ?? null,
    }))
);

await browser.close();

// Normalize on the Node.js side using shared util.ts
const champions = rawChampions
    .map<Champion>(c => ({
        name: normalizeText(c.name ?? '') ?? '',
        title: normalizeText(c.title ?? '') ?? '',
    }))
    .filter(c => c.name && c.title);

const roster = rawRoster
    .map<Wrestler>(r => ({ name: normalizeText(r.name ?? '') ?? '' }))
    .filter(r => r.name);

// Validate before writing
if (champions.length === 0 && roster.length === 0) {
    console.error('ERROR: No data scraped — page may not have loaded');
    process.exit(1);
}

const output = sortRoster({ champions, roster });
const outputPath = join(__dirname, '../../rosters/tna-roster.json');
writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');

async function scrollUntilAllLoaded(page: Page, gridSelector: string) {
    let previousCount = 0;

    const itemSelector = `${gridSelector} a`

    while (true) {
        const currentCount = await page.evaluate(
            (selector) => document.querySelectorAll(selector).length,
            itemSelector
        );

        if (currentCount === previousCount) break;

        previousCount = currentCount;

        const loadRequest = page.waitForResponse(
            resp => resp.url().includes('/ajax/query/fighters')
        );

        await page.locator(itemSelector).last().scrollIntoViewIfNeeded();

        try {
            await Promise.race([
                loadRequest,
                page.waitForTimeout(2000),
            ]);
        } catch (e) {
            if (e instanceof Error && e.message.includes('Timeout')) {
                // no response, count check on next iteration will break the loop
            } else {
                throw e;
            }
        }

        await Promise.race([
            loadRequest,
            page.waitForTimeout(2000),
        ]);
    }
}