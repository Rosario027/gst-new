// GSTR-1 Step 1 — sales data ingestion + live validation.
(function () {
  if (!window.FP || !FP.requireSession()) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inr = (n) => (n === '' || n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const state = { regId: null, gstin: null, period: null, file: null };

  function banner(msg, kind) { const b = $('s1-banner'); b.textContent = msg; b.className = 's1-banner show ' + (kind || 'e'); if (kind === 's') setTimeout(() => b.classList.remove('show'), 4000); }

  // ── Setup ──
  function initSetup() {
    const regs = FP.getRegistrations();
    $('s1-reg').innerHTML = regs.length
      ? regs.map((r) => `<option value="${r.id}" data-gstin="${r.gstin}">${r.gstin} · ${esc(r.company_name || r.legal_name || '')}</option>`).join('')
      : '<option value="">No registrations</option>';
    const cur = FP.currentRegistration(); if (cur) $('s1-reg').value = cur.id;
    const now = new Date(); let dm = now.getMonth(), dy = now.getFullYear();
    if (dm === 0) { dm = 11; dy -= 1; } else dm -= 1;
    $('s1-month').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    $('s1-month').value = dm + 1;
    const years = []; for (let y = now.getFullYear() + 1; y >= 2017; y--) years.push(y);
    $('s1-year').innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
    $('s1-year').value = dy;
    [$('s1-reg'), $('s1-month'), $('s1-year')].forEach((el) => el.addEventListener('change', sync));
    sync();
  }
  function sync() {
    const opt = $('s1-reg').selectedOptions[0];
    state.regId = $('s1-reg').value;
    state.gstin = opt ? opt.dataset.gstin : '';
    state.period = String($('s1-month').value).padStart(2, '0') + $('s1-year').value;
    $('s1-context').textContent = `${state.gstin || '—'} · ${MONTHS[+$('s1-month').value - 1]} ${$('s1-year').value} · upload your sales register and validate`;
    $('s1-template').href = FP.gstr1.templateUrl(state.gstin, state.period);
    loadHistory();
  }

  // ── File pick / drop ──
  function wireDrop() {
    const drop = $('s1-drop'), input = $('s1-file');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files[0]) pick(input.files[0]); });
    function pick(f) { state.file = f; $('s1-fname').textContent = '📄 ' + f.name; $('s1-run').disabled = false; }
  }

  function setProgress(pct, label, indeterminate) {
    $('s1-progress-wrap').style.display = '';
    const bar = $('s1-pbar'); bar.classList.toggle('indet', !!indeterminate);
    bar.firstElementChild.style.width = (indeterminate ? 40 : pct) + '%';
    $('s1-progress-label').textContent = label || '';
    $('s1-progress-pct').textContent = indeterminate ? '' : pct + '%';
  }

  // ── Run validate ──
  async function runValidate() {
    if (!state.file) { banner('Select a file first.', 'e'); return; }
    if (!state.regId) { banner('No registration selected.', 'e'); return; }
    $('s1-run').disabled = true;
    setProgress(0, 'Uploading & validating…', true);
    try {
      const res = await FP.gstr1.upload(state.file, state.regId, state.period, 'books');
      const v = res.validation, t = (v && v.totals) || {};
      const passPct = t.rows ? Math.round((t.validRows / t.rows) * 100) : 0;
      setProgress(passPct, `${t.validRows || 0} of ${t.rows || 0} rows valid`, false);
      renderSummary(res);
      renderPreview(res);
      const dl = $('s1-report'); dl.href = FP.gstr1.validationReportUrl(res.datasetId); dl.style.display = '';
      $('s1-continue').style.display = '';
      const st = v && v.status;
      banner(st === 'errors' ? 'Validation found errors — see the result below and download the report.' : 'Validation complete.', st === 'errors' ? 'e' : 's');
      loadHistory();
    } catch (e) {
      $('s1-progress-wrap').style.display = 'none';
      banner(e.message || 'Upload failed.', 'e');
    } finally {
      $('s1-run').disabled = false;
    }
  }

  // ── Summary ──
  function renderSummary(res) {
    const v = res.validation || {}, t = v.totals || {};
    const map = { errors: ['#C8102E', 'Not ready — fix errors'], warnings: ['#C77700', 'Ready with warnings'], clean: ['#168736', 'Clean — ready to reconcile'] };
    const m = map[v.status] || ['#6B7280', v.status || ''];
    $('s1-summary-sub').innerHTML = `<span style="color:${m[0]};font-weight:600;">${m[1]}</span>`;
    $('s1-tiles').innerHTML =
      tile(t.rows || 0, 'rows', '#1F2937') + tile(t.validRows || 0, 'valid', '#168736') +
      tile(t.errorRows || 0, 'rows w/ errors', t.errorRows ? '#C8102E' : '#168736') +
      tile(t.errors || 0, 'errors', '#C8102E') + tile(t.warnings || 0, 'warnings', '#C77700');
    // Document-count summary (Table 13)
    const ds = res.docSummary;
    if (ds && ds.totalDocuments != null) {
      const byType = Object.entries(ds.byType || {}).map(([k, n]) => `${esc(k)}: ${n}`).join(' · ');
      $('s1-tiles').innerHTML += tile(ds.totalDocuments, 'documents', '#1F2937') + tile(ds.cancelled, 'cancelled', ds.cancelled ? '#C77700' : '#168736') + tile(ds.netDocuments, 'net issued', '#155CDB');
      if (byType) $('s1-summary-sub').innerHTML += ` <span class="issue">· ${byType}</span>`;
    }
    const issues = (v.topIssues || []).slice(0, 10);
    $('s1-topissues').innerHTML = issues.length
      ? `<table class="data-table compact" style="width:100%"><thead><tr><th>Code</th><th>Severity</th><th>Count</th><th>Issue</th></tr></thead><tbody>${issues.map((i) => `<tr><td class="mono">${esc(i.code || '')}</td><td><span class="action-status ${i.severity === 'error' ? 'reject' : 'pending'}">${i.severity}</span></td><td>${i.count}</td><td>${esc(i.message)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="issue">No issues 🎉</div>';
    $('s1-summary-card').style.display = '';
  }
  function tile(val, label, color) { return `<div class="s1-tile"><b style="color:${color}">${val}</b><span>${label}</span></div>`; }

  // ── Preview ──
  function renderPreview(res) {
    const recs = (res.records || []).filter((r) => r.section !== 'hsn').slice(0, 200);
    $('s1-preview-title').textContent = `Preview of uploaded rows · ${esc(res.records ? '' : '')}${esc(state.file ? state.file.name : '')}`;
    $('s1-preview-sub').textContent = `Showing ${recs.length} of ${(res.records || []).length} parsed rows`;
    $('s1-preview-body').innerHTML = recs.map((r, i) => {
      const d = r.data || {};
      const errs = (r.errors || []).filter((x) => x.severity === 'error');
      const warns = (r.errors || []).filter((x) => x.severity === 'warning');
      let badge, msg = '';
      if (errs.length) { badge = `<span class="action-status reject">Fail</span>`; msg = errs[0].message; }
      else if (warns.length) { badge = `<span class="action-status pending">Warn</span>`; msg = warns[0].message; }
      else { badge = `<span class="action-status matched">OK</span>`; }
      return `<tr>
        <td>${i + 1}</td><td>${esc(r.section).toUpperCase()}</td>
        <td class="mono">${esc(d.invoiceNumber || d.noteNumber || '—')}</td>
        <td>${esc(d.invoiceDate || d.noteDate || '—')}</td>
        <td class="mono">${esc(d.ctin || '—')}</td>
        <td>${esc(d.pos || '—')}</td>
        <td class="mono">${esc(d.hsn || '—')}</td>
        <td class="num">${inr(d.taxableValue)}</td>
        <td class="num">${d.rate != null ? d.rate : '—'}</td>
        <td class="num">${inr(d.iamt)}</td><td class="num">${inr(d.camt)}</td><td class="num">${inr(d.samt)}</td>
        <td>${badge}${msg ? ` <span class="issue">${esc(msg)}</span>` : ''}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="13" style="text-align:center;color:var(--text-muted)">No rows parsed</td></tr>';
    $('s1-preview-card').style.display = '';
  }

  // ── Upload history ──
  async function loadHistory() {
    if (!state.regId) return;
    try {
      const { datasets } = await FP.gstr1.datasets(state.regId, state.period);
      if (!datasets || !datasets.length) { $('s1-history').innerHTML = '<div class="issue">No uploads yet for this period.</div>'; return; }
      $('s1-history').innerHTML = datasets.map((d) => {
        const s = d.summary || {}; const total = s.totalRecords || 0; const valid = s.validRecords || 0;
        const pct = total ? Math.round((valid / total) * 100) : 0;
        const stCls = d.status === 'errors' ? 'reject' : (d.status === 'json_generated' || d.status === 'reconciled' || d.status === 'validated') ? 'matched' : 'pending';
        const dt = d.created_at ? new Date(d.created_at).toLocaleString('en-IN') : '';
        return `<div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:7px;">
            <div style="font-size:13px;font-weight:600;">${esc(d.original_filename || '(file)')} <span class="issue">· ${esc(d.source)} · ${esc(dt)}</span></div>
            <div><span class="action-status ${stCls}">${esc(d.status)}</span> <span class="issue">${valid}/${total} valid</span></div>
          </div>
          <div class="pbar"><i style="width:${pct}%"></i></div>
        </div>`;
      }).join('');
    } catch (e) { /* keep silent */ }
  }

  // ── Boot ──
  initSetup();
  wireDrop();
  $('s1-run').addEventListener('click', runValidate);
})();
