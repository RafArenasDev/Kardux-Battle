# Fase 4 — Frontend web (`apps/web`)

> Requiere `docs/SPEC.md` y las fases 1–3 terminadas.

React 19 + Vite + TypeScript + Tailwind + Zustand + Framer Motion, consumiendo
`@kardux/contracts` y `@kardux/engine` (para predicción optimista y validación local).

1. **Capa de socket**: hook `useGameSocket` con auth por `sessionStorage` (token + tabId),
   reconexión automática con `match:rejoin`, y detección de desincronización por `version`
   (si el `version` recibido salta, pedir snapshot completo).
2. **Sesión por pestaña** exactamente como describe `docs/SPEC.md`: nada de cookies ni
   `localStorage`, `BroadcastChannel` para colisión de `tabId`, nickname en `document.title`
   y favicon coloreado por jugador.
3. **Pantallas**: Home (crear / unirse por código), Lobby (configuración completa de
   `MatchConfig` solo para el anfitrión, lista de jugadores, countdown de auto-inicio,
   preview del mazo), Mesa, Resultados, Leaderboard.
4. **Mesa radial** según la sección de interfaz de `docs/SPEC.md`, responsive con breakpoint
   768 px al layout en columna.
5. **Animaciones**: implementa la tabla completa de `docs/SPEC.md` con Framer Motion.
   Solo `transform` y `opacity`. Respeta `prefers-reduced-motion`.
6. **Ruta `/dev/tabs`** (solo en dev): formulario con código de sala y N, abre N pestañas
   con `window.open`, cada una con nickname autogenerado y auto-join.
7. PWA instalable con manifest e iconos del escudo.
8. i18n es/en con i18next desde el inicio.
9. Accesibilidad: navegación completa por teclado, `aria-live` anunciando el resultado de
   cada ronda, contraste AA.
10. Tests: Vitest + Testing Library para componentes; Playwright E2E con 7 browser contexts
    jugando una partida completa hasta el final.
