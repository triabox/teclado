// Reglas del modo juego. El servidor calcula el XP con esto y el teclado lo lee desde /api/config,
// así que para sumar rangos o desbloqueos alcanza con editar este archivo.
//
// - Rango nuevo: agregar una entrada a `ranks` con un `min` de XP mayor al anterior.
// - Desbloqueo nuevo: agregar su id a `unlocks` del rango y su texto a `unlockLabels`.
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
    { name: 'Aprendiz', emoji: '🌱', min: 0,    unlocks: [] },
    { name: 'Tipeador', emoji: '⌨️', min: 100,  unlocks: ['color:neon'] },
    { name: 'Veloz',    emoji: '💨', min: 300,  unlocks: ['sound:crystal'] },
    { name: 'Rayo',     emoji: '⚡', min: 700,  unlocks: ['fx:rainbow-all'] },
    { name: 'Maestro',  emoji: '🎓', min: 1500, unlocks: ['color:gold'] },
    { name: 'Leyenda',  emoji: '👑', min: 3000, unlocks: ['color:galaxy', 'sound:space'] },
  ],

  unlockLabels: {
    'color:neon': 'Colores Neón',
    'sound:crystal': 'Sonido Cristales',
    'fx:rainbow-all': 'Arcoíris al tocar en todos los colores',
    'color:gold': 'Teclado de Oro',
    'color:galaxy': 'Colores Galaxia',
    'sound:space': 'Sonido Espacial',
  },
};
