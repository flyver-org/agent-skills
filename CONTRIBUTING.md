# Contribuir

1. Sigue el formato editable en `skills/<tema>/<nombre>/SKILL.md` con delimitadores `---`, `name` idéntico al directorio y `description` de una sola línea en texto plano o cadena entre comillas dobles. Es el subconjunto YAML que valida el catálogo sin dependencias; evita sintaxis YAML avanzada en frontmatter. Declara la versión de las skills propias con un bloque final `metadata:` y `  version: "1.0.0"` (dos espacios). Actualízala cuando cambies su comportamiento.
2. Especifica cuándo usar la skill y un límite que evite activarla para otra tarea. Añade referencias locales relativas solo si ahorran trabajo real.
3. Si adaptas contenido ajeno, registra origen, versión y licencia en `SOURCES.md`, y no lo incorpores si no tienes permiso.
4. Describe un caso representativo y el resultado verificable. Corre `npm run check` y `npm test`. Revisa el diff antes de instalar o publicar.

Para actualizar un paquete externo, sigue el [flujo de revisión del upstream](docs/landing-skills.md#actualizar-por-pr); edita primero la selección en `upstreams.yaml` si quieres incluir o retirar una skill, y regenera el snapshot. No edites los archivos vendorizados a mano.
