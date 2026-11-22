---
name: flyver-revision-de-cambios
description: Revisa diffs, PR y correcciones de software con foco en regresiones observables. Úsala para aportar hallazgos verificables, no para editar o fusionar sin alcance autorizado.
metadata:
  version: "1.0.0"
---

# Revisión de cambios

1. Identifica base, head y el contrato que debía cambiar. Lee los caminos de éxito y los consumidores del contrato que deben seguir funcionando.
2. Elige un caso que una implementación incompleta podría pasar por alto. Ejercítalo por el punto de entrada del usuario en un entorno aislado o explica qué frontera sustituiste.
3. Para datos compartidos, sigue la identidad, permisos y filtro de pertenencia hasta la escritura y lectura. Usa fixtures ficticios; no consultes datos de producción para reproducir.
4. Reporta hallazgos sobre la versión exacta con ubicación, impacto y reproducción segura. Separa fallos observados, hipótesis y escenarios no ejecutados; si no hay bloqueantes, menciona el riesgo residual.
