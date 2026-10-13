# App Chess ♞

Jugá al ajedrez contra **Stockfish 16** (WebAssembly, un solo hilo) directamente en el navegador. Funciona en iPhone (Safari) y se puede agregar a la pantalla de inicio; después de la primera carga anda sin conexión.

**Abrir:** https://fedegarcia32.github.io/appchess/

En el iPhone: abrí el enlace en Safari → Compartir → **Agregar a inicio**.

Funciones: tablero táctil (tocar o arrastrar), jugadas legales (chess.js), coronación, deshacer, nueva partida, elegir color, lista de jugadas, exportar/copiar PGN, nivel 0–20 + tiempo/profundidad, botón **Mejor jugada** con flecha, barra de evaluación y modo análisis.

Nota técnica: el WASM de Stockfish está guardado en base64 (`vendor/stockfish-wasm-b64.js`) y lo carga `vendor/sf-worker.js`.

## Licencia
Este proyecto incluye **Stockfish** / **stockfish.js** (© Stockfish developers, © Chess.com LLC), licenciados bajo **GNU GPL v3**, por lo que el proyecto completo se distribuye bajo GPLv3 (ver `LICENSE`). chess.js © Jeff Hlywa, licencia BSD-2-Clause.
