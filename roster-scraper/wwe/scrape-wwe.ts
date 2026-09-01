import { chromium } from 'playwright';
import { normalizeText, sortRoster } from '../util';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = 'https://www.wwe.com/superstars';
const dropdownSelector = '[data-drupal-selector="edit-field-superstar-type-target-id"]';
const invalidOptions = ['ALL SUPERSTARS', 'CURRENT SUPERSTARS'];

// Drupal Views paginates this display and ignores an items_per_page override, so
// each section is fetched page by page until the endpoint returns an empty one.
// MAX_PAGES is only a runaway guard in case that empty page never comes.
const MAX_PAGES = 100;

/** The subset of `drupalSettings.views.ajaxViews[*]` the /views/ajax endpoint needs. */
type ViewAjaxConfig = {
    view_name: string;
    view_display_id: string;
    view_args: string;
    view_path: string;
    view_base_path: string | null;
    view_dom_id: string;
    pager_element: number;
};

/** One entry of the Drupal AJAX command array returned by /views/ajax. */
type AjaxCommand = { command: string; data?: unknown };

type FilterOption = { text: string; value: string };

const browser = await chromium.launch();
const page = await browser.newPage();

// esbuild's keepNames transform wraps the named helpers used inside
// page.evaluate() in a `__name()` call whose definition only exists at module
// scope in Node. Define a no-op on the page before it loads so those helpers
// resolve when the serialized functions run in the browser.
await page.addInitScript(() => {
    (window as unknown as { __name?: unknown }).__name ??= (fn: unknown) => fn;
});

// Load the roster page once: it server-renders the champions block and the
// exposed-filter <option> list, and seeds the cookies/UA the Views AJAX endpoint
// expects.
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(dropdownSelector);

const rawChampions = await page.locator('.championship-details').evaluateAll(els =>
    els.map(el => ({
        champion: el.querySelector('h1')?.textContent ?? null,
        title: el.querySelector('p')?.textContent ?? null,
    }))
);

// Valid filter options (minus the catch-all entries) plus the identifiers the
// Views AJAX endpoint needs, read straight from drupalSettings.
const { options, viewConfig } = await page.evaluate(
    (invalid): { options: FilterOption[]; viewConfig: ViewAjaxConfig } => {
        const select = document.querySelector<HTMLSelectElement>(
            '[data-drupal-selector="edit-field-superstar-type-target-id"]'
        );
        if (!select) throw new Error('superstar-type filter <select> not found');

        const options = Array.from(select.options)
            .filter(o => !invalid.includes((o.textContent ?? '').trim().toUpperCase()))
            .map(o => ({ text: o.textContent?.trim() ?? '', value: o.value }));

        const ajaxViews = (window as any).drupalSettings?.views?.ajaxViews ?? {};
        const config = (Object.values(ajaxViews) as ViewAjaxConfig[]).find(
            v => v.view_name === 'current_superstar'
        );
        if (!config) {
            throw new Error('current_superstar view config not found in drupalSettings');
        }

        return { options, viewConfig: config };
    },
    invalidOptions
);

// Drive the Views AJAX endpoint straight from the page context so it shares the
// browser's cookie jar and UA. Each request is a plain cacheable GET returning
// the standard Drupal AJAX command array; the `insert` command carries an HTML
// fragment of `.views-row` elements. No dropdown selection, no infinite-scroll
// clicks, no DOM-settle races.
const rawRoster = await page.evaluate(
    async ({ options, viewConfig, maxPages }) => {
        const parseRows = (commands: AjaxCommand[]): (string | null)[] => {
            const html = commands
                .filter(c => c.command === 'insert' && typeof c.data === 'string')
                .map(c => c.data as string)
                .join('\n');
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return Array.from(
                doc.querySelectorAll(
                    '.current-superstar-views-rows-wrapper .views-row .views-field-title'
                )
            ).map(el => el.textContent);
        };

        const fetchPage = async (termId: string, pageNum: number) => {
            const params = new URLSearchParams({
                _wrapper_format: 'drupal_ajax',
                _drupal_ajax: '1',
                field_superstar_type_target_id: termId,
                view_name: viewConfig.view_name,
                view_display_id: viewConfig.view_display_id,
                view_args: viewConfig.view_args ?? '',
                view_path: viewConfig.view_path,
                view_base_path: viewConfig.view_base_path ?? '',
                view_dom_id: viewConfig.view_dom_id,
                pager_element: String(viewConfig.pager_element ?? 0),
                page: String(pageNum),
            });

            const res = await fetch(`/views/ajax?${params}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                throw new Error(
                    `views/ajax term ${termId} page ${pageNum} responded ${res.status}: ${detail.slice(0, 200)}`
                );
            }

            // WWE returns the command array as an object keyed by index rather
            // than a plain array, so normalise it with Object.values().
            return parseRows(Object.values(await res.json()) as AjaxCommand[]);
        };

        const sections = [];
        for (const option of options) {
            const superstars: (string | null)[] = [];
            let terminated = false;

            for (let pageNum = 0; pageNum < maxPages; pageNum++) {
                const rows = await fetchPage(option.value, pageNum);
                if (rows.length === 0) {
                    terminated = true;
                    break;
                }
                superstars.push(...rows);
            }

            sections.push({ title: option.text, superstars, terminated });
        }
        return sections;
    },
    { options, viewConfig, maxPages: MAX_PAGES }
);

await browser.close();

// Refuse to write unless every section paged all the way to an empty page. A
// section that hit the runaway guard instead means the endpoint stopped
// honouring `page`, so the data is incomplete and would churn git history with
// alternating add/remove commits.
for (const section of rawRoster) {
    if (!section.terminated) {
        console.error(
            `ERROR: section "${section.title}" hit the ${MAX_PAGES}-page cap without an empty page — refusing to write.`
        );
        process.exit(1);
    }
}

// Normalize on the Node.js side using shared util.ts
const champions = rawChampions
    .map<Champion>(c => ({
        name: normalizeText(c.champion ?? '') ?? '',
        title: normalizeText(c.title ?? '') ?? '',
    }))
    .filter(c => c.name && c.title);

const sections = rawRoster.map<Section>(section => ({
    name: section.title,
    members: section.superstars
        .map<Wrestler>(s => ({ name: normalizeText(s ?? '') ?? '' }))
        .filter(s => s.name),
}));

// Validate before writing
if (champions.length === 0) {
    console.error('ERROR: No champions scraped — page markup may have changed');
    process.exit(1);
}

if (sections.every(s => s.members.length === 0)) {
    console.error('ERROR: No roster members scraped — page may not have loaded');
    process.exit(1);
}

const output = sortRoster({ champions, sections });
const outputPath = join(__dirname, '../../rosters/wwe-roster.json');
writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
