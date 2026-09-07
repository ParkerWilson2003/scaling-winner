const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function parseEnv(text) {
  const values = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadEnv() {
  let fileValues = {};
  try {
    fileValues = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...fileValues, ...process.env };
}

function quote(value) {
  const text = String(value ?? '');
  if (!/[\s#"']/u.test(text)) return text;
  return JSON.stringify(text);
}

function updateEnv(updates) {
  let text = '';
  try {
    text = fs.readFileSync(ENV_PATH, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const remaining = { ...updates };
  const lines = text.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || !Object.prototype.hasOwnProperty.call(remaining, match[1])) return line;
    const value = remaining[match[1]];
    delete remaining[match[1]];
    return `${match[1]}=${quote(value)}`;
  });

  for (const [key, value] of Object.entries(remaining)) lines.push(`${key}=${quote(value)}`);
  fs.writeFileSync(ENV_PATH, `${lines.join('\n').replace(/\n+$/u, '')}\n`, { mode: 0o600 });
}

module.exports = { ENV_PATH, loadEnv, parseEnv, updateEnv };
