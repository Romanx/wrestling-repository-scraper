import { registerNetworkWait, normalizeText } from "../util.ts"

registerNetworkWait();

let scrape = async () => {
    let champions = parseChampions();
    let roster = await parseRoster();

    return JSON.stringify({
        champions,
        roster,
    });
};

scrape();

function parseChampions()
{
    return Array.from(document.querySelectorAll('.champions-section')[0].querySelectorAll('a')).map(el => {
        const name = el.querySelector('h5')!.innerText;
        const title = el.querySelector('h6')!.innerText;

        return {
            name: normalizeText(name),
            title: normalizeText(title),
        }
    });
}

async function parseRoster()
{
    const footer = document.getElementById('footer')!;
    let previous = 0;
    let current = footer.getBoundingClientRect().y;

    while (previous !== current) {
        previous = current;
        footer.scrollIntoView({ behavior: 'instant', block: 'end', inline: 'nearest' });
        await window.waitForNetworkIdle();
        current = footer.getBoundingClientRect().y;
    }

    let roster = Array.from(document.querySelectorAll('.roster-section #filterResults a'))
        .map(el => {
            const name = normalizeText(el.querySelector('h5')?.innerText);

            return {
                name,
            }
        })

    return roster;
}