import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestPath = new URL('../upstreams.yaml', import.meta.url);
export const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const repoPart = '[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?';
const githubRepo = new RegExp('^https://github\\.com/' + repoPart + '/' + repoPart + '$');
const portablePath = (path) => path.length <= 200 && path.split('/').every((p) =>
  /^(?:\.(?:agents|claude)|[A-Za-z0-9][A-Za-z0-9._-]*)$/.test(p) &&
  !p.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
export const knownLicenses = new Map([
  ['MIT', /(?:^|\n)MIT License(?:\n|$)/i],
  ['Apache-2.0', /Apache License[ \t\r\n]+Version 2\.0\b/i],
  ['BSD-3-Clause', /Redistribution and use in source and binary forms[\s\S]*Neither the name/i],
]);

// Strict documented YAML subset: only scalars and lists, no aliases or evaluated values.
export function parseUpstreamConfig(raw) {
  if (Buffer.byteLength(raw, 'utf8') > 32_768) throw new Error('upstreams.yaml excede el límite.');
  const sources = [];
  let schema = false;
  let header = false;
  let current;
  for (const [index, original] of raw.replace(/\r\n/g, '\n').split('\n').entries()) {
    const line = original.trimEnd();
    if (!line || /^ *#/.test(line)) continue;
    const invalid = () => { throw new Error('upstreams.yaml: línea inválida o duplicada ' + (index + 1)); };
    if (line === 'schemaVersion: 2' && !schema && !header) schema = true;
    else if (line === 'sources:' && schema && !header) header = true;
    else if (header) {
      const origin = /^  - id: (\S+)$/.exec(line);
      if (origin) {
        current = { id: origin[1] };
        sources.push(current);
      } else if (current) {
        const field = /^    (repository|branch|license|skillsPath|licensePath): (\S+)$/.exec(line);
        const skill = /^      - ([a-z0-9-]{1,64})$/.exec(line);
        if (line === '    skills:' && !current.skills) current.skills = [];
        else if (field && !Object.hasOwn(current, field[1]) && !current.skills) current[field[1]] = field[2];
        else if (skill && current.skills && slug.test(skill[1]) && !current.skills.includes(skill[1])) current.skills.push(skill[1]);
        else invalid();
      } else invalid();
    } else invalid();
  }

  if (!sources.length || sources.length > 8) throw new Error('upstreams.yaml requiere entre 1 y 8 fuentes.');
  const ids = new Set();
  const locations = new Set();
  const names = new Map();
  for (const source of sources) {
    const { id, repository, branch, license, skills } = source;
    source.skillsPath ??= 'skills';
    source.licensePath ??= 'LICENSE';
    const { skillsPath, licensePath } = source;
    if (!slug.test(id) || !portablePath(id) || id.length > 64 || ids.has(id) ||
        !githubRepo.test(repository ?? '') || repository.endsWith('.git') ||
        !branch || branch.length > 128 || branch.includes('..') ||
        !branch.split('/').every((part) => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(part) &&
          !part.endsWith('.') && !part.endsWith('.lock')) ||
        !knownLicenses.has(license) || !portablePath(skillsPath) || !portablePath(licensePath) ||
        licensePath === skillsPath || licensePath.startsWith(skillsPath + '/') ||
        !skills?.length || skills.length > 128 || !skills.every(portablePath)) {
      throw new Error('upstreams.yaml: fuente inválida, duplicada o incompleta (' + id + ').');
    }
    ids.add(id);
    const location = [repository.toLowerCase(), branch, skillsPath].join('\0');
    if (locations.has(location)) throw new Error('upstreams.yaml: origen/rama/ruta repetidos (' + id + ').');
    locations.add(location);
    for (const skill of skills) {
      if (names.has(skill)) throw new Error('upstreams.yaml: skill duplicada entre ' + names.get(skill) + ' y ' + id + ': ' + skill);
      names.set(skill, id);
    }
  }
  if (names.size > 200) throw new Error('upstreams.yaml excede el límite global de skills.');
  return { sources };
}

export function readUpstreamConfig() {
  return parseUpstreamConfig(readFileSync(manifestPath, 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'vendor-roots') {
      throw new Error('Uso: node scripts/upstreams.mjs vendor-roots');
    }
    for (const source of readUpstreamConfig().sources) console.log('vendor/' + source.id);
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
