// @ts-ignore
const $ = window.jQuery;
registerNetworkWait();

const pagerIdentifier = '[data-drupal-views-infinite-scroll-pager="automatic"]';
const dropdownIdentifier = '[data-drupal-selector="edit-field-superstar-type-target-id"]';

async () => {
    let champions = Array.from($('.championship-details').map(function() {
      return { champion: unicodeTrim(this.querySelector('h1').textContent), title: unicodeTrim(this.querySelector('p').textContent) }
    }));

    const invalidOptions = ['ALL SUPERSTARS', 'CURRENT SUPERSTARS'];

    /** @type {HTMLSelectElement} */
    // @ts-ignore
    const dropdown = document.querySelector(dropdownIdentifier);
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

/**
 * Extracts structured participant info from a MatchResults DOM element.
 * @param {string} title
 * @param {string} value
 */
async function parseSection(title, value) {
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
      .map(function() { return unicodeTrim(this.querySelector('.views-field-title').textContent) }));

    return { title, superstars };
}

/**
 * @param {number} ms
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function registerNetworkWait() {
  if (window.waitForNetworkIdle) return; // don’t patch twice

  let pending = 0;
  let lastChange = Date.now();

  // Patch fetch
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    pending++;
    lastChange = Date.now();
    try {
      return await origFetch(...args);
    } finally {
      pending--;
      lastChange = Date.now();
    }
  };

  // Patch XHR
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener("loadstart", () => {
      pending++;
      lastChange = Date.now();
    });
    this.addEventListener("loadend", () => {
      pending--;
      lastChange = Date.now();
    });
    return origOpen.apply(this, args);
  };

  // Define the helper
  window.waitForNetworkIdle = function (timeout = 500, checkInterval = 100) {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (pending === 0 && Date.now() - lastChange >= timeout) {
          clearInterval(interval);
          resolve();
        }
      }, checkInterval);
    });
  };
};

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