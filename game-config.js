// Reglas del modo juego. El servidor calcula el XP con esto y el teclado lo lee desde /api/config,
// así que para sumar rangos o desbloqueos alcanza con editar este archivo.
//
// - Rango nuevo: agregar una entrada a `ranks` con un `min` de XP mayor al anterior.
// - Logro nuevo: agregar una entrada a `achievements`.
// - Desbloqueo nuevo: agregar su id a `unlocks` del rango o del logro y su texto a `unlockLabels`.
//   El id tiene que existir también en el teclado (index.html, registro LOCKS); un id que el
//   teclado todavía no conoce se muestra en el perfil pero no habilita nada.

module.exports = {
  // Clave de dibujos: el jugador elige 3 distintos, en orden (12 × 11 × 10 = 1320 combinaciones)
  animals: [
    { id: 'perro', e: '🐶' }, { id: 'gato', e: '🐱' }, { id: 'zorro', e: '🦊' }, { id: 'rana', e: '🐸' },
    { id: 'leon', e: '🦁' }, { id: 'mono', e: '🐵' }, { id: 'panda', e: '🐼' }, { id: 'conejo', e: '🐰' },
    { id: 'pulpo', e: '🐙' }, { id: 'buho', e: '🦉' }, { id: 'tortuga', e: '🐢' }, { id: 'unicornio', e: '🦄' },
  ],
  pickCount: 3,

  xp: {
    perGame: 20,        // por jugar la partida
    pointsPer: 100,     // 1 XP cada tantos puntos
    perLevel: 15,       // por cada nivel superado
    comboMax: 50,       // 1 XP por acierto de la mejor racha, hasta este tope
    streakPerDay: 0.1,  // extra por cada día seguido después del primero
    streakMaxDays: 5,   // tope del extra: 5 días = +50%
  },

  ranks: [
    { name: 'Aprendiz', emoji: '🌱', min: 0,     unlocks: [] },
    { name: 'Tipeador', emoji: '⌨️', min: 100,   unlocks: ['color:neon'] },
    { name: 'Veloz',    emoji: '💨', min: 300,   unlocks: ['sound:crystal'] },
    { name: 'Rayo',     emoji: '⚡', min: 700,   unlocks: ['fx:rainbow-all'] },
    { name: 'Maestro',  emoji: '🎓', min: 1500,  unlocks: ['color:gold'] },
    { name: 'Leyenda',  emoji: '👑', min: 3000,  unlocks: ['color:galaxy', 'sound:space'] },
    { name: 'Diamante', emoji: '💎', min: 6500,  unlocks: ['color:ice'] },
    { name: 'Fénix',    emoji: '🔥', min: 11000, unlocks: ['fx:shapes'] },
    { name: 'Cósmico',  emoji: '🌌', min: 17000, unlocks: ['fx:space-bg'] },
    { name: 'Dragón',   emoji: '🐉', min: 25000, unlocks: ['color:lava', 'sound:fire'] },
    { name: 'Mítico',   emoji: '🦄', min: 36000, unlocks: ['fx:round-keys'] },
    { name: 'Campeón',  emoji: '🏆', min: 55000, unlocks: ['badge:crown', 'color:flow'] },
  ],

  // Logros: metas que no dependen de la experiencia. `stat` es un contador del jugador
  // (perfectLevels, bestCombo, bestLevel, bestStreak, games, totalHits, podiums, bestGoodRun, goodKeys) y `goal` el valor a alcanzar.
  // Para sumar uno alcanza con agregar una entrada; si da premio, su id va en `unlocks`.
  achievements: [
    { id: 'punteria',   emoji: '🎯', name: 'Puntería',     desc: 'Pasar un nivel sin errores',            stat: 'perfectLevels', goal: 1,    unlocks: [] },
    { id: 'combo15',    emoji: '⚡', name: 'Combo 15',     desc: '15 aciertos seguidos',                  stat: 'bestCombo',     goal: 15,   unlocks: [] },
    { id: 'combo30',    emoji: '💥', name: 'Combo 30',     desc: '30 aciertos seguidos',                  stat: 'bestCombo',     goal: 30,   unlocks: ['fx:trail'] },
    { id: 'combo50',    emoji: '🌪️', name: 'Combo 50',     desc: '50 aciertos seguidos',                  stat: 'bestCombo',     goal: 50,   unlocks: ['sound:thunder'] },
    { id: 'nivel5',     emoji: '🧗', name: 'Nivel 5',      desc: 'Llegar al nivel 5',                     stat: 'bestLevel',     goal: 5,    unlocks: [] },
    { id: 'nivel8',     emoji: '🏔️', name: 'Nivel 8',      desc: 'Llegar al nivel 8',                     stat: 'bestLevel',     goal: 8,    unlocks: ['color:mountain'] },
    { id: 'nivel12',    emoji: '🚀', name: 'Nivel 12',     desc: 'Llegar al nivel 12',                    stat: 'bestLevel',     goal: 12,   unlocks: ['title:imparable'] },
    { id: 'dias3',      emoji: '🔥', name: '3 días',       desc: 'Jugar 3 días seguidos',                 stat: 'bestStreak',    goal: 3,    unlocks: [] },
    { id: 'dias7',      emoji: '📅', name: '7 días',       desc: 'Jugar 7 días seguidos',                 stat: 'bestStreak',    goal: 7,    unlocks: ['color:sunset'] },
    { id: 'dias30',     emoji: '🗓️', name: '30 días',      desc: 'Jugar 30 días seguidos',                stat: 'bestStreak',    goal: 30,   unlocks: ['title:constante'] },
    { id: 'partidas50', emoji: '🎮', name: '50 partidas',  desc: 'Jugar 50 partidas',                     stat: 'games',         goal: 50,   unlocks: [] },
    { id: 'teclas5000', emoji: '⌨️', name: '5.000 teclas', desc: 'Acertar 5.000 teclas en total',         stat: 'totalHits',     goal: 5000, unlocks: ['sound:typewriter'] },
    { id: 'cazador',    emoji: '🍀', name: 'Cazador',      desc: 'Atrapar 5 teclas verdes seguidas sin tocar una roja', stat: 'bestGoodRun', goal: 5, unlocks: [] },
    { id: 'coleccion',  emoji: '💚', name: 'Coleccionista', desc: 'Atrapar 50 teclas verdes en total',    stat: 'goodKeys',      goal: 50,   unlocks: [] },
    { id: 'podio',      emoji: '🥇', name: 'Podio',        desc: 'Terminar una semana entre los 3 primeros', stat: 'podiums',    goal: 1,    unlocks: [] },
  ],

  // Títulos que se muestran junto al nombre en el ranking (el jugador elige cuál usar)
  titles: { 'title:imparable': 'Imparable', 'title:constante': 'Constante' },

  unlockLabels: {
    'color:neon': 'Colores Neón',
    'sound:crystal': 'Sonido Cristales',
    'fx:rainbow-all': 'Arcoíris al tocar en todos los colores',
    'color:gold': 'Teclado de Oro',
    'color:galaxy': 'Colores Galaxia',
    'sound:space': 'Sonido Espacial',
    'color:ice': 'Colores Hielo',
    'fx:shapes': 'Burbujas de formas',
    'fx:space-bg': 'Fondo espacial',
    'color:lava': 'Colores Lava',
    'sound:fire': 'Sonido Fuego',
    'fx:round-keys': 'Teclas redondas',
    'badge:crown': 'Corona en el ranking',
    'color:flow': 'Arcoíris en movimiento',
    'fx:trail': 'Estela al deslizar',
    'sound:thunder': 'Sonido Trueno',
    'color:mountain': 'Colores Montaña',
    'title:imparable': 'Título "Imparable"',
    'color:sunset': 'Colores Atardecer',
    'title:constante': 'Título "Constante"',
    'sound:typewriter': 'Sonido Máquina de escribir',
  },
};
