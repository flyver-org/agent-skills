# Flyver Agent Skills

Biblioteca de instrucciones reutilizables para agentes. Las fuentes están ordenadas por tema; cada skill es un paquete independiente con su propio `SKILL.md`.

| Tema | Skills iniciales |
| --- | --- |
| [Marketing](skills/marketing/) | Prospección B2B, contenido social y catálogo de marketing upstream |
| [Design](skills/design/) | Brief de diseño UI, revisión visual |
| [Video](skills/video/) | Producción de video explicativo |
| [Engineering](skills/engineering/) | Revisión de cambios, preparación de despliegues |
| [Operations](skills/operations/) | Documentación de flujos |

## Listar y validar

Requiere Node.js 22+. No hay dependencias npm ni claves.

```sh
npm run skills -- list
npm run skills -- list marketing
npm run skills -- version copywriting
npm run check
npm test
```

## Usar una skill en Codex o Claude Code

Desde el catálogo, indica la ruta de un proyecto existente. El script copia solo los nombres explícitos dentro de `<proyecto>/.agents/skills/` por defecto, no cambia configuración global, no sobrescribe y no crea enlaces. Para Claude Code, añade `--agent claude-code` antes de los nombres y las dejará en `<proyecto>/.claude/skills/`.

```sh
npm run skills -- install --target "/ruta/a/mi-proyecto" flyver-prospeccion-b2b flyver-contenido-social
```

En PowerShell, puedes usar una ruta como `"C:\Proyectos\mi-proyecto"`. Una vez copiada, abre una sesión de Codex en el proyecto e invoca, por ejemplo, `$flyver-prospeccion-b2b`. Revisa el contenido antes de usarlo. La copia es una instantánea, no se actualiza sola. Para actualizarla, revisa diferencias y reemplaza manualmente solo la skill que quieres cambiar.

Para trabajo de landing, consulta las [cuatro recomendadas](docs/landing-skills.md). Todo el catálogo upstream seleccionado se instala individualmente por nombre, no en bloque, con su licencia MIT. Revisa las instrucciones antes de usarlas y no ejecutes scripts externos al instalar.

## Versiones y mantenimiento

- [`upstreams.yaml`](upstreams.yaml) es la política que revisamos por PR: repositorio público, rama, licencia y nombres aprobados. No contiene secretos ni versiones duplicadas.
- El campo YAML `metadata.version` en cada `SKILL.md` es la versión declarada por quien mantiene la skill.
- El [lock upstream](vendor/coreyhaines31-marketingskills/upstream.json) registra la versión declarada (o `null`), el commit exacto y los SHA-256 por archivo. Una versión sin cambios no garantiza contenido idéntico; el informe de revisión compara también los hashes.
- El workflow semanal y manual lee el YAML, consulta la rama una vez y muestra el estado de cada skill aprobada. Si solo aparecen skills no aprobadas o no cambian los archivos seleccionados, lo registra sin cambiar el lock ni abrir PR. Si hay cambios aprobados, valida un candidato y propone un PR draft cuando el token existente tiene permiso. Si no puede crearlo, conserva un resumen y patch como artefacto, sin cambiar permisos ni fusionar ni instalar nada. Un reporte de upstream no indica que tus copias locales se hayan actualizado.

Otros agentes pueden usar el paquete estándar `SKILL.md` en su ruta de descubrimiento correspondiente; no se han configurado cuentas ni instalado agentes externos.

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para ampliar el catálogo y [SOURCES.md](SOURCES.md) para sus fuentes.
