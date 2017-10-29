const STORAGE_KEY = 'data';
const DISPLAY_KEY = browser.runtime.getManifest().displayKey;

let data = {};

data[getDateKey()] = {
  lastUpdated: (new Date()),
  tabCounts: Array(24).fill(0),
  tabsLastCount: 0,
  tabsMaxCount: 0,
  tabsMinCount: 0,
  tabsOpened: 0,
  tabsClosed: 0,
  tabsSwitched: 0
};

let tabIds = [];

const prefixes = {
  tabsLastCount: '#',
  tabsOpened: '+',
  tabsClosed: '-',
  tabsSwitched: '~' 
};

function getDateKey() {
  const d = new Date();
  return [d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear()].join('-');
}

(async function loadStorage() {
  const storage = await browser.storage.local.get(STORAGE_KEY);

  // Not first run!
  //if (false){
  if (storage.data) {
    data = storage.data;
  }
  // First run!
  else {
    updateStorage();
  }
  updateBadge();
})();

// Save changes to persistent storage
function updateStorage() {
  browser.storage.local.set({STORAGE_KEY, data});
}

function updateBadge() {
  const dateKey = getDateKey();
  const str = prefixes[DISPLAY_KEY] + data[dateKey][DISPLAY_KEY].toString();
  browser.browserAction.setBadgeText({text: str});
}

async function updateData(eventType) {
  const dateKey = getDateKey();
  if (eventType == 'onActivated') {
    data[dateKey].tabsSwitched++;
  }
  else {
    if (eventType == 'onCreated') {
      data[dateKey].tabsOpened++;
    }
    else if (eventType == 'onRemoved') {
      data[dateKey].tabsClosed++;
    }

    let numTabs = await getTabCount();
    if (eventType == 'onRemoved') {
      numTabs--;
    }
    data[dateKey].tabsLastCount = numTabs;
    data[dateKey].tabCounts[ (new Date()).getUTCHours() ] = numTabs;

    if (numTabs > data[dateKey].tabsMaxCount) {
      data[dateKey].tabsMaxCount = numTabs;
    }

    if (data[dateKey].tabsMinCount === 0 || numTabs < data[dateKey].tabsMinCount) {
      data[dateKey].tabsMinCount = numTabs;
    }
  }
  updateBadge();
  updateStorage();
}

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

function evictTabId(id) {
  const index = tabIds.indexOf(id);
  if (index != -1) {
    tabIds.splice(index, 1);
  }
}

browser.tabs.onCreated.addListener(tab => {
  updateData('onCreated');
});

browser.tabs.onRemoved.addListener(tab => {
  updateData('onRemoved');
  evictTabId(tab.id);
});

browser.tabs.onActivated.addListener(info => {
  if (!isNewTabId(info.tabId)) {
    updateData('onActivated');
  }
});

if (['tabsLastCount', 'tabsSwitched'].indexOf(DISPLAY_KEY) > -1) {
  updateData('fluglehorn');
}
else {
  updateBadge();
}

