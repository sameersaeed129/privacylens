/* End-to-end test: runs the real app in jsdom and completes the study in both interfaces. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const M = require('../app/model.js');

const root = path.join(__dirname, '..', 'app');

function load() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<script src="(.*?)"><\/script>/g, (_, f) => '<script>' + fs.readFileSync(path.join(root, f), 'utf8') + '</script>');
  const ctx = { errors: [], csv: '' };
  ctx.dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.Blob = class { constructor(parts) { this.parts = parts; } };
      w.URL.createObjectURL = b => { ctx.csv = b.parts.join(''); return 'blob:test'; };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = () => {};
      w.addEventListener('error', e => ctx.errors.push(e.message));
    }
  });
  const w = ctx.dom.window, d = w.document;
  ctx.d = d;
  ctx.click = el => { assert.ok(el, 'element to click exists'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  ctx.btn = t => [...d.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(t));
  ctx.sw = label => d.querySelector(`button[aria-label="${label}"]`);
  ctx.submit = el => el.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  ctx.change = el => el.dispatchEvent(new w.Event('change', { bubbles: true }));
  return ctx;
}

const solvers = {
  A: c => {
    const priv = dev => { c.click(c.btn('Devices')); c.click(c.btn(dev)); c.click(c.btn('Advanced')); c.click(c.btn('Data and privacy')); };
    const home = () => { for (let i = 0; i < 4; i++) c.click(c.btn('‹ Back')); };
    return {
      T1: () => { priv('Living Room Camera'); c.click(c.sw('Allow microphone')); },
      T2: () => { priv('Front Door Camera'); const s = c.d.querySelector('#frame select'); s.value = '7'; c.change(s); },
      T3: () => { priv('Smart Thermostat'); c.click(c.sw('Cloud sync')); },
      T4: () => { c.d.getElementById('ans').value = '8'; },
      T5: () => { priv('Living Room Camera'); c.click(c.sw('Allow camera')); home(); priv('Front Door Camera'); c.click(c.sw('Allow camera')); }
    };
  },
  B: c => ({
    T1: () => c.click(c.sw('Microphone of Living Room Camera')),
    T2: () => c.click(c.sw('7 days for Front Door Camera') || c.d.querySelector('button[aria-label="7 days for Front Door Camera"]')),
    T3: () => c.click(c.sw('Send data of Smart Thermostat to cloud')),
    T4: () => { c.d.getElementById('ans').value = '8'; },
    T5: () => c.click(c.btn('All cameras off'))
  })
};

function runBlock(c, cond) {
  const solve = solvers[cond](c);
  for (let n = 0; n < M.tasks.length; n++) {
    const text = c.d.querySelector('.task-text').textContent;
    const task = M.tasks.find(t => t.text === text);
    assert.ok(task, 'known task shown: ' + text);
    solve[task.id]();
    c.click(c.btn('I am done'));
  }
  const form = c.d.querySelector('#sus form');
  for (let n = 1; n <= 10; n++) c.d.querySelector(`input[name=q${n}][value="${n % 2 ? 5 : 1}"]`).checked = true;
  c.submit(form);
}

const parse = csv => { const [head, ...lines] = csv.trim().split('\n'); const keys = head.split(','); return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v]))); };

function start(c, pid, design) {
  c.d.getElementById('pid').value = pid;
  c.d.getElementById('design').value = design;
  c.submit(c.d.getElementById('startform'));
}

test('between subjects: every task solved in the shuffled order, in both interfaces', () => {
  for (const [pid, cond] of [['P01', 'A'], ['P02', 'B']]) {
    const c = load();
    start(c, pid, 'between');
    runBlock(c, cond);
    c.click(c.btn('Download results'));
    const rows = parse(c.csv), tasks = rows.filter(r => r.type === 'task');
    assert.deepStrictEqual(c.errors, []);
    assert.strictEqual(tasks.length, 5);
    assert.ok(tasks.every(r => r.success === '1' && r.condition === cond), JSON.stringify(tasks));
    assert.deepStrictEqual(tasks.map(r => r.item), M.orderFor(pid + '-' + cond).map(t => t.id));
    assert.deepStrictEqual(tasks.map(r => r.order), ['1', '2', '3', '4', '5']);
    assert.strictEqual(rows.filter(r => r.type === 'sus').length, 10);
  }
});

test('within subjects: both interfaces, counterbalanced by ID', () => {
  const c = load();
  start(c, 'P02', 'within');           // even ID: B first, then A
  runBlock(c, 'B');
  c.click(c.btn('Start part 2'));
  runBlock(c, 'A');
  c.click(c.btn('Download results'));
  const rows = parse(c.csv);
  assert.deepStrictEqual(c.errors, []);
  assert.deepStrictEqual([...new Set(rows.map(r => r.condition))], ['B', 'A']);
  assert.strictEqual(rows.filter(r => r.type === 'task' && r.success === '1').length, 10);
  assert.strictEqual(rows.filter(r => r.type === 'sus').length, 20);
});

test('demo mode with explained alerts', () => {
  const c = load();
  c.d.getElementById('cond').value = 'B';
  c.d.getElementById('explain').checked = true;
  c.click(c.d.getElementById('demo'));
  assert.strictEqual(c.d.querySelectorAll('.alert').length, 3);
  c.click(c.btn('Turn off the microphone'));
  assert.strictEqual(c.d.querySelectorAll('.alert').length, 2);
  c.click(c.btn('This looks normal'));
  assert.strictEqual(c.d.querySelectorAll('.alert').length, 1);
  assert.deepStrictEqual(c.errors, []);
});
