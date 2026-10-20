// The Bananas panel's nine-pixel icon, shared by painted screens and solid signs.
(() => {
  "use strict";
  const BL = window.BL;
  const PARTS = [
    ["#211b14", [[0, 0, 1, 5], [2, 0, 1, 2], [3, 2, 1, 2], [4, 4, 1, 1], [1, 5, 1, 2], [5, 5, 1, 1], [6, 6, 1, 1], [2, 7, 2, 1], [7, 7, 1, 1], [4, 8, 4, 1]]],
    ["#ffd84a", [[1, 2, 2, 2], [1, 4, 3, 1], [2, 5, 3, 1], [2, 6, 4, 1], [4, 7, 3, 1]]],
    ["#789a3b", [[1, 0, 1, 2]]]
  ];
  // A square at the canvas's (x, y), preserving whole pixels even when the screen is scaled.
  const paint = (g, x, y, size) => {
    const step = size / 9;
    for (const [color, pieces] of PARTS) {
      g.fillStyle = color;
      for (const [px, py, w, h] of pieces) {
        const left = Math.round(x + px * step), top = Math.round(y + py * step);
        g.fillRect(left, top, Math.round(x + (px + w) * step) - left, Math.round(y + (py + h) * step) - top);
      }
    }
  };
  // Centred on the origin, facing +z, with the same colours and proportions as the panel's SVG.
  const geometry = (height, depth, emissive = 1) => {
    const parts = [], step = height / 9;
    for (const [color, pieces] of PARTS) for (const [x, y, w, h] of pieces) {
      parts.push(BL.models.box({ w: w * step, h: h * step, d: depth, color, emissive,
        offset: { x: (x + w / 2 - 4.5) * step, y: (4.5 - y - h / 2) * step } }));
    }
    return BL.models.merge(...parts);
  };
  BL.bananaIcon = { paint, geometry };
})();
