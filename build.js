// Builds the static site for Vercel: copies the browser-facing files into dist/.
// The local app (server.js) is not part of this build - Vercel only gets static files plus api/.
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = [
  'index.html',
  'devops-sessions.json',
  'devops-syllabus.txt',
  'portal-course-list.txt',
  'README.md'
];

for (const f of files) {
  const src = path.join(__dirname, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f));
}

console.log('build: copied ' + files.length + ' static files to dist/');
