const STORAGE_KEY = 'data';
const STORAGE_KEY_DATE_PREFIX = 'date::';
const STORAGE_DEBOUNCE_MS = 60000; // persist storage once per minute, max

// make this user-configurable
const DISPLAY_KEY = 'tabsLastCount';

let dateDataCache = null;

let tabIds = [];

const prefixes = {
  tabsLastCount: '#',
  tabsOpened: '+',
  tabsClosed: '-',
  tabsSwitched: '~' 
  tabsLoaded: 'l',
  tabsUnloaded: 'u',
  windowCount: 'w',
  windowOpened: 'w+',
  windowClosed: 'w-',
  windowsSwitched: 'w~',
};

// Listen for the reasons for activation, and pass
// to initialization function.
browser.runtime.onStartup.addListener(() => {
  init('startup');
});
browser.runtime.onInstalled.addListener(() => {
  init('install');
});

async function init(reason) {
  //console.log('init', reason, getDateKey());
  
  // TODO: This is so wrong. Figure out how to deterministically detect
  // end of session restore.
  if (reason == 'startup') {
    //console.log('init: post-startup, so not listening to any tab events for 15s');
    setTimeout(initEventListeners, 15000);
  }
  else {
    initEventListeners();
  }

  // Populate UI
  updateBadge();
}

// Save changes to persistent storage.
// But only every STORAGE_DEBOUNCE_MS.
let updateStorage = debounce(async function updateStorage() {
  let dateKey = getDateKey();
  let storageKey = STORAGE_KEY_DATE_PREFIX + dateKey;
  let setParam = {};
  setParam[storageKey] = dateDataCache;
  await browser.storage.local.set(setParam);
}, STORAGE_DEBOUNCE_MS);

async function updateBadge() {
  // get data for current date
  const dateKey = getDateKey();
  const dateData = await getDateData(dateKey);

  // update badge data with default display value
  const count = dateData[DISPLAY_KEY]
  // 3 char display length limit on badge
  const str = count > 999 ? '999' : count.toString();
  browser.browserAction.setBadgeText({text: str});

  // set icon tooltip to summary of all counters
  let formattedCounts = Object.keys(prefixes).map(prefix => {
    return prefixes[prefix] + dateData[prefix].toString();
  });

  browser.browserAction.setTitle({title: formattedCounts.join(' / ')});
}

async function updateData(eventType) {
  const dateKey = getDateKey();
  let dateData = await getDateData(dateKey);
  if (eventType == 'onActivated') {
    dateData.tabsSwitched++;
  }
  else {
    if (eventType == 'onCreated') {
      dateData.tabsOpened++;
      dateData.tabsSwitched++;
    }
    else if (eventType == 'onRemoved') {
      dateData.tabsClosed++;
    }

    let numTabs = await getTabCount();
    if (eventType == 'onRemoved') {
      numTabs--;
    }
    dateData.tabsLastCount = numTabs;
    dateData.tabCounts[ (new Date()).getUTCHours() ] = numTabs;

    if (numTabs > dateData.tabsMaxCount) {
      dateData.tabsMaxCount = numTabs;
    }

    if (dateData.tabsMinCount === 0 || numTabs < dateData.tabsMinCount) {
      dateData.tabsMinCount = numTabs;
    }
  }
  // update UI
  updateBadge();

  await setDateData(dateKey, dateData);
}

function getDateKey() {
  const d = new Date();
  return [d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear()].join('-');
}

// Initializes persistent storage and cache if doesn't exist.
async function getDateData(dateKey) {
  // If no cache (eg, we just started up)...
  let dateData = getDateDataCache();
  // Or date changed while we've been running...
  if (!dateData || dateData.dateKey != dateKey) {
    // Get data from storage.
    const storageKey = STORAGE_KEY_DATE_PREFIX + dateKey;
    let items = await browser.storage.local.get(storageKey);
    // If no storage record for this date...
    if (!items[storageKey]) {
      // initialize date storage for the date.
      dateData = {
        dateKey: dateKey,
        lastUpdated: (new Date()),
        tabCounts: Array(24).fill(0),
        tabsLastCount: 0,
        tabsMaxCount: 0,
        tabsMinCount: 0,
        tabsOpened: 0,
        tabsClosed: 0,
        tabsSwitched: 0
      };
      // Store it.
      await setDateData(dateKey, dateData);
    }
    else {
      dateData = items[storageKey];
    }
    // Update cache
    setDateDataCache(dateData);
  }

  return dateData;
}

// These are the only two bits touching that one global.
function getDateDataCache() {
  return dateDataCache;
}

function setDateDataCache(dateData) {
  dateDataCache = dateData;
}

async function setDateData(dateKey, dateData) {
  setDateDataCache(dateData);
  await updateStorage();
}

function initEventListeners() {
  getTabCount();

  browser.tabs.onCreated.addListener(tab => {
    //console.log('onCreated');
    updateData('onCreated');
  });

  browser.tabs.onRemoved.addListener(tab => {
    //console.log('onRemoved');
    updateData('onRemoved');
    evictTabIdFromCache(tab.id);
  });

  browser.tabs.onActivated.addListener(info => {
    //console.log('onActivated');
    if (!isNewTabId(info.tabId)) {
      updateData('onActivated');
    }
  });
}

/*

Tab Cache: Manually create and manage a cache of ids of current tabs
because the core APIs can't do things like let you know if a user
switched between two different tabs.

*/

async function getTabCount() {
  const tabs = await browser.tabs.query({});
  // exta work to make sure our tab cache is freshhhhhh
  tabs.forEach(tab => { isNewTabId(tab.id) });
  return tabs.length;
}

function isNewTabId(id) {
  if (tabIds.indexOf(id) == -1) {
    tabIds.push(id);
    return true;
  }
  else {
    return false;
  }
}

function evictTabIdFromCache(id) {
  const index = tabIds.indexOf(id);
  if (index != -1) {
    tabIds.splice(index, 1);
  }
}

// https://davidwalsh.name/javascript-debounce-function
function debounce(func, wait, immediate) {
  let timeout
	return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    var callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) func.apply(context, args)
  }
}

browser.browserAction.onClicked.addListener((tab) => {
  console.log('TabStatistics: Exporting data to CSV...')
  dataToCSV()
})

const dataToCSV = async () => {
  let entries = await browser.storage.local.get(null);

  // loop over keys
  let preppedData = Object.keys(entries)
    // make an array of only valid keys
    .filter(k => k.startsWith('date::'))
    // make array of only entries with valid keys
    .map(k => entries[k])
    // fix any bad data
    // (so far, only ever found empty tabCounts for some reason)
    .map(e => {
      e.tabCounts = e.tabCounts ? e.tabCounts.join('|') : Array(24).fill().map(() => 0).join('|')
      return e
    })

  console.log('TabStatistics: Entries exporting to CSV...', preppedData.length)

  if (preppedData.length == 0) {
    return
  }

  const csvData = CSV(preppedData)

  const b = new Blob(
    [ csvData ],
    { type : 'text/plain;charset=utf-8' }
  )

  const url = URL.createObjectURL( b );

  await browser.tabs.create({ url })

  /*
  await browser.downloads.download({
    url,
    filename : 'all-tab-actions.csv'
  })
  */

  URL.revokeObjectURL(url)
}

function CSV(array) {
  const sep = ','
  const nl = '\n'
  // Use first element to choose the keys and the order
  const keys = Object.keys(array[0])

  // Build header
  let result = keys.join(sep) + nl

  // Add the rows
  array.forEach(function(obj){
    result += keys.map(k => obj[k]).join(sep) + nl
  })

  return result
}
