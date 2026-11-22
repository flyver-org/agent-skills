# Landing: cuatro skills externas

Fuente: [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills). La [configuración YAML](../upstreams.yaml) lista las fuentes, con repositorio, rama, licencia y nombres por separado. Estas cuatro son del origen `coreyhaines31-marketingskills`. El [lock de origen](../vendor/coreyhaines31-marketingskills/upstream.json) es la referencia para el commit instalado, la versión declarada y los SHA-256 de cada paquete y archivo. El catálogo conserva la [licencia MIT](../vendor/coreyhaines31-marketingskills/LICENSE) y los archivos originales, incluidas referencias y evaluaciones. Los scripts externos no se ejecutan durante la actualización, validación o instalación.

| Skill | Cuándo usarla |
| --- | --- |
| [product-marketing](../vendor/coreyhaines31-marketingskills/skills/product-marketing/SKILL.md) | Define audiencia, oferta, posicionamiento y propuesta de valor. |
| [customer-research](../vendor/coreyhaines31-marketingskills/skills/customer-research/SKILL.md) | Valida el lenguaje del cliente, objeciones y evidencia. |
| [copywriting](../vendor/coreyhaines31-marketingskills/skills/copywriting/SKILL.md) | Escribe titular, jerarquía, prueba y CTA. |
| [cro](../vendor/coreyhaines31-marketingskills/skills/cro/SKILL.md) | Revisa fricción, relevancia y criterios para medir conversiones. |

## Instalar una copia

Desde el catálogo, usa solo el agente que necesitas. Los scripts no descargan ni ejecutan el contenido de la skill.

```sh
npm run skills -- install --target "/ruta/a/mi-proyecto" product-marketing customer-research copywriting cro
npm run skills -- install --target "/ruta/a/mi-proyecto" --agent claude-code product-marketing customer-research copywriting cro
```

Esta selección no instala las demás skills que recomienda upstream. No añadas dependencias automáticamente; si hace falta otra skill, revísala primero. Al usar ambas herramientas, considera que estas skills utilizan un archivo de posicionamiento del proyecto; en Claude Code, indica la ruta de ese archivo si no se descubre automáticamente.

## Actualizar por PR

1. En un clon separado del repositorio upstream, sin checkout, identifica y revisa el SHA exacto nuevo y el diff. Revisa el contenido, las dependencias y la licencia; no ejecutes nada del clon.
2. En la rama de revisión del catálogo, ejecuta `node scripts/refresh-upstream.mjs <id-de-fuente> <clon-upstream> <sha-completo>`. Comprueba una por una las skills listadas en el YAML y las referencias compartidas conocidas. Si solo cambia el SHA upstream pero no cambia ningún archivo aprobado, conserva el lock anterior. Las skills nuevas no listadas se reportan sin importarlas. Una skill aprobada que ya no existe, un cambio de licencia o un enlace no soportado detiene el candidato para revisión manual.
3. Corre `npm run check` y `npm test`; revisa el diff del PR y prueba un brief y una página ficticia. El workflow semanal/manual ya prepara candidato y resumen; si el token no permite crear el borrador, usa el patch de la ejecución para revisión manual. Nunca habilita automerge ni actualiza instalaciones locales.

La skill `link-building` instala seis guías MIT compartidas bajo `.agents/tools/integrations/` o `.claude/tools/integrations/`. El instalador conserva los enlaces relativos y se detiene antes de escribir si detecta una colisión.
