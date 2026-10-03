/* PrivacyLens model: pure logic, no DOM. Works in the browser and in Node. */
const Model = (() => {
  'use strict';

  const LABEL = { camera: 'Camera', mic: 'Microphone', motion: 'Motion sensing', location: 'Location' };
  const RETENTION = [1, 7, 30, 90];

  const seed = () => [
    { id: 'd1', name: 'Living Room Camera', room: 'Living room', retention: 30, cloud: true,
      sensors: [{ type: 'camera', on: true }, { type: 'mic', on: true }] },
    { id: 'd2', name: 'Front Door Camera', room: 'Entrance', retention: 30, cloud: true,
      sensors: [{ type: 'camera', on: true }, { type: 'motion', on: true }] },
    { id: 'd3', name: 'Smart Thermostat', room: 'Hallway', retention: 30, cloud: true,
      sensors: [{ type: 'motion', on: true }, { type: 'location', on: true }] },
    { id: 'd4', name: 'Kitchen Speaker', room: 'Kitchen', retention: 30, cloud: true,
      sensors: [{ type: 'mic', on: true }] },
    { id: 'd5', name: 'Hallway Motion Sensor', room: 'Hallway', retention: 7, cloud: false,
      sensors: [{ type: 'motion', on: true }] }
  ];

  const find = (devs, id) => devs.find(d => d.id === id);
  const sensor = (d, type) => d.sensors.find(s => s.type === type);
  const activeCount = devs => devs.reduce((n, d) => n + d.sensors.filter(s => s.on).length, 0);
  const totalSensors = devs => devs.reduce((n, d) => n + d.sensors.length, 0);

  /* Share of possible data flows (sensors + cloud links) that are switched off, 0 to 100. */
  const privacyScore = devs => {
    const possible = totalSensors(devs) + devs.length;
    if (possible === 0) return 100;
    const open = activeCount(devs) + devs.filter(d => d.cloud).length;
    return Math.round(100 * (1 - open / possible));
  };

  const preset = (devs, name) => {
    for (const d of devs) {
      if (name === 'private') d.cloud = false;
      for (const s of d.sensors) {
        if (name === 'cameras_off' && s.type === 'camera') s.on = false;
        if (name === 'private') s.on = false;
        if (name === 'away') s.on = s.type === 'camera' || s.type === 'motion';
      }
    }
  };

  const tasks = [
    { id: 'T1', text: 'Turn off the microphone of the Living Room Camera.',
      check: d => sensor(find(d, 'd1'), 'mic').on === false },
    { id: 'T2', text: 'Make the Front Door Camera keep its recordings for only 7 days.',
      check: d => find(d, 'd2').retention === 7 },
    { id: 'T3', text: 'Stop the Smart Thermostat from sending data to the cloud.',
      check: d => find(d, 'd3').cloud === false },
    { id: 'T4', text: 'How many sensors are recording right now? Enter the number.', answer: true,
      check: (d, a) => String(a == null ? '' : a).trim() !== '' && Number(a) === activeCount(d) },
    { id: 'T5', text: 'Switch off every camera in the home.',
      check: d => d.every(x => x.sensors.filter(s => s.type === 'camera').every(s => !s.on)) }
  ];

  const SUS_ITEMS = [
    'I think that I would like to use this system frequently.',
    'I found the system unnecessarily complex.',
    'I thought the system was easy to use.',
    'I think that I would need the support of a technical person to be able to use this system.',
    'I found the various functions in this system were well integrated.',
    'I thought there was too much inconsistency in this system.',
    'I would imagine that most people would learn to use this system very quickly.',
    'I found the system very cumbersome to use.',
    'I felt very confident using the system.',
    'I needed to learn a lot of things before I could get going with this system.'
  ];

  const susScore = a => {
    if (a.length !== 10 || a.some(v => !(v >= 1 && v <= 5))) throw new Error('SUS needs 10 answers from 1 to 5');
    return a.reduce((t, v, i) => t + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
  };

  /* Odd participant number = A (nested settings), even = B (dashboard). */
  const conditionFor = id => {
    const n = parseInt(String(id).replace(/\D/g, ''), 10);
    return Number.isNaN(n) || n % 2 === 1 ? 'A' : 'B';
  };

  /* Reproducible task order: the same key always gives the same shuffle. */
  const hash = s => { let x = 2166136261; for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
  const rng = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const orderFor = key => {
    const r = rng(hash(key)), a = tasks.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  /* Illustrative explained alerts (rule-based demo, not a real detector). */
  const ALERTS = [
    { id: 'a1', device: 'd2', sensor: 'motion', time: '03:12', confidence: 'High',
      title: 'Unusual motion at the front door',
      why: 'Movement was detected at 03:12. This sensor has not triggered at night in the last 30 days, so the event was marked unusual.',
      fix: 'Turn off motion sensing' },
    { id: 'a2', device: 'd4', sensor: 'mic', time: '14:40', confidence: 'Medium',
      title: 'Kitchen speaker listened longer than usual',
      why: 'The microphone was active for 42 minutes. It is normally active for less than 5 minutes at a time.',
      fix: 'Turn off the microphone' },
    { id: 'a3', device: 'd3', sensor: 'location', time: '11:20', confidence: 'Medium',
      title: 'Thermostat read your location while nobody was home',
      why: 'Location was read 9 times in one hour. The usual rate is about once per hour.',
      fix: 'Turn off location' }
  ];
  const alerts = devs => ALERTS.filter(a => { const d = find(devs, a.device); const s = d && sensor(d, a.sensor); return !!(s && s.on); });

  const HEADER = ['participant', 'condition', 'type', 'item', 'order', 'success', 'time_s', 'clicks', 'score', 'note'];
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const toCsv = rows =>
    [HEADER.join(',')].concat(rows.map(r => HEADER.map(k => esc(r[k])).join(','))).join('\n') + '\n';

  return { LABEL, RETENTION, seed, find, sensor, activeCount, totalSensors, privacyScore, preset,
           tasks, SUS_ITEMS, susScore, conditionFor, orderFor, alerts, HEADER, toCsv };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Model;
