import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestPath = new URL('../upstreams.yaml', import.meta.url);
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const repoPart = '[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?';
const githubRepo = new RegExp('^https://github\\.com/' + repoPart + '/' + repoPart + '$');

// Intentionally small, fail-closed YAML subset: two sections with simple scalars/list.
// No package loading, aliases, arbitrary URLs, implicit types or interpolation.
export function parseUpstreamConfig(raw) {
  if (Buffer.byteLength(raw, 'utf8') > 16_384) throw new Error('upstreams.yaml excede el límite.');
  const sources = new Map();
  const skills = [];
  const sections = new Set();
  let section;
  let schema;
  for (const [idx, original] of raw.replace(/\r\n/g, '\n').split('\n').entries()) {
    const line = original.trimEnd();
    if (!line || /^ *#/.test(line)) continue;
    const invalid = () => { throw new Error('upstreams.yaml: línea inválida o duplicada ' + (idx + 1)); };
    if (line === 'schemaVersion: 1') {
      if (schema || section) invalid();
      schema = true;
    } else if (/^(source|skills):$/.test(line)) {
      section = line.slice(0, -1);
      if (sections.has(section)) invalid();
      sections.add(section);
    } else if (section === 'source') {
      const match = /^  (repository|branch|license): (\S+)$/.exec(line);
      if (!match || sources.has(match[1])) invalid();
      sources.set(match[1], match[2]);
    } else if (section === 'skills') {
      const match = /^  - ([a-z0-9-]{1,64})$/.exec(line);
      if (!match || !slug.test(match[1]) || skills.includes(match[1])) invalid();
      skills.push(match[1]);
    } else invalid();
  }
  const { repository, branch, license } = Object.fromEntries(sources);
  if (!schema || !githubRepo.test(repository ?? '') || repository.endsWith('.git') ||
      !branch || branch.length > 128 || branch.includes('..') ||
      !branch.split('/').every((part) => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(part) &&
        !part.endsWith('.') && !part.endsWith('.lock')) ||
      license !== 'MIT' || skills.length < 1 || skills.length > 128) {
    throw new Error('upstreams.yaml debe declarar un repositorio público GitHub, rama válida, licencia MIT y skills únicas.');
  }
  return { repository, branch, license, skills };
}

export function readUpstreamConfig() {
  return parseUpstreamConfig(readFileSync(manifestPath, 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'source') throw new Error('Uso: node scripts/upstreams.mjs source');
    const { repository, branch } = readUpstreamConfig();
    console.log(repository + '\t' + branch);
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
