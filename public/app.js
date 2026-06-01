// FylePro — shared interactivity + entity management

// ============================================
// ENTITY DATA MODEL (v2.0.8)
// 3 entities under same PAN — switching changes
// sidebar, dashboard, due dates, and workflow.
// ============================================
const ENTITIES = [
  {
    id: 'apex-steel-mh',
    name: 'Apex Steel · Maharashtra',
    shortName: 'Apex Steel',
    gstin: '27AABCT3518Q1ZV',
    type: 'normal',
    typeLabel: 'Normal Registration',
    state: 'Maharashtra (27)',
    pan: 'AABCT3518Q',
    aato: '\u20B9 1,28,500 Cr (FY 25-26)',
    period: 'Monthly',
    nextDue: 'GSTR-1 by 11-Jun-2026',
    daysToDue: 27,
    homePage: 'gstr1.html'
  },
  {
    id: 'apex-services-isd',
    name: 'Apex Services Ltd · ISD',
    shortName: 'Apex Services (ISD)',
    gstin: '27AABCT3518Q2ZW',
    type: 'isd',
    typeLabel: 'Input Service Distributor',
    state: 'Maharashtra (27)',
    pan: 'AABCT3518Q',
    aato: 'N/A (ISD distributes credit)',
    period: 'Monthly',
    nextDue: 'GSTR-6 by 13-Jun-2026',
    daysToDue: 29,
    homePage: 'gstr6.html'
  },
  {
    id: 'apex-traders-comp',
    name: 'Apex Traders LLP · Composition',
    shortName: 'Apex Traders (Comp.)',
    gstin: '27AABCT3518Q3ZX',
    type: 'composition',
    typeLabel: 'Composition Scheme (\u00A710)',
    state: 'Maharashtra (27)',
    pan: 'AABCT3518Q',
    aato: '\u20B9 1.24 Cr (FY 25-26)',
    period: 'Quarterly',
    nextDue: 'CMP-08 (Q1) by 18-Jul-2026',
    daysToDue: 64,
    homePage: 'cmp08.html'
  }
];

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem('fylepro.session') || 'null');
  } catch(e) {
    return null;
  }
}

function getOnboardedCompanies() {
  try {
    const data = JSON.parse(localStorage.getItem('fylepro.onboarding') || 'null');
    if (!data || !Array.isArray(data.companies)) return [];
    const session = getStoredSession();
    const userId = session && session.userId;
    return data.companies
      .filter(company => !userId || company.accessUserIds.includes(userId))
      .map(company => ({
        id: company.id,
        name: company.companyName + ' · ' + company.state,
        shortName: company.companyName,
        gstin: company.gstin,
        type: 'normal',
        typeLabel: company.filingScheme === 'qrmp' ? 'Normal Registration · QRMP' : 'Normal Registration',
        state: company.state,
        pan: company.gstin.slice(2, 12),
        aato: 'Onboarded company',
        period: company.filingScheme === 'qrmp' ? 'Quarterly' : 'Monthly',
        nextDue: company.filingScheme === 'qrmp' ? 'QRMP filing cycle active' : 'Monthly filing cycle active',
        daysToDue: 0,
        homePage: 'gstr1.html'
      }));
  } catch(e) {
    return [];
  }
}

// Real GST registrations from the backend (populated by api.js on login/onboarding).
function getBackendRegistrations() {
  try {
    const regs = JSON.parse(localStorage.getItem('fylepro.registrations') || '[]');
    if (!Array.isArray(regs) || !regs.length) return [];
    return regs.map(function (r) {
      return {
        id: r.id,
        name: (r.company_name || r.legal_name || 'Company') + (r.state_name ? ' · ' + r.state_name : ''),
        shortName: r.company_name || r.legal_name || r.gstin,
        gstin: r.gstin,
        type: 'normal',
        typeLabel: r.filing_scheme === 'qrmp' ? 'Normal Registration · QRMP' : 'Normal Registration',
        state: (r.state_name || '') + (r.state_code ? ' (' + r.state_code + ')' : ''),
        pan: (r.gstin || '').slice(2, 12),
        aato: '',
        period: r.filing_scheme === 'qrmp' ? 'Quarterly' : 'Monthly',
        nextDue: 'GSTR-1 filing',
        daysToDue: 0,
        homePage: 'gstr1.html'
      };
    });
  } catch (e) { return []; }
}

function getAccessibleEntities() {
  const backend = getBackendRegistrations();
  if (backend.length) return backend;
  const onboarded = getOnboardedCompanies();
  return onboarded.length ? onboarded : ENTITIES;
}

function getCurrentEntity() {
  let id = null;
  const entities = getAccessibleEntities();
  try { id = localStorage.getItem('fylepro.entity'); } catch(e) {}
  const e = entities.find(x => x.id === id);
  return e || entities[0];
}

function switchEntity(newId) {
  const allowed = getAccessibleEntities().some(x => x.id === newId);
  if (!allowed) {
    if (window.showToast) window.showToast('Access denied for this company');
    return;
  }
  try { localStorage.setItem('fylepro.entity', newId); } catch(e) {}
  window.location.href = 'dashboard.html';
}

// ============================================
// EVENT WIRING (drawer, modal, tabs, etc.)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-drawer-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-drawer-open');
      const drawer = document.getElementById(id);
      const backdrop = document.getElementById(id + '-backdrop');
      if (drawer) drawer.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    });
  });
  document.querySelectorAll('[data-drawer-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-drawer-close');
      const drawer = document.getElementById(id);
      const backdrop = document.getElementById(id + '-backdrop');
      if (drawer) drawer.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
    });
  });
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-modal-open');
      const modal = document.getElementById(id);
      if (modal) modal.classList.add('open');
    });
  });
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-modal-close');
      const modal = document.getElementById(id);
      if (modal) modal.classList.remove('open');
    });
  });
  document.querySelectorAll('[data-tab-group]').forEach(group => {
    const tabs = group.querySelectorAll('[data-tab]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        group.querySelectorAll('[data-tab-panel]').forEach(p => {
          p.classList.toggle('hidden', p.getAttribute('data-tab-panel') !== target);
        });
      });
    });
  });
  document.querySelectorAll('[data-toggle-group]').forEach(group => {
    const btns = group.querySelectorAll('.toggle-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-toggle');
        if (target) {
          document.querySelectorAll('[data-toggle-panel]').forEach(p => {
            p.classList.toggle('hidden', p.getAttribute('data-toggle-panel') !== target);
          });
        }
      });
    });
  });
  document.querySelectorAll('.file-type-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const parent = opt.closest('.file-type-panel');
      if (parent) parent.querySelectorAll('.file-type-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const radio = opt.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });
  const fontBtn = document.getElementById('font-resize');
  if (fontBtn) {
    const sizes = [14, 15, 16, 13];
    let idx = 0;
    fontBtn.addEventListener('click', () => {
      idx = (idx + 1) % sizes.length;
      document.documentElement.style.fontSize = sizes[idx] + 'px';
    });
  }
});

