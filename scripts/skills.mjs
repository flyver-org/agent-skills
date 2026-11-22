import { createHash } from 'node:crypto';
import { cpSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { knownLicenses, readUpstreamConfig } from './upstreams.mjs';

export const catalogRoot = fileURLToPath(new URL('../skills/', import.meta.url));
export const vendorBase = fileURLToPath(new URL('../vendor/', import.meta.url));
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validName = (value) => slug.test(value) && value.length <= 64;
export const guidePaths = ['ahrefs', 'dataforseo', 'exa', 'firecrawl', 'hunter', 'semrush']
  .map((name) => 'tools/integrations/' + name + '.md');
export const guidesFor = (source) => source.id === 'coreyhaines31-marketingskills' &&
  source.skills.includes('link-building') ? guidePaths : [];
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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
  return readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .map((entry) => {
      if (!entry.isDirectory() || !validName(entry.name)) {
        throw new Error(`Directorio de catálogo inválido: ${join(path, entry.name)}`);
      }
      return entry.name;
    });
}

export function frontmatter(raw, file) {
  const match = /^---\n([^]*?)\n---\n([^]+)$/.exec(raw.replace(/\r\n/g, '\n'));
  if (!match || !match[2].trim()) throw new Error(`Frontmatter o instrucciones inválidos: ${file}`);
  const fields = new Map();
  const parsed = /\nmetadata:\n  version: (?:"([^"\r\n]+)"|([^\s\r\n]+))$/.exec(match[1]);
  const version = parsed ? parsed[1] ?? parsed[2] : null;
  if (version !== null && !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+][0-9A-Za-z.+-]+)?$/.test(version)) {
    throw new Error(`Versión no válida: ${file}`);
  }
  const metadata = parsed ? match[1].slice(0, parsed.index) : match[1];
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
  return { name: fields.get('name'), description: fields.get('description'), version, body: match[2] };
}

function readSkill(category, name, folder, provenance) {
  assertPlainTree(folder);
  const file = join(folder, 'SKILL.md');
  if (!statIfPresent(file)?.isFile()) throw new Error(`Falta SKILL.md: ${folder}`);
  const metadata = frontmatter(readFileSync(file, 'utf8'), file);
  const { description, version, body } = metadata;
  if (metadata.name !== name || !description?.trim() || [...description].length > 1024) {
    throw new Error(`El nombre debe coincidir con la carpeta y description debe tener entre 1 y 1024 caracteres: ${file}`);
  }
  for (const link of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = link[1];
    if (/^(https?:\/\/|mailto:|#)/.test(target)) continue;
    // Exact upstream-only exceptions: a website example and six shared, lock-verified guides.
    if (provenance?.sourceId === 'coreyhaines31-marketingskills' && name === 'site-architecture' && target === '/features/analytics') continue;
    if (provenance?.guides?.some(({ path }) => target === '../../' + path)) continue;
    const path = resolve(folder, decodeURIComponent(target.split('#')[0]));
    const inside = relative(folder, path);
    if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside) || !statIfPresent(path)) {
      throw new Error(`Referencia local inválida: ${target} en ${file}`);
    }
  }
  return { category, name, folder, description, version, ...provenance };
}

function plainFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return plainFiles(child);
    if (!entry.isFile()) throw new Error(`Archivo externo no permitido: ${child}`);
    return [child];
  });
}

function checkHashes(root, paths, hashes) {
  if (!hashes || Object.keys(hashes).length !== paths.length) throw new Error('Inventario externo no coincide.');
  for (const file of paths) {
    const key = relative(root, file).split(sep).join('/');
    if (hashes[key] !== sha256(readFileSync(file))) throw new Error(`SHA-256 externo distinto: ${key}`);
  }
}

