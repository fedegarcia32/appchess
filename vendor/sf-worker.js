// Carga Stockfish con el WASM embebido en base64
importScripts('stockfish-wasm-b64.js');
var __W=Uint8Array.from(atob(self.__SF_WASM_B64),function(c){return c.charCodeAt(0)});
var __f=self.fetch;self.fetch=function(u,o){if(String(u&&u.url||u).indexOf('.wasm')>=0)return Promise.resolve(new Response(__W,{headers:{'Content-Type':'application/wasm'}}));return __f(u,o)};
importScripts('stockfish-nnue-16-single.js');
