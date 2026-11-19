# Brotli decoder (vendored)

`decode.js` is Google's official JavaScript Brotli decoder, copied unmodified from
<https://github.com/google/brotli/blob/master/js/decode.js> on 2026-11-19
(SHA-256 `7FD3ECB658C9C7E389EAF0AAF7E0ADCC8BA47E043C21BDEFB8C3CAA83D893D35`). MIT license, see `LICENSE`.

Used only to read player save strings in the browser: Melvor Idle 2 saves are Brotli-compressed and
browsers have no built-in Brotli decompression. `build.py` inlines it and turns its single `export let`
into a plain declaration so it fits the page's one classic script.
