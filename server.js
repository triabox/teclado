// Servidor del teclado: sirve la página y guarda jugadores, partidas y ranking.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CFG = require('./game-config');

const PORT = process.env.PORT || 80;
const TZ = process.env.GAME_TZ || 'America/Argentina/Buenos_Aires'; // define cuándo cambia "el día" de la racha

// ---------- Base de datos ----------
let db;
async function initDb() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  } else {
    console.warn('Sin DATABASE_URL: uso una base en memoria (solo para desarrollo, se borra al reiniciar)');
    const { Pool } = require('pg-mem').newDb().adapters.createPg();
    db = new Pool();
  }
  await db.query(`CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    nick TEXT NOT NULL,
    nick_lower TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER NOT NULL DEFAULT 0,
    best_combo INTEGER NOT NULL DEFAULT 0,
    best_level INTEGER NOT NULL DEFAULT 0,
    streak_days INTEGER NOT NULL DEFAULT 0,
    best_streak_days INTEGER NOT NULL DEFAULT 0,
    last_play_day TEXT,
    total_hits INTEGER NOT NULL DEFAULT 0,
    perfect_levels INTEGER NOT NULL DEFAULT 0,
    podiums INTEGER NOT NULL DEFAULT 0,
    podium_checked TEXT,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    player_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    game_id TEXT,
    start_level INTEGER NOT NULL DEFAULT 1,
    perfect_levels INTEGER NOT NULL DEFAULT 0,
    day TEXT NOT NULL,
    score INTEGER NOT NULL,
    level INTEGER NOT NULL,
    best_combo INTEGER NOT NULL,
    hits INTEGER NOT NULL,
    misses INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    xp INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS games_day_idx ON games (day)');
  // bases creadas antes de que existiera el guardado por nivel
  if (process.env.DATABASE_URL) {
    await db.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS game_id TEXT');
    await db.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS start_level INTEGER NOT NULL DEFAULT 1');
    await db.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS perfect_levels INTEGER NOT NULL DEFAULT 0');
    for (const col of ['total_hits INTEGER NOT NULL DEFAULT 0', 'perfect_levels INTEGER NOT NULL DEFAULT 0',
                       'podiums INTEGER NOT NULL DEFAULT 0', 'podium_checked TEXT', 'title TEXT'])
      await db.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS ' + col);
    // jugadores anteriores a los logros: su total de teclas sale de las partidas ya guardadas
    await db.query(`UPDATE players SET total_hits = (SELECT COALESCE(SUM(g.hits), 0) FROM games g WHERE g.player_id = players.id)
      WHERE total_hits = 0 AND games > 0`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS achievements (
    player_id INTEGER NOT NULL,
    ach_id TEXT NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, ach_id)
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS games_player_game_idx ON games (player_id, game_id)');
}

// ---------- Fechas (en la zona horaria del juego) ----------
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());                       // 'YYYY-MM-DD'
const shiftDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const weekStart = day => shiftDay(day, -((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7)); // lunes

// ---------- Nicks y clave ----------
const NICK_RE = /^[A-Za-z0-9ÑñÁÉÍÓÚáéíóúÜü_]{3,12}$/;
const BAD_WORDS = ['puta', 'puto', 'mierda', 'pija', 'concha', 'verga', 'pene', 'culo', 'pelotud', 'bolud', 'forro',
  'trola', 'idiota', 'imbecil', 'estupid', 'tarad', 'mogolic', 'nazi', 'hitler', 'sexo', 'porno', 'caca', 'pedo',
  'teta', 'chota', 'poronga', 'garcha', 'coger', 'cojer', 'maric', 'fuck', 'shit', 'bitch', 'dick', 'pussy', 'nigg'];
const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/_/g, '');
const isRude = nick => { const n = normalize(nick); return BAD_WORDS.some(w => n.includes(w)); };
const ANIMAL_IDS = new Set(CFG.animals.map(a => a.id));
const validAnimals = a => Array.isArray(a) && a.length === CFG.pickCount && a.every(x => ANIMAL_IDS.has(x)) && new Set(a).size === a.length;
const hashPass = (animals, salt) => crypto.scryptSync(animals.join('-'), salt, 32).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

const ADJ = ['Veloz', 'Feliz', 'Genial', 'Rapido', 'Magico', 'Bravo', 'Turbo', 'Super', 'Loco', 'Astro'];
const NOUN = ['Tigre', 'Panda', 'Zorro', 'Robot', 'Dragon', 'Puma', 'Koala', 'Ninja', 'Rayo', 'Cometa'];
const pick = arr => arr[crypto.randomInt(arr.length)];
async function freeNick(base) {
  for (let i = 0; i < 20; i++) {
    const cand = (base ? base.slice(0, 9) : pick(NOUN) + pick(ADJ)).slice(0, 10) + crypto.randomInt(10, 100);
    const r = await db.query('SELECT 1 FROM players WHERE nick_lower = $1', [cand.toLowerCase()]);
    if (!r.rows.length && !isRude(cand)) return cand;
  }
  return null;
}

// ---------- Límites de intentos (en memoria: alcanza para un solo servidor) ----------
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), b = buckets.get(key);
  if (!b || now > b.until) { buckets.set(key, { n: 1, until: now + windowMs }); return false; }
  return ++b.n > max;
}
const clearLimit = key => buckets.delete(key);
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.until) buckets.delete(k); }, 60e3).unref();

// ---------- Perfil ----------
const rankIndex = xp => { let i = 0; CFG.ranks.forEach((r, k) => { if (xp >= r.min) i = k; }); return i; };
const CROWN_RANK = CFG.ranks.findIndex(r => r.unlocks.includes('badge:crown'));
const statsOf = p => ({ perfectLevels: p.perfect_levels, bestCombo: p.best_combo, bestLevel: p.best_level,
  bestStreak: p.best_streak_days, games: p.games, totalHits: p.total_hits, podiums: p.podiums });
function profile(p, earned = []) {
  const day = today(), i = rankIndex(p.xp), next = CFG.ranks[i + 1];
  const alive = p.last_play_day === day || p.last_play_day === shiftDay(day, -1); // la racha sigue viva si jugó hoy o ayer
  // lo desbloqueado sale de los rangos alcanzados y de los logros ganados
  const unlocks = [...CFG.ranks.slice(0, i + 1).flatMap(r => r.unlocks),
                   ...CFG.achievements.filter(a => earned.includes(a.id)).flatMap(a => a.unlocks)];
  return {
    nick: p.nick, xp: p.xp, rank: i, rankName: CFG.ranks[i].name, rankEmoji: CFG.ranks[i].emoji,
    rankMin: CFG.ranks[i].min, nextMin: next ? next.min : null, nextName: next ? next.name : null,
    games: p.games, bestScore: p.best_score, bestCombo: p.best_combo, bestLevel: p.best_level,
    streak: alive ? p.streak_days : 0, bestStreak: p.best_streak_days, playedToday: p.last_play_day === day,
    unlocks, achievements: earned, stats: statsOf(p),
    title: unlocks.includes(p.title) ? p.title : null,
  };
}

// Podio semanal: la primera vez que el jugador aparece después de cerrada una semana,
// se mira si terminó entre los 3 primeros de esa semana.
const podiumCache = new Map();
async function checkPodium(p) {
  const thisWeek = weekStart(today()), lastWeek = shiftDay(thisWeek, -7);
  if (p.podium_checked === lastWeek) return p;
  if (!podiumCache.has(lastWeek)) {
    const r = await db.query(`SELECT g.player_id, SUM(g.xp) AS xp FROM games g WHERE g.day >= $1 AND g.day < $2
      GROUP BY g.player_id ORDER BY xp DESC LIMIT 3`, [lastWeek, thisWeek]);
    podiumCache.clear(); podiumCache.set(lastWeek, r.rows.map(x => x.player_id));
  }
  const won = podiumCache.get(lastWeek).includes(p.id) ? 1 : 0;
  const r = await db.query('UPDATE players SET podiums = podiums + $1, podium_checked = $2 WHERE id = $3 RETURNING *', [won, lastWeek, p.id]);
  return r.rows[0];
}

// Arma el perfil y entrega los logros que el jugador ya cumple y todavía no tenía
async function withProfile(p) {
  p = await checkPodium(p);
  const have = (await db.query('SELECT ach_id FROM achievements WHERE player_id = $1', [p.id])).rows.map(r => r.ach_id);
  const stats = statsOf(p);
  const fresh = CFG.achievements.filter(a => !have.includes(a.id) && stats[a.stat] >= a.goal).map(a => a.id);
  for (const id of fresh) {
    try { await db.query('INSERT INTO achievements (player_id, ach_id) VALUES ($1, $2)', [p.id, id]); }
    catch (e) { /* otro pedido del mismo jugador lo guardó primero */ }
  }
  return { me: profile(p, [...have, ...fresh]), newAchievements: fresh };
}
async function newSession(playerId) {
  const token = crypto.randomBytes(24).toString('base64url');
  await db.query('INSERT INTO sessions (token_hash, player_id) VALUES ($1, $2)', [sha(token), playerId]);
  return token;
}
async function playerFromReq(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const r = await db.query('SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = $1', [sha(m[1])]);
  return r.rows[0] || null;
}

// ---------- Rutas ----------
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

const routes = {
  'GET /api/config': async () => CFG,

  'GET /api/suggest': async () => ({ nick: await freeNick() }),

  'POST /api/register': async (req, body, ip) => {
    if (limited('reg:' + ip, 10, 3600e3)) throw new HttpError(429, 'Se crearon muchos jugadores desde acá. Probá más tarde.');
    const nick = String(body.nick || '').trim();
    if (!NICK_RE.test(nick)) throw new HttpError(400, 'El nombre tiene que tener entre 3 y 12 letras o números, sin espacios.');
    if (isRude(nick)) throw new HttpError(400, 'Ese nombre no se puede usar. Probá con otro.');
    if (!validAnimals(body.animals)) throw new HttpError(400, 'Elegí 3 animalitos distintos.');
    const salt = crypto.randomBytes(12).toString('hex');
    let r;
    try {
      r = await db.query('INSERT INTO players (nick, nick_lower, salt, pass_hash) VALUES ($1, $2, $3, $4) RETURNING *',
        [nick, nick.toLowerCase(), salt, hashPass(body.animals, salt)]);
    } catch (e) {
      const dup = await db.query('SELECT 1 FROM players WHERE nick_lower = $1', [nick.toLowerCase()]);
      if (!dup.rows.length) throw e;
      throw new HttpError(409, 'Ese nombre ya lo tiene otro jugador.', { suggestion: await freeNick(nick) });
    }
    return { token: await newSession(r.rows[0].id), ...await withProfile(r.rows[0]) };
  },

  'POST /api/login': async (req, body, ip) => {
    const nick = String(body.nick || '').trim().toLowerCase();
    // 5 intentos por jugador cada 5 minutos y 30 por conexión por hora: la clave tiene pocas combinaciones
    if (limited('ip:' + ip, 30, 3600e3) || limited('nick:' + nick, 5, 300e3))
      throw new HttpError(429, 'Demasiados intentos. Esperá 5 minutos y probá de nuevo.');
    const r = await db.query('SELECT * FROM players WHERE nick_lower = $1', [nick]);
    const p = r.rows[0];
    const ok = p && validAnimals(body.animals) &&
      crypto.timingSafeEqual(Buffer.from(hashPass(body.animals, p.salt)), Buffer.from(p.pass_hash));
    if (!ok) throw new HttpError(401, 'El nombre o los animalitos no coinciden. Fijate el orden.');
    clearLimit('nick:' + nick);
    return { token: await newSession(p.id), ...await withProfile(p) };
  },

  'POST /api/logout': async req => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (m) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha(m[1])]);
    return { ok: true };
  },

  'GET /api/me': async req => {
    const p = await playerFromReq(req);
    if (!p) throw new HttpError(401, 'Sesión vencida.');
    return withProfile(p);
  },

  // El jugador elige qué título mostrar junto a su nombre (o ninguno)
  'POST /api/title': async (req, body) => {
    const p = await playerFromReq(req);
    if (!p) throw new HttpError(401, 'Sesión vencida.');
    const title = body.title || null, cur = await withProfile(p);
    if (title && !(CFG.titles[title] && cur.me.unlocks.includes(title))) throw new HttpError(400, 'Todavía no tenés ese título.');
    const r = await db.query('UPDATE players SET title = $1 WHERE id = $2 RETURNING *', [title, p.id]);
    return { me: profile(r.rows[0], cur.me.achievements) };
  },

  // Guarda una partida. El teclado la manda varias veces con el mismo gameId (al pasar cada nivel,
  // al salir y al terminar) con los totales acumulados; acá se suma solo la diferencia de XP.
  'POST /api/games': async (req, body) => {
    const p = await playerFromReq(req);
    if (!p) throw new HttpError(401, 'Sesión vencida.');
    if (limited('game:' + p.id, 1, 1e3)) throw new HttpError(429, 'Esperá un momento.');
    const { gameId, score, level, bestCombo, hits, misses, durationMs } = body;
    const startLevel = body.startLevel === undefined ? 1 : body.startLevel; // nivel desde el que arrancó (punto de partida guardado)
    const perfectLevels = body.perfectLevels === undefined ? 0 : body.perfectLevels; // niveles pasados sin errores en esta partida
    const okShape = typeof gameId === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(gameId) &&
      int(score, 0, 5e6) && int(level, 1, 500) && int(startLevel, 1, 500) && startLevel <= level && int(bestCombo, 0, 5000) && int(hits, 0, 5000) &&
      int(misses, 0, 5000) && int(durationMs, 0, 4 * 3600e3) && int(perfectLevels, 0, level - startLevel);
    // El puntaje lo calcula el teclado, así que se descartan los que el juego no puede dar:
    // cada acierto vale como mucho 450 (150 × combo 3) y cada nivel superado da hasta 500 × nivel de bonus.
    // Solo cuentan los niveles pasados en esta partida: arrancar desde un nivel guardado no los regala de nuevo,
    // y nadie puede arrancar más arriba del mejor nivel al que llegó.
    const maxBonus = 500 * ((level - 1) * level - (startLevel - 1) * startLevel) / 2;
    const plausible = okShape && startLevel <= Math.max(p.best_level, 1) &&
      score <= hits * 450 + maxBonus && level - startLevel <= Math.floor(hits / 10) &&
      bestCombo <= hits && durationMs >= hits * 60;
    if (!plausible) throw new HttpError(400, 'No se pudo guardar la partida.');

    const prev = (await db.query('SELECT * FROM games WHERE player_id = $1 AND game_id = $2', [p.id, gameId])).rows[0];
    // una partida ya guardada solo puede avanzar, nunca retroceder
    if (prev && (startLevel !== (prev.start_level || 1) || score < prev.score || level < prev.level || hits < prev.hits || bestCombo < prev.best_combo || perfectLevels < prev.perfect_levels))
      throw new HttpError(400, 'No se pudo guardar la partida.');

    const day = today();
    // la racha de días se decide en el primer guardado de la partida
    const streak = prev || p.last_play_day === day ? Math.max(p.streak_days, 1)
      : p.last_play_day === shiftDay(day, -1) ? p.streak_days + 1 : 1;
    const X = CFG.xp;
    const parts = {
      game: hits >= 5 ? X.perGame : 0, // sin esto se podría sumar XP perdiendo a propósito una y otra vez
      points: Math.floor(score / X.pointsPer),
      levels: (level - startLevel) * X.perLevel,
      combo: Math.min(bestCombo, X.comboMax),
    };
    const subtotal = parts.game + parts.points + parts.levels + parts.combo;
    const streakPct = Math.round(Math.min(streak - 1, X.streakMaxDays) * X.streakPerDay * 100);
    parts.streak = Math.round(subtotal * streakPct / 100);
    const total = Math.max(subtotal + parts.streak, prev ? prev.xp : 0);
    const gained = total - (prev ? prev.xp : 0);

    const before = rankIndex(p.xp);
    const r = await db.query(`UPDATE players SET xp = xp + $1, games = games + $2,
        best_score = GREATEST(best_score, $3), best_combo = GREATEST(best_combo, $4), best_level = GREATEST(best_level, $5),
        streak_days = $6, best_streak_days = GREATEST(best_streak_days, $6), last_play_day = $7,
        total_hits = total_hits + $9, perfect_levels = perfect_levels + $10
      WHERE id = $8 RETURNING *`, [gained, prev ? 0 : 1, score, bestCombo, level, streak, prev ? p.last_play_day : day, p.id,
                                    hits - (prev ? prev.hits : 0), perfectLevels - (prev ? prev.perfect_levels : 0)]);
    if (prev) {
      await db.query(`UPDATE games SET score = $1, level = $2, best_combo = $3, hits = $4, misses = $5, duration_ms = $6, xp = $7,
        perfect_levels = $9 WHERE id = $8`, [score, level, bestCombo, hits, misses, durationMs, total, prev.id, perfectLevels]);
    } else {
      await db.query(`INSERT INTO games (player_id, game_id, day, score, level, best_combo, hits, misses, duration_ms, xp, start_level, perfect_levels)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [p.id, gameId, day, score, level, bestCombo, hits, misses, durationMs, total, startLevel, perfectLevels]);
    }
    const { me, newAchievements } = await withProfile(r.rows[0]);
    return {
      xp: { ...parts, total, streakPct }, gained, me, newAchievements,
      rankUp: me.rank > before,
      newUnlocks: [...CFG.ranks.slice(before + 1, me.rank + 1).flatMap(k => k.unlocks),
                   ...CFG.achievements.filter(a => newAchievements.includes(a.id)).flatMap(a => a.unlocks)],
      newStreakDay: !prev && p.last_play_day !== day,
    };
  },

  // Moderación: borra un jugador (por ejemplo, un nombre ofensivo que pasó el filtro).
  // Solo funciona con la clave de administrador definida en ADMIN_TOKEN.
  'POST /api/admin/delete-player': async (req, body) => {
    const given = String(req.headers['x-admin-token'] || ''), real = process.env.ADMIN_TOKEN || '';
    if (!real || given.length !== real.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(real)))
      throw new HttpError(403, 'No autorizado.');
    const r = await db.query('SELECT id FROM players WHERE nick_lower = $1', [String(body.nick || '').toLowerCase()]);
    if (!r.rows.length) throw new HttpError(404, 'No existe ese jugador.');
    const id = r.rows[0].id;
    await db.query('DELETE FROM games WHERE player_id = $1', [id]);
    await db.query('DELETE FROM sessions WHERE player_id = $1', [id]);
    await db.query('DELETE FROM achievements WHERE player_id = $1', [id]);
    await db.query('DELETE FROM players WHERE id = $1', [id]);
    return { ok: true };
  },

  'GET /api/leaderboard': async (req, body, ip, url) => {
    const week = url.searchParams.get('period') === 'week';
    const r = week
      ? await db.query(`SELECT p.nick, p.xp AS total, p.title, SUM(g.xp) AS xp FROM games g JOIN players p ON p.id = g.player_id
          WHERE g.day >= $1 GROUP BY p.nick, p.xp, p.title ORDER BY xp DESC, p.nick LIMIT 200`, [weekStart(today())])
      : await db.query('SELECT nick, xp AS total, title, xp FROM players WHERE games > 0 ORDER BY xp DESC, nick LIMIT 200');
    const rows = r.rows.map((x, i) => {
      const rank = rankIndex(Number(x.total));
      return { pos: i + 1, nick: x.nick, xp: Number(x.xp), emoji: CFG.ranks[rank].emoji,
               title: CFG.titles[x.title] || null, crown: CROWN_RANK >= 0 && rank >= CROWN_RANK };
    });
    const p = await playerFromReq(req);
    return { period: week ? 'week' : 'all', top: rows.slice(0, 10), me: p ? rows.find(x => x.nick === p.nick) || null : null };
  },
};

// ---------- HTTP ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 10000) { reject(new HttpError(413, 'Demasiados datos.')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new HttpError(400, 'Datos inválidos.')); } });
    req.on('error', reject);
  });
}
const send = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const handler = routes[req.method + ' ' + url.pathname];
    if (!handler) return send(res, 404, { error: 'No existe.' });
    try {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
      const body = req.method === 'POST' ? await readBody(req) : {};
      send(res, 200, await handler(req, body && typeof body === 'object' ? body : {}, ip, url));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra });
      console.error(req.method, url.pathname, e);
      send(res, 500, { error: 'Algo falló en el servidor. Probá de nuevo.' });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (url.pathname !== '/' && url.pathname !== '/index.html') { res.writeHead(404); return res.end('No existe'); }
  // siempre revalidar, así los cambios se ven sin tener que borrar la caché
  fs.readFile(path.join(__dirname, 'index.html'), (err, html) => {
    if (err) { res.writeHead(500); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
  });
});

initDb().then(() => server.listen(PORT, '0.0.0.0', () => console.log('Teclado escuchando en el puerto ' + PORT)))
  .catch(e => { console.error('No se pudo iniciar la base de datos', e); process.exit(1); });