export function addVendored(catalog, root, policy) {
  assertDirectory(root);
  assertPlainTree(root);
  const manifest = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'));
  if (manifest.schemaVersion !== 2 || manifest.repository !== policy.repository ||
      !/^[a-f0-9]{40}$/.test(manifest.commit) || manifest.license !== policy.license) {
    throw new Error('El formato, origen o licencia externos no coinciden con el catálogo.');
  }
  const contained = join(root, 'skills');
  const names = directories(contained);
  if (!names.length || JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.skills).sort())) {
    throw new Error('Lista externa no coincide.');
  }
  if (JSON.stringify(names) !== JSON.stringify([...policy.skills].sort())) {
    throw new Error('El inventario vendorizado no coincide con la selección de upstreams.yaml.');
  }
  const sharedGuides = guidesFor(policy);
  const sharedPaths = ['LICENSE', ...sharedGuides];
  const skillsPaths = plainFiles(contained);
  const wholeTree = new Set(plainFiles(root));
  for (const p of [...skillsPaths, ...sharedPaths.map((path) => join(root, path)), join(root, 'upstream.json')]) {
    if (!wholeTree.delete(p)) throw new Error(`Falta archivo externo esperado: ${p}`);
  }
  if (wholeTree.size) throw new Error('Hay archivos externos no registrados.');
  checkHashes(root, sharedPaths.map((path) => join(root, path)), manifest.sharedSha256);
  const license = join(root, 'LICENSE');
  if (!knownLicenses.get(policy.license)?.test(readFileSync(license, 'utf8').replace(/\r\n/g, '\n'))) {
    throw new Error('El aviso de licencia no coincide con la política: ' + policy.id);
  }
  for (const name of names) {
    if (catalog.has(name)) throw new Error(`Nombre de skill duplicado: ${name}`);
    const folder = join(contained, name);
    const entry = manifest.skills[name];
    const localLicense = join(folder, 'LICENSE');
    const carriesLicense = statIfPresent(localLicense);
    if (carriesLicense && (!carriesLicense.isFile() ||
        !readFileSync(localLicense).equals(readFileSync(license)))) {
      throw new Error('Licencia de paquete diferente al aviso aprobado: ' + policy.id + '/' + name);
    }
    const skill = readSkill('marketing', name, folder, {
      license: carriesLicense ? undefined : license, commit: manifest.commit, sourceId: policy.id,
      guides: name === 'link-building' ? sharedGuides.map((path) => ({ path, source: join(root, path) })) : [],
    });
    if (skill.version !== entry?.version || entry.commit !== manifest.commit) {
      throw new Error(`Versión o commit externo distinto en el lock: ${name}`);
    }
    checkHashes(folder, plainFiles(folder), entry.sha256);
    catalog.set(name, skill);
  }
}

export function loadCatalog(root = catalogRoot, config = root === catalogRoot ? readUpstreamConfig() : null, vendors = vendorBase) {
  const catalog = new Map();
  for (const category of directories(root)) {
    for (const name of directories(join(root, category))) {
      if (catalog.has(name)) throw new Error(`Nombre de skill duplicado: ${name}`);
      catalog.set(name, readSkill(category, name, join(root, category, name)));
    }
  }
  if (config) {
    const approved = new Set(config.sources.map((source) => source.id));
    for (const entry of readdirSync(vendors, { withFileTypes: true })) {
      if (!entry.isDirectory() || !approved.has(entry.name)) throw new Error('Snapshot sin fuente YAML aprobada: ' + entry.name);
    }
    for (const source of config.sources) addVendored(catalog, join(vendors, source.id), source);
  }
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
  const guides = selected.flatMap((skill) => skill.guides ?? []);
  const paths = [agents, destination, ...(guides.length ? [join(agents, 'tools'), join(agents, 'tools', 'integrations')] : [])];
  for (const directory of paths) {
    if (statIfPresent(directory)) assertDirectory(directory);
  }
  for (const skill of selected) {
    if (statIfPresent(join(destination, skill.name))) throw new Error(`No se sobrescribirá: ${skill.name}`);
  }
  for (const { path } of guides) {
    if (statIfPresent(join(agents, path))) throw new Error(`No se sobrescribirá: ${path}`);
  }
  for (const directory of paths) {
    if (!statIfPresent(directory)) mkdirSync(directory);
    assertDirectory(directory);
  }
  for (const { path, source } of guides) {
    cpSync(source, join(agents, path), { force: false, errorOnExist: true });
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
    for (const { category, name, description, version } of rows) {
      console.log(`${category}/${name} @ ${version ?? 'sin versión declarada'} | ${description}`);
    }
  } else if (command === 'version' && args.length === 1) {
    const skill = catalog.get(args[0]);
    if (!skill) throw new Error(`Skill desconocida: ${args[0]}`);
    console.log(`${skill.name}: ${skill.version ?? 'sin versión declarada'} (${skill.sourceId ? skill.sourceId + ' @ ' + skill.commit : 'Flyver'})`);
  } else if (command === 'audit-upstream' && args.length <= 1) {
    const rows = [...catalog.values()].filter((s) => s.sourceId && (!args[0] || s.sourceId === args[0]));
    if (!rows.length) throw new Error('Fuente desconocida: ' + args[0]);
    for (const skill of rows) {
      console.log('- ' + skill.sourceId + '/' + skill.name + ' @ ' +
        (skill.version ?? 'sin versión declarada') + ': hashes verificados');
    }
  } else if (command === 'install') {
    install(catalog, args);
  } else {
    throw new Error('Uso: validate | list [tema] | version <skill> | audit-upstream [origen] | install --target <proyecto> [--agent codex|claude-code] <skill>...');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); }
  catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
