declare global {
  interface Window {
    waitForNetworkIdle: (timeout?: number, checkInterval?: number) => Promise<void>;
  }
}

const unicodeSeparators = /[\u0020\u00A0\u1680\u2000-\u200A\u200b\u2028\u2029\u202F\u205F\u3000\uFEFF]/g;
const unicodeSeparatorsRegex = new RegExp(`^${unicodeSeparators.source}+|${unicodeSeparators.source}+$`, 'g');

const replacements: [RegExp, string][] = [
  // Quotes
  [/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"],  // single quotes, prime
  [/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"'],  // double quotes, double prime
  [/[\u00AB\u00BB]/g, '"'],                          // guillemets « »
  [/[\u2039\u203A]/g, "'"],                          // single guillemets ‹ ›

  // Dashes and hyphens
  [/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-'],  // various dashes (‐‑‒–—―)
  [/[\u2212]/g, '-'],                                // minus sign
  
  // Ellipsis
  [/[\u2026]/g, '...'],                              // …
  
  // Other common ones
  [/[\u2022\u2023\u2043]/g, '-'],                    // bullets (•‣⁃)
  [/[\u00B7\u2027]/g, '-'],                          // middle dots (·‧)
  [/[\u2044\u2215]/g, '/'],                          // fraction slash, division slash
  [/[\u00D7]/g, 'x'],                                // multiplication sign ×
  [/[\u2026]/g, '...'],                              // horizontal ellipsis
];

export function normalizeText(text: string | undefined): string | undefined {
  if (!text) return text;

  let result = text;
  
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  return result
    .replace(unicodeSeparatorsRegex, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sortRoster(roster : Roster) : Roster
{
  // Sort by title
  roster.champions
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    champions: roster.champions,
    roster: roster.roster
      ?.sort((a, b) => a.name.localeCompare(b.name))
      .map(normalizeWrester),
    sections: roster.sections
      ?.sort((a, b) => a.name.localeCompare(b.name))
      .map(normalizeSection),
  }
}

function normalizeSection(section : Section) : Section
{
  section.members.sort((a, b) => a.name.localeCompare(b.name));
  for (const member of section.members) {
    normalizeWrester(member);
  }

  return section;
}

function normalizeWrester(wrestler : Wrestler) : Wrestler
{
  if (wrestler.info?.length == 0)
  {
    delete wrestler.info;
  }

  return wrestler;
}