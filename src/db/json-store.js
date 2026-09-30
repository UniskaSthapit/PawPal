// File-based database used when no MONGODB_URI is set.
// Keeps everything in memory and saves to data/pawpal-db.json after each change.
const fs = require('fs');
const path = require('path');

const FILE = process.env.PAWPAL_DATA_FILE || path.join(__dirname, '..', '..', 'data', 'pawpal-db.json');

function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => doc[k] === v);
}

function createJsonStore() {
  let data = {};
  let saveTimer = null;

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, FILE); // atomic swap so the file is never half-written
    }, 50);
  };
  const coll = (name) => (data[name] ||= []);
  const copy = (d) => (d ? structuredClone(d) : null);

  return {
    name: 'File database (data/pawpal-db.json)',
    async init() {
      if (fs.existsSync(FILE)) {
        try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
        catch { console.warn('⚠️  Could not read data file — starting fresh.'); data = {}; }
      }
    },
    async find(name, filter = {}) { return coll(name).filter((d) => matches(d, filter)).map(copy); },
    async findOne(name, filter = {}) { return copy(coll(name).find((d) => matches(d, filter))); },
    async count(name, filter = {}) { return coll(name).filter((d) => matches(d, filter)).length; },
    async insert(name, doc) { coll(name).push(copy(doc)); persist(); return copy(doc); },
    async update(name, id, patch) {
      const d = coll(name).find((x) => x.id === id);
      if (!d) return null;
      Object.assign(d, copy(patch));
      persist();
      return copy(d);
    },
    async remove(name, id) {
      const list = coll(name);
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) { list.splice(i, 1); persist(); }
      return i >= 0;
    },
    async removeWhere(name, filter) {
      const list = coll(name);
      const keep = list.filter((d) => !matches(d, filter));
      const n = list.length - keep.length;
      if (n) { data[name] = keep; persist(); }
      return n;
    },
    async clear(name) { data[name] = []; persist(); },
    async flush() { clearTimeout(saveTimer); fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(data)); },
  };
}

module.exports = { createJsonStore };
