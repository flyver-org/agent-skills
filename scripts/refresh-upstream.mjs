import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addVendored, catalogRoot, frontmatter, guidesFor, loadCatalog, sha256, vendorBase } from './skills.mjs';
import { readUpstreamConfig } from './upstreams.mjs';

const shaPattern = /^[a-f0-9]{40}$/;
const skillPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const decoder = new TextDecoder('utf-8', { fatal: true });
const git = (path, ...args) => execFileSync('git', ['-C', path, ...args], { maxBuffer: 2_000_000 });

function snapshotFiles(source, pin, policy) {
  if (git(source, 'rev-parse', '--verify', pin + '^{commit}').toString().trim() !== pin) {
    throw new Error('La revisión upstream no es el commit exacto.');
  }
  const approved = new Set(policy.skills);
  const skillRows = decoder.decode(git(source, 'ls-tree', '-dz', pin + ':' + policy.skillsPath)).split('\0').filter(Boolean);
  if (skillRows.length > 500) throw new Error('Cantidad de directorios upstream anómala.');
  const available = new Set(skillRows.map((line) => line.split('\t', 2)[1])
    .filter((name) => typeof name === 'string' && skillPattern.test(name) && name.length <= 64));
  const missing = [...approved].filter((name) => !available.has(name));
  if (missing.length) throw new Error('Skills aprobadas ausentes en upstream: ' + missing.join(', '));
  const excluded = [...available].filter((name) => !approved.has(name)).sort();
  const shared = [policy.licensePath, ...guidesFor(policy)];
  const rows = decoder.decode(git(source, 'ls-tree', '-lrz', pin, '--', ...shared,
    ...[...approved].map((name) => policy.skillsPath + '/' + name))).split('\0').filter(Boolean);
  if (!rows.length || rows.length > 1000) throw new Error('Cantidad de archivos upstream anómala.');
  const result = new Map();
  let bytes = 0;
  for (const row of rows) {
    const record = /^(100644|100755) blob ([0-9a-f]{40}) +([0-9]+)\t(.+)$/.exec(row);
    if (!record) throw new Error('El snapshot contiene un archivo especial o ruta inválida.');
    const [, , blob, size, path] = record;
    if (!path.split('/').every((part) =>
      /^(?:\.(?:agents|claude)|[A-Za-z0-9][A-Za-z0-9_.-]*)$/.test(part) && !part.endsWith('.') &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw new Error('Ruta upstream no portable: ' + path);
    }
    bytes += Number(size);
    if (Number(size) > 1_000_000 || bytes > 20_000_000) throw new Error('Tamaño upstream excede el límite.');
    const data = git(source, 'cat-file', 'blob', blob);
    if (data.length !== Number(size) || data.includes(0)) throw new Error('Blobs inesperados en el snapshot.');
    decoder.decode(data); // The external catalog is text, never execute it.
    const normalized = path === policy.licensePath ? 'LICENSE'
      : path.startsWith(policy.skillsPath + '/') ? 'skills/' + path.slice(policy.skillsPath.length + 1)
      : path;
    if (result.has(normalized)) throw new Error('Ruta externa duplicada: ' + normalized);
    result.set(normalized, data);
  }
  return { data: result, excluded };
}

function createLock(data, pin, policy) {
  const names = new Set();
  for (const path of data.keys()) {
    if (path.startsWith('skills/')) {
      const name = path.split('/')[1];
      if (!skillPattern.test(name) || name.length > 64) throw new Error('Nombre de skill no válido: ' + name);
      names.add(name);
    }
  }
  const missing = policy.skills.filter((name) => !data.has('skills/' + name + '/SKILL.md'));
  if (missing.length) throw new Error('Falta SKILL.md en las skills aprobadas: ' + missing.join(', '));
  const commitOrder = [...names].sort();
  const skills = {};
  for (const name of commitOrder) {
    const dir = 'skills/' + name + '/';
    const md = data.get(dir + 'SKILL.md');
    if (!md) throw new Error('Falta SKILL.md: ' + name);
    const { version } = frontmatter(decoder.decode(md), dir + 'SKILL.md');
    const files = [...data.keys()].filter((path) => path.startsWith(dir)).sort();
    skills[name] = { version, commit: pin, sha256: Object.fromEntries(files.map((path) =>
      [path.slice(dir.length), sha256(data.get(path))])) };
  }
  const shared = ['LICENSE', ...guidesFor(policy)];
  const sharedSha256 = Object.fromEntries(shared.map((path) => {
    if (!data.has(path)) throw new Error('Falta el archivo compartido upstream: ' + path);
    return [path, sha256(data.get(path))];
  }));
  return { schemaVersion: 2, repository: policy.repository, commit: pin, license: policy.license, skills, sharedSha256 };
}

function summarize(before, after, excluded, unchanged, id) {
  const lines = ['## Fuente: ' + id, '', 'Commit instalado: ' + before.commit, 'Commit revisado: ' + after.commit, '', '### Revisión por skill aprobada', ''];
  const oldNames = Array.isArray(before.skills) ? before.skills : Object.keys(before.skills);
  const names = [...new Set([...oldNames, ...Object.keys(after.skills)])].sort();
  for (const name of names) {
    const prev = before.skills[name];
    const next = after.skills[name];
    if (!oldNames.includes(name)) lines.push('- ' + name + ': nueva (' + (next.version ?? 'sin versión declarada') + ')');
    else if (!next) lines.push('- ' + name + ': retirada de la selección YAML');
    else if (before.schemaVersion !== 2) lines.push('- ' + name + ': inventario migrado (' + (next.version ?? 'sin versión declarada') + ')');
    else if (prev.version !== next.version) lines.push('- ' + name + ': ' + (prev.version ?? 'sin versión declarada') + ' → ' + (next.version ?? 'sin versión declarada'));
    else if (JSON.stringify(prev.sha256) !== JSON.stringify(next.sha256)) lines.push('- ' + name + ': contenido cambió sin cambiar la versión declarada');
    else lines.push('- ' + name + ': sin cambios (' + (next.version ?? 'sin versión declarada') + ')');
  }
  if (JSON.stringify(before.sharedSha256) !== JSON.stringify(after.sharedSha256)) lines.push('- Archivos compartidos añadidos o modificados.');
  if (excluded.length) lines.push('', 'No aprobadas en YAML; no importadas: ' + excluded.join(', ') + '.');
  if (unchanged) lines.push('', 'No hay cambios aprobados; se conserva el lock y no se abre PR.');
  return lines.join('\n');
}

function comparable(lock) {
  if (lock.schemaVersion !== 2) return null;
  return JSON.stringify({
    repository: lock.repository,
    license: lock.license,
    sharedSha256: lock.sharedSha256,
    skills: Object.entries(lock.skills).map(([name, { version, sha256 }]) => [name, version, sha256]),
  });
}

export function refreshSnapshot(source, pin, target, policy) {
  if (!shaPattern.test(pin ?? '')) throw new Error('Indica un SHA de commit completo de 40 caracteres.');
  const destination = resolve(target);
  const haveSnapshot = existsSync(destination);
  if (haveSnapshot && !lstatSync(destination).isDirectory()) throw new Error('Ruta de snapshot no segura.');
  const before = haveSnapshot ? JSON.parse(readFileSync(join(destination, 'upstream.json'), 'utf8'))
    : { commit: 'sin snapshot previo', skills: [] };
  const { data, excluded } = snapshotFiles(resolve(source), pin, policy);
  // A license change is intentionally not self-approved by the scheduled job.
  if (haveSnapshot && !data.get('LICENSE')?.equals(readFileSync(join(destination, 'LICENSE')))) {
    throw new Error('La licencia upstream cambió. Hace falta una revisión manual.');
  }
  const lock = createLock(data, pin, policy);
  const ownCatalog = () => loadCatalog(catalogRoot, null);
  if (comparable(before) === comparable(lock)) {
    addVendored(ownCatalog(), destination, policy);
    return summarize(before, lock, excluded, true, policy.id);
  }
  const scratch = mkdtempSync(join(dirname(destination), '.vendor-refresh-'));
  const candidate = join(scratch, 'candidate');
  const backup = join(scratch, 'original');
  mkdirSync(candidate);
  let savedOriginal = false;
  try {
    for (const [path, value] of data) {
      const file = join(candidate, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, value, { flag: 'wx', mode: 0o644 });
    }
    writeFileSync(join(candidate, 'upstream.json'), JSON.stringify(lock, null, 2) + '\n');
    addVendored(ownCatalog(), candidate, policy);
    if (haveSnapshot) {
      renameSync(destination, backup);
      savedOriginal = true;
    }
    renameSync(candidate, destination);
    savedOriginal = false;
    return summarize(before, lock, excluded, false, policy.id);
  } catch (err) {
    if (savedOriginal) {
      try { renameSync(backup, destination); savedOriginal = false; }
      catch { throw new Error('No se pudo restaurar ' + basename(destination) + '; copia original en ' + backup, { cause: err }); }
    }
    throw err;
  } finally {
    if (!savedOriginal) rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const [id, source, pin, ...extra] = process.argv.slice(2);
    if (!id || !source || !pin || extra.length) {
      throw new Error('Uso: node scripts/refresh-upstream.mjs <id-origen> <clon-upstream> <sha>');
    }
    const policy = readUpstreamConfig().sources.find((entry) => entry.id === id);
    if (!policy) throw new Error('Fuente no listada en upstreams.yaml: ' + id);
    console.log(refreshSnapshot(source, pin, join(vendorBase, id), policy));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
