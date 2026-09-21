# Fase 5 — Tabla de posiciones y perfiles

1. Ranking **en vivo** dentro de la partida: orden por cantidad de cartas con animación de
   reordenamiento (`layout` de Framer Motion) y delta respecto a la ronda anterior.
2. Ranking **global persistido**: partidas jugadas/ganadas, %, cartas acumuladas, racha
   máxima, rondas ganadas, atributo favorito y **Elo** (K=32, base 1200) adaptado a N
   jugadores mediante mini-duelos todos-contra-todos al cerrar la partida.
3. `GET /leaderboard?scope=global|source|friends&period=all|day|week&cursor=` con
   paginación keyset y caché de 30 s en Redis.
4. Actualización transaccional del Elo al finalizar la partida (idempotente: si el job
   se reintenta, no debe recalcular dos veces — usa `Match.ratedAt`).
5. Perfil público `/u/:id`: stats, últimas 20 partidas, cartas más ganadas.
6. Tests: cálculo de Elo con casos fijos, idempotencia, paginación.
