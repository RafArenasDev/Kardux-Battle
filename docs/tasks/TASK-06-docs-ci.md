# Fase 7 — README, diagramas, Docker y CI

1. `README.md` (inglés) y `README.es.md` con todo lo listado en la sección README de
   `CLAUDE.md`, incluidos los diagramas **Mermaid**: C4 nivel 2, secuencia de una ronda,
   máquina de estados, ER de la base de datos y componentes del frontend.
2. `docs/adr/` con un ADR corto por decisión relevante: NestJS vs Laravel, motor puro,
   Postgres + Redis, Tauri vs Electron, sesión por pestaña.
3. `docker-compose.yml` que levante postgres + redis + api + web con un solo comando,
   y Dockerfile multi-stage para la API.
4. `.env.example` comentado campo por campo.
5. GitHub Actions: `lint → typecheck → test → build`, matriz de Node, cobertura publicada,
   y job de Playwright con los servicios levantados.
6. `CONTRIBUTING.md`, `CREDITS.md` (atribución de las APIs), `LICENSE` (MIT) y disclaimer
   de fan-project sin fines comerciales.
7. GIF de demo en la portada del README.
