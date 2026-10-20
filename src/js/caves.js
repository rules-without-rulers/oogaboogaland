// The eight cave slots round the island and the gate. Each slot has a clock position, status, scene, name
// and repository, plus `theme` for the facade the hub dresses it with and `soon` for a sealed cave that
// already wears one (c2 is the Lightning Factory). The director seals a slot whose scene is `wip` and
// closed. A slot with no scene of its own but a `place` is a room inside the hub, reached by the hub's
// `navigate` view of that name (B.C.A. at c10).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // Ring slot position is a clock angle: 12 is far, 3 is right.
  const slot = (id, clock, scene = null, status = "dark", name = null, repo = null) => ({ id, clock, scene, status, name, repo });
  // `theme` picks the facade the hub dresses the mouth with; `soon` marks a sealed cave that already wears one.
  const slots = [
    { ...slot("c11", 11, "lab", "open", "EntropyLab", "oogaboogax/entropylab"), theme: "lab" },
    // Banana Certified Accounting: an office in the hub itself, so it has no scene to seal.
    { ...slot("c10", 10, null, "open", "B.C.A.", "oogaboogax/bananacertifiedaccounting"), place: "bca", theme: "bca", title: "Banana Certified Accounting" },
    slot("c9", 9),
    slot("c730", 7.25, null, "headquarters", "Headquarters"),
    { ...slot("c1", 1, null, "mirror", "Ooga Booga Land", "oogaboogax/oogaboogaland"), theme: "matrix" },
    { ...slot("c2", 2, "factory", "open", "Lightning Factory", "oogaboogax/lightningfoundry"), additionalRepo: "oogaboogax/bananapayserver", theme: "lightning" },
    // Its sign links its repository; with no work there yet it is no work site (`repo`).
    { ...slot("c3", 3, "arcade", "open", "Ooga Arcade"), link: "oogaboogax/oogaarcade", theme: "arcade" },
    slot("c5", 4.75, null, "headquarters", "Headquarters")
  ];
  BL.caves = { slots, gate: { name: "The old gate" } };
})();
