/**
 * AEW roster scraper.
 *
 * Two sources, because neither offers everything:
 *
 *   champions  <- the `__NUXT_DATA__` payload in the roster HTML. There is no
 *                 champions endpoint, and the payload is already JSON, so this is
 *                 JSON.parse + index resolution rather than HTML scraping.
 *   wrestlers  <- GET /api/wrestlers. The rendered listing is one flat grid with
 *                 no category information (the tabs are client-side filters), and
 *                 the API is a documented contract returning category *names* —
 *                 so no category ids are hardcoded here.
 *
 * Champion names are joined from the API records by `wrestlerId`, which also
 * covers the hidden team entries that never appear in the visible listing.
 *
 * Output is the legacy archive shape:
 *   { champions: [{ name, title }], sections: [{ name, members: [{ name }] }] }
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractPayload, resolveValue, requireArray, requireObject } from '../devalue';
import type { Json } from '../devalue';
import { normalizeText, USER_AGENT } from '../util';

const __dirname = dirname(fileURLToPath(import.meta.url));

const rosterUrl = 'https://www.allelitewrestling.com/roster';
const wrestlersUrl = 'https://www.allelitewrestling.com/api/wrestlers';
const outputPath = join(__dirname, '../../rosters/aew-roster.json');

/** `per_page` is capped at 25 server-side, so ~10 pages for 227 records. */
const API_PAGE_DELAY_MS = 1000;
const MAX_API_PAGES = 100; // runaway guard only

/** Section for records that carry no category at all. */
const UNCATEGORISED = 'UNCATEGORISED';

// Deliberately not named Champion/Section/Roster: types.ts declares those as
// globals for the Playwright scrapers, and this file's shapes are narrower.
type AewChampion = { name: string; title: string };
type AewSection = { name: string; members: { name: string }[] };
type AewRoster = { champions: AewChampion[]; sections: AewSection[] };

type WrestlerRecord = {
  name: string;
  isHidden: boolean;
  categories: string[];
};

/** Tidy scraped text. Both sources are already entity-decoded and trimmed. */
const clean = (text: unknown) => normalizeText(typeof text === 'string' ? text : '') ?? '';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en');

// --------------------------------------------------------------- champions --

/** Walk `pinia.config.config.roster`, naming the path so failures are legible. */
function rosterConfig(payload: Json[]): Record<string, Json> {
  const root = resolveValue(payload, 0) as Record<string, Json>;
  const config = requireObject(
    requireObject(requireObject(root.pinia, 'root.pinia').config, 'root.pinia.config').config,
    'root.pinia.config.config'
  );
  return requireObject(config.roster, 'pinia.config.config.roster');
}

function readChampions(html: string): { id: number; title: string }[] {
  const champions = requireArray(rosterConfig(extractPayload(html)).champions, 'roster.champions')
    .map((entry) => {
      const block = requireObject(entry, 'roster.champions[]');
      // Editors can add other content block types to this slot.
      if (block.component !== 'ContentBlockChampion') {
        throw new Error(`roster.champions holds a ${JSON.stringify(block.component)} block`);
      }
      const data = requireObject(block.data, 'roster.champions[].data');
      const id = data.wrestlerId;
      const title = clean(data.championText);
      if (typeof id !== 'number' || !title) {
        throw new Error(`champion block is missing wrestlerId/championText: ${JSON.stringify(data)}`);
      }
      return { id, title };
    });

  if (champions.length === 0) throw new Error('roster.champions is empty');
  return champions;
}

// ------------------------------------------------------------- roster (API) --

