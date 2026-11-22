import { createHash } from 'node:crypto';
import { cpSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const catalogRoot = fileURLToPath(new URL('../skills/', import.meta.url));
const vendorRoot = fileURLToPath(new URL('../vendor/coreyhaines31-marketingskills/', import.meta.url));
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validName = (value) => slug.test(value) && value.length <= 64;

function statIfPresent(path) {
  try { return lstatSync(path); }
  catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
}

function assertDirectory(path) {
  if (!statIfPresent(path)?.isDirectory()) {
    throw new Error(`Se esperaba un directorio normal: ${path}`);
  }
}

function assertPlainTree(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) assertPlainTree(child);
    else if (!entry.isFile()) throw new Error(`No se permiten enlaces ni archivos especiales: ${child}`);
  }
}

function directories(path) {
  assertDirectory(path);
  return readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      if (!entry.isDirectory() || !validName(entry.name)) {
        throw new Error(`Directorio de catálogo inválido: ${join(path, entry.name)}`);
      }
      return entry.name;
    });
}

function readSkill(category, name, folder, license) {
  assertPlainTree(folder);
  const file = join(folder, 'SKILL.md');
  if (!statIfPresent(file)?.isFile()) throw new Error(`Falta SKILL.md: ${folder}`);
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = /^---\n([^]*?)\n---\n([^]+)$/.exec(raw);
  if (!match || !match[2].trim()) throw new Error(`Frontmatter o instrucciones inválidos: ${file}`);
  const fields = new Map();
  const metadata = license ? match[1].replace(/\nmetadata:\n  version: [0-9]+(?:\.[0-9]+)*$/, '') : match[1];
  for (const line of metadata.split('\n')) {
    const pair = /^(name|description): (.+)$/.exec(line);
    if (!pair || fields.has(pair[1])) throw new Error(`Metadata inválida o duplicada: ${file}`);
    let value = pair[2].trim();
    if (value.startsWith('"')) {
      value = JSON.parse(value);
    } else if (/^[-?:!&*#%|>{}\[\]@'`]|:\s|\s#|^(?:true|false|null|~|[+\-]?\d[\d.]*)(?:$)/i.test(value)) {
      throw new Error(`Usa una cadena entre comillas para este campo: ${file}`);
    }
    if (typeof value !== 'string' || /[\r\n\0]/.test(value)) {
      throw new Error(`Valor inválido en metadata: ${file}`);
    }
    fields.set(pair[1], value);
  }
  const description = fields.get('description');
  if (fields.get('name') !== name || !description?.trim() || [...description].length > 1024) {
    throw new Error(`El nombre debe coincidir con la carpeta y description debe tener entre 1 y 1024 caracteres: ${file}`);
  }
  for (const link of match[2].matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = link[1];
    if (/^(https?:\/\/|mailto:|#)/.test(target)) continue;
    const path = resolve(folder, decodeURIComponent(target.split('#')[0]));
    const inside = relative(folder, path);
    if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside) || !statIfPresent(path)) {
      throw new Error(`Referencia local inválida: ${target} en ${file}`);
    }
  }
  return { category, name, folder, description, license };
}

function addVendored(catalog, root) {
  assertDirectory(root);
  assertPlainTree(root);
  const manifest = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'));
  if (manifest.repository !== 'https://github.com/coreyhaines31/marketingskills' ||
      !/^[a-f0-9]{40}$/.test(manifest.commit) || manifest.license !== 'MIT') {
    throw new Error('El origen o licencia externos no coinciden con la política del catálogo.');
  }
  const original = new Set(['LICENSE']);
  const contained = join(root, 'skills');
  const names = directories(contained);
  if (JSON.stringify(names) !== JSON.stringify(manifest.skills)) throw new Error('Lista externa no coincide.');
  const license = join(root, 'LICENSE');
  const collect = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) collect(child);
      else original.add(relative(root, child).split(sep).join('/'));
    }
  };
  collect(contained);
  if (Object.keys(manifest.sha256).length !== original.size) throw new Error('Inventario externo no coincide.');
  for (const file of original) {
    const hash = createHash('sha256').update(readFileSync(join(root, file))).digest('hex');
    if (manifest.sha256[file] !== hash) throw new Error(`SHA-256 externo distinto: ${file}`);
  }
  for (const name of names) {
    if (catalog.has(name)) throw new Error(`Nombre de skill duplicado: ${name}`);
    catalog.set(name, readSkill('marketing', name, join(contained, name), license));
  }
}

