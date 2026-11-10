const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 4321);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.cmd': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.zip': 'application/zip',
};

/* Walk the project folder (skips node_modules and dotfiles) so /code can list it. */
function listFiles(dir, base = '') {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    const rel = base ? base + '/' + ent.name : ent.name;
    if (ent.isDirectory()) out.push(...listFiles(full, rel));
    else {
      const st = fs.statSync(full);
      out.push({ name: rel, full, size: st.size, mtime: st.mtime });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

/* Minimal store-only zip (no dependencies). */
function buildZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const data = f.data;
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    parts.push(lh, name, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);

    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, ...central, eocd]);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kb = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // POST /api/backup -> writes the posted JSON into ./backup/
  if (req.method === 'POST' && urlPath === '/api/backup') {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 5 * 1024 * 1024) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        JSON.parse(body); // validate before writing
        const dir = path.join(root, 'backup');
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(dir, 'course-data-' + stamp + '.json');
        fs.writeFileSync(file, body, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ ok: true, file: path.relative(root, file) }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // GET /api/files -> JSON index of the project
  if (req.method === 'GET' && urlPath === '/api/files') {
    const files = listFiles(root).map(f => ({ name: f.name, size: f.size, mtime: f.mtime }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      .end(JSON.stringify({ root, files }, null, 2));
    return;
  }

  // GET /api/code.zip -> the whole project as one download
  if (req.method === 'GET' && urlPath === '/api/code.zip') {
    try {
      const files = listFiles(root).map(f => ({ name: f.name, data: fs.readFileSync(f.full) }));
      const zip = buildZip(files);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="course-tracker.zip"',
        'Content-Length': zip.length
      }).end(zip);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Could not build zip: ' + e.message);
    }
    return;
  }

  // GET /code -> page listing every project file
  if (req.method === 'GET' && (urlPath === '/code' || urlPath === '/code/')) {
    const files = listFiles(root);
    const total = files.reduce((a, f) => a + f.size, 0);
    const rows = files.map(f => `<tr><td><a href="/${encodeURI(f.name)}">${esc(f.name)}</a></td>` +
      `<td class="n">${kb(f.size)}</td><td class="n">${f.mtime.toISOString().slice(0, 16).replace('T', ' ')}</td></tr>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Course Tracker - code</title>
<style>
:root{--bg:#f6f7f5;--surface:#fff;--fg:#1c1f1b;--muted:#5c635a;--line:#d9ddd5;--accent:#2f6a4f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:880px;margin:32px auto;padding:0 20px 40px}
h1{font-size:22px;margin:0 0 4px}
p.sub{color:var(--muted);margin:0 0 16px}
a{color:var(--accent)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6px 16px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 4px 6px;border-bottom:1px solid var(--line)}
td{padding:7px 4px;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:0}
td.n,th.n{text-align:right;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;width:1%}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;border-radius:6px;padding:8px 14px;font-weight:600;margin:0 8px 14px 0}
.btn.alt{background:#5c635a}
code{background:#eef1ec;padding:1px 5px;border-radius:4px}
</style></head><body><main>
<h1>Course Tracker &middot; all code</h1>
<p class="sub">Served by the app on this computer from <code>${esc(root)}</code> &middot; ${files.length} file${files.length === 1 ? '' : 's'} &middot; ${kb(total)}</p>
<a class="btn" href="/api/code.zip" download="course-tracker.zip">Download everything (.zip)</a>
<a class="btn alt" href="/">Back to the tracker</a>
<div class="card"><table>
<thead><tr><th>File</th><th class="n">Size</th><th class="n">Modified (UTC)</th></tr></thead>
<tbody>${rows}</tbody></table></div>
</main></body></html>`);
    return;
  }

  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(root, rel);

  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found: ' + rel);
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log('Serving ' + root + ' on http://localhost:' + port));
