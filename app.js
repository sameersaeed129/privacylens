/* PrivacyLens UI: two interfaces (A nested settings, B privacy dashboard) and the study flow. */
(() => {
  'use strict';
  const M = Model;
  const $ = id => document.getElementById(id);
  const ICON = { camera: '📷', mic: '🎙️', motion: '📡', location: '📍' };

  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  };

  const app = { devs: M.seed(), cond: 'A', nav: [], study: null, explain: false, dismissed: new Set() };

  const sw = (on, label, fn) =>
    h('button', { class: 'switch' + (on ? ' on' : ''), type: 'button', role: 'switch',
                  'aria-checked': String(on), 'aria-label': label, onclick: fn }, h('span', { class: 'knob' }));
  const retentionSelect = d =>
    h('select', { 'aria-label': 'Keep data for', onchange: e => { d.retention = Number(e.target.value); } },
      M.RETENTION.map(n => h('option', { value: n, selected: n === d.retention }, n + (n === 1 ? ' day' : ' days'))));

  /* ---------- Interface A: nested settings (baseline) ---------- */
  function baseline() {
    const top = app.nav[app.nav.length - 1];
    const push = x => () => { app.nav.push(x); render(); };
    const row = (label, fn) => h('button', { class: 'row', type: 'button', onclick: fn }, h('span', {}, label), h('span', { class: 'chev' }, '›'));
    let title = 'Settings';
    let body = [];
    if (!top) {
      body = [row('Account', push('empty')), row('Notifications', push('empty')), row('Devices', push('devices')), row('About', push('empty'))];
    } else if (top === 'empty') {
      title = 'Details';
      body = [h('p', { class: 'muted pad' }, 'Nothing to configure here.')];
    } else if (top === 'devices') {
      title = 'Devices';
      body = app.devs.map(d => row(d.name, push('dev:' + d.id)));
    } else {
      const [kind, id] = top.split(':');
      const d = M.find(app.devs, id);
      title = d.name;
      if (kind === 'dev') {
        body = [row('Name and room', push('empty')), row('Firmware', push('empty')), row('Advanced', push('adv:' + id))];
      } else if (kind === 'adv') {
        title = 'Advanced';
        body = [row('Network', push('empty')), row('Diagnostics', push('empty')), row('Data and privacy', push('priv:' + id))];
      } else {
        title = 'Data and privacy';
        body = d.sensors.map(s => {
          const label = 'Allow ' + M.LABEL[s.type].toLowerCase();
          return h('div', { class: 'row' }, h('span', {}, label), sw(s.on, label, () => { s.on = !s.on; render(); }));
        });
        body.push(h('div', { class: 'row' }, h('span', {}, 'Cloud sync'), sw(d.cloud, 'Cloud sync', () => { d.cloud = !d.cloud; render(); })));
        body.push(h('div', { class: 'row' }, h('span', {}, 'Keep data for'), retentionSelect(d)));
      }
    }
    const back = app.nav.length
      ? h('button', { class: 'back', type: 'button', onclick: () => { app.nav.pop(); render(); } }, '‹ Back')
      : h('span');
    return [h('div', { class: 'bar' }, back, h('strong', {}, title), h('span')), h('div', { class: 'list' }, body)];
  }

  /* ---------- Interface B: privacy dashboard ---------- */
  function card(d) {
    const sensorRows = d.sensors.map(s => {
      const label = M.LABEL[s.type];
      return h('div', { class: 'srow' + (s.on ? ' live' : '') },
        h('span', {}, ICON[s.type] + ' ' + label),
        h('span', { class: 'state' }, s.on ? 'Recording' : 'Off'),
        sw(s.on, label + ' of ' + d.name, () => { s.on = !s.on; render(); }));
    });
    const cloudRow = h('div', { class: 'srow' },
      h('span', {}, '☁️ Send to cloud'), h('span', { class: 'state' }, d.cloud ? 'Yes' : 'No'),
      sw(d.cloud, 'Send data of ' + d.name + ' to cloud', () => { d.cloud = !d.cloud; render(); }));
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Keep data for' },
      h('span', { class: 'muted' }, 'Keep data'),
      M.RETENTION.map(n => h('button', { class: 'chip' + (n === d.retention ? ' sel' : ''), type: 'button',
        'aria-pressed': String(n === d.retention), 'aria-label': n + (n === 1 ? ' day' : ' days') + ' for ' + d.name,
        onclick: () => { d.retention = n; render(); } }, n + 'd')));
    return h('article', { class: 'dev' },
      h('header', {}, h('strong', {}, d.name), h('span', { class: 'muted' }, d.room)), sensorRows, cloudRow, seg);
  }

  function alertsView() {
    const list = M.alerts(app.devs).filter(a => !app.dismissed.has(a.id));
    if (!list.length) return h('p', { class: 'muted pad' }, 'No unusual activity. Nothing needs your attention.');
    return h('div', { class: 'alerts' }, list.map(a => h('article', { class: 'alert' },
      h('strong', {}, a.title),
      h('div', { class: 'muted small' }, 'Today ' + a.time + '. Confidence: ' + a.confidence),
      h('details', {}, h('summary', {}, 'Why am I seeing this?'), h('p', {}, a.why)),
      h('div', { class: 'btns' },
        h('button', { class: 'primary', type: 'button', onclick: () => { M.sensor(M.find(app.devs, a.device), a.sensor).on = false; render(); } }, a.fix),
        h('button', { class: 'ghost', type: 'button', onclick: () => { app.dismissed.add(a.id); render(); } }, 'This looks normal')))));
  }

  function dashboard() {
    const a = M.activeCount(app.devs), total = M.totalSensors(app.devs), score = M.privacyScore(app.devs);
    const cloud = app.devs.filter(d => d.cloud).length;
    const act = (label, name) => h('button', { class: 'ghost', type: 'button', onclick: () => { M.preset(app.devs, name); render(); } }, label);
    return [
      h('div', { class: 'summary' + (a ? ' live' : '') },
        h('div', { class: 'big' }, String(a)),
        h('div', {}, h('strong', {}, 'sensors recording right now'),
          h('div', { class: 'muted' }, 'out of ' + total + '. ' + cloud + ' of ' + app.devs.length + ' devices send data to the cloud.'))),
      h('div', { class: 'meter', role: 'img', 'aria-label': 'Privacy score ' + score + ' percent' }, h('div', { class: 'fill', style: 'width:' + score + '%' })),
      h('div', { class: 'muted small' }, 'Privacy score: ' + score + '%'),
      h('div', { class: 'actions' }, act('All cameras off', 'cameras_off'), act('Away mode', 'away'), act('Private mode', 'private')),
      app.explain ? alertsView() : null,
      app.devs.map(card)
    ];
  }

  function render() {
    $('frame').replaceChildren(...(app.cond === 'A' ? baseline() : dashboard()).flat().filter(Boolean));
  }

  /* ---------- Study flow ---------- */
  const show = id => ['start', 'study', 'sus', 'done'].forEach(s => { $(s).hidden = s !== id; });
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  function startBlock() {
    const st = app.study;
    app.cond = st.blocks[st.b];
    st.order = M.orderFor(st.pid + '-' + app.cond);
    st.i = 0;
    show('study');
    beginTask();
  }

  function beginTask() {
    const st = app.study, t = st.order[st.i];
    app.devs = M.seed(); app.nav = []; st.clicks = 0; st.t0 = Date.now();
    $('task').replaceChildren(
      h('div', { class: 'muted small' }, 'Task ' + (st.i + 1) + ' of ' + st.order.length),
      h('p', { class: 'task-text' }, t.text),
      t.answer ? h('input', { id: 'ans', type: 'number', min: '0', inputmode: 'numeric', 'aria-label': 'Your answer', placeholder: 'Your answer' }) : null,
      h('div', { class: 'timer', id: 'timer' }, '0:00'),
      h('div', { class: 'btns' },
        h('button', { class: 'primary', type: 'button', onclick: () => finish(false) }, 'I am done'),
        h('button', { class: 'ghost', type: 'button', onclick: () => finish(true) }, 'Skip task')));
    clearInterval(st.timer);
    st.timer = setInterval(() => { $('timer').textContent = fmt((Date.now() - st.t0) / 1000); }, 250);
    render();
  }

  function finish(skipped) {
    const st = app.study, t = st.order[st.i];
    const secs = (Date.now() - st.t0) / 1000;
    const input = $('ans');
    const ok = !skipped && t.check(app.devs, input ? input.value : undefined);
    st.rows.push({ participant: st.pid, condition: app.cond, type: 'task', item: t.id, order: st.i + 1,
                   success: ok ? 1 : 0, time_s: secs.toFixed(1), clicks: st.clicks, note: skipped ? 'skipped' : '' });
    clearInterval(st.timer);
    st.i += 1;
    if (st.i < st.order.length) beginTask(); else showSus();
  }

  function showSus() {
    const scale = n => h('div', { class: 'scale' }, [1, 2, 3, 4, 5].map(v =>
      h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'q' + n, value: v, required: true }), String(v))));
    const items = M.SUS_ITEMS.map((text, i) => h('fieldset', {}, h('legend', {}, text), scale(i + 1)));
    const form = h('form', { onsubmit: e => { e.preventDefault(); submitSus(e.target); } },
      h('p', { class: 'muted' }, '1 means strongly disagree, 5 means strongly agree.'), items,
      h('label', {}, 'Anything else you want to tell us? (optional)', h('textarea', { name: 'comment', rows: '3' })),
      h('button', { class: 'primary', type: 'submit' }, 'Finish'));
    $('sus').replaceChildren(h('h2', {}, 'About the app you just used'), form);
    show('sus');
  }

  function submitSus(form) {
    const st = app.study, fd = new FormData(form);
    const scores = M.SUS_ITEMS.map((_, i) => Number(fd.get('q' + (i + 1))));
    scores.forEach((s, i) => st.rows.push({ participant: st.pid, condition: app.cond, type: 'sus', item: 'Q' + (i + 1), score: s }));
    const comment = String(fd.get('comment') || '').trim();
    if (comment) st.rows.push({ participant: st.pid, condition: app.cond, type: 'comment', item: 'comment', note: comment });
    st.b += 1;
    if (st.b < st.blocks.length) {
      $('done').replaceChildren(
        h('h2', {}, 'Part 1 is finished'),
        h('p', {}, 'Now you will use a second version of the app and do the same kind of tasks again.'),
        h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'button', onclick: startBlock }, 'Start part 2')));
    } else {
      $('done').replaceChildren(
        h('h2', {}, 'Thank you'),
        h('p', {}, 'Download your results file and send it to the researcher.'),
        h('div', { class: 'btns' },
          h('button', { class: 'primary', type: 'button', onclick: download }, 'Download results (CSV)'),
          h('button', { class: 'ghost', type: 'button', onclick: () => { app.study = null; $('startform').reset(); show('start'); } }, 'New participant')));
    }
    show('done');
  }

  function download() {
    const st = app.study;
    const url = URL.createObjectURL(new Blob([M.toCsv(st.rows)], { type: 'text/csv' }));
    const a = h('a', { href: url, download: 'privacylens_' + st.pid + '_' + st.blocks.join('') + '.csv' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('frame').addEventListener('click', () => { if (app.study) app.study.clicks += 1; });

  $('startform').addEventListener('submit', e => {
    e.preventDefault();
    const pid = $('pid').value.trim(), design = $('design').value, pick = $('cond').value;
    const first = design === 'within' || pick === 'auto' ? M.conditionFor(pid) : pick;
    const blocks = design === 'within' ? (first === 'A' ? ['A', 'B'] : ['B', 'A']) : [first];
    app.explain = false;
    app.study = { pid, design, blocks, b: 0, i: 0, order: [], rows: [], clicks: 0, t0: 0, timer: null };
    startBlock();
  });

  $('demo').addEventListener('click', () => {
    app.cond = $('cond').value === 'A' ? 'A' : 'B';
    app.explain = $('explain').checked && app.cond === 'B';
    app.dismissed = new Set();
    app.study = null; app.devs = M.seed(); app.nav = [];
    $('task').replaceChildren(h('p', {}, 'Free exploration: change any setting you like.'),
      h('button', { class: 'ghost', type: 'button', onclick: () => show('start') }, 'Back to start'));
    render(); show('study');
  });
})();
