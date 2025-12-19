import { normalizeText } from "../util";

const scrape = () => {
    let sections = Array.from(document.querySelectorAll('section.wixui-column-strip'))
        .map(section => ({
            title: section.querySelector('h1')?.innerText,
            section,
        }))
        .filter(i => i.title);

    var res = sections.map(s => convertSection(s));

    return JSON.stringify(res);
}

scrape();

/**
 * Extracts structured participant info from a MatchResults DOM element.
 * @param {{ title: string, section: Element }} item - The `.MatchResults` element containing anchors and text.
 */
function convertSection({ title, section }: { title: string; section: Element; })
{
    var members = Array.from(section.querySelectorAll('[role="listitem"]'))
        .map(section => {
            const name = normalizeText(section.querySelector('[data-testid="richTextElement"]')?.textContent);

            return {
                name: name,
                sublines: Array.from(section.querySelectorAll('h2'))
                    .map(l => normalizeText(l.textContent))
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