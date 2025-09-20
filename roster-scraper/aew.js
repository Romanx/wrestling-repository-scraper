() => {
    let sections = Array.from(document.querySelectorAll('section.wixui-column-strip'))
        .map(section => ({
            title: section.querySelector('h1')?.innerText,
            section,
        }))
        .filter(i => i.title);

    var res = sections.map(s => convertSection(s));

    return JSON.stringify(res);
}

/**
 * Extracts structured participant info from a MatchResults DOM element.
 * @param {{ title: string, section: Element }} item - The `.MatchResults` element containing anchors and text.
 */
function convertSection({ title, section })
{
    var members = Array.from(section.querySelectorAll('[role="listitem"]'))
        .map(section => {
            const name = unicodeTrim(section.querySelector('[data-testid="richTextElement"]')?.textContent);

            return {
                name: name,
                sublines: Array.from(section.querySelectorAll('h2'))
                    .map(l => unicodeTrim(l.textContent))
                    .filter(text => text
                      && text.length > 0
                      && text.toUpperCase() !== 'Empty Heading'.toUpperCase()
                      && text !== name)
            }
        });

    return {
        title,
        members
    }
}

/**
 * @param {string | undefined} text
 */
function unicodeTrim(text) {
  // Match all Unicode separator characters (category Z)
  const unicodeSeparators = /[\u0020\u00A0\u1680\u2000-\u200A\u200b\u2028\u2029\u202F\u205F\u3000\uFEFF]/g;

  if (!text)
    return text;
  
  return text
    .replace(new RegExp(`^${unicodeSeparators.source}+|${unicodeSeparators.source}+$`, 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();
}