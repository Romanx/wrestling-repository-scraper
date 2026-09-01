import { chromium } from 'playwright';
import { normalizeText, sortRoster } from '../util';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = 'https://tnawrestling.com/roster/';
const fightersEndpoint = 'https://tnawrestling.com/ajax/query/fighters';

const browser = await chromium.launch();
const page = await browser.newPage();

// Load the roster page once. This server-renders the champions block and seeds
// the session + XSRF cookies that the fighters endpoint requires.
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.champions-section');

const rawChampions = await page.locator('.champions-section a').evaluateAll(els =>
    els.map(el => ({
        name: el.querySelector('h5')?.textContent ?? null,
        title: el.querySelector('h6')?.textContent ?? null,
    }))
);

// The roster grid lazy-loads via POST /ajax/query/fighters — 8 cards per page,
// JSON envelope { html, total, count, has_more }. Driving that endpoint
// directly (from the page context, so the browser's cookie jar satisfies CSRF)
// replaces the old scroll-and-scrape loop: no lazy-load race, and `total` gives
// an authoritative completeness check. The returned HTML fragments are parsed
// with the browser's own DOMParser rather than a hand-rolled regex.
const { rawRoster, expectedTotal, pagesFetched } = await page.evaluate(
    async (endpoint) => {
        const fragments: string[] = [];
        let total = 0;
        let pageNum = 0;
        let exhausted = false;

        for (pageNum = 1; pageNum <= 100; pageNum++) {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: new URLSearchParams({
                    query_s: '',
                    page: String(pageNum),
                    model: 'Fighter',
                    role: 'roster',
                }),
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                throw new Error(
                    `fighters endpoint page ${pageNum} responded ${res.status}: ${detail.slice(0, 200)}`
                );
            }

            const body = (await res.json()) as {
                html: string;
                total: number;
                count: number;
                has_more: boolean;
            };

            total = body.total;
            if (body.html) fragments.push(body.html);

            if (!body.has_more) {
                exhausted = true;
                break;
            }
        }

        if (!exhausted) {
            throw new Error(
                `fighters endpoint never signalled has_more:false after ${pageNum - 1} pages`
            );
        }

        const doc = new DOMParser().parseFromString(fragments.join(''), 'text/html');
        const rawRoster = Array.from(doc.querySelectorAll('a h5')).map(el => ({
            name: el.textContent,
        }));

        return { rawRoster, expectedTotal: total, pagesFetched: pageNum };
    },
    fightersEndpoint
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

// Validate before writing. A partial roster used to slip through and churn git
// history with alternating add/remove commits, so refuse to write unless the
// number of parsed cards matches the total the endpoint itself reported.
if (champions.length === 0) {
    console.error('ERROR: No champions parsed — page markup may have changed');
    process.exit(1);
}

if (expectedTotal === 0 || roster.length !== expectedTotal) {
    console.error(
        `ERROR: roster incomplete — parsed ${roster.length} of ${expectedTotal} ` +
        `wrestlers across ${pagesFetched} page(s). Refusing to write a partial roster.`
    );
    process.exit(1);
}

const output = sortRoster({ champions, roster });
const outputPath = join(__dirname, '../../rosters/tna-roster.json');
writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
