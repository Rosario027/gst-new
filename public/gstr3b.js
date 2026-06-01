// GSTR-3B — auto-prepared from GSTR-1, with manual ITC and net-payable.
(function () {
  if (!window.FP || !FP.requireSession()) return;
  const $ = (id) => document.getElementById(id);
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const state = { regId: null, gstin: null, period: null, filingScheme: 'monthly', summary: null, json: null };
  const itc = { iamt: 0, camt: 0, samt: 0, csamt: 0 };

  function banner(msg, kind) { const b = $('tb-banner'); b.textContent = msg; b.className = 'banner show ' + (kind || 'i'); }
  function inr(n) { return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function initControls() {
    const regs = FP.getRegistrations();
    $('tb-reg').innerHTML = regs.length
      ? regs.map(r => `<option value="${r.id}" data-gstin="${r.gstin}" data-scheme="${r.filing_scheme}">${r.gstin}</option>`).join('')
      : '<option>No registrations</option>';
    const cur = FP.currentRegistration(); if (cur) $('tb-reg').value = cur.id;
    const now = new Date(); let dm = now.getMonth(), dy = now.getFullYear();
    if (dm === 0) { dm = 11; dy -= 1; } else dm -= 1;
    $('tb-month').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    $('tb-month').value = dm + 1;
    const years = []; for (let y = now.getFullYear() + 1; y >= 2017; y--) years.push(y);
    $('tb-year').innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    $('tb-year').value = dy;
    [$('tb-reg'), $('tb-month'), $('tb-year')].forEach(el => el.addEventListener('change', sync));
    sync();
  }
  function sync() {
    const opt = $('tb-reg').selectedOptions[0];
    state.regId = $('tb-reg').value;
    state.gstin = opt ? opt.dataset.gstin : '';
    state.filingScheme = opt ? opt.dataset.scheme : 'monthly';
    state.period = String($('tb-month').value).padStart(2, '0') + $('tb-year').value;
    paintDue();
  }
  function paintDue() {
    const d = computeGstDueDates(state.filingScheme).gstr3b;
    $('tb-days').textContent = dueDaysText(d.daysLeft);
    $('tb-date').textContent = d.label + ' · period ' + d.period;
  }

  async function compute() {
    try {
      banner('Computing from GSTR-1…', 'i');
      const res = await FP.gstr3b.compute(state.regId, state.period);
      if (!res.hasData) { $('tb-results').style.display = 'none'; banner(res.message, 'e'); return; }
      state.summary = res.summary; state.json = res.gstr3bJson;
      $('tb-banner').className = 'banner';
      render();
      $('tb-results').style.display = '';
    } catch (e) { banner(e.message, 'e'); }
  }

  function taxRow(label, t, opts) {
    const z = (v) => (opts && opts.txOnly) ? '—' : inr(v);
    return `<tr><td class="lbl">${label}</td><td>${inr(t.txval)}</td><td>${z(t.iamt)}</td><td>${opts && opts.noIntra ? '—' : z(t.camt)}</td><td>${opts && opts.noIntra ? '—' : z(t.samt)}</td><td>${z(t.csamt)}</td></tr>`;
  }

  function render() {
    const s = state.summary;
    $('tb-31').innerHTML =
      taxRow('(a) Outward taxable supplies (other than zero-rated, nil, exempted)', s.osup_det) +
      taxRow('(b) Outward taxable supplies (zero-rated)', s.osup_zero, { noIntra: true }) +
      taxRow('(c) Other outward supplies (nil-rated, exempted)', s.osup_nil_exmp, { txOnly: true, noIntra: true }) +
      taxRow('(d) Inward supplies (liable to reverse charge)', s.isup_rev) +
      taxRow('(e) Non-GST outward supplies', s.osup_nongst, { txOnly: true, noIntra: true });

    $('tb-32').innerHTML = (s.inter_unreg.length
      ? s.inter_unreg.map(u => `<tr><td class="lbl">${u.pos} ${u.stateName}</td><td>${inr(u.txval)}</td><td>${inr(u.iamt)}</td></tr>`).join('')
      : `<tr><td class="lbl" colspan="3" style="text-align:center;color:#9CA3AF">No inter-state B2C supplies</td></tr>`);

    $('tb-itc').innerHTML =
      `<tr><td class="lbl">(A)(5) All other ITC</td>
        <td><input type="number" step="0.01" data-itc="iamt" value="${itc.iamt}"></td>
        <td><input type="number" step="0.01" data-itc="camt" value="${itc.camt}"></td>
        <td><input type="number" step="0.01" data-itc="samt" value="${itc.samt}"></td>
        <td><input type="number" step="0.01" data-itc="csamt" value="${itc.csamt}"></td></tr>`;
    $('tb-itc').querySelectorAll('input[data-itc]').forEach(inp => inp.addEventListener('input', () => {
      itc[inp.dataset.itc] = parseFloat(inp.value) || 0; renderNet();
    }));
    renderNet();
  }

  function renderNet() {
    const s = state.summary;
    const liab = { iamt: s.totalTaxLiability.iamt, camt: s.totalTaxLiability.camt, samt: s.totalTaxLiability.samt, csamt: s.totalTaxLiability.csamt };
    const heads = [['IGST', 'iamt'], ['CGST', 'camt'], ['SGST/UTGST', 'samt'], ['Cess', 'csamt']];
    $('tb-net').innerHTML = heads.map(([name, k]) => {
      const net = Math.max(0, (liab[k] || 0) - (itc[k] || 0));
      return `<tr><td class="lbl">${name}</td><td>${inr(liab[k])}</td><td>${inr(itc[k])}</td><td>${inr(net)}</td></tr>`;
    }).join('');
  }

  function downloadJson() {
    if (!state.json) return;
    // merge manual ITC into the portal JSON before download
    const json = JSON.parse(JSON.stringify(state.json));
    json.itc_elg.itc_avl = [{ ty: 'OTH', iamt: itc.iamt, camt: itc.camt, samt: itc.samt, csamt: itc.csamt }];
    json.itc_elg.itc_net = { iamt: itc.iamt, camt: itc.camt, samt: itc.samt, csamt: itc.csamt };
    FP.downloadJson(json, 'GSTR3B-' + state.period + '.json');
  }

  initControls();
  $('tb-compute').addEventListener('click', compute);
  $('tb-dl-json').addEventListener('click', downloadJson);
})();
