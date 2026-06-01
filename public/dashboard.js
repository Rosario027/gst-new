// Clean, real, API-driven dashboard (launchpad to the GSTR-1 workbench).
(function () {
  if (!window.FP || !FP.requireSession()) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // Greeting from the real session.
  let name = 'there';
  try { name = (JSON.parse(localStorage.getItem('fylepro.session') || '{}').name || 'there').split(/\s+/)[0]; } catch (e) {}
  $('db-greeting').textContent = 'Welcome, ' + name;

  function openWorkbench(regId) {
    if (regId) localStorage.setItem('fylepro.entity', regId);
    window.location.href = 'gstr1-workbench.html';
  }
  window.__openWb = openWorkbench;

  async function load() {
    let regs = FP.getRegistrations();
    if (!regs.length) { try { regs = await FP.refreshRegistrations(); } catch (e) {} }

    const regsEl = $('db-regs');
    if (!regs || !regs.length) {
      regsEl.innerHTML = `<div class="db-empty">No GST registrations yet.<br><span class="db-muted">Sign out and use “New user?” to add your GSTIN(s), or contact your workspace admin.</span></div>`;
      $('db-datasets').innerHTML = '';
      $('db-sub').textContent = 'No registrations yet';
      return;
    }

    $('db-sub').textContent = regs.length + ' GST registration' + (regs.length > 1 ? 's' : '');
    const dueChips = (r) => {
      if (typeof computeGstDueDates !== 'function') return '';
      const d = computeGstDueDates(r.filing_scheme);
      const pill = (x, name) => `<span class="due-pill ${dueChipClass(x.daysLeft)}" title="${x.label} · period ${x.period}">${name} ${dueDaysText(x.daysLeft)}</span>`;
      return `<div class="reg-meta" style="margin-top:-4px">${pill(d.gstr1, 'GSTR-1')}${pill(d.gstr3b, 'GSTR-3B')}</div>`;
    };
    regsEl.innerHTML = regs.map(r => `
      <div class="reg-card">
        <div class="gstin">${esc(r.gstin)}</div>
        <div class="nm">${esc(r.company_name || r.legal_name || '')}</div>
        <div class="reg-meta">
          <span class="chip">${esc(r.state_name || '')}${r.state_code ? ' (' + esc(r.state_code) + ')' : ''}</span>
          <span class="chip">${r.filing_scheme === 'qrmp' ? 'QRMP' : 'Monthly'}</span>
          <span class="chip b">${(r.delivery_mode || 'json').toUpperCase()}</span>
        </div>
        ${dueChips(r)}
        <button class="btn btn-primary" onclick="__openWb('${r.id}')">Open GSTR-1 Workbench</button>
      </div>`).join('');

    // Recent uploads for the first / current registration.
    const cur = FP.currentRegistration() || regs[0];
    try {
      const { datasets } = await FP.gstr1.datasets(cur.id);
      if (!datasets || !datasets.length) {
        $('db-datasets').innerHTML = `<div class="db-empty">No uploads yet for <strong>${esc(cur.gstin)}</strong>.<br><span class="db-muted">Open the workbench to upload your sales data.</span></div>`;
        return;
      }
      const rows = datasets.slice(0, 12).map(d => {
        const s = d.summary || {};
        const dt = d.created_at ? new Date(d.created_at).toLocaleString('en-IN') : '';
        return `<tr>
          <td>${esc(d.period)}</td>
          <td>${esc(d.source)}</td>
          <td>${esc(d.original_filename || '')}</td>
          <td>${s.totalRecords != null ? s.totalRecords : ''}</td>
          <td><span class="st ${esc(d.status)}">${esc(d.status)}</span></td>
          <td class="db-muted">${esc(dt)}</td>
        </tr>`;
      }).join('');
      $('db-datasets').innerHTML = `<table class="db-tbl"><thead><tr><th>Period</th><th>Source</th><th>File</th><th>Rows</th><th>Status</th><th>Uploaded</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (e) {
      $('db-datasets').innerHTML = `<div class="db-empty db-muted">Could not load uploads: ${esc(e.message)}</div>`;
    }
  }

  load();
})();
