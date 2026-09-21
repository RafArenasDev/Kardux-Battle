# Fase 6 — Desktop (Tauri) y Mobile (Expo)

1. **Desktop**: `apps/desktop` con Tauri 2 envolviendo el build de `apps/web`.
    - Builds para Windows, macOS y Linux en CI.
    - Deep link `kardux://join/<code>`.
    - Icono del escudo en todos los tamaños requeridos por cada plataforma.
2. **Mobile**: `apps/mobile` con Expo + React Native.
    - Reutiliza `@kardux/engine`, `@kardux/contracts` y la capa de socket; **no** dupliques lógica.
    - Layout en columna de la mesa, safe areas, haptics al iniciar tu turno.
    - Mantener la sesión por instancia de app (equivalente móvil del `tabId`).
3. Extrae a `packages/ui` los design tokens y cualquier componente compartible.
4. Verifica que una partida pueda tener simultáneamente jugadores de web, desktop y mobile.
