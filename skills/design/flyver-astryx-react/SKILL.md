---
name: flyver-astryx-react
description: Integra y evalúa Astryx de Meta en un proyecto React 19 o posterior. Úsala para instalar la biblioteca y generar su skill oficial en el proyecto consumidor, o para un piloto de componentes y temas. No migra todo un design system.
metadata:
  version: "1.0.0"
---

# Integrar Astryx en React

Esta guía no instala dependencias por sí sola. **Si el usuario pidió implementar el cambio**, trabaja en el proyecto consumidor y en una rama de prueba, no en el catálogo. Si solo pidió orientación, presenta el plan y no ejecutes comandos de instalación.

1. **Comprueba compatibilidad.** Lee el lockfile, los manifiestos de la app, su versión de Node y React/React DOM. Astryx requiere React 19+. No actualices React ni cambies el design system existente para desbloquear un piloto sin acuerdo. Usa el gestor de paquetes existente.
2. **Elige una versión concreta.** Consulta el [repositorio oficial](https://github.com/meta/astryx) y las dependencias peer de esa versión en npm. Conserva la versión ya instalada si es compatible; si es nueva, selecciona y fija una versión aprobada. Alinea core, tema y CLI en esa misma versión. En pnpm, el flujo depende de los paquetes oficiales:

   ~~~sh
   pnpm add -E @astryxdesign/core@VERSION @astryxdesign/theme-neutral@VERSION @stylexjs/stylex@PEER_COMPATIBLE
   pnpm add -D -E @astryxdesign/cli@VERSION
   pnpm exec astryx init --to skills
   ~~~

   Sustituye VERSION y PEER_COMPATIBLE por versiones verificadas. En un monorepo, aplícalo solo al paquete de la app. Usa el binario local del paquete oficial: el paquete npm sin scope llamado astryx no es esta CLI. La instrucción oficial se genera en el consumidor y corresponde al CLI instalado; revisa sus archivos y el diff de las instrucciones de agente, no los copies a este catálogo.
3. **Piloto acotado.** Consulta pnpm exec astryx component Button (o el componente que usarás) y el [quick start del core](https://github.com/meta/astryx/blob/main/packages/core/README.md#quick-start) para los imports y el proveedor Theme de tu framework. Integra el tema en una sola vista y empieza con un componente. Los estilos precompilados no necesitan un plugin para el uso normal. No agregues reset.css al CSS global ni sustituyas el reset existente por defecto: el reset incide sobre toda la app. Si el piloto no puede aislar ese impacto, pruébalo en una app de ejemplo separada o confirma el cambio global antes de aplicarlo.
4. **Verifica por el flujo de usuario.** Compila, abre el piloto y prueba teclado, foco, estados deshabilitados y contraste. Si la app usa claro/oscuro, comprueba ambos. Revisa una pantalla vecina para detectar regresiones de estilo. Usa pnpm exec astryx doctor --built . desde la app si el CLI instalado lo soporta, además de los checks del proyecto. Reporta qué versiones quedaron y qué observaste; no actives MCP, actualizaciones globales ni despliegues como parte del piloto.
