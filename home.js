/* home.js – Home-Screen mit Bottom-Navigation */

const NAV_ITEMS = [
  {
    id: 'uebersicht', label: 'Übersicht',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  },
  {
    id: 'todos', label: 'Todos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  },
  {
    id: 'termine', label: 'Termine',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
      <line x1="16" x2="16" y1="2" y2="6"/>
      <line x1="8" x2="8" y1="2" y2="6"/>
      <line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  },
  {
    id: 'vertraege', label: 'Verträge',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" x2="8" y1="13" y2="13"/>
      <line x1="16" x2="8" y1="17" y2="17"/>
      <polyline points="10 9 9 9 8 9"/></svg>`,
  },
  {
    id: 'mehr', label: 'Mehr',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="1"/>
      <circle cx="19" cy="12" r="1"/>
      <circle cx="5" cy="12" r="1"/></svg>`,
  },
];

let _activeTab = 'uebersicht';

function renderHome(container) {
  container.innerHTML = `
    <div class="home-screen">
      <main class="tab-content" id="tab-content" role="main"></main>
      <nav class="bottom-nav" aria-label="Hauptnavigation">
        ${NAV_ITEMS.map(item => `
          <button class="nav-tab${item.id === _activeTab ? ' active' : ''}"
                  onclick="setActiveTab('${item.id}')"
                  aria-label="${item.label}"
                  aria-current="${item.id === _activeTab ? 'page' : 'false'}">
            ${item.icon}
            <span class="nav-label">${item.label}</span>
          </button>
        `).join('')}
      </nav>
    </div>
  `;
  initDashboard(document.getElementById('tab-content'));
}

function setActiveTab(tabId) {
  if (_activeTab === 'uebersicht') cleanupDashboard();
  if (_activeTab === 'todos')      cleanupTodos();
  if (_activeTab === 'termine')    cleanupTermine();
  if (_activeTab === 'vertraege')  cleanupContracts();

  _activeTab = tabId;
  document.querySelectorAll('.nav-tab').forEach((btn, i) => {
    const active = NAV_ITEMS[i].id === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });

  const content = document.getElementById('tab-content');
  if (!content) return;

  if (tabId === 'uebersicht') {
    content.innerHTML = '';
    initDashboard(content);
  } else if (tabId === 'todos') {
    content.innerHTML = '';
    initTodos(content);
  } else if (tabId === 'termine') {
    content.innerHTML = '';
    initTermine(content);
  } else if (tabId === 'vertraege') {
    content.innerHTML = '';
    initContracts(content);
  } else {
    content.innerHTML = _tabContent(tabId);
  }
}

function _tabContent(tabId) {
  if (tabId === 'mehr') {
    return `
      <div class="mehr-screen">
        <h1 class="screen-title">Mehr</h1>
        <div class="mehr-nav-list">
          <button class="mehr-nav-item" onclick="window.navigate('#/household')">
            <span>Haushaltsverwaltung</span>
            <svg class="mehr-nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
        <div class="mehr-stufe3">
          <p class="mehr-stufe3-label">Kommt in Stufe 3</p>
          <p class="mehr-stufe3-items">🔧 Garantien &nbsp;·&nbsp; 🎁 Geschenke</p>
        </div>
        <button class="btn-logout mehr-logout" onclick="logout()">Abmelden</button>
        <p class="mehr-version">NjaKër v2.0</p>
      </div>
    `;
  }
  const titles = {};
  const [title, text] = titles[tabId] || [tabId, ''];
  return `<div class="placeholder"><h2>${title}</h2><p>${text}</p></div>`;
}

async function logout() {
  await window.db.auth.signOut();
  // onAuthStateChange in app.js navigiert zu #/auth
}
