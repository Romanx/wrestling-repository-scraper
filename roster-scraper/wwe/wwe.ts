import { registerNetworkWait, normalizeText } from '../util';

declare global {
    interface Window {
        jQuery: any;
    }
}

const $ = window.jQuery;
registerNetworkWait();

const pagerIdentifier = '[data-drupal-views-infinite-scroll-pager="automatic"]';
const dropdownIdentifier = '[data-drupal-selector="edit-field-superstar-type-target-id"]';

const scrape = async () => {
    let champions = Array.from($('.championship-details').map(function() {
      return { champion: normalizeText(this.querySelector('h1').textContent), title: normalizeText(this.querySelector('p').textContent) }
    }));

    const invalidOptions = ['ALL SUPERSTARS', 'CURRENT SUPERSTARS'];

    const dropdown = <HTMLSelectElement>document.querySelector(dropdownIdentifier);
    const validOptions = Array.from(dropdown.options)
        .filter(option => invalidOptions.indexOf(option.innerText.toUpperCase()) === -1)

    let roster = [];

    for (const option of validOptions) {
      let section = await parseSection(option.textContent, option.value);
      roster.push(section);
    }

    return JSON.stringify({
      champions,
      roster
    }, undefined, 2);
}

scrape();

async function parseSection(title: string, value: string) {
    let $dropdown = $(dropdownIdentifier);
    $dropdown.val(value).change();
    await window.waitForNetworkIdle(500);

    let pager = $(pagerIdentifier)

    let attempt = 0;
    while (pager.length > 0)
    {
        pager.find('[rel=next]').click()
        await window.waitForNetworkIdle(1000);

        pager = $(pagerIdentifier);
        attempt++;
    }

    const superstars = Array.from($('.current-superstar-views-rows-wrapper .views-row')
      .map(function() { return normalizeText(this.querySelector('.views-field-title').textContent) }));

    return { title, superstars };
}
