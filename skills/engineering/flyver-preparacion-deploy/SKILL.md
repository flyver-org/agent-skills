---
name: flyver-preparacion-deploy
description: Prepara o diagnostica el despliegue de una aplicación sin mezclar compilación, arranque y recuperación. Úsala para revisar cambios y evidencia antes de desplegar.
---

# Preparación y diagnóstico de despliegue

1. Registra rama, SHA, servicio y ambiente; identifica qué pipeline se ejecutó y cuál fue la primera etapa fallida: detección, instalación, build, migración, arranque o salud.
2. Verifica por nombre las variables necesarias y su fase de uso, sin leer ni divulgar valores. Separa referencia al entorno de los requisitos de red y persistencia.
3. Valida localmente o en staging con fixtures. Distingue una prueba de build de una de runtime; conserva un plan de reversión que incluya compatibilidad de schema.
4. Para afirmar recuperación, vincula la versión activa y una comprobación de salud o recorrido público permitido al intento exacto. Un build fallido no prueba caída de la versión anterior.
5. Reporta el primer error confirmado, el próximo paso más pequeño y lo no verificado. No cambies producción, credenciales ni datos por inferencia.