async function readWrestlers(): Promise<Map<number, WrestlerRecord>> {
  const wrestlers = new Map<number, WrestlerRecord>();
  let total = 0;
  let fetched = 0;
  let pages = 0;

  for (let page = 1; page <= MAX_API_PAGES; page++) {
    if (page > 1) await new Promise((r) => setTimeout(r, API_PAGE_DELAY_MS));

    const res = await fetch(
      `${wrestlersUrl}?include%5B0%5D=categories&page=${page}&sort%5B0%5D=first_name`,
      { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`GET ${wrestlersUrl} page ${page} -> ${res.status}`);

    const body = (await res.json()) as {
      data?: Record<string, unknown>[];
      meta?: { total: number; last_page: number };
    };
    if (!Array.isArray(body.data) || !body.meta) {
      throw new Error(`unexpected response shape on page ${page}`);
    }

    total = body.meta.total;
    pages = page;
    if (body.data.length === 0) break;

    // `meta.total` counts raw records. Offset paging repeats some across a page
    // boundary (Chris Sabin, id 33), so unique records are expected to be fewer.
    fetched += body.data.length;

    for (const raw of body.data) {
      const id = raw.id;
      if (typeof id !== 'number') throw new Error('API returned a record without an id');
      if (wrestlers.has(id)) continue; // ids are stable, so dedupe on them

      const categories = Array.isArray(raw.categories) ? raw.categories : [];
      wrestlers.set(id, {
        name: clean(raw.full_name),
        isHidden: raw.hide_from_roster === true,
        categories: categories
          .map((c) => clean((c as { name?: unknown }).name))
          .filter((name) => name.length > 0),
      });
    }

    if (page >= body.meta.last_page) break;
  }

  // Refuse a partial roster: writing one churns git history with alternating
  // add/remove commits (the TNA scraper has the same guard).
  if (fetched !== total) {
    throw new Error(
      `API returned ${fetched} of ${total} records across ${pages} page(s) ` +
        `(${wrestlers.size} unique ids)`
    );
  }
  return wrestlers;
}

// ------------------------------------------------------------------- build --

function buildRoster(
  championRefs: { id: number; title: string }[],
  wrestlers: Map<number, WrestlerRecord>
): AewRoster {
  const champions = championRefs.map(({ id, title }) => {
    const wrestler = wrestlers.get(id);
    if (!wrestler) throw new Error(`champion id ${id} ("${title}") is not in the roster data`);
    return { name: wrestler.name, title };
  });

  // Section names come straight from the API's category names. A member joins
  // every section it belongs to; today every record carries at most one.
  const sections = new Map<string, AewSection>();
  const listed = new Set<number>();

  for (const [id, w] of wrestlers) {
    if (w.isHidden) continue;
    if (!w.name) throw new Error(`wrestler ${id} has no name`);

    for (const name of w.categories.length > 0 ? w.categories : [UNCATEGORISED]) {
      const section = sections.get(name) ?? { name, members: [] };
      section.members.push({ name: w.name });
      sections.set(name, section);
      listed.add(id);
    }
  }

  const visible = [...wrestlers.values()].filter((w) => !w.isHidden).length;
  if (listed.size !== visible) {
    throw new Error(`only ${listed.size} of ${visible} visible wrestlers were placed in a section`);
  }

  // Sort everything so the file only changes when the roster changes: the source
  // orders by first name with ordinal collation, so its tie order is whatever the
  // database returned that day.
  return {
    champions: champions.sort((a, b) => a.title.localeCompare(b.title, 'en')),
    sections: [...sections.values()]
      .sort(byName)
      .map((s) => ({ name: s.name, members: s.members.sort(byName) })),
  };
}

// -------------------------------------------------------------------- main --

async function main(): Promise<void> {
  const res = await fetch(rosterUrl, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' } });
  if (!res.ok) throw new Error(`GET ${rosterUrl} -> ${res.status} ${res.statusText}`);

  // Read the champions first: a broken payload fails in 1 request instead of 11.
  const championRefs = readChampions(await res.text());
  const wrestlers = await readWrestlers();
  const roster = buildRoster(championRefs, wrestlers);
  const json = JSON.stringify(roster, null, 2) + '\n';

  if (process.argv.includes('--dry-run')) {
    process.stdout.write(json);
    return;
  }

  writeFileSync(outputPath, json);
  const members = roster.sections.reduce((n, s) => n + s.members.length, 0);
  console.log(
    `wrote ${outputPath}: ${roster.sections.length} sections, ` +
      `${members} members, ${roster.champions.length} champions`
  );
}

try {
  await main();
} catch (error) {
  console.error(`ERROR: ${(error as Error).message}`);
  process.exit(1);
}