// ============================================
// SIDEBAR VARIANTS (one per entity type)
// ============================================
function getSidebarHTML(active, entityType) {
  const isActive = (k) => active === k ? 'active' : '';

  // ---- ISD ----
  if (entityType === 'isd') {
    return `
      <a href="dashboard.html" class="nav-item ${isActive('dashboard')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
        <span class="nav-item-label">Dashboard</span>
      </a>
      <div class="nav-section">
        <div class="nav-section-label">Returns &middot; ISD</div>
        <a href="gstr6.html" class="nav-item ${isActive('gstr6')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
          <span class="nav-item-label">GSTR-6 Monthly</span>
          <span class="nav-badge warn">29d</span>
        </a>
        <a href="gstr6a-view.html" class="nav-item ${isActive('gstr6a')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span class="nav-item-label">GSTR-6A Auto-drafted</span>
        </a>
        <a href="gstr9-annual.html" class="nav-item ${isActive('gstr9')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="nav-item-label">GSTR-9 Annual</span>
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">ITC Management</div>
        <a href="gstr6-step1.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span class="nav-item-label">ITC Received</span>
        </a>
        <a href="gstr6-step2.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
          <span class="nav-item-label">ITC Distribution</span>
        </a>
        <a href="isd-units.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span class="nav-item-label">Recipient Units (12)</span>
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-group-collapsible" data-group="reconciliation">
          <button class="nav-section-toggle-header" type="button" aria-label="Toggle Reconciliation section">
            <svg class="nav-section-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <span>Reconciliation</span>
            <svg class="nav-section-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="nav-subitems">
            <a href="reco-2a-vs-2b.html" class="nav-item nav-subitem ${isActive('reco2a2b')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <span class="nav-item-label">2A vs 2B</span>
            </a>
            <a href="reco-2a-vs-books.html" class="nav-item nav-subitem ${isActive('reco2abooks')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span class="nav-item-label">2A vs Books</span>
            </a>
            <a href="reco-2b-vs-books.html" class="nav-item nav-subitem ${isActive('reco2bbooks')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span class="nav-item-label">2B vs Books</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">E-Invoice (IRN)</div>
        <div class="nav-group-collapsible" data-group="einvoice">
          <div class="nav-item-row">
            <a href="einvoice.html" class="nav-item nav-item-parent ${isActive('einvoice')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="nav-item-label">IRN hub</span>
              <span class="nav-badge warn">84 ⏱</span>
            </a>
            <button class="nav-collapse-toggle" type="button" aria-label="Toggle IRN sub-items">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="nav-subitems">
            <a href="einvoice-generate.html" class="nav-item nav-subitem ${isActive('einvgen')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="nav-item-label">Generate (single)</span>
            </a>
            <a href="einvoice-bulk.html" class="nav-item nav-subitem ${isActive('einvbulk')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span class="nav-item-label">Bulk &amp; ERP sync</span>
            </a>
            <a href="einvoice-management.html" class="nav-item nav-subitem ${isActive('einvmgmt')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span class="nav-item-label">Search &amp; manage</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">E-Way Bill (EWB)</div>
        <div class="nav-group-collapsible" data-group="ewb">
          <div class="nav-item-row">
            <a href="ewb.html" class="nav-item nav-item-parent ${isActive('ewb')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 17h2l1.5-9h11L19 17h2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M10 12h4"/></svg>
              <span class="nav-item-label">EWB hub</span>
              <span class="nav-badge warn">12 ⏱</span>
            </a>
            <button class="nav-collapse-toggle" type="button" aria-label="Toggle EWB sub-items">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="nav-subitems">
            <a href="ewb-generate.html" class="nav-item nav-subitem ${isActive('ewbgen')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="nav-item-label">Generate (single)</span>
            </a>
            <a href="ewb-bulk.html" class="nav-item nav-subitem ${isActive('ewbbulk')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span class="nav-item-label">Bulk &amp; portal sync</span>
            </a>
            <a href="ewb-management.html" class="nav-item nav-subitem ${isActive('ewbmgmt')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
              <span class="nav-item-label">Manage all</span>
            </a>
          </div>
        </div>
      </div>


      <div class="nav-section">
        <div class="nav-section-label">Reports &amp; Compliance</div>
        <a href="reports.html" class="nav-item ${isActive('reports')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span class="nav-item-label">Reports &amp; downloads</span>
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-group-collapsible" data-group="ledgers">
          <button class="nav-section-toggle-header" type="button" aria-label="Toggle Ledgers section">
            <svg class="nav-section-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
            <span>Ledgers &amp; Payments</span>
            <svg class="nav-section-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="nav-subitems">
            <a href="ledgers.html" class="nav-item nav-subitem ${isActive('ledgers')}" style="font-weight:600;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              <span class="nav-item-label">Overview &middot; all ledgers</span>
            </a>
            <a href="cash-ledger.html" class="nav-item nav-subitem ${isActive('cashledger')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
              <span class="nav-item-label">Cash Ledger</span>
            </a>
            <a href="credit-ledger.html" class="nav-item nav-subitem ${isActive('creditledger')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span class="nav-item-label">Credit Ledger</span>
            </a>
            <a href="challans.html" class="nav-item nav-subitem ${isActive('challans')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
              <span class="nav-item-label">Challans</span>
            </a>
            <a href="drc03a.html" class="nav-item nav-subitem ${isActive('drc03a')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="nav-item-label">DRC-03A · Refunds</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Compliance</div>
        <a href="notices.html" class="nav-item ${isActive('notices')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="nav-item-label">Notices &amp; Orders</span>
        </a>
      </div>
    `;
  }

  // ---- COMPOSITION ----
  if (entityType === 'composition') {
    return `
      <a href="dashboard.html" class="nav-item ${isActive('dashboard')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
        <span class="nav-item-label">Dashboard</span>
      </a>
      <div class="nav-section">
        <div class="nav-section-label">Returns &middot; Composition</div>
        <a href="cmp08.html" class="nav-item ${isActive('cmp08')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
          <span class="nav-item-label">CMP-08 Quarterly</span>
          <span class="nav-badge warn">64d</span>
        </a>
        <a href="gstr4.html" class="nav-item ${isActive('gstr4')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="nav-item-label">GSTR-4 Annual</span>
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Outward Supplies</div>
        <a href="bos-register.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="nav-item-label">Bill of Supply</span>
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Inward Supplies</div>
        <a href="purchase-register-comp.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <span class="nav-item-label">Purchase Register</span>
        </a>
      </div>
            <div class="nav-section">
        <div class="nav-group-collapsible" data-group="reconciliation">
          <button class="nav-section-toggle-header" type="button" aria-label="Toggle Reconciliation section">
            <svg class="nav-section-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <span>Reconciliation</span>
            <svg class="nav-section-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="nav-subitems">
            <a href="reco-2a-vs-books.html" class="nav-item nav-subitem ${isActive('reco2abooks')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span class="nav-item-label">2A vs Books</span>
            </a>
            <a href="reco-books-vs-einv.html" class="nav-item nav-subitem ${isActive('recobookseinv')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>
              <span class="nav-item-label">Books vs E-invoice</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">E-Invoice (IRN)</div>
        <div class="nav-group-collapsible" data-group="einvoice">
          <div class="nav-item-row">
            <a href="einvoice.html" class="nav-item nav-item-parent ${isActive('einvoice')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="nav-item-label">IRN hub</span>
              <span class="nav-badge warn">84 ⏱</span>
            </a>
            <button class="nav-collapse-toggle" type="button" aria-label="Toggle IRN sub-items">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="nav-subitems">
            <a href="einvoice-generate.html" class="nav-item nav-subitem ${isActive('einvgen')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="nav-item-label">Generate (single)</span>
            </a>
            <a href="einvoice-bulk.html" class="nav-item nav-subitem ${isActive('einvbulk')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span class="nav-item-label">Bulk &amp; ERP sync</span>
            </a>
            <a href="einvoice-management.html" class="nav-item nav-subitem ${isActive('einvmgmt')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span class="nav-item-label">Search &amp; manage</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">E-Way Bill (EWB)</div>
        <div class="nav-group-collapsible" data-group="ewb">
          <div class="nav-item-row">
            <a href="ewb.html" class="nav-item nav-item-parent ${isActive('ewb')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 17h2l1.5-9h11L19 17h2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M10 12h4"/></svg>
              <span class="nav-item-label">EWB hub</span>
              <span class="nav-badge warn">12 ⏱</span>
            </a>
            <button class="nav-collapse-toggle" type="button" aria-label="Toggle EWB sub-items">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="nav-subitems">
            <a href="ewb-generate.html" class="nav-item nav-subitem ${isActive('ewbgen')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="nav-item-label">Generate (single)</span>
            </a>
            <a href="ewb-bulk.html" class="nav-item nav-subitem ${isActive('ewbbulk')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span class="nav-item-label">Bulk &amp; portal sync</span>
            </a>
            <a href="ewb-management.html" class="nav-item nav-subitem ${isActive('ewbmgmt')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
              <span class="nav-item-label">Manage all</span>
            </a>
          </div>
        </div>
      </div>
<div class="nav-section">
        <div class="nav-section-label">Reports &amp; Compliance</div>
        <a href="reports.html" class="nav-item ${isActive('reports')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span class="nav-item-label">Reports &amp; downloads</span>
        </a>
      </div>
            <div class="nav-section">
        <div class="nav-group-collapsible" data-group="ledgers">
          <button class="nav-section-toggle-header" type="button" aria-label="Toggle Ledgers section">
            <svg class="nav-section-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
            <span>Ledgers &amp; Payments</span>
            <svg class="nav-section-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="nav-subitems">
            <a href="ledgers.html" class="nav-item nav-subitem ${isActive('ledgers')}" style="font-weight:600;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              <span class="nav-item-label">Overview &middot; all ledgers</span>
            </a>
            <a href="cash-ledger.html" class="nav-item nav-subitem ${isActive('cashledger')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
              <span class="nav-item-label">Cash Ledger</span>
            </a>
            <a href="credit-ledger.html" class="nav-item nav-subitem ${isActive('creditledger')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span class="nav-item-label">Credit (ITC) Ledger</span>
            </a>
            <a href="challans.html" class="nav-item nav-subitem ${isActive('challans')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
              <span class="nav-item-label">Challans</span>
            </a>
            <a href="drc03a.html" class="nav-item nav-subitem ${isActive('drc03a')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="nav-item-label">DRC-03A &middot; Refunds</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Compliance</div>
        <a href="notices.html" class="nav-item ${isActive('notices')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="nav-item-label">Notices &amp; Orders</span>
        </a>
      </div>
    `;
  }

  // ---- NORMAL (default) ----
  return `
      <a href="dashboard.html" class="nav-item ${isActive('dashboard')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
        <span class="nav-item-label">Dashboard</span>
      </a>
      <div class="nav-section">
        <div class="nav-section-label">Returns</div>
        <a href="gstr1.html" class="nav-item ${isActive('gstr1')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
          <span class="nav-item-label">GSTR-1 Outward</span>
          <span class="nav-badge warn">27d</span>
        </a>
        <a href="gstr1-workbench.html" class="nav-item ${isActive('gstr1reco')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span class="nav-item-label">GSTR-1 Reconciliation</span>
          <span class="nav-badge success">Live</span>
        </a>
        <a href="gstr1a.html" class="nav-item ${isActive('gstr1a')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          <span class="nav-item-label">GSTR-1A Amendment</span>
          <span class="nav-badge success">New</span>
        </a>
        <a href="gstr3b.html" class="nav-item ${isActive('gstr3b')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <span class="nav-item-label">GSTR-3B Inward</span>
          <span class="nav-badge">36d</span>
        </a>
        <a href="gstr9-annual.html" class="nav-item ${isActive('gstr9')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="nav-item-label">GSTR-9 Annual</span>
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Inward Supplies</div>
        <a href="ims.html" class="nav-item ${isActive('ims')}" style="position:relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span class="nav-item-label">IMS &middot; Invoice Mgmt</span>
          <span class="nav-badge warn">142</span>
        </a>
        <a href="pr-recon.html" class="nav-item ${isActive('prrecon')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
          <span class="nav-item-label">PR vs 2B Recon</span>
        </a>
        <a href="itc-upload.html" class="nav-item ${isActive('itc')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>
          <span class="nav-item-label">ITC Reconciliation</span>
        </a>
        <a href="rcm-statement.html" class="nav-item ${isActive('rcm')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          <span class="nav-item-label">RCM Liability/ITC</span>
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-group-collapsible" data-group="reconciliation">
          <button class="nav-section-toggle-header" type="button" aria-label="Toggle Reconciliation section">
            <svg class="nav-section-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <span>Reconciliation</span>
            <svg class="nav-section-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="nav-subitems">
            <a href="reco-2a-vs-2b.html" class="nav-item nav-subitem ${isActive('reco2a2b')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <span class="nav-item-label">2A vs 2B</span>
            </a>
            <a href="reco-2a-vs-books.html" class="nav-item nav-subitem ${isActive('reco2abooks')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span class="nav-item-label">2A vs Books</span>
            </a>
            <a href="reco-2b-vs-books.html" class="nav-item nav-subitem ${isActive('reco2bbooks')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span class="nav-item-label">2B vs Books</span>
              <span class="nav-badge warn">critical</span>
            </a>
            <a href="reco-books-vs-ims.html" class="nav-item nav-subitem ${isActive('recobooksims')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span class="nav-item-label">Books vs IMS</span>
            </a>
            <a href="reco-books-vs-einv.html" class="nav-item nav-subitem ${isActive('recobookseinv')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>
              <span class="nav-item-label">Books vs E-invoice</span>
            </a>
            <a href="reco-export-inv-vs-books.html" class="nav-item nav-subitem ${isActive('recoexport')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span class="nav-item-label">Exports tie-out</span>
            </a>
            <a href="reco-files.html" class="nav-item nav-subitem ${isActive('recofiles')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span class="nav-item-label">Compare two files</span>
              <span class="nav-badge success">Live</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">E-Invoice (IRN)</div>
        <div class="nav-group-collapsible" data-group="einvoice">
          <div class="nav-item-row">
            <a href="einvoice.html" class="nav-item nav-item-parent ${isActive('einvoice')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="nav-item-label">IRN hub</span>
              <span class="nav-badge warn">84 ⏱</span>
            </a>
            <button class="nav-collapse-toggle" type="button" aria-label="Toggle IRN sub-items">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="nav-subitems">
            <a href="einvoice-generate.html" class="nav-item nav-subitem ${isActive('einvgen')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="nav-item-label">Generate (single)</span>
            </a>
            <a href="einvoice-bulk.html" class="nav-item nav-subitem ${isActive('einvbulk')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span class="nav-item-label">Bulk &amp; ERP sync</span>
            </a>
            <a href="einvoice-management.html" class="nav-item nav-subitem ${isActive('einvmgmt')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span class="nav-item-label">Search &amp; manage</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">E-Way Bill (EWB)</div>
        <div class="nav-group-collapsible" data-group="ewb">
          <div class="nav-item-row">
            <a href="ewb.html" class="nav-item nav-item-parent ${isActive('ewb')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 17h2l1.5-9h11L19 17h2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M10 12h4"/></svg>
              <span class="nav-item-label">EWB hub</span>
              <span class="nav-badge warn">12 ⏱</span>
            </a>
            <button class="nav-collapse-toggle" type="button" aria-label="Toggle EWB sub-items">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="nav-subitems">
            <a href="ewb-generate.html" class="nav-item nav-subitem ${isActive('ewbgen')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="nav-item-label">Generate (single)</span>
            </a>
            <a href="ewb-bulk.html" class="nav-item nav-subitem ${isActive('ewbbulk')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span class="nav-item-label">Bulk &amp; portal sync</span>
            </a>
            <a href="ewb-management.html" class="nav-item nav-subitem ${isActive('ewbmgmt')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
              <span class="nav-item-label">Manage all</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Reports &amp; Compliance</div>
        <a href="reports.html" class="nav-item ${isActive('reports')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span class="nav-item-label">Reports &amp; downloads</span>
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-group-collapsible" data-group="ledgers">
          <button class="nav-section-toggle-header" type="button" aria-label="Toggle Ledgers section">
            <svg class="nav-section-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
            <span>Ledgers &amp; Payments</span>
            <svg class="nav-section-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="nav-subitems">
            <a href="ledgers.html" class="nav-item nav-subitem ${isActive('ledgers')}" style="font-weight:600;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              <span class="nav-item-label">Overview &middot; all ledgers</span>
            </a>
            <a href="cash-ledger.html" class="nav-item nav-subitem ${isActive('cashledger')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
              <span class="nav-item-label">Cash Ledger</span>
            </a>
            <a href="credit-ledger.html" class="nav-item nav-subitem ${isActive('creditledger')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span class="nav-item-label">Credit (ITC) Ledger</span>
            </a>
            <a href="challans.html" class="nav-item nav-subitem ${isActive('challans')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
              <span class="nav-item-label">Challans</span>
            </a>
            <a href="drc03a.html" class="nav-item nav-subitem ${isActive('drc03a')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="nav-item-label">DRC-03A · Refunds</span>
            </a>
          </div>
        </div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Compliance</div>
        <a href="notices.html" class="nav-item ${isActive('notices')}" style="position:relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="nav-item-label">Notices &amp; Orders</span>
          <span class="nav-badge">3</span>
        </a>
        <a href="amnesty.html" class="nav-item ${isActive('amnesty')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span class="nav-item-label">\u00A7128A Amnesty</span>
          <span class="nav-badge success">SPL</span>
        </a>
      </div>
  `;
}

