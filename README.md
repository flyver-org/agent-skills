# Flyver Agent Skills

Biblioteca de instrucciones reutilizables para agentes. Las fuentes están ordenadas por tema; cada skill es un paquete independiente con su propio `SKILL.md`.

| Tema | Skills iniciales |
| --- | --- |
| [Marketing](skills/marketing/) | Prospección B2B, contenido social y cuatro skills de landing revisadas |
| [Design](skills/design/) | Brief de diseño UI, revisión visual |
| [Video](skills/video/) | Producción de video explicativo |
| [Engineering](skills/engineering/) | Revisión de cambios, preparación de despliegues |
| [Operations](skills/operations/) | Documentación de flujos |

## Listar y validar

Requiere Node.js 22+. No hay dependencias npm ni claves.

```sh
npm run skills -- list
npm run skills -- list marketing
npm run check
npm test
```

## Usar una skill en Codex o Claude Code

Desde el catálogo, indica la ruta de un proyecto existente. El script copia solo los nombres explícitos dentro de `<proyecto>/.agents/skills/` por defecto, no cambia configuración global, no sobrescribe y no crea enlaces. Para Claude Code, añade `--agent claude-code` antes de los nombres y las dejará en `<proyecto>/.claude/skills/`.

```sh
npm run skills -- install --target "/ruta/a/mi-proyecto" flyver-prospeccion-b2b flyver-contenido-social
```

En PowerShell, puedes usar una ruta como `"C:\Proyectos\mi-proyecto"`. Una vez copiada, abre una sesión de Codex en el proyecto e invoca, por ejemplo, `$flyver-prospeccion-b2b`. Revisa el contenido antes de usarlo. La copia es una instantánea, no se actualiza sola. Para actualizarla, revisa diferencias y reemplaza manualmente solo la skill que quieres cambiar.

Para trabajo de landing, consulta las [cuatro skills externas y su revisión fijada](docs/landing-skills.md). Se instalan por nombre con el mismo comando y conservan su licencia MIT.

Otros agentes pueden usar el paquete estándar `SKILL.md` en su ruta de descubrimiento correspondiente; no se han configurado cuentas ni instalado agentes externos.

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para ampliar el catálogo y [SOURCES.md](SOURCES.md) para sus fuentes.
