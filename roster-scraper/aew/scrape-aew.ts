import { chromium } from 'playwright';
import { normalizeText, sortRoster } from '../util';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = 'https://www.allelitewrestling.com/aew-roster';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('section.wixui-column-strip');

const rawSections = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section.wixui-column-strip'))
        .map(section => ({
            title: section.querySelector('h1')?.innerText ?? null,
            members: Array.from(section.querySelectorAll('[role="listitem"]')).map(item => ({
                name: item.querySelector('[data-testid="richTextElement"]')?.textContent ?? null,
                sublines: Array.from(item.querySelectorAll('h2')).map(h => h.textContent ?? null),
            })),
        }))
);

await browser.close();

const champions = rawSections
    .find(s => s.title?.toLocaleLowerCase() === 'champions')!
    .members
    .map<Champion>(m => ({
        name: m.name!,
        title: m.sublines[1]
    }))

const sections = rawSections
    .filter(s => s.title?.toLocaleLowerCase() !== 'champions')
    .map<Section | null>(section => {
        const title = section.title ? normalizeText(section.title) : null;
        if (!title) return null;

        const members = section.members
            .map<Wrestler | null>(member => {
                const name = normalizeText(member.name ?? '') ?? '';
                if (!name) return null;

                const sublines = member.sublines
                    .map(s => normalizeText(s ?? ''))
                    .filter((t): t is string => !!t
                        && t.length > 0
                        && t.toUpperCase() !== 'EMPTY HEADING'
                        && t !== name);

                // keys alphabetical: name before sublines; omit sublines if empty
                return sublines.length > 0 ? { name, sublines } : { name };
            })
            .filter((m) => m !== null)

        return { name: title, members };
    })
    .filter((s) => s !== null);

// Validate before writing — prevents blank [] commits
if (sections.length === 0) {
    console.error('ERROR: No sections found — Wix page may not have loaded');
    process.exit(1);
}
if (!sections.some(s => s.members.length > 0)) {
    console.error('ERROR: Sections found but no members — Wix hydration may be incomplete');
    process.exit(1);
}

const sorted = sortRoster({ champions, sections });

// Write directly to the output file
const outputPath = join(__dirname, '../../rosters/aew-roster.json');
writeFileSync(outputPath, JSON.stringify(sorted, null, 2) + '\n');