// ============================================
// ENTITY SWITCHER PANEL HTML
// ============================================
function getEntitySwitcherPanel(currentId) {
  const entities = getAccessibleEntities();
  const pan = entities[0] && entities[0].pan ? entities[0].pan : 'selected PAN';
  const cardHTML = (e) => {
    const isSel = e.id === currentId;
    const cls = e.type === 'isd' ? 'isd' : e.type === 'composition' ? 'composition' : '';
    const icon = e.type === 'isd' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>'
               : e.type === 'composition' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
               : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>';
    return `
      <div class="entity-card ${isSel ? 'selected' : ''}" data-entity-id="${e.id}">
        <div class="entity-card-icon ${cls}">${icon}</div>
        <div class="entity-card-body">
          <div class="entity-card-name">${e.name}</div>
          <div class="entity-card-meta">${e.gstin} &middot; ${e.state}</div>
          <div class="entity-card-meta-row">
            <span class="entity-card-type-pill ${cls}">${e.typeLabel}</span>
            <span class="entity-card-aato">${e.period} &middot; AATO ${e.aato}</span>
          </div>
        </div>
        <div class="entity-card-check">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>`;
  };
  return `
    <div class="entity-switcher-overlay" id="entity-switcher-overlay"></div>
    <div class="entity-switcher-panel" id="entity-switcher-panel">
      <div class="entity-switcher-panel-header">
        <div class="entity-switcher-panel-title">Switch filing entity</div>
        <div class="entity-switcher-panel-sub">Only companies assigned to your login are listed here. Current PAN scope: <strong class="mono">${pan}</strong>.</div>
      </div>
      <div class="entity-switcher-list">
        ${entities.map(cardHTML).join('')}
      </div>
    </div>`;
}

// ============================================
// ENTITY STRIP (top of every page)
// ============================================
function getEntityStripHTML(entity) {
  const cls = entity.type === 'isd' ? 'isd' : entity.type === 'composition' ? 'composition' : '';
  const shortType = entity.type === 'isd' ? 'ISD' : entity.type === 'composition' ? 'Composition' : 'Normal';
  return `
    <div class="entity-strip">
      <div class="entity-strip-left">
        <span class="entity-strip-label">Filing for</span>
        <div class="entity-strip-current" id="entity-strip-trigger">
          <span class="entity-strip-current-name">${entity.shortName}</span>
          <span class="entity-strip-current-gstin">${entity.gstin}</span>
          <span class="entity-strip-type-badge ${cls}">${shortType}</span>
          <svg class="entity-strip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entity-strip-right">
        <div class="entity-strip-due">
          <span class="entity-strip-due-label">Next due:</span>
          <span class="entity-strip-due-value">${entity.nextDue}</span>
        </div>
      </div>
    </div>`;
}

// ============================================
// SHELL RENDERER
// ============================================
function renderShell(active, moduleName, breadcrumb) {
  const session = getStoredSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  const entity = getCurrentEntity();

  const hamburger = `
  <button class="hamburger-fab" id="hamburger-toggle" aria-label="Open menu" type="button">
    <svg class="ham-icon-bars" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    <svg class="ham-icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
  <div class="sidebar-overlay" id="sidebar-overlay"></div>`;

  const sidebar = `
  <aside class="sidebar drawer-mode" id="sidebar-drawer">
    <div class="brand">
      <div class="brand-mark">FP</div>
      <div class="brand-text">FylePro</div>
    </div>
    <nav class="nav">
      ${getSidebarHTML(active, entity.type)}
      <div class="nav-section">
        <div class="nav-section-label">System</div>
        <a class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span class="nav-item-label">Settings</span>
        </a>
        <a class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span class="nav-item-label">Help &amp; Support</span>
        </a>
      </div>
    </nav>
    <div class="sidebar-footer">
      v2.0.8 &middot; Build 2026.05<br>
      <span style="opacity:0.6">FylePro Platform</span>
    </div>
  </aside>`;

  const header = `
  <header class="header header-fluid">
    <div class="header-left">
      <div class="header-module">${moduleName}</div>
      ${breadcrumb ? `<div class="header-breadcrumb">${breadcrumb}</div>` : ''}
    </div>
    <div class="header-right">
      <button class="header-icon-btn" id="font-resize" title="Font size">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
      </button>
      <button class="header-icon-btn" title="Notifications">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="notif-dot">7</span>
      </button>
      <button class="header-icon-btn" title="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/></svg>
      </button>
      <button class="user-chip">
        <div class="avatar">${session.initials || 'FP'}</div>
        <div>
          <div class="user-name">${session.name || 'FylePro User'}</div>
          <span class="user-meta">${session.role || 'Tax Manager'} &middot; ${session.company || 'Workspace'}</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>
  </header>`;

  document.getElementById('shell-sidebar').innerHTML = hamburger + sidebar;
  document.getElementById('shell-header').innerHTML = header;

  // Inject entity strip at top of main + panel on body
  const main = document.querySelector('main.main');
  if (main) {
    const stripWrap = document.createElement('div');
    stripWrap.innerHTML = getEntityStripHTML(entity);
    main.insertBefore(stripWrap.firstElementChild, main.firstChild);
    const panelWrap = document.createElement('div');
    panelWrap.innerHTML = getEntitySwitcherPanel(entity.id);
    while (panelWrap.firstChild) document.body.appendChild(panelWrap.firstChild);
  }

  // Hamburger
  const btn = document.getElementById('hamburger-toggle');
  const drawer = document.getElementById('sidebar-drawer');
  const overlay = document.getElementById('sidebar-overlay');
  if (btn && drawer && overlay) {
    const closeDrawer = () => {
      drawer.classList.remove('open');
      overlay.classList.remove('visible');
      btn.classList.remove('is-open');
      btn.setAttribute('aria-label', 'Open menu');
    };
    const openDrawer = () => {
      drawer.classList.add('open');
      overlay.classList.add('visible');
      btn.classList.add('is-open');
      btn.setAttribute('aria-label', 'Close menu');
    };
    btn.addEventListener('click', () => {
      if (drawer.classList.contains('open')) closeDrawer();
      else openDrawer();
    });
    overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    });
  }

  // Entity switcher
  const trigger = document.getElementById('entity-strip-trigger');
  const eOverlay = document.getElementById('entity-switcher-overlay');
  const ePanel = document.getElementById('entity-switcher-panel');
  if (trigger && eOverlay && ePanel) {
    const closeE = () => { eOverlay.classList.remove('open'); ePanel.classList.remove('open'); };
    const openE = () => { eOverlay.classList.add('open'); ePanel.classList.add('open'); };
    trigger.addEventListener('click', openE);
    eOverlay.addEventListener('click', closeE);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ePanel.classList.contains('open')) closeE();
    });
    ePanel.querySelectorAll('.entity-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-entity-id');
        if (id) switchEntity(id);
      });
    });
  }

  // Dashboard adaptation
  if (active === 'dashboard') applyEntityToDashboard(entity);
}

