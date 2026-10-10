# Teclado Anti-Stress

Teclado completo de teclas transparentes con sonidos de fluidos (burbujas, gotas, slime, gelatina, miel, lava…), modo realista 3D, luz RGB, pantalla completa y un modo juego con jugadores, experiencia, rachas y ranking.

- `index.html`: el teclado y el juego. Los sonidos se generan con Web Audio.
- `server.js`: sirve la página y guarda jugadores, partidas y ranking en Postgres.
- `game-config.js`: reglas de experiencia, rangos y desbloqueos. Para sumar rangos o premios se edita este archivo.

## Correrlo local

```bash
npm install
npm run dev
```

Sin `DATABASE_URL` usa una base en memoria que se borra al reiniciar.

## Variables de entorno

- `DATABASE_URL`: conexión a Postgres.
- `PORT`: puerto (80 por defecto).
- `GAME_TZ`: zona horaria que define cuándo cambia el día para la racha (por defecto `America/Argentina/Buenos_Aires`).
- `ADMIN_TOKEN`: clave para borrar jugadores.

## Borrar un jugador

```bash
curl -X POST https://renzo.xjexim.easypanel.host/api/admin/delete-player \
  -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"nick":"NombreDelJugador"}'
```
