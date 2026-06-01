// Free-form two-file reconciliation.
(function () {
  if (!window.FP || !FP.requireSession()) return;
  const $ = (id) => document.getElementById(id);
  const state = { fileA: null, fileB: null, lines: null, summary: null };

  function banner(msg, kind) { const b = $('rf-banner'); b.textContent = msg; b.className = 'banner show ' + (kind || 'e'); if (kind === 's') setTimeout(() => b.classList.remove('show'), 4000); }

  function wireDrop(dropId, inputId, nameId, which) {
    const drop = $(dropId), input = $(inputId);
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) { input.files = e.dataTransfer.files; pick(e.dataTransfer.files[0]); } });
    input.addEventListener('change', () => { if (input.files[0]) pick(input.files[0]); });
    function pick(f) { state[which] = f; $(nameId).textContent = f.name; $('rf-run').disabled = !(state.fileA && state.fileB); }
  }

  async function run() {
    if (!state.fileA || !state.fileB) return;
    try {
      $('rf-result').innerHTML = '<p class="muted">Reconciling…</p>';
      const res = await FP.gstr1.reconcileFiles(state.fileA, state.fileB);
      state.lines = res.lines; state.summary = res.summary;
      const s = res.summary;
      const tiles = `<div class="rf-card"><h3>Result</h3>
        <p class="hint">${res.fileA.name} (${res.fileA.rows} rows) vs ${res.fileB.name} (${res.fileB.rows} rows)</p>
        <div class="wb-stat">
          <div class="s"><b style="color:#168736">${s.matched}</b><span>matched</span></div>
          <div class="s"><b style="color:#C77700">${s.mismatch}</b><span>mismatch</span></div>
          <div class="s"><b style="color:#155CDB">${s.onlyInBooks}</b><span>only in A</span></div>
          <div class="s"><b style="color:#C8102E">${s.onlyInCompare}</b><span>only in B</span></div>
        </div>`;
      const flagged = res.lines.filter(l => l.status !== 'matched').slice(0, 200);
      const rows = flagged.map(l => {
        const cls = { mismatch: 'warn', only_in_books: 'info', only_in_compare: 'err' }[l.status] || 'ok';
        const diff = Object.keys(l.diff || {}).map(f => `${f}: ${l.diff[f].books} → ${l.diff[f].compare}`).join(', ');
        return `<tr><td>${l.section.toUpperCase()}</td><td>${l.matchKey}</td><td><span class="pill ${cls}">${l.status.replace(/_/g, ' ')}</span></td><td style="font-family:inherit">${diff}</td></tr>`;
      }).join('');
      const table = flagged.length
        ? `<table class="wb-tbl"><thead><tr><th>Section</th><th>Key</th><th>Status</th><th>Difference (A → B)</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="pill ok" style="margin-top:12px;display:inline-block">Everything reconciles ✓</p>';
      $('rf-result').innerHTML = tiles + table + '</div>';
      $('rf-report').style.display = '';
      banner('Reconciliation complete.', 's');
    } catch (e) { $('rf-result').innerHTML = ''; banner(e.message, 'e'); }
  }

  async function downloadReport() {
    if (!state.lines) return;
    try {
      await FP.downloadPost('/gstr1/reconcile-files/report',
        { lines: state.lines, summary: state.summary, labelA: state.fileA.name, labelB: state.fileB.name },
        'reconciliation-report.xlsx');
    } catch (e) { banner(e.message, 'e'); }
  }

  wireDrop('drop-a', 'file-a', 'name-a', 'fileA');
  wireDrop('drop-b', 'file-b', 'name-b', 'fileB');
  $('rf-run').addEventListener('click', run);
  $('rf-report').addEventListener('click', downloadReport);
})();
