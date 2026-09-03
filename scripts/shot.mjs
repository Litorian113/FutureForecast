// Headless-Chrome screenshot via the DevTools protocol (Node 22 has WebSocket built in).
// Used to check the page visually. Copy this file into other projects as it is.
// usage: node shot.mjs <url> <out.png> [actions-json]
// actions: [{type:'click',sel:'…'},{type:'key',key:'ArrowRight'},{type:'hover',x,y},{type:'wait',ms},{type:'eval',js}]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [url, out, actionsJson] = process.argv.slice(2);
// viewport via env: SHOT_W=390 SHOT_H=844 node shot.mjs … (default 1440x900)
const VW = Number(process.env.SHOT_W || 1440), VH = Number(process.env.SHOT_H || 900);
const MOBILE = VW < 800;
const actions = actionsJson ? JSON.parse(actionsJson) : [];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9334', `--window-size=${VW},${VH}`, '--hide-scrollbars', '--no-first-run', '--user-data-dir=/tmp/fw-chrome', 'about:blank'],
  { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { const list = await (await fetch('http://localhost:9334/json')).json(); target = list.find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(m.params.type)) logs.push(m.params.type + ': ' + m.params.args.map(a=>a.value??a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: MOBILE });
await send('Page.navigate', { url }); await sleep(2500);
const evalJs = async (js) => (await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true })).result?.result?.value;
for (const a of actions) {
  if (a.type === 'wait') await sleep(a.ms);
  else if (a.type === 'eval') console.log('eval →', await evalJs(a.js));
  else if (a.type === 'click') { const r = await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(a.sel)});const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 }); await sleep(300); }
  else if (a.type === 'hover') { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y }); await sleep(300); }
  else if (a.type === 'key') { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: a.key, code: a.key, windowsVirtualKeyCode: a.key === 'ArrowRight' ? 39 : a.key === 'ArrowLeft' ? 37 : 32 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: a.key }); await sleep(300); }
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('console:', logs.length ? logs.join('\n') : 'clean');
ws.close(); chrome.kill();