// Show/hide page sections based on entity type
function applyEntityToDashboard(entity) {
  document.querySelectorAll('[data-entity-section]').forEach(el => {
    const types = el.getAttribute('data-entity-section').split(',').map(s => s.trim());
    el.style.display = types.includes(entity.type) ? '' : 'none';
  });
}

// ============================================
// TOAST SYSTEM
// ============================================
function ensureToastContainer() {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  return c;
}

function showToast(message, type) {
  type = type || 'success';
  var container = ensureToastContainer();
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  var iconSvg;
  if (type === 'warning') iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  else if (type === 'info') iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  else iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>';
  toast.innerHTML = '<div class="toast-icon">' + iconSvg + '</div><div class="toast-msg">' + message + '</div>';
  container.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('visible'); });
  setTimeout(function() { toast.classList.remove('visible'); setTimeout(function() { toast.remove(); }, 250); }, 2800);
}

document.addEventListener('click', function(e) {
  var btn = e.target.closest('button');
  if (!btn) return;
  if (btn.matches('[data-modal-open], [data-modal-close], [data-drawer-open], [data-drawer-close]')) return;
  if (btn.matches('[data-tab], [data-toggle]')) return;
  if (btn.id === 'font-resize' || btn.id === 'hamburger-toggle') return;
  if (btn.closest('.file-type-option')) return;
  if (btn.closest('.entity-switcher-panel')) return;
  if (btn.closest('#entity-strip-trigger')) return;
  if (btn.classList.contains('user-chip')) return;
  if (btn.classList.contains('expand-icon-btn')) return;
  if (btn.classList.contains('page-btn')) return;
  if (btn.classList.contains('icon-btn') || btn.classList.contains('header-icon-btn') || btn.classList.contains('ctx-icon-btn')) {
    var title = btn.getAttribute('title'); if (title) showToast(title); return;
  }
  var text = btn.textContent.trim().replace(/\s+/g, ' ');
  if (!text) return;
  if (text.length > 50) text = text.slice(0, 47) + '...';
  var lower = text.toLowerCase();
  if (/export|download/.test(lower)) showToast(text + ' \u2014 file would download (demo)', 'info');
  else if (/delete|cancel|remove|reset/.test(lower)) showToast(text + ' \u2014 confirmation step skipped (demo)', 'warning');
  else if (/start upload|browse files/.test(lower)) showToast('Upload queued \u2014 processing simulated in demo');
  else if (/^search$/.test(lower)) showToast('Filters applied');
  else if (/generate now/.test(lower)) showToast('Report queued for generation');
  else showToast(text);
});