export function loadCatalog(root = catalogRoot, external = root === catalogRoot ? vendorRoot : undefined) {
  const catalog = new Map();
  for (const category of directories(root)) {
    for (const name of directories(join(root, category))) {
      if (catalog.has(name)) throw new Error(`Nombre de skill duplicado: ${name}`);
      catalog.set(name, readSkill(category, name, join(root, category, name)));
    }
  }
  if (external) addVendored(catalog, external);
  if (!catalog.size) throw new Error('El catálogo está vacío.');
  return catalog;
}

function install(catalog, args) {
  const [flag, rawTarget, ...rest] = args;
  let agent = 'codex';
  if (rest[0] === '--agent') {
    rest.shift();
    agent = rest.shift();
  }
  const names = rest;
  if (flag !== '--target' || !rawTarget || rawTarget.startsWith('--') || !names.length) {
    throw new Error('Uso: install --target <proyecto-existente> [--agent codex|claude-code] <skill> [<skill>...]');
  }
  if (new Set(names).size !== names.length) throw new Error('No repitas nombres.');
  const selected = names.map((name) => {
    const skill = catalog.get(name);
    if (!skill) throw new Error(`Skill desconocida: ${name}`);
    return skill;
  });
  const agentDir = new Map([['codex', '.agents'], ['claude-code', '.claude']]).get(agent);
  if (!agentDir) throw new Error('Agente inválido: usa codex o claude-code.');
  const target = resolve(rawTarget);
  assertDirectory(target);
  const agents = join(realpathSync(target), agentDir);
  const destination = join(agents, 'skills');
  for (const directory of [agents, destination]) {
    if (statIfPresent(directory)) assertDirectory(directory);
  }
  for (const skill of selected) {
    if (statIfPresent(join(destination, skill.name))) throw new Error(`No se sobrescribirá: ${skill.name}`);
  }
  for (const directory of [agents, destination]) {
    if (!statIfPresent(directory)) mkdirSync(directory);
    assertDirectory(directory);
  }
  for (const skill of selected) {
    const folder = join(destination, skill.name);
    mkdirSync(folder); // Reserva exclusiva; no sigue enlaces ni reemplaza rutas existentes.
    for (const entry of readdirSync(skill.folder)) {
      cpSync(join(skill.folder, entry), join(folder, entry), { recursive: true, force: false, errorOnExist: true });
    }
    if (skill.license) cpSync(skill.license, join(folder, "LICENSE"), { force: false, errorOnExist: true });
    console.log(`Copiada: ${skill.name} → ${folder}`);
  }
}

function main([command, ...args]) {
  const catalog = loadCatalog();
  if (command === 'validate' && !args.length) {
    console.log(`${catalog.size} skills válidas.`);
  } else if (command === 'list' && args.length <= 1) {
    const rows = [...catalog.values()].filter((s) => !args.length || args[0] === s.category);
    if (!rows.length) throw new Error(`Tema desconocido: ${args[0]}`);
    for (const { category, name, description } of rows) console.log(`${category}/${name} | ${description}`);
  } else if (command === 'install') {
    install(catalog, args);
  } else {
    throw new Error('Uso: validate | list [tema] | install --target <proyecto> [--agent codex|claude-code] <skill>...');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); }
  catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
