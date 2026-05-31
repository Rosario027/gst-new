// GSTR-1 Reconciliation Workbench controller.
(function () {
  if (!window.FP || !FP.requireSession()) return;

  const $ = (id) => document.getElementById(id);
  const state = { regId: null, period: null, gstin: null, deliveryMode: 'json',
                  booksDatasetId: null, cmpDatasetId: null, filingId: null };

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function banner(msg, kind) {
    const b = $('wb-banner');
    b.textContent = msg; b.className = 'wb-banner show ' + (kind || 'e');
    if (kind === 's') setTimeout(() => b.classList.remove('show'), 4000);
  }
  function fmtInr(n) { return '₹ ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
  function enable(cardId) { $(cardId).classList.remove('disabled-card'); }

  // ── Setup selectors ──
  function initSetup() {
    const regs = FP.getRegistrations();
    const regSel = $('wb-reg');
    if (!regs.length) {
      regSel.innerHTML = '<option>No registrations — seed the DB</option>';
    } else {
      regSel.innerHTML = regs.map(r => `<option value="${r.id}" data-gstin="${r.gstin}" data-mode="${r.delivery_mode}">${r.gstin} · ${r.company_name || r.legal_name || ''}</option>`).join('');
    }
    const cur = FP.currentRegistration();
    if (cur) regSel.value = cur.id;

    const now = new Date();
    // default to previous month (filing period)
    let dm = now.getMonth(), dy = now.getFullYear();
    if (dm === 0) { dm = 11; dy -= 1; } else { dm -= 1; }
    $('wb-month').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    $('wb-month').value = dm + 1;
    const years = [];
    for (let y = now.getFullYear() + 1; y >= 2017; y--) years.push(y);
    $('wb-year').innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    $('wb-year').value = dy;

    [regSel, $('wb-month'), $('wb-year')].forEach(el => el.addEventListener('change', syncSetup));
    syncSetup();
  }

  function syncSetup() {
    const regSel = $('wb-reg');
    const opt = regSel.selectedOptions[0];
    state.regId = regSel.value;
    state.gstin = opt ? opt.dataset.gstin : '';
    state.deliveryMode = opt ? opt.dataset.mode : 'json';
    const mm = String($('wb-month').value).padStart(2, '0');
    const yyyy = $('wb-year').value;
    state.period = mm + yyyy;
    localStorage.setItem('fylepro.entity', state.regId);
    $('wb-context').textContent = `${state.gstin || '—'} · ${MONTHS[+$('wb-month').value - 1]} ${yyyy} · delivery: ${state.deliveryMode.toUpperCase()}`;
    $('wb-template').href = FP.gstr1.templateUrl(state.gstin, state.period);
    $('wb-sample-books').href = FP.gstr1.sampleUrl('books');
    $('wb-sample-einv').href = FP.gstr1.sampleUrl('einvoice');
  }

  // ── Generic drop-zone wiring ──
  function wireDrop(dropId, inputId, nameId, onFile) {
    const drop = $(dropId), input = $(inputId);
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('drag');
      if (e.dataTransfer.files[0]) { input.files = e.dataTransfer.files; handle(e.dataTransfer.files[0]); }
    });
    input.addEventListener('change', () => { if (input.files[0]) handle(input.files[0]); });
    function handle(file) { $(nameId).textContent = file.name; onFile(file); }
  }

  // ── Step 2: upload books ──
  function renderSummary(elId, summary, warnings) {
    const sec = summary.bySection || {};
    const rows = Object.keys(sec).map(k =>
      `<tr><td>${k.toUpperCase()}</td><td>${sec[k].count}</td><td>${fmtInr(sec[k].taxableValue)}</td><td>${fmtInr(sec[k].tax)}</td></tr>`).join('');
    const warn = (warnings && warnings.length) ? `<div class="wb-muted" style="margin-top:8px;">⚠ ${warnings.join(' · ')}</div>` : '';
    $(elId).innerHTML = `
      <div class="wb-stat">
        <div class="s"><b>${summary.totalRecords}</b><span>rows parsed</span></div>
        <div class="s"><b style="color:#168736">${summary.validRecords}</b><span>valid</span></div>
        <div class="s"><b style="color:${summary.errorRecords ? '#C8102E' : '#168736'}">${summary.errorRecords}</b><span>with errors</span></div>
        <div class="s"><b>${fmtInr(summary.totalTaxableValue)}</b><span>taxable value</span></div>
        <div class="s"><b>${fmtInr(summary.totalTax)}</b><span>tax</span></div>
      </div>
      <table class="wb-tbl"><thead><tr><th>Section</th><th>Rows</th><th>Taxable</th><th>Tax</th></tr></thead><tbody>${rows}</tbody></table>${warn}`;
  }

  function renderErrors(elId, records) {
    const bad = records.filter(r => r.errors && r.errors.length);
    if (!bad.length) return;
    const rows = bad.slice(0, 50).map(r => {
      const msgs = r.errors.map(e => `<span class="pill ${e.severity === 'error' ? 'err' : 'warn'}">${e.field}: ${e.message}</span>`).join(' ');
      return `<tr><td>${r.section.toUpperCase()}</td><td>${r.rowNo}</td><td style="font-family:inherit">${msgs}</td></tr>`;
    }).join('');
    $(elId).insertAdjacentHTML('beforeend',
      `<table class="wb-tbl"><thead><tr><th>Section</th><th>Row</th><th>Issues (first 50)</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  function renderValidation(elId, datasetId, validation) {
    if (!validation) return;
    const v = validation, t = v.totals || {};
    const map = { errors: ['err', 'Not ready — fix errors before generating JSON'], warnings: ['warn', 'Ready with warnings — review advised'], clean: ['ok', 'Clean — ready to generate JSON'] };
    const [cls, label] = map[v.status] || ['muted', v.status];
    const issues = (v.topIssues || []).slice(0, 8).map(i =>
      `<tr><td>${i.code || ''}</td><td><span class="pill ${i.severity === 'error' ? 'err' : 'warn'}">${i.severity}</span></td><td>${i.count}</td><td style="font-family:inherit">${i.message}</td></tr>`).join('');
    $(elId).insertAdjacentHTML('beforeend', `
      <div style="margin-top:12px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <span class="pill ${cls}" style="font-size:12px;">${label}</span>
        <span class="wb-muted">${t.errors || 0} errors · ${t.warnings || 0} warnings across ${t.rows || 0} rows</span>
        <a class="btn btn-secondary" href="${FP.gstr1.validationReportUrl(datasetId)}" download>⬇ Download validation report</a>
      </div>
      ${issues ? `<table class="wb-tbl"><thead><tr><th>Code</th><th>Severity</th><th>Count</th><th>Issue</th></tr></thead><tbody>${issues}</tbody></table>` : ''}`);
  }

  async function uploadBooks(file) {
    try {
      $('books-result').innerHTML = '<p class="wb-muted">Uploading & validating…</p>';
      const res = await FP.gstr1.upload(file, state.regId, state.period, 'books');
      state.booksDatasetId = res.datasetId;
      $('books-result').innerHTML = '';
      renderSummary('books-result', res.summary, res.warnings);
      renderValidation('books-result', res.datasetId, res.validation);
      renderErrors('books-result', res.records);
      enable('card-recon'); enable('card-json');
      const st = res.validation && res.validation.status;
      banner(st === 'errors' ? 'Uploaded — validation found errors (see report).' : 'Books uploaded and validated.', st === 'errors' ? 'e' : 's');
    } catch (e) { $('books-result').innerHTML = ''; banner(e.message, 'e'); }
  }

  async function uploadCmp(file) {
    try {
      $('cmp-name').textContent = file.name + ' — uploading…';
      const res = await FP.gstr1.upload(file, state.regId, state.period, 'einvoice');
      state.cmpDatasetId = res.datasetId;
      $('cmp-name').textContent = file.name + ` (${res.summary.totalRecords} rows)`;
      $('btn-reconcile').disabled = false;
    } catch (e) { banner(e.message, 'e'); }
  }

  // ── Step 3: reconcile ──
  async function runReconcile() {
    try {
      $('recon-result').innerHTML = '<p class="wb-muted">Reconciling…</p>';
      const res = await FP.gstr1.reconcile(state.booksDatasetId, state.cmpDatasetId);
      state.reconId = res.reconciliationId;
      const reportBtn = $('btn-recon-report');
      reportBtn.href = FP.gstr1.reconReportUrl(res.reconciliationId);
      reportBtn.style.display = '';
      const s = res.summary;
      const statTiles = `<div class="wb-stat">
        <div class="s"><b style="color:#168736">${s.matched}</b><span>matched</span></div>
        <div class="s"><b style="color:#C77700">${s.mismatch}</b><span>value mismatch</span></div>
        <div class="s"><b style="color:#155CDB">${s.onlyInBooks}</b><span>only in books</span></div>
        <div class="s"><b style="color:#C8102E">${s.onlyInCompare}</b><span>only in compare</span></div>
      </div>`;
      const flagged = res.lines.filter(l => l.status !== 'matched').slice(0, 100);
      const rows = flagged.map(l => {
        const cls = { mismatch: 'warn', only_in_books: 'info', only_in_compare: 'err' }[l.status] || 'muted';
        const diff = Object.keys(l.diff || {}).map(f => `${f}: ${l.diff[f].books} → ${l.diff[f].compare}`).join(', ');
        return `<tr><td>${l.section.toUpperCase()}</td><td>${l.matchKey}</td><td><span class="pill ${cls}">${l.status.replace(/_/g,' ')}</span></td><td style="font-family:inherit">${diff}</td></tr>`;
      }).join('');
      $('recon-result').innerHTML = statTiles +
        (flagged.length ? `<table class="wb-tbl"><thead><tr><th>Section</th><th>Key</th><th>Status</th><th>Difference</th></tr></thead><tbody>${rows}</tbody></table>`
                        : '<p class="pill ok" style="margin-top:10px;display:inline-block">Everything reconciles ✓</p>');
      banner('Reconciliation complete.', 's');
    } catch (e) { $('recon-result').innerHTML = ''; banner(e.message, 'e'); }
  }

  // ── Step 4: generate JSON ──
  async function generateJson() {
    if (!state.booksDatasetId) { banner('Upload books data first.', 'e'); return; }
    try {
      $('json-result').innerHTML = '<p class="wb-muted">Generating…</p>';
      const res = await FP.gstr1.generate(state.booksDatasetId);
      state.filingId = res.filingId;
      $('json-result').innerHTML = `<pre class="wb-json">${escapeHtml(JSON.stringify(res.gstr1Json, null, 2))}</pre>`;
      const dl = $('btn-download-json');
      dl.href = FP.gstr1.jsonUrl(res.filingId); dl.style.display = '';
      const push = $('btn-push');
      push.style.display = res.deliveryMode === 'api' ? '' : '';
      push.textContent = res.deliveryMode === 'api' ? 'Push to portal (API)' : 'Mark / simulate portal save';
      banner('GSTR-1 JSON generated.', 's');
    } catch (e) { $('json-result').innerHTML = ''; banner(e.message, 'e'); }
  }

  async function pushToPortal() {
    if (!state.filingId) return;
    try {
      $('push-status').textContent = 'Pushing…';
      const res = await FP.gstr1.push(state.filingId);
      $('push-status').innerHTML = `<span class="pill ${res.status === 'error' ? 'err' : 'ok'}">${res.status}</span> ${res.message || ''} ${res.reference ? '· ref ' + res.reference : ''}`;
    } catch (e) { $('push-status').innerHTML = `<span class="pill err">error</span> ${e.message}`; }
  }

  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  // ── Boot ──
  initSetup();
  wireDrop('drop-books', 'file-books', 'books-name', uploadBooks);
  wireDrop('drop-cmp', 'file-cmp', 'cmp-name', uploadCmp);
  $('btn-reconcile').addEventListener('click', runReconcile);
  $('btn-generate').addEventListener('click', generateJson);
  $('btn-push').addEventListener('click', pushToPortal);
})();
