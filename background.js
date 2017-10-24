const STORAGE_KEY = 'data';
const DISPLAY_KEY = 'tabsSwitched';

let data = {
  lastUpdated: (new Date()),
  tabsLastCount: 0,
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

async function loadStorage() {
  const storage = await browser.storage.local.get(STORAGE_KEY);

  // Not first run!
  if (storage.data) {
    data = storage.data;
  }
  // First run!
  else {
    updateStorage();
  }
}

// Save changes to persistent storage
function updateStorage() {
  data.lastUpdated = new Date();
  browser.storage.local.set({STORAGE_KEY, data});
}

function updateBadge() {
  const str = prefixes[DISPLAY_KEY] + data[DISPLAY_KEY].toString();
  browser.browserAction.setBadgeText({text: str});
}

async function updateData(eventType) {
  switch(eventType) {
    case 'onActivated':
      data.tabsSwitched++;
      break;
    case 'onCreated':
      data.tabsOpened++;
    case 'onRemoved':
      data.tabsClosed++;
    default:
      let numTabs = await getTabCount();
      if (eventType == 'onRemoved') {
        numTabs--;
      }
      data.tabsLastCount = numTabs;
      break;
  }
  updateBadge();
  //updateStorage();
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