// ============================================
// v2.0.9 — STEP PAYLOAD CONTROL PANEL
// Renders a uniform "data control" widget below
// any step's main content. Page calls:
//   renderPayloadControl({
//     anchor: '#payload-mount',
//     title: 'Step 1 payload — Purchase Register',
//     version: 'v4',
//     sourceLabel: 'Upload + ERP sync',
//     files: [...],
//     showResync: true,
//     resyncLabel: 'Re-sync from ERP',
//     history: [...]
//   });
// ============================================
function renderPayloadControl(cfg) {
  if (!cfg || !cfg.anchor) return;
  const mount = document.querySelector(cfg.anchor);
  if (!mount) return;

  const files = (cfg.files || []).map(f => {
    const ext = (f.type || 'json').toLowerCase();
    const icon = ext.toUpperCase();
    return `
      <div class="payload-file" title="Download ${f.name}">
        <div class="payload-file-icon ${ext}">${icon}</div>
        <div class="payload-file-body">
          <div class="payload-file-name">${f.name}</div>
          <div class="payload-file-meta">${f.meta || ''}</div>
        </div>
        <div class="payload-file-dl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </div>
      </div>`;
  }).join('');

  const history = (cfg.history || []).map(h => {
    const tagCls = h.tag || 'current';
    const rowCls = (h.tag === 'current') ? 'current' : (h.tag === 'override') ? 'override' : '';
    return `
      <div class="payload-version-row ${rowCls}">
        <div class="payload-version-dot"></div>
        <div class="payload-version-meta">
          <strong>${h.label || ''}</strong> &middot; <span class="mono">${h.version || ''}</span>
          <div class="payload-version-meta-sub">${h.by || ''} &middot; ${h.time || ''}${h.note ? ' &middot; ' + h.note : ''}</div>
        </div>
        <span class="payload-version-tag ${tagCls}">${tagCls === 'current' ? 'Current' : tagCls === 'override' ? 'Override' : tagCls === 'initial' ? 'Initial' : tagCls === 'resync' ? 'Re-sync' : tagCls}</span>
        <div class="payload-version-actions">
          <button class="payload-version-mini-btn" title="Download v${h.version}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          ${tagCls === 'current' ? '' : `
          <button class="payload-version-mini-btn" title="Restore v${h.version}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>`}
        </div>
      </div>`;
  }).join('');

  const resyncBtn = cfg.showResync ? `
    <button class="payload-action-btn resync" title="Re-sync from source">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      ${cfg.resyncLabel || 'Re-sync'}
    </button>` : '';

  mount.innerHTML = `
    <div class="payload-control">
      <div class="payload-control-head">
        <div class="payload-control-head-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div>
          <div class="payload-control-head-title">${cfg.title || 'Step payload'}</div>
          <div class="payload-control-head-sub">Source: ${cfg.sourceLabel || 'Manual'} &middot; ${cfg.recordCount || ''} records &middot; SHA: ${cfg.sha || '—'}</div>
        </div>
        <div class="payload-control-version-pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
          Live: ${cfg.version || 'v1'}
        </div>
      </div>

      <div class="payload-files">${files}</div>

      <div class="payload-actions">
        <button class="payload-action-btn add" title="Add new records to this payload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add records
        </button>
        <button class="payload-action-btn edit" title="Edit existing rows in payload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          Edit rows
        </button>
        <button class="payload-action-btn amend" title="Amend prior-period records">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
          Amend prior period
        </button>
        <button class="payload-action-btn override" title="Force-override values (creates new version with override tag)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Manual override
        </button>
        <button class="payload-action-btn reset" title="Reset this step (discards uncommitted edits)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Reset step
        </button>
        ${resyncBtn}
      </div>

      <div class="payload-history-head">Version history &middot; ${(cfg.history || []).length} snapshots &middot; all retained for audit / rollback</div>
      <div class="payload-history">${history}</div>
    </div>
  `;
}


// ============================================
// v2.0.11 — STEP HEADER + STEP FOOTER (CA-CORRECT ORDER)
// renderStepHeader → sits ABOVE the working tables.
//   Provides orientation: status + help + current upload card.
// renderStepFooter → sits BELOW the working tables.
//   Provides decision context: validation + disposition + upload history.
// Working data tables and the sticky action bar remain in page HTML
// between these two mounts.
// ============================================

function _statusStripHTML(s) {
  s = s || {};
  const stateCls = (s.state || 'in-progress').toLowerCase().replace(/\s+/g, '-');
  const stateLabel = s.state || 'In progress';
  const stateIcon = (stateCls === 'completed' || stateCls === 'filed' || stateCls === 'submitted')
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const facts = [
    { label: 'Period', value: s.period || '\u2014' },
    { label: 'Today', value: s.today || '15-May-2026 (Fri)' },
    { label: 'Filing due', value: s.due || '\u2014', cls: s.dueClass || '' },
    { label: 'Last action', value: s.lastAction || '\u2014' },
    { label: 'Next milestone', value: s.nextMilestone || '\u2014' }
  ];
  return `
    <div class="step-status-strip">
      <div class="step-status-strip-row">
        <div class="step-status-state ${stateCls}">${stateIcon}${stateLabel}</div>
        <div style="font-size:12px;color:var(--text-muted);">Step status reflects the most recent action taken in this workflow node.</div>
      </div>
      <div class="step-status-strip-facts-row">
        ${facts.map(f => `
          <div>
            <div class="step-status-fact-label">${f.label}</div>
            <div class="step-status-fact-value ${f.cls || ''}">${f.value}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function _currentUploadHTML(u) {
  if (!u) return '';
  const fileExt = (u.fileType || 'xlsx').toLowerCase();
  const countsHTML = (u.pass === undefined && u.warn === undefined && u.fail === undefined) ? '' : `
    <div class="current-upload-counts">
      <span class="upload-count-pill total">${u.records || '0'} records</span>
      ${u.pass !== undefined ? `<span class="upload-count-pill pass">\u2713 ${u.pass} pass</span>` : ''}
      ${u.warn ? `<span class="upload-count-pill warn">\u26A0 ${u.warn} warn</span>` : ''}
      ${u.fail ? `<span class="upload-count-pill fail">\u2717 ${u.fail} fail</span>` : ''}
    </div>`;
  return `
    <div class="current-upload-card">
      <div class="current-upload-icon">${fileExt}</div>
      <div class="current-upload-body">
        <div class="current-upload-label">${u.label || 'Currently loaded payload'}</div>
        <div class="current-upload-name">${u.fileName || 'No file uploaded yet'}</div>
        <div class="current-upload-meta">
          ${u.source || 'Manual'} &middot; ${u.size || ''} &middot; uploaded by ${u.uploadedBy || '\u2014'} &middot; ${u.uploadedAt || '\u2014'}
        </div>
        ${countsHTML}
      </div>
      <div class="current-upload-actions">
        <button class="current-upload-dl-btn" title="Download current payload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
      </div>
    </div>`;
}

function _validationStripHTML(vList) {
  // v2.0.30 — disabled per user request. Validation summary strip removed from step
  // pages because it duplicated info shown in the activity tracker (Run Validate +
  // history rows). Return empty string regardless of input.
  return '';
}

function _dispositionHTML(dList) {
  if (!dList || dList.length === 0) return '';
  const icons = {
    continue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>',
    refresh:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    amend:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    replace:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    manual:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    skip:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>'
  };
  return `
    <div class="disposition-section">
      <div class="disposition-head">
        <div class="disposition-head-title">What would you like to do with this payload?</div>
        <div class="disposition-head-sub">Pick one and proceed via the action bar below &middot; the recommended option is highlighted</div>
      </div>
      <div class="disposition-grid">
        ${dList.map(d => {
          const id = (d.id || 'continue').toLowerCase();
          const isPrimary = d.primary ? ' primary' : '';
          return `
            <a class="disposition-card ${id}${isPrimary}" title="${d.title}">
              <div class="disposition-card-icon">${icons[id] || icons.continue}</div>
              <div class="disposition-card-body">
                <div class="disposition-card-title">
                  ${d.title || ''}
                  ${d.primary ? '<span class="disposition-card-title-pill">Recommended</span>' : ''}
                </div>
                <div class="disposition-card-desc">${d.desc || ''}</div>
              </div>
            </a>`;
        }).join('')}
      </div>
    </div>`;
}

function _historyHTML(hList) {
  if (!hList || hList.length === 0) return '';
  return `
    <div class="upload-history-card">
      <div class="upload-history-head">
        <div class="upload-history-head-left">
          <div class="upload-history-title">Sync &amp; upload history &middot; ${hList.length} prior versions retained</div>
          <div class="upload-history-sub">Every snapshot kept for audit &middot; download any version &middot; restore to roll back</div>
        </div>
        <button class="btn btn-secondary btn-sm">Export history CSV</button>
      </div>
      <div class="upload-history-list">
        ${hList.map(h => {
          const tagCls = (h.tag || 'current').toLowerCase();
          const tagLabel = tagCls === 'current' ? 'Current' :
                           tagCls === 'override' ? 'Override' :
                           tagCls === 'resync' ? 'Re-sync' :
                           tagCls === 'initial' ? 'Initial' : tagCls;
          return `
            <div class="upload-history-row ${tagCls}">
              <div class="upload-history-dot"></div>
              <div class="upload-history-version">${h.version || ''}</div>
              <div>
                <div class="upload-history-label">${h.label || ''}</div>
                <div class="upload-history-meta">${h.source || ''} &middot; ${h.by || ''} &middot; ${h.time || ''}</div>
              </div>
              <div class="upload-history-records">${h.records || ''}</div>
              <span class="upload-history-tag ${tagCls}">${tagLabel}</span>
              <div class="upload-history-actions">
                <button class="upload-history-mini-btn" title="Download v${h.version}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                ${tagCls === 'current' ? '' : `
                <button class="upload-history-mini-btn" title="Restore v${h.version}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>`}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// PUBLIC: render top-of-step orientation block
function renderStepHeader(cfg) {
  if (!cfg || !cfg.anchor) return;
  const mount = document.querySelector(cfg.anchor);
  if (!mount) return;
  const intro = cfg.intro ? `<div class="step-intro"><strong>What this step does:</strong> ${cfg.intro}</div>` : '';
  const uploadHTML = cfg.skipCurrentUpload ? '' : _currentUploadHTML(cfg.currentUpload);
  mount.innerHTML = _statusStripHTML(cfg.status) + intro + uploadHTML;
}

// PUBLIC: render bottom-of-step decision block
function renderStepFooter(cfg) {
  if (!cfg || !cfg.anchor) return;
  const mount = document.querySelector(cfg.anchor);
  if (!mount) return;
  const vHTML = cfg.skipValidationInFooter ? '' :
    ('<div class="step-footer-heading">Validation status</div>' + _validationStripHTML(cfg.validations));
  mount.innerHTML = vHTML +
    '<div class="step-footer-heading">Disposition &middot; choose next action</div>' +
    _dispositionHTML(cfg.dispositions) +
    '<div class="step-footer-heading">Sync history &middot; re-syncs and uploads to this step</div>' +
    _historyHTML(cfg.history);
}

// Backwards-compat shim: pages still calling renderStepFlow get
// header above + footer below (we'll create both mounts at runtime).
function renderStepFlow(cfg) {
  if (!cfg || !cfg.anchor) return;
  const mount = document.querySelector(cfg.anchor);
  if (!mount) return;
  // If currentUploadInline anchor is provided, force header to skip the upload card.
  if (cfg.currentUploadInline) cfg.skipCurrentUpload = true;
  // Render header in place
  mount.id = 'step-header-mount';
  renderStepHeader(Object.assign({}, cfg, { anchor: '#step-header-mount' }));
  // Render current-upload card at inline anchor, if specified
  if (cfg.currentUploadInline) {
    renderCurrentUploadCard(cfg.currentUploadInline, cfg.currentUpload);
  }
  // Render footer before action bar
  const main = mount.closest('main');
  if (main) {
    const actionBar = main.querySelector('.action-bar');
    const footerMount = document.createElement('div');
    footerMount.id = 'step-footer-mount';
    if (actionBar) main.insertBefore(footerMount, actionBar);
    else main.appendChild(footerMount);
    renderStepFooter(Object.assign({}, cfg, { anchor: '#step-footer-mount' }));
  }
}

// v2.0.12 — for pages that want the current-upload card placed inline (not at top)
function renderCurrentUploadCard(anchor, upload) {
  const mount = (typeof anchor === 'string') ? document.querySelector(anchor) : anchor;
  if (!mount) return;
  mount.innerHTML = _currentUploadHTML(upload);
}

// ============================================
// v2.0.19 — Challan-creation popup (PMT-06)
// Any "Create challan" button calls window.openChallanPopup(ctx).
// ctx is optional: { amount, head, reason }
// ============================================
window.openChallanPopup = function(ctx) {
  ctx = ctx || {};
  var existing = document.getElementById('challan-modal-overlay');
  if (existing) { existing.classList.add('active'); return; }

  var overlay = document.createElement('div');
  overlay.id = 'challan-modal-overlay';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div class="modal-head-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="13" y2="15"/></svg>
        </div>
        <div style="min-width:0;">
          <div class="modal-head-title">Create challan (PMT-06)</div>
          <div class="modal-head-sub">Deposit cash into the electronic cash ledger &middot; valid 15 days from generation</div>
        </div>
        <button class="modal-close" onclick="window.closeChallanPopup()" title="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="modal-body">

        <div class="modal-summary-strip">
          <div class="modal-summary-item">
            <div class="modal-summary-label">GSTIN</div>
            <div class="modal-summary-value">27AABCT3518Q1ZV</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Period</div>
            <div class="modal-summary-value">May 2026</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Reason</div>
            <div class="modal-summary-value" style="font-size:11.5px;">${ctx.reason || 'Monthly tax payment'}</div>
          </div>
        </div>

        <div class="modal-section-title">Tax components (auto-filled from Step 4 set-off)</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">IGST &middot; Tax (&#8377;)</label>
            <input class="modal-field-input" value="0" style="text-align:right;font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">CGST &middot; Tax (&#8377;)</label>
            <input class="modal-field-input" value="0" style="text-align:right;font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">SGST &middot; Tax (&#8377;)</label>
            <input class="modal-field-input" value="0" style="text-align:right;font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Cess &middot; Tax (&#8377;)</label>
            <input class="modal-field-input" value="${ctx.amount || '8,00,00,000'}" style="text-align:right;font-family:var(--font-mono);background:#F8FAFC;border-color:var(--fp-accent);">
          </div>
        </div>

        <div class="modal-section-title">Interest, Fee, Penalty (optional)</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Interest (&#8377;)</label>
            <input class="modal-field-input" value="0" style="text-align:right;font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Late fee (&#8377;)</label>
            <input class="modal-field-input" value="0" style="text-align:right;font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Penalty (&#8377;)</label>
            <input class="modal-field-input" value="0" style="text-align:right;font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Other (&#8377;)</label>
            <input class="modal-field-input" value="0" style="text-align:right;font-family:var(--font-mono);">
          </div>
        </div>

        <div class="modal-summary-strip" style="background:linear-gradient(135deg, #F8FAFC, var(--surface));border-color:var(--fp-accent);">
          <div class="modal-summary-item">
            <div class="modal-summary-label">Total challan amount</div>
            <div class="modal-summary-value" style="font-size:18px;color:var(--fp-ink);">&#8377; ${ctx.amount || '8,00,00,000'}</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">CPIN (on generate)</div>
            <div class="modal-summary-value" style="color:var(--text-muted);">25052618424182</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Valid till</div>
            <div class="modal-summary-value" style="color:var(--text-muted);">30-May-2026</div>
          </div>
        </div>

        <div class="modal-section-title">Mode of payment</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Payment mode</label>
            <select class="modal-field-input">
              <option>E-payment (Net banking)</option>
              <option>NEFT / RTGS</option>
              <option>Over the Counter (cash / cheque / DD)</option>
              <option>Credit / Debit card</option>
            </select>
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Bank</label>
            <select class="modal-field-input">
              <option>State Bank of India</option>
              <option>HDFC Bank</option>
              <option>ICICI Bank</option>
              <option>Axis Bank</option>
              <option>Kotak Mahindra Bank</option>
              <option>Punjab National Bank</option>
            </select>
          </div>
        </div>

      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="window.closeChallanPopup()">Cancel</button>
        <button class="btn btn-secondary">Save as draft</button>
        <button class="btn btn-secondary">Download PDF</button>
        <button class="btn btn-primary cta-large" onclick="window.closeChallanPopup(); if (window.showToast) window.showToast('Challan generated &middot; CPIN 25052618424182 &middot; redirecting to bank gateway...');">
          Generate challan &amp; pay &rarr;
        </button>
      </div>
    </div>
  `;
  // Click on overlay (but not modal) closes
  overlay.addEventListener('click', function(e){
    if (e.target === overlay) window.closeChallanPopup();
  });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
};

window.closeChallanPopup = function() {
  var existing = document.getElementById('challan-modal-overlay');
  if (existing) { existing.remove(); document.body.style.overflow = ''; }
};

// ============================================
// v2.0.21 — Generate single IRN popup (called from einvoice pages or anywhere)
// ============================================
window.openIrnPopup = function(ctx) {
  ctx = ctx || {};
  var existing = document.getElementById('irn-modal-overlay');
  if (existing) { existing.classList.add('active'); return; }

  var overlay = document.createElement('div');
  overlay.id = 'irn-modal-overlay';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div class="modal-head-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
        </div>
        <div style="min-width:0;">
          <div class="modal-head-title">Generate IRN (e-invoice)</div>
          <div class="modal-head-sub">Issues an Invoice Reference Number from IRP &middot; QR code embedded in invoice PDF &middot; valid permanently once issued</div>
        </div>
        <button class="modal-close" onclick="window.closeIrnPopup()" title="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="modal-body">

        <div class="modal-section-title">Supplier (your details)</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Supplier GSTIN</label>
            <input class="modal-field-input" value="${ctx.supplierGstin || '27AABCT3518Q1ZV'}" readonly style="background:var(--bg);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Trade name</label>
            <input class="modal-field-input" value="Apex Steel Mumbai" readonly style="background:var(--bg);">
          </div>
        </div>

        <div class="modal-section-title">Recipient (buyer)</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Recipient GSTIN</label>
            <input class="modal-field-input" value="${ctx.recipientGstin || '27AAACH7409R1ZX'}" placeholder="15-char GSTIN">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Trade name</label>
            <input class="modal-field-input" value="Hindalco Industries Ltd">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Place of supply</label>
            <select class="modal-field-input">
              <option>27 - Maharashtra</option>
              <option>29 - Karnataka</option>
              <option>33 - Tamil Nadu</option>
              <option>07 - Delhi</option>
            </select>
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Document type</label>
            <select class="modal-field-input">
              <option>Tax Invoice</option>
              <option>Credit Note</option>
              <option>Debit Note</option>
              <option>Export Invoice (LUT)</option>
              <option>Export Invoice (IGST paid)</option>
            </select>
          </div>
        </div>

        <div class="modal-section-title">Invoice details</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Invoice no.</label>
            <input class="modal-field-input" value="${ctx.invNo || 'TS/26/02842'}" style="font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Invoice date</label>
            <input class="modal-field-input" type="date" value="2026-05-15">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Taxable value (&#8377;)</label>
            <input class="modal-field-input" value="${ctx.taxable || '8,42,000.00'}" style="text-align:right;font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Tax rate (%)</label>
            <select class="modal-field-input">
              <option>18</option>
              <option>12</option>
              <option>5</option>
              <option>28</option>
              <option>0</option>
            </select>
          </div>
        </div>

        <div class="modal-summary-strip" style="background:linear-gradient(135deg, #F8FAFC, var(--surface));border-color:var(--fp-accent);">
          <div class="modal-summary-item">
            <div class="modal-summary-label">IGST</div>
            <div class="modal-summary-value">&mdash;</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">CGST (9%)</div>
            <div class="modal-summary-value">&#8377; 75,780</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">SGST (9%)</div>
            <div class="modal-summary-value">&#8377; 75,780</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Invoice total</div>
            <div class="modal-summary-value" style="color:var(--fp-ink);">&#8377; 9,93,560</div>
          </div>
        </div>

        <div class="modal-section-title">Transport (optional &mdash; for EWB)</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Transport mode</label>
            <select class="modal-field-input">
              <option>Road</option>
              <option>Rail</option>
              <option>Air</option>
              <option>Ship</option>
            </select>
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Vehicle / LR no.</label>
            <input class="modal-field-input" placeholder="MH-04-AB-1234">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Distance (km)</label>
            <input class="modal-field-input" value="412" style="text-align:right;font-family:var(--font-mono);">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Generate EWB along with IRN?</label>
            <select class="modal-field-input">
              <option>Yes &middot; auto-generate EWB</option>
              <option>No &middot; IRN only</option>
            </select>
          </div>
        </div>

      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="window.closeIrnPopup()">Cancel</button>
        <button class="btn btn-secondary">Validate JSON</button>
        <button class="btn btn-secondary">Save as draft</button>
        <button class="btn btn-primary cta-large" onclick="window.closeIrnPopup(); if (window.showToast) window.showToast('IRN issued &middot; 35dc4d8d2c6f8c3b... &middot; QR generated &middot; EWB EBN 312504201842');">
          Generate IRN + EWB &rarr;
        </button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', function(e){
    if (e.target === overlay) window.closeIrnPopup();
  });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
};

window.closeIrnPopup = function() {
  var existing = document.getElementById('irn-modal-overlay');
  if (existing) { existing.remove(); document.body.style.overflow = ''; }
};

// ============================================
// v2.0.23 — EWB Extend + Cancel popups
// ============================================
window.openEwbExtendPopup = function(ctx) {
  ctx = ctx || {};
  var existing = document.getElementById('ewb-extend-overlay');
  if (existing) { existing.classList.add('active'); return; }
  var overlay = document.createElement('div');
  overlay.id = 'ewb-extend-overlay';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head" style="background:linear-gradient(135deg,#0E6BA8,#0BA5E9);">
        <div class="modal-head-icon" style="background:#fff;color:#0BA5E9;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div style="min-width:0;">
          <div class="modal-head-title">Extend EWB validity</div>
          <div class="modal-head-sub">Allowed 8h before expiry or up to 8h after expiry &middot; reason mandatory</div>
        </div>
        <button class="modal-close" onclick="window.closeEwbExtendPopup()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="modal-summary-strip">
          <div class="modal-summary-item">
            <div class="modal-summary-label">EWB no.</div>
            <div class="modal-summary-value" style="font-size:12.5px;">${ctx.ewb || '181 0042 8442 91'}</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Currently valid until</div>
            <div class="modal-summary-value" style="font-size:12.5px;color:var(--error);">${ctx.validUntil || '18-May 23:59'}</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Extension window</div>
            <div class="modal-summary-value" style="font-size:12px;color:var(--success);">Open &middot; 8h ± expiry</div>
          </div>
        </div>

        <div class="modal-section-title">Reason for extension (mandatory)</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Reason category</label>
            <select class="modal-field-input">
              <option>Natural calamity</option>
              <option>Law and order</option>
              <option>Accident</option>
              <option>Transhipment</option>
              <option>Vehicle breakdown</option>
              <option>Order of authority</option>
              <option>Others</option>
            </select>
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Remarks (text)</label>
            <input class="modal-field-input" value="Vehicle breakdown near Solapur &middot; replacement vehicle dispatched 19-May 08:00">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">From place (current location)</label>
            <input class="modal-field-input" value="Solapur, Maharashtra">
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Remaining distance (km)</label>
            <input class="modal-field-input" value="280" style="text-align:right;font-family:var(--font-mono);">
          </div>
        </div>

        <div class="modal-summary-strip" style="background:linear-gradient(135deg,#E0F2FE,var(--surface));border-color:#0BA5E9;">
          <div class="modal-summary-item">
            <div class="modal-summary-label">New validity (computed)</div>
            <div class="modal-summary-value" style="color:#0BA5E9;font-size:14px;">21-May 23:59</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Extension granted</div>
            <div class="modal-summary-value" style="font-size:13px;">+3 days (280 / 200 km = 2 days, ceil to next-day boundary)</div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="window.closeEwbExtendPopup()">Cancel</button>
        <button class="btn cta-large" style="background:linear-gradient(135deg,#0E6BA8,#0BA5E9);color:#fff;border:none;" onclick="window.closeEwbExtendPopup(); if (window.showToast) window.showToast('EWB extended &middot; new validity 21-May 23:59 &middot; reason logged');">
          Submit extension &rarr;
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', function(e){ if (e.target === overlay) window.closeEwbExtendPopup(); });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
};
window.closeEwbExtendPopup = function() {
  var e = document.getElementById('ewb-extend-overlay');
  if (e) { e.remove(); document.body.style.overflow = ''; }
};

window.openEwbCancelPopup = function(ctx) {
  ctx = ctx || {};
  var existing = document.getElementById('ewb-cancel-overlay');
  if (existing) { existing.classList.add('active'); return; }
  var overlay = document.createElement('div');
  overlay.id = 'ewb-cancel-overlay';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head" style="background:#C8102E;">
        <div class="modal-head-icon" style="background:#fff;color:#C8102E;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
        <div style="min-width:0;">
          <div class="modal-head-title">Cancel EWB</div>
          <div class="modal-head-sub">Allowed within 24h of generation &middot; only if not verified by officer in transit &middot; this cannot be undone</div>
        </div>
        <button class="modal-close" onclick="window.closeEwbCancelPopup()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="modal-body">
        <div style="padding:14px;background:rgba(200,16,46,0.06);border:1px solid rgba(200,16,46,0.30);border-radius:var(--radius);margin-bottom:18px;font-size:12.5px;line-height:1.55;color:var(--text);">
          <strong style="color:var(--error);">Caution:</strong> Cancellation is irreversible. The EWB will be marked Cancelled on the portal and cannot be reactivated. If you need to fix invoice details, cancel + re-generate within the 24h window. After 24h, cancellation is not allowed even by the portal.
        </div>

        <div class="modal-summary-strip" style="background:linear-gradient(135deg,#FFF5F5,var(--surface));border-color:rgba(200,16,46,0.40);">
          <div class="modal-summary-item">
            <div class="modal-summary-label">EWB no.</div>
            <div class="modal-summary-value" style="font-size:12.5px;">${ctx.ewb || '181 0042 8442 91'}</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Generated</div>
            <div class="modal-summary-value" style="font-size:12.5px;">${ctx.generatedAt || '15-May 17:38'}</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Cancel window</div>
            <div class="modal-summary-value" style="font-size:11.5px;color:var(--warning);">5h 18m left &middot; not yet verified by officer</div>
          </div>
        </div>

        <div class="modal-section-title">Reason for cancellation (mandatory)</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Reason category</label>
            <select class="modal-field-input">
              <option>Duplicate</option>
              <option>Order cancelled</option>
              <option>Data entry mistake</option>
              <option>Vehicle / transport changed (will re-generate)</option>
              <option>Others</option>
            </select>
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Remarks (text)</label>
            <input class="modal-field-input" value="Customer changed delivery slot &middot; re-generating with revised vehicle and ETA">
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="window.closeEwbCancelPopup()">Keep EWB</button>
        <button class="btn cta-large" style="background:#C8102E;color:#fff;border:none;" onclick="window.closeEwbCancelPopup(); if (window.showToast) window.showToast('EWB cancelled &middot; portal updated &middot; you can re-generate within remaining 24h window');">
          Cancel EWB permanently
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', function(e){ if (e.target === overlay) window.closeEwbCancelPopup(); });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
};
window.closeEwbCancelPopup = function() {
  var e = document.getElementById('ewb-cancel-overlay');
  if (e) { e.remove(); document.body.style.overflow = ''; }
};

// ============================================
// v2.0.24 — IRN line-items modal + IRN cancel modal
// ============================================
window.openIrnLineItemsPopup = function(ctx) {
  ctx = ctx || {};
  var existing = document.getElementById('irn-items-overlay');
  if (existing) { existing.classList.add('active'); return; }
  var overlay = document.createElement('div');
  overlay.id = 'irn-items-overlay';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="max-width:900px;">
      <div class="modal-head" style="background:linear-gradient(135deg,#4338CA,#7C3AED);">
        <div class="modal-head-icon" style="background:#fff;color:#7C3AED;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
        </div>
        <div style="min-width:0;">
          <div class="modal-head-title">IRN line items &middot; ${ctx.docNo || 'TS/26/02842'}</div>
          <div class="modal-head-sub">Signed payload from IRP &middot; ${ctx.items || 2} line items &middot; deterministic IRN derived from doc + GSTIN + FY</div>
        </div>
        <button class="modal-close" onclick="window.closeIrnLineItemsPopup()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="modal-body" style="padding:18px 22px;">

        <div class="modal-summary-strip" style="background:linear-gradient(135deg,#F3E8FF,var(--surface));border-color:#7C3AED;">
          <div class="modal-summary-item">
            <div class="modal-summary-label">IRN (64-char hash)</div>
            <div class="modal-summary-value" style="font-size:10.5px;color:#7C3AED;word-break:break-all;">${ctx.irn || '35dc4d8d2c6f8c3b91a2 4d2c6f8c3b91a2 4d2c6f8c3b91a2 4d2c6f8c3b91a2'}</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">IRP &middot; Generated</div>
            <div class="modal-summary-value" style="font-size:11.5px;">NIC-IRP1 &middot; 15-May 18:42</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">ACK no.</div>
            <div class="modal-summary-value" style="font-size:11.5px;">122110024842817</div>
          </div>
        </div>

        <div class="modal-section-title">Line items</div>
        <div class="table-wrap" style="margin-bottom:14px;">
          <table class="data-table grid-lined compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th class="mono">HSN</th>
                <th>UQC</th>
                <th class="num">Qty</th>
                <th class="num">Rate (&#8377;)</th>
                <th class="num">Taxable (&#8377;)</th>
                <th class="num">CGST %</th>
                <th class="num">SGST %</th>
                <th class="num">Line total (&#8377;)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Hot-rolled steel coil &middot; S275</td><td class="mono">720839</td><td>MTS</td><td class="num">12.500</td><td class="num">67,800</td><td class="num">8,42,000</td><td class="num">9</td><td class="num">9</td><td class="num">9,93,560</td></tr>
              <tr><td>2</td><td>Galvanised steel sheet &middot; 0.5mm</td><td class="mono">721049</td><td>MTS</td><td class="num">3.200</td><td class="num">82,400</td><td class="num">2,63,680</td><td class="num">9</td><td class="num">9</td><td class="num">3,11,142</td></tr>
              <tr style="background:rgba(124,58,237,0.05);font-weight:700;">
                <td colspan="6" style="text-align:right;">Total taxable &middot; CGST &middot; SGST &middot; Cess &middot; Round-off &middot; Invoice value</td>
                <td class="num">11,05,680</td>
                <td class="num" colspan="2" style="text-align:center;">99,511 + 99,511</td>
                <td class="num">13,04,701</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">
          <div>
            <div class="modal-section-title" style="border-top:none;padding-top:0;margin-top:0;">Buyer</div>
            <div style="font-size:12px;color:var(--text);line-height:1.6;">
              <strong>Hindalco Industries Ltd</strong><br>
              GSTIN: <span class="mono">27AAACH7409R1ZX</span><br>
              Birla Centurion, P B Marg, Worli<br>
              Mumbai 400030 &middot; Maharashtra (27)
            </div>
          </div>
          <div>
            <div class="modal-section-title" style="border-top:none;padding-top:0;margin-top:0;">QR + signed JSON</div>
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:96px;height:96px;background:repeating-linear-gradient(45deg, var(--fp-ink), var(--fp-ink) 4px, #fff 4px, #fff 8px);border-radius:6px;flex-shrink:0;border:2px solid var(--fp-ink);"></div>
              <div style="font-size:11px;color:var(--text-muted);line-height:1.55;">QR contains: Supplier GSTIN, Buyer GSTIN, Doc no, Doc date, Invoice value, Main HSN, IRN, IRP date. Verifiable via any QR scanner against IRP.</div>
            </div>
          </div>
        </div>

      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="window.closeIrnLineItemsPopup()">Close</button>
        <button class="btn btn-secondary">Download signed JSON</button>
        <button class="btn btn-secondary">Download PDF (with QR)</button>
        <button class="btn cta-large" style="background:linear-gradient(135deg,#0E6BA8,#0BA5E9);color:#fff;border:none;">Generate EWB from this IRN &rarr;</button>
      </div>
    </div>`;
  overlay.addEventListener('click', function(e){ if (e.target === overlay) window.closeIrnLineItemsPopup(); });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
};
window.closeIrnLineItemsPopup = function() {
  var e = document.getElementById('irn-items-overlay');
  if (e) { e.remove(); document.body.style.overflow = ''; }
};

window.openIrnCancelPopup = function(ctx) {
  ctx = ctx || {};
  var existing = document.getElementById('irn-cancel-overlay');
  if (existing) { existing.classList.add('active'); return; }
  var overlay = document.createElement('div');
  overlay.id = 'irn-cancel-overlay';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head" style="background:#C8102E;">
        <div class="modal-head-icon" style="background:#fff;color:#C8102E;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
        <div style="min-width:0;">
          <div class="modal-head-title">Cancel IRN</div>
          <div class="modal-head-sub">Allowed within 24h of generation &middot; once cancelled, must issue Credit Note to reverse downstream &middot; irreversible</div>
        </div>
        <button class="modal-close" onclick="window.closeIrnCancelPopup()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="modal-body">
        <div style="padding:14px;background:rgba(200,16,46,0.06);border:1px solid rgba(200,16,46,0.30);border-radius:var(--radius);margin-bottom:18px;font-size:12.5px;line-height:1.55;color:var(--text);">
          <strong style="color:var(--error);">Caution:</strong> IRN cancellation is final. The IRN will be marked Cancelled on IRP and the GSTR-1 auto-pushed entry will be reversed. After 24 hours, the portal blocks cancellation &mdash; you would need to issue a Credit Note instead.
        </div>
        <div class="modal-summary-strip" style="background:linear-gradient(135deg,#FFF5F5,var(--surface));border-color:rgba(200,16,46,0.40);">
          <div class="modal-summary-item">
            <div class="modal-summary-label">IRN</div>
            <div class="modal-summary-value" style="font-size:10.5px;word-break:break-all;">${ctx.irn || '35dc4d8d2c6f8c3b91a2...'}</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Doc no.</div>
            <div class="modal-summary-value" style="font-size:11.5px;">${ctx.docNo || 'TS/26/02842'}</div>
          </div>
          <div class="modal-summary-item">
            <div class="modal-summary-label">Cancel window</div>
            <div class="modal-summary-value" style="font-size:11.5px;color:var(--warning);">${ctx.timeLeft || '22h 14m left'}</div>
          </div>
        </div>
        <div class="modal-section-title">Reason (mandatory)</div>
        <div class="modal-field-grid">
          <div class="modal-field">
            <label class="modal-field-label">Reason category</label>
            <select class="modal-field-input">
              <option>Duplicate</option>
              <option>Data Entry Mistake</option>
              <option>Order Cancelled</option>
              <option>Others</option>
            </select>
          </div>
          <div class="modal-field">
            <label class="modal-field-label">Remarks</label>
            <input class="modal-field-input" value="Buyer cancelled order before dispatch &middot; will not be re-issued">
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="window.closeIrnCancelPopup()">Keep IRN</button>
        <button class="btn cta-large" style="background:#C8102E;color:#fff;border:none;" onclick="window.closeIrnCancelPopup(); if (window.showToast) window.showToast('IRN cancelled &middot; IRP updated &middot; GSTR-1 entry reversed &middot; downstream 2A/2B will refresh');">
          Cancel IRN permanently
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', function(e){ if (e.target === overlay) window.closeIrnCancelPopup(); });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
};
window.closeIrnCancelPopup = function() {
  var e = document.getElementById('irn-cancel-overlay');
  if (e) { e.remove(); document.body.style.overflow = ''; }
};

// ============================================
// v2.0.26 — Collapsible nav groups (IRN, EWB, Ledgers)
// ============================================
(function() {
  // Delegated click handler for the chevron toggle
  document.addEventListener('click', function(e) {
    // v2.0.39 — Ledgers section header: clicking it navigates to ledgers.html (overview)
    // instead of toggling. The chevron icon inside still allows toggle via its own selector.
    var ledgersHeader = e.target.closest('.nav-section-toggle-header[aria-label="Toggle Ledgers section"]');
    if (ledgersHeader && !e.target.closest('.nav-section-toggle-chevron')) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'ledgers.html';
      return;
    }
    // Toggle if user clicked the chevron button (.nav-collapse-toggle)
    // OR the full-width section header (.nav-section-toggle-header)
    var toggle = e.target.closest('.nav-collapse-toggle, .nav-section-toggle-header');
    if (!toggle) return;
    e.preventDefault();
    e.stopPropagation();
    var group = toggle.closest('.nav-group-collapsible');
    if (group) group.classList.toggle('is-expanded');
  });

  // Auto-expand the group containing the active page on load
  function autoExpandActiveGroup() {
    var activeSub = document.querySelector('.nav-subitem.active, .nav-group-collapsible .nav-item.active');
    if (activeSub) {
      var group = activeSub.closest('.nav-group-collapsible');
      if (group) group.classList.add('is-expanded');
    }
    // Also expand if the parent hub link is active (current page = hub itself)
    var parents = document.querySelectorAll('.nav-group-collapsible .nav-item-parent.active');
    parents.forEach(function(p) {
      var grp = p.closest('.nav-group-collapsible');
      if (grp) grp.classList.add('is-expanded');
    });
  }

  // Run after renderShell injects the sidebar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoExpandActiveGroup);
  } else {
    // renderShell is called synchronously from script tags so sidebar already exists
    setTimeout(autoExpandActiveGroup, 0);
  }
})();

// ============================================
// v2.0.28 — gstr3b-step3 reconciliation source toggle (IMS / 2B)
// ============================================
window.setReconSource = function(source) {
  if (source !== 'ims' && source !== '2b') return;
  
  // Toggle button states
  document.querySelectorAll('.source-toggle-btn').forEach(function(btn) {
    var isActive = btn.dataset.source === source;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
  
  // Toggle info panels
  document.querySelectorAll('.source-active-info').forEach(function(info) {
    info.style.display = info.dataset.activeInfo === source ? '' : 'none';
  });
  
  // Update all dynamic labels
  document.querySelectorAll('[data-recon-label]').forEach(function(el) {
    var newText = source === 'ims' ? el.dataset.ims : el.dataset.b2b;
    if (newText) el.textContent = newText;
  });
  
  // Set body attribute for CSS-driven visibility
  document.body.dataset.reconSource = source;
  
  // Show toast feedback
  if (window.showToast) {
    var label = source === 'ims' ? 'IMS workflow (Accept/Reject)' : 'GSTR-2B snapshot (read-only)';
    window.showToast('Reconciliation source switched to ' + label);
  }
};

// Initialize default state on load
document.addEventListener('DOMContentLoaded', function() {
  if (document.querySelector('.source-toggle-btn')) {
    document.body.dataset.reconSource = 'ims';
  }
});

// ============================================
// v2.0.31 — gstr3b-step3 breakup toggle (Show item-wise breakup)
// ============================================
window.toggleReconBreakup = function(view) {
  var content = document.querySelector('.recon-breakup-content[data-recon-breakup="' + view + '"]');
  var btn = document.getElementById(view + '-breakup-toggle');
  if (!content || !btn) return;
  var isHidden = content.style.display === 'none' || !content.style.display;
  content.style.display = isHidden ? 'block' : 'none';
  // Update button label and rotate chevron
  var lbl = isHidden ? 'Hide item-wise breakup' : 'Show item-wise breakup (6 sub-tables)';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14" style="transform:' + (isHidden ? 'rotate(180deg)' : 'rotate(0deg)') + ';transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg> ' + lbl;
};

// ============================================
// v2.0.35 — IMS auto-category row toggle (click to expand line-wise details)
// ============================================
window.toggleAutoCatRow = function(cat) {
  var detail = document.querySelector('.auto-cat-detail[data-cat="' + cat + '"]');
  var chevron = document.querySelector('.auto-cat-chevron[data-cat="' + cat + '"]');
  if (!detail || !chevron) return;
  var isHidden = detail.style.display === 'none' || !detail.style.display;
  detail.style.display = isHidden ? 'table-row' : 'none';
  chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
};

// ============================================
// v2.0.36 — Generic recon breakup toggle (5 reco pages)
// ============================================
window.toggleReconBreakupGeneric = function(recoId) {
  var content = document.querySelector('.recon-breakup-generic[data-recon-breakup-generic="' + recoId + '"]');
  var btn = document.getElementById(recoId + '-breakup-toggle');
  if (!content || !btn) return;
  var isHidden = content.style.display === 'none' || !content.style.display;
  content.style.display = isHidden ? 'block' : 'none';
  var lbl = isHidden ? 'Hide item-wise breakup' : 'Show item-wise breakup (detailed table)';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14" style="transform:' + (isHidden ? 'rotate(180deg)' : 'rotate(0deg)') + ';transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg> ' + lbl;
};

// ============================================
// v2.0.38 — IRN management: source toggle + bulk select
// ============================================
window.setIrnSource = function(source, btn) {
  document.querySelectorAll('.irn-source-toggle').forEach(function(b) {
    if (b === btn) {
      b.classList.add('active');
      b.style.background = 'var(--fp-accent)';
      b.style.color = 'var(--fp-ink)';
    } else {
      b.classList.remove('active');
      b.style.background = 'transparent';
      b.style.color = 'var(--text-muted)';
    }
  });
  var label = source === 'all' ? 'all sources' : source === 'digi' ? 'FylePro-generated' : 'Auto-fetched from IRP';
  if (window.showToast) window.showToast('IRN view filtered to: ' + label);
};

window.toggleAllIrnRows = function(checked) {
  document.querySelectorAll('.irn-row-check').forEach(function(cb) { cb.checked = checked; });
  window.updateIrnSelectionCount();
};

window.updateIrnSelectionCount = function() {
  var checked = document.querySelectorAll('.irn-row-check:checked');
  var count = checked.length;
  var countEl = document.getElementById('irn-selected-count');
  var barEl = document.getElementById('irn-bulk-bar');
  var allCb = document.getElementById('irn-select-all');
  if (countEl) countEl.textContent = count;
  if (barEl) barEl.style.display = count > 0 ? 'flex' : 'none';
  if (allCb) {
    var total = document.querySelectorAll('.irn-row-check').length;
    allCb.checked = count > 0 && count === total;
    allCb.indeterminate = count > 0 && count < total;
  }
};

window.clearIrnSelection = function() {
  document.querySelectorAll('.irn-row-check').forEach(function(cb) { cb.checked = false; });
  var allCb = document.getElementById('irn-select-all');
  if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
  window.updateIrnSelectionCount();
};

// ============================================
// v2.0.38 — EWB management: source toggle + bulk select
// ============================================
window.setEwbSource = function(source, btn) {
  document.querySelectorAll('.ewb-source-toggle').forEach(function(b) {
    if (b === btn) {
      b.classList.add('active');
      b.style.background = 'var(--fp-accent)';
      b.style.color = 'var(--fp-ink)';
    } else {
      b.classList.remove('active');
      b.style.background = 'transparent';
      b.style.color = 'var(--text-muted)';
    }
  });
  var label = source === 'all' ? 'all sources' : source === 'digi' ? 'FylePro-generated' : 'Auto-fetched from EWB portal';
  if (window.showToast) window.showToast('EWB view filtered to: ' + label);
};

window.toggleAllEwbRows = function(checked) {
  document.querySelectorAll('.ewb-row-check').forEach(function(cb) { cb.checked = checked; });
  window.updateEwbSelectionCount();
};

window.updateEwbSelectionCount = function() {
  var checked = document.querySelectorAll('.ewb-row-check:checked');
  var count = checked.length;
  var countEl = document.getElementById('ewb-selected-count');
  var barEl = document.getElementById('ewb-bulk-bar');
  var allCb = document.getElementById('ewb-select-all');
  if (countEl) countEl.textContent = count;
  if (barEl) barEl.style.display = count > 0 ? 'flex' : 'none';
  if (allCb) {
    var total = document.querySelectorAll('.ewb-row-check').length;
    allCb.checked = count > 0 && count === total;
    allCb.indeterminate = count > 0 && count < total;
  }
};

window.clearEwbSelection = function() {
  document.querySelectorAll('.ewb-row-check').forEach(function(cb) { cb.checked = false; });
  var allCb = document.getElementById('ewb-select-all');
  if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
  window.updateEwbSelectionCount();
};
