const test = require('node:test');
const assert = require('node:assert');
const M = require('../app/model.js');

test('seed state: tasks T1, T2, T3, T5 start unsolved', () => {
  const d = M.seed();
  for (const id of ['T1', 'T2', 'T3', 'T5']) assert.strictEqual(M.tasks.find(t => t.id === id).check(d), false, id);
  assert.strictEqual(M.activeCount(d), 8);
  assert.strictEqual(M.totalSensors(d), 8);
});

test('each task is solvable', () => {
  const d = M.seed();
  M.sensor(M.find(d, 'd1'), 'mic').on = false;
  M.find(d, 'd2').retention = 7;
  M.find(d, 'd3').cloud = false;
  M.preset(d, 'cameras_off');
  const get = id => M.tasks.find(t => t.id === id);
  assert.ok(get('T1').check(d) && get('T2').check(d) && get('T3').check(d) && get('T5').check(d));
  assert.ok(get('T4').check(M.seed(), '8'));
  assert.ok(!get('T4').check(M.seed(), '7'));
  assert.ok(!get('T4').check(M.seed(), ''));
  assert.ok(!get('T4').check(M.seed(), undefined));
});

test('presets', () => {
  const d = M.seed();
  M.preset(d, 'private');
  assert.strictEqual(M.activeCount(d), 0);
  assert.ok(d.every(x => x.cloud === false));
  assert.strictEqual(M.privacyScore(d), 100);
  const a = M.seed();
  M.preset(a, 'away');
  assert.ok(a.every(x => x.sensors.every(s => s.on === (s.type === 'camera' || s.type === 'motion'))));
  assert.strictEqual(M.privacyScore(M.seed()) < 50, true);
});

test('SUS scoring and validation', () => {
  assert.strictEqual(M.susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
  assert.strictEqual(M.susScore(Array(10).fill(3)), 50);
  assert.throws(() => M.susScore([1, 2, 3]));
  assert.throws(() => M.susScore([0, 3, 3, 3, 3, 3, 3, 3, 3, 3]));
});

test('condition assignment and CSV escaping', () => {
  assert.strictEqual(M.conditionFor('P01'), 'A');
  assert.strictEqual(M.conditionFor('P02'), 'B');
  assert.strictEqual(M.conditionFor('abc'), 'A');
  const csv = M.toCsv([{ participant: 'P1', condition: 'A', type: 'comment', item: 'comment', note: 'say "hi", ok' }]);
  const lines = csv.trim().split('\n');
  assert.strictEqual(lines[0], M.HEADER.join(','));
  assert.strictEqual(lines[1], ['P1', 'A', 'comment', 'comment', '', '', '', '', '', '"say ""hi"", ok"'].join(','));
});

test('task order is reproducible, complete, and varies by key', () => {
  const ids = k => M.orderFor(k).map(t => t.id);
  assert.deepStrictEqual(ids('P01-A'), ids('P01-A'));
  assert.deepStrictEqual(ids('P01-A').slice().sort(), ['T1', 'T2', 'T3', 'T4', 'T5']);
  const orders = new Set(Array.from({ length: 30 }, (_, i) => ids('P' + i + '-A').join()));
  assert.ok(orders.size > 5);
});

test('explained alerts depend on sensor state', () => {
  const d = M.seed();
  assert.strictEqual(M.alerts(d).length, 3);
  M.sensor(M.find(d, 'd4'), 'mic').on = false;
  assert.strictEqual(M.alerts(d).length, 2);
});
