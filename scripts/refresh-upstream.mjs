import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontmatter, guidePaths, loadCatalog, sha256, upstream } from './skills.mjs';

const defaultTarget = fileURLToPath(new URL('../vendor/coreyhaines31-marketingskills/', import.meta.url)).replace(/[\\/]$/, '');
const shaPattern = /^[a-f0-9]{40}$/;
const skillPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const decoder = new TextDecoder('utf-8', { fatal: true });
const git = (path, ...args) => execFileSync('git', ['-C', path, ...args], { maxBuffer: 2_000_000 });

function snapshotFiles(source, pin) {
  if (git(source, 'rev-parse', '--verify', pin + '^{commit}').toString().trim() !== pin) {
    throw new Error('La revisión upstream no es el commit exacto.');
  }
  const rows = decoder.decode(git(source, 'ls-tree', '-lrz', pin, '--', 'LICENSE', 'skills', ...guidePaths))
    .split('\0').filter(Boolean);
  if (!rows.length || rows.length > 1000) throw new Error('Cantidad de archivos upstream anómala.');
  const result = new Map();
  let bytes = 0;
  for (const row of rows) {
    const record = /^(100644|100755) blob ([0-9a-f]{40}) +([0-9]+)\t(.+)$/.exec(row);
    if (!record) throw new Error('El snapshot contiene un archivo especial o ruta inválida.');
    const [, , blob, size, path] = record;
    if (!path.split('/').every((part) =>
      /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(part) && !part.endsWith('.') &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw new Error('Ruta upstream no portable: ' + path);
    }
    bytes += Number(size);
    if (Number(size) > 1_000_000 || bytes > 20_000_000) throw new Error('Tamaño upstream excede el límite.');
    const data = git(source, 'cat-file', 'blob', blob);
    if (data.length !== Number(size) || data.includes(0)) throw new Error('Blobs inesperados en el snapshot.');
    decoder.decode(data); // The external catalog is text, never execute it.
    result.set(path, data);
  }
  return result;
}

function createLock(data, pin) {
  const names = new Set();
  for (const path of data.keys()) {
    if (path.startsWith('skills/')) {
      const name = path.split('/')[1];
      if (!skillPattern.test(name) || name.length > 64) throw new Error('Nombre de skill no válido: ' + name);
      names.add(name);
    }
  }
  if (!names.size) throw new Error('El commit no tiene skills.');
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
  const shared = ['LICENSE', ...(names.has('link-building') ? guidePaths : [])];
  for (const path of guidePaths.filter((p) => !shared.includes(p))) data.delete(path);
  const sharedSha256 = Object.fromEntries(shared.map((path) => {
    if (!data.has(path)) throw new Error('Falta el archivo compartido upstream: ' + path);
    return [path, sha256(data.get(path))];
  }));
  return { schemaVersion: 2, repository: upstream, commit: pin, license: 'MIT', skills, sharedSha256 };
}

function summarize(before, after) {
  const lines = ['Upstream: ' + before.commit + ' → ' + after.commit, ''];
  const oldNames = Array.isArray(before.skills) ? before.skills : Object.keys(before.skills);
  const names = [...new Set([...oldNames, ...Object.keys(after.skills)])].sort();
  for (const name of names) {
    const prev = before.skills[name];
    const next = after.skills[name];
    if (!oldNames.includes(name)) lines.push('- ' + name + ': nueva (' + (next.version ?? 'sin versión declarada') + ')');
    else if (!next) lines.push('- ' + name + ': retirada');
    else if (before.schemaVersion !== 2) lines.push('- ' + name + ': inventario migrado (' + (next.version ?? 'sin versión declarada') + ')');
    else if (prev.version !== next.version) lines.push('- ' + name + ': ' + (prev.version ?? 'sin versión declarada') + ' → ' + (next.version ?? 'sin versión declarada'));
    else if (JSON.stringify(prev.sha256) !== JSON.stringify(next.sha256)) lines.push('- ' + name + ': contenido cambió sin cambiar la versión declarada');
  }
  if (JSON.stringify(before.sharedSha256) !== JSON.stringify(after.sharedSha256)) lines.push('- Archivos compartidos añadidos o modificados.');
  if (lines.length === 2) lines.push('- No hay cambios de contenido entre los archivos seleccionados.');
  return lines.join('\n');
}

export function refreshSnapshot(source, pin, target = defaultTarget) {
  if (!shaPattern.test(pin ?? '')) throw new Error('Indica un SHA de commit completo de 40 caracteres.');
  const destination = resolve(target);
  const before = JSON.parse(readFileSync(join(destination, 'upstream.json'), 'utf8'));
  const data = snapshotFiles(resolve(source), pin);
  // A license change is intentionally not self-approved by the scheduled job.
  if (!data.get('LICENSE')?.equals(readFileSync(join(destination, 'LICENSE')))) {
    throw new Error('La licencia upstream cambió. Hace falta una revisión manual.');
  }
  const lock = createLock(data, pin);
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
    const catalog = fileURLToPath(new URL('../skills/', import.meta.url));
    loadCatalog(catalog, candidate);
    renameSync(destination, backup);
    savedOriginal = true;
    renameSync(candidate, destination);
    savedOriginal = false;
    return summarize(before, lock);
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
    const [source, pin, ...extra] = process.argv.slice(2);
    if (!source || !pin || extra.length) throw new Error('Uso: node scripts/refresh-upstream.mjs <clon-upstream> <sha>');
    console.log(refreshSnapshot(source, pin));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
