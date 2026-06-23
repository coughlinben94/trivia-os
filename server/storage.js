const fs = require('fs');
const path = require('path');

const SHOWS_DIR = path.join(__dirname, '..', 'shows');

if (!fs.existsSync(SHOWS_DIR)) fs.mkdirSync(SHOWS_DIR, { recursive: true });

function debounce(fn, delay) {
  const timers = new Map();
  return function (id, ...args) {
    if (timers.has(id)) clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      fn(id, ...args);
    }, delay));
  };
}

function writeShow(id, show) {
  const filePath = path.join(SHOWS_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(show, null, 2), 'utf8');
}

const debouncedWrite = debounce(writeShow, 500);

function saveShow(show) {
  show.updatedAt = new Date().toISOString();
  debouncedWrite(show.id, show);
}

function saveShowImmediate(show) {
  show.updatedAt = new Date().toISOString();
  writeShow(show.id, show);
}

function loadShow(id) {
  const filePath = path.join(SHOWS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listShows() {
  const files = fs.readdirSync(SHOWS_DIR).filter(f => f.endsWith('.json'));
  return files
    .map(f => {
      try {
        const show = JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, f), 'utf8'));
        return { id: show.id, title: show.title, date: show.date, theme: show.theme, createdAt: show.createdAt, updatedAt: show.updatedAt };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function deleteShow(id) {
  const filePath = path.join(SHOWS_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

module.exports = { saveShow, saveShowImmediate, loadShow, listShows, deleteShow };
