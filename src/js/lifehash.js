/*
 * LifeHash v2, adapted from Blockchain Commons' bc-lifehash (0444dbe).
 * https://github.com/BlockchainCommons/bc-lifehash
 * Copyright © 2019 Blockchain Commons, LLC
 * SPDX-License-Identifier: BSD-2-Clause-Patent
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * Subject to the terms and conditions of this license, each copyright holder and
 * contributor hereby grants to those receiving rights under this license a
 * perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable
 * (except for failure to satisfy the conditions of this license) patent license
 * to make, have made, use, offer to sell, sell, import, and otherwise transfer this
 * software, where such license applies only to those patent claims, already
 * acquired or hereafter acquired, licensable by such copyright holder or
 * contributor that are necessarily infringed by:
 * (a) their Contribution(s) (the licensed copyrights of copyright holders and
 * non-copyrightable additions of contributors, in source or binary form) alone; or
 * (b) combination of their Contribution(s) with the work of authorship to which
 * such Contribution(s) was added by such copyright holder or contributor, if, at
 * the time the Contribution is added, such addition causes such combination to be
 * necessarily infringed. The patent license shall not apply to any other
 * combinations which include the Contribution.
 * Except as expressly stated above, no rights or licenses from any copyright
 * holder or contributor is granted under this license, whether expressly, by
 * implication, estoppel or otherwise.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
(() => {
  "use strict";
  // Also loaded by the Ember Den's dealer on the Worker (worker/src/poker-den.js), for `sha256`.
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const UTF8 = new TextEncoder();
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const rotate = (x, n) => x >>> n | x << (32 - n);
  // Synchronous SHA-256 keeps room construction synchronous, including file:// loads.
  const sha256 = (input) => {
    const length = Math.ceil((input.length + 9) / 64) * 64, bytes = new Uint8Array(length);
    bytes.set(input); bytes[input.length] = 128;
    const data = new DataView(bytes.buffer), bits = input.length * 8;
    data.setUint32(length - 8, Math.floor(bits / 4294967296)); data.setUint32(length - 4, bits >>> 0);
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < length; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = data.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15], y = w[i - 2];
        w[i] = w[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ x >>> 3) + w[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ y >>> 10);
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], j = h[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (j + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + (e & f ^ ~e & g) + K[i] + w[i]) >>> 0;
        const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + (a & b ^ a & c ^ b & c)) >>> 0;
        j = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += j;
    }
    const digest = new Uint8Array(32), out = new DataView(digest.buffer);
    for (let i = 0; i < 8; i++) out.setUint32(i * 4, h[i]);
    return digest;
  };
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const mix = (a, b, t) => [clamp(a[0] * (1 - t) + b[0] * t), clamp(a[1] * (1 - t) + b[1] * t), clamp(a[2] * (1 - t) + b[2] * t)];
  const BLACK = [0, 0, 0], WHITE = [1, 1, 1];
  const SPECTRUM = [[0, 168, 222], [41, 60, 130], [210, 59, 130], [217, 63, 53], [244, 228, 81], [0, 158, 84], [0, 168, 222]].map((c) => c.map((v) => v / 255));
  // Reference uses fmodf and float luminance: Math.fround preserves its rounding at palette boundaries.
  const mod1 = (v) => Math.fround(Math.fround(v) % 1 + 1) % 1;
  const luminance = (c) => {
    const r = Math.fround(0.299 * c[0]), g = Math.fround(0.587 * c[1]), b = Math.fround(0.114 * c[2]);
    return Math.fround(Math.sqrt(Math.fround(Math.fround(Math.fround(r * r) + Math.fround(g * g)) + Math.fround(b * b))));
  };
  const blend = (colors, t) => {
    if (colors.length === 2) return mix(colors[0], colors[1], clamp(t));
    if (t <= 0) return colors[0];
    if (t >= 1) return colors[colors.length - 1];
    const segment = t * (colors.length - 1), index = Math.floor(segment);
    return mix(colors[index], colors[index + 1], mod1(segment));
  };
  const hue = (t) => blend(SPECTRUM, t);
  const palette = (digest) => {
    let offset = 2;
    const bits = (count) => {
      let value = 0;
      for (let i = 0; i < count; i++, offset++) value = value * 2 + (digest[offset >>> 3] >>> (7 - (offset & 7)) & 1);
      return value;
    };
    const frac = () => bits(16) / 65535;
    const kind = bits(2), t = frac();
    let colors, reversed;
    if (kind === 0) {
      const tint = bits(1); reversed = bits(1);
      const keyAdvance = frac() * 0.3 + 0.05, neutralAdvance = frac() * 0.3 + 0.05;
      const key = tint ? mix(hue(t), BLACK, 0.5) : hue(t), neutral = tint ? WHITE : BLACK;
      colors = [mix(key, neutral, keyAdvance), mix(neutral, key, neutralAdvance)];
    } else if (kind === 1 || kind === 2) {
      const lighter = frac() * 0.3, darker = frac() * 0.3;
      reversed = bits(1);
      colors = kind === 1 ? [hue(t), hue(mod1(t + 0.5))] : [hue(t), hue(mod1(t + 1 / 3)), hue(mod1(t + 2 / 3))];
      colors.sort((a, b) => luminance(a) - luminance(b));
      colors[0] = mix(colors[0], BLACK, darker);
      colors[colors.length - 1] = mix(colors[colors.length - 1], WHITE, lighter);
      if (kind === 2) colors.reverse();
    } else {
      const advance = frac() * 0.5 + 0.2;
      reversed = bits(1);
      colors = [hue(t), hue(mod1(t + 1 / 12)), hue(mod1(t + 2 / 12)), hue(mod1(t + 3 / 12))];
      if (luminance(colors[0]) >= luminance(colors[3])) colors.reverse();
      colors[0] = mix(colors[0], BLACK, advance); colors[1] = mix(colors[1], BLACK, advance / 2);
      colors[2] = mix(colors[2], WHITE, advance / 2); colors[3] = mix(colors[3], WHITE, advance);
    }
    return { colors, reversed, snowflake: bits(1) };
  };
  const make = (seed) => {
    const digest = sha256(UTF8.encode(seed)), initial = sha256(digest);
    let cells = new Uint8Array(256), next = new Uint8Array(256), generations = 0;
    const history = new Uint8Array(150 * 32), packed = new Uint8Array(32), lastAlive = new Uint8Array(256);
    for (let i = 0; i < 256; i++) cells[i] = initial[i >>> 3] >>> (7 - (i & 7)) & 1;
    // Exact packed-state compare detects cycles without hashing every generation.
    generation: for (; generations < 150; generations++) {
      packed.fill(0);
      for (let i = 0; i < 256; i++) packed[i >>> 3] |= cells[i] << (7 - (i & 7));
      for (let g = 0; g < generations; g++) {
        let equal = true;
        for (let i = 0; i < 32; i++) if (packed[i] !== history[g * 32 + i]) { equal = false; break; }
        if (equal) break generation;
      }
      history.set(packed, generations * 32);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const index = y * 16 + x, left = (x + 15) & 15, right = (x + 1) & 15, above = ((y + 15) & 15) * 16, below = ((y + 1) & 15) * 16;
        const neighbors = cells[above + left] + cells[above + x] + cells[above + right] + cells[y * 16 + left] + cells[y * 16 + right] + cells[below + left] + cells[below + x] + cells[below + right];
        next[index] = neighbors === 3 || cells[index] && neighbors === 2 ? 1 : 0;
        if (cells[index]) lastAlive[index] = generations + 1;
      }
      const swap = cells; cells = next; next = swap;
    }
    const values = new Float64Array(256);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 256; i++) { values[i] = lastAlive[i] / generations; min = Math.min(min, values[i]); max = Math.max(max, values[i]); }
    const gradient = palette(digest), colors = new Uint8Array(32 * 32 * 3);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const t = (min - values[y * 16 + x]) / (min - max), color = blend(gradient.colors, gradient.reversed ? 1 - t : t);
      for (let transform = 0; transform < 4; transform++) {
        const transpose = !gradient.snowflake && (transform === 1 || transform === 2);
        let tx = transpose ? y : x, ty = transpose ? x : y;
        if (transform & 1) tx = 31 - tx;
        if (transform & 2) ty = 31 - ty;
        const index = (ty * 32 + tx) * 3;
        colors[index] = color[0] * 255; colors[index + 1] = color[1] * 255; colors[index + 2] = color[2] * 255;
      }
    }
    const hash = Array.from(digest, (v) => v.toString(16).padStart(2, "0")).join("");
    return { width: 32, height: 32, colors, hash };
  };
  BL.lifehash = { make, sha256 };
})();
