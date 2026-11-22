# Landing: cuatro skills externas

Fuente aprobada: [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills), revisión exacta [5b2b400eec1e7e1cec76245a715d0b0d4fd2a9c1](https://github.com/coreyhaines31/marketingskills/commit/5b2b400eec1e7e1cec76245a715d0b0d4fd2a9c1). [Licencia MIT en esa revisión](https://github.com/coreyhaines31/marketingskills/blob/5b2b400eec1e7e1cec76245a715d0b0d4fd2a9c1/LICENSE), Copyright (c) 2025 Corey Haines. El snapshot conserva los archivos sin editar, incluidos referencias, evaluaciones y licencia original. El [lock de origen](../vendor/coreyhaines31-marketingskills/upstream.json) registra el SHA del commit y el SHA-256 de cada archivo.

| Skill | Cuándo usarla |
| --- | --- |
| [product-marketing](https://github.com/coreyhaines31/marketingskills/tree/5b2b400eec1e7e1cec76245a715d0b0d4fd2a9c1/skills/product-marketing) | Define audiencia, oferta, posicionamiento y propuesta de valor. |
| [customer-research](https://github.com/coreyhaines31/marketingskills/tree/5b2b400eec1e7e1cec76245a715d0b0d4fd2a9c1/skills/customer-research) | Valida el lenguaje del cliente, objeciones y evidencia. |
| [copywriting](https://github.com/coreyhaines31/marketingskills/tree/5b2b400eec1e7e1cec76245a715d0b0d4fd2a9c1/skills/copywriting) | Escribe titular, jerarquía, prueba y CTA. |
| [cro](https://github.com/coreyhaines31/marketingskills/tree/5b2b400eec1e7e1cec76245a715d0b0d4fd2a9c1/skills/cro) | Revisa fricción, relevancia y criterios para medir conversiones. |

## Instalar una copia

Desde el catálogo, usa solo el agente que necesitas. Los scripts no descargan ni ejecutan el contenido de la skill.

```sh
npm run skills -- install --target "/ruta/a/mi-proyecto" product-marketing customer-research copywriting cro
npm run skills -- install --target "/ruta/a/mi-proyecto" --agent claude-code product-marketing customer-research copywriting cro
```

Esta selección no instala las demás skills que recomienda upstream. No añadas dependencias automáticamente; si hace falta otra skill, revísala primero. Al usar ambas herramientas, considera que estas skills utilizan un archivo de posicionamiento del proyecto; en Claude Code, indica la ruta de ese archivo si no se descubre automáticamente.

## Actualizar por PR

1. En un clon separado del repositorio upstream, elige y anota el SHA exacto nuevo. Revisa `git diff <sha-anterior> <sha-nuevo> -- LICENSE skills/product-marketing skills/customer-research skills/copywriting skills/cro`. Revisa cambios en instrucciones, archivos, dependencias y licencia; no ejecutes nada del clon.
2. Actualiza en la rama del PR solo las cuatro carpetas completas y `LICENSE` con los archivos aprobados del commit. Quita del snapshot únicamente archivos que upstream haya eliminado, conserva avisos y registra el SHA nuevo. Actualiza la lista de hashes SHA-256 del lock y los enlaces de este documento.
3. Corre `npm run check` y `npm test`; revisa el diff del PR y prueba un brief y una página ficticia. No sigas `main` automáticamente ni habilites skills externas al clonar el catálogo.
