(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, donations, qr, terrain, hubModels, headquartersModels, dropModels, rocketModels, rocketParts, poolModels, caves, daylight, game: gameMod, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod, crew: crewMod, pile: pileMod, crates: cratesMod, critters: crittersMod, weather: weatherMod, chain, mempool, oogatronLive } = BL;
  const { clamp, lerp, ease, fnv1a, mulberry32 } = math;
  const { createNode, addChild, removeChild, updateWorld, createCamera, addTween, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const { JET_SPEED, JET_RISE, JET_FUEL_SECONDS, JET_MOVE_SECONDS } = crewMod;
  const { DROP_HEIGHT } = pileMod;
  const { CONFETTI } = fxMod;
  const params = new URLSearchParams(location.search);
  const METER_CAPACITY = 60;
  const SEED = 1;
  const DEG = Math.PI / 180;
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const yawParam = parseFloat(params.get("yaw"));
  // Debug-only clock params: hour pins the hour, daylen is the day length in seconds.
  const DEBUG = params.has("debug");
  const timeParam = DEBUG ? params.get("time") : null;
  const hourParam = DEBUG ? parseFloat(params.get("hour")) : NaN;
  const daylenParam = DEBUG ? parseFloat(params.get("daylen")) : NaN;
  const dayParam = DEBUG ? parseFloat(params.get("day")) : NaN;
  const latitudeParam = DEBUG ? parseFloat(params.get("latitude")) : NaN;
  const requestedView = DEBUG ? params.get("view") : null;
  const preloadedView = requestedView === "hq" ? "underground" : requestedView === "bsmt" ? "basement" : requestedView === "pile" || requestedView === "lab" || requestedView === "mirror" || requestedView === "timechain" ? requestedView : null;
  const preloadedPose = DEBUG ? readPositionPose(params.get("pose")) : null;
  const preloadedMode = DEBUG ? params.get("mode") || preloadedPose?.mode : null;
  const preloadedFirstPerson = DEBUG && (params.get("firstperson") === "1" || preloadedMode === "first-person" || preloadedMode === "eye-level");
  const preloadedCharacter = DEBUG ? (params.get("character") || preloadedPose?.character)?.trim().toLowerCase() : null;
  const preloadedWeapon = DEBUG ? Number(params.get("weapon")) : 0;
  const preloadedAmmo = DEBUG ? params.get("ammo") : null;
  const preloadedEquipment = preloadedWeapon === 1 || preloadedWeapon === 2 || preloadedAmmo === "unlimited"
    || preloadedAmmo !== null && preloadedAmmo.trim() !== "" && Number.isFinite(Number(preloadedAmmo));
  const preloadedJetpack = DEBUG && (params.get("jetpack") === "1" || !!preloadedPose?.character && preloadedPose.jetpack);
  const preloadedJetpackWear = preloadedJetpack && preloadedView !== "underground" && preloadedView !== "basement";
  const POSITION_DEBUG = DEBUG && params.get("pos") !== "0";
  const islandLatitude = Number.isFinite(latitudeParam) ? Math.max(-66, Math.min(66, latitudeParam)) : daylight.ISLAND_LATITUDE_DEG;
  // MEADOW/RADIUS are island measures owned by terrain.js; keep them in sync.
  const MEADOW = 22, RADIUS = 30;
  const PITCH_MIN = 0.2, PITCH_MAX = 1.25, DIST_MIN = 3.5, DIST_MAX = 64, BIRDS_EYE_MIN = 21;
  const CLEARANCE = 1.5;
  const PILE_VIEW = { yaw: Number.isFinite(yawParam) ? yawParam : 0, pitch: 0.62, dist: 24, target: { x: 0, y: 0.6, z: 0 } };
  // GATE_VIEW.target.y is a placeholder; the real height is set at enter.
  const GATE_VIEW = { yaw: 0, pitch: 0.32, dist: 18, target: { x: 0, y: 0, z: -(RADIUS - 2) } };
  const mouthView = (m) => ({ yaw: m.ry, pitch: 0.3, dist: 18, target: { x: m.x, y: 1.5, z: m.z } });
  const NAVIGATION = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, dist: 6 };
  const NAVIGATION_OFFSETS = [0, -0.75, 0.75, -1.5, 1.5];
  const ENTER_DIST = 10, ENTER_DUR = 0.45;
  const FLY = { speed: 6, perDist: 0.5, climb: 6, yMin: -8, yMax: JET_RISE * JET_FUEL_SECONDS + 16 }, FLY_BOUND = RADIUS + JET_SPEED * JET_MOVE_SECONDS + 8;
  // ABYSS_FLOOR is an unseen support that keeps hop integration finite until the visible abyss fall ends.
  const ABYSS_FLOOR = -120, ABYSS_RESPAWN_Y = -60;
  const FOLLOW = { y: 0.9, min: 4, max: 10, pitch: [0.25, 0.8] };
  // Close view sits at an average Ooga eye; first person sits at the face surface.
  // Looking down then clears the hidden head. Portal ownership stays with the Ooga, not this offset.
  const CLOSE_VIEW = { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 6, orbitDist: 6 };
  const STEP_MAX = pilotMod.WALK.step;
  const MAGAZINE_REACH = 0.7, MAGAZINE_SCALE = 2.4;
  // LAUNCH_REACH/RALLY_REACH include room around the kart plinth and the plane's wings.
  const RALLY_REACH = 3.2, LAUNCH_REACH = 4, RALLY_KART_Z = -3.6;
  const MATRIX_TYPES = 8;
  const MATRIX_RAIN_GAP = 0.19;
  const MATRIX_SURFACE_PITCH = 0.12, MATRIX_SURFACE_GAP = 0.13, MATRIX_GLYPH_HZ = 20;
  const MATRIX_PIXEL_PITCH = 0.021, MATRIX_PIXEL_SIZE = 0.016;
  const MATRIX_STREAM_SPEED_MIN = 0.56, MATRIX_STREAM_SPEED_RANGE = 0.64;
  const MATRIX_TRAIN_MIN = 7, MATRIX_TRAIN_RANGE = 6, MATRIX_TRAIN_GAP_MIN = 2, MATRIX_TRAIN_GAP_RANGE = 5;
  const MATRIX_WORLD_SPEED = 72, MATRIX_WORLD_MAX = RADIUS + 8, MATRIX_FRONT_WIDTH = 1.5, MATRIX_GLYPH_REACH = 0.16;
  const MATRIX_MIRROR_HEIGHT = 3.25;
  const MATRIX_GATE_HIDDEN_Y = 3.2, MATRIX_GATE_SPEED = 3.2, MATRIX_BUTTON_REACH = 3.4, MATRIX_BUTTON_USE_REACH = 2.2;
  const MIRROR_GATE_Z = 0.28;
  // Breaking the mirror enables a local release; its gate starts locked down.
  const MIRROR_GATE_CLOSED = true;
  const MATRIX_WORLD = { active: 0, direction: 0, radius: 0, time: 0, density: 1, speed: MATRIX_WORLD_SPEED, retreatSpeed: MATRIX_WORLD_SPEED, maxRadius: MATRIX_WORLD_MAX, permanentCave: 0, permanentPlane: new Float32Array(4), permanentAperture: new Float32Array(4), livingGlobal: 0, origin: new Float32Array([0, 0, 0]), caves: new Float32Array(8 * 4), caveBounds: new Float32Array(8 * 4), caveNear: 0 };
  // WebGL quality may reduce effects and resolution, but it must not remove whole Matrix lanes:
  // the black backing turns adjacent omitted lanes into conspicuous missing wall panels.
  const MATRIX_DENSITY = { high: 8, medium: 8, low: 8, canvas2d: 1 };
  const PORTAL_Z = 0.5, PORTAL_MIN_X = -2.48, PORTAL_MAX_X = 2.48, PORTAL_MIN_Y = 0, PORTAL_MAX_Y = 2.98;
  // RENDER_OPTS sky, light and lamp values are resampled from the clock every frame.
  const RENDER_OPTS = {
    clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3),
    light: { x: 0.55, y: 0.78, z: -0.25 }, sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, celestialPole: { x: 0, y: Math.sin(20 * DEG), z: -Math.cos(20 * DEG) }, starMatrix: new Float32Array(9),
    stars: 0, torch: 0, day: 1, twilight: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, sunStrength: 1, moonStrength: 0, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002, outdoorDarkestSurfaceEstimate: 0.34, activeLightSource: "sun", latitude: 20, dayOfYear: 172, continuousDay: 171.5, solarDeclination: 0, siderealAngle: 0, sunAltitude: 90, sunAzimuth: 180, moonAltitude: -90, moonAzimuth: 0, sunriseHour: 6, sunsetHour: 18,
    time: 0, bloomStrength: 0.5, lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 34, matrix: MATRIX_WORLD, sea: -70, cutawayMaxY: 1e6, birdsEyeCutaway: false, cutawayFade: 0, cutawayRockMix: 0, cutawayRegions: [], cutawayRegionCount: 0, cutawayCloudY: 0, cutawayCloudMix: 0
  };
  let viewPoseActor = null;
  RENDER_OPTS.beforeView = () => {
    const cave = pilot?.player;
    if (!cave || !crew || !cave.weapon.equipped || !cave.weapon.aiming || cave.gunSightMix <= 0) return null;
    viewPoseActor = cave;
    crew.poseWeapon(cave, camera, cave.gunSightMix);
    return cave;
  };
  RENDER_OPTS.afterView = () => {
    if (!viewPoseActor) return;
    crew.poseWeapon(viewPoseActor);
    viewPoseActor = null;
  };
  RENDER_OPTS.starMatrix[0] = RENDER_OPTS.starMatrix[4] = RENDER_OPTS.starMatrix[8] = 1;
  const DAYLIGHT_DEBUG = {
    sunDirection: RENDER_OPTS.sunDirection, moonDirection: RENDER_OPTS.moon, celestialPole: RENDER_OPTS.celestialPole,
    hour: 12, continuousDay: 171.5, phase: "noon", latitude: 20, dayOfYear: 172, solarDeclination: 0, siderealAngle: 0, sunAltitude: 90, sunAzimuth: 180, moonAltitude: -90, moonAzimuth: 0,
    daylightFactor: 1, twilightFactor: 0, starFactor: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, moonStrength: 0, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002, outdoorDarkestSurfaceEstimate: 0.34, activeLightSource: "sun", sunriseHour: 6, sunsetHour: 18
  };
  // Mirrored out of RENDER_OPTS for __ooga only, so it stays off the shipped frame path.
  const syncDaylightDebug = (hour) => {
    DAYLIGHT_DEBUG.hour = hour;
    DAYLIGHT_DEBUG.continuousDay = RENDER_OPTS.continuousDay;
    DAYLIGHT_DEBUG.phase = phase;
    DAYLIGHT_DEBUG.latitude = RENDER_OPTS.latitude;
    DAYLIGHT_DEBUG.dayOfYear = RENDER_OPTS.dayOfYear;
    DAYLIGHT_DEBUG.solarDeclination = RENDER_OPTS.solarDeclination;
    DAYLIGHT_DEBUG.siderealAngle = RENDER_OPTS.siderealAngle;
    DAYLIGHT_DEBUG.sunAltitude = RENDER_OPTS.sunAltitude;
    DAYLIGHT_DEBUG.sunAzimuth = RENDER_OPTS.sunAzimuth;
    DAYLIGHT_DEBUG.moonAltitude = RENDER_OPTS.moonAltitude;
    DAYLIGHT_DEBUG.moonAzimuth = RENDER_OPTS.moonAzimuth;
    DAYLIGHT_DEBUG.daylightFactor = RENDER_OPTS.day;
    DAYLIGHT_DEBUG.twilightFactor = RENDER_OPTS.twilight;
    DAYLIGHT_DEBUG.starFactor = RENDER_OPTS.stars;
    DAYLIGHT_DEBUG.lampFactor = RENDER_OPTS.lampFactor;
    DAYLIGHT_DEBUG.directStrength = RENDER_OPTS.directStrength;
    DAYLIGHT_DEBUG.directionalLightStrength = RENDER_OPTS.directionalLightStrength;
    DAYLIGHT_DEBUG.moonStrength = RENDER_OPTS.moonStrength;
    DAYLIGHT_DEBUG.ambientFloor = RENDER_OPTS.ambientFloor;
    DAYLIGHT_DEBUG.diffuseFloor = RENDER_OPTS.diffuseFloor;
    DAYLIGHT_DEBUG.shadowStrength = RENDER_OPTS.shadowStrength;
    DAYLIGHT_DEBUG.shadowFloor = RENDER_OPTS.shadowFloor;
    DAYLIGHT_DEBUG.shadowBias = RENDER_OPTS.shadowBias;
    DAYLIGHT_DEBUG.outdoorDarkestSurfaceEstimate = RENDER_OPTS.outdoorDarkestSurfaceEstimate;
    DAYLIGHT_DEBUG.activeLightSource = RENDER_OPTS.activeLightSource;
    DAYLIGHT_DEBUG.sunriseHour = RENDER_OPTS.sunriseHour;
    DAYLIGHT_DEBUG.sunsetHour = RENDER_OPTS.sunsetHour;
  };
  const PHASE_TOASTS = { dawn: "Dawn breaks over the island", morning: "Morning on the island", noon: "High noon", dusk: "Dusk settles over the island", night: "Night. The torches are lit.", midnight: "Midnight. The island sleeps." };
  // Lamp colours and reach; a lamp's flame reads through node.glow.
  const LAMP = { torch: { r: 1.0, g: 0.62, b: 0.25, radius: 6, glow: 0.85, hide: false }, fire: { r: 1.0, g: 0.55, b: 0.2, radius: 9, glow: 0.9, hide: true }, lantern: { r: 1.0, g: 0.8, b: 0.45, radius: 4, glow: 0.9, hide: false } };
  const LIGHT_CAPACITY = BL.glRenderer.POINT_LIGHT_CAPACITY;
  const LIGHTING_DEBUG = {
    registeredLampCount: 0, activeFullLightCount: 0, approximatedLightCount: 0,
    configuredLightCapacity: LIGHT_CAPACITY, selectedCount: 0, approximatedCount: 0,
    tier: "high", selectedIds: new Array(LIGHT_CAPACITY).fill(null), approximatedIds: new Array(LIGHT_CAPACITY).fill(null)
  };
  const LAMP_STAGGER = 0.12, LAMP_RAMP = 0.4, LAMP_OFF = 0.12;
  const CAVE_TORCH_GAP = 0.12;
  const FIRE_DEGREES = [130, 125, 135, 120, 140, 115, 145], FIRE_RADIUS = 11.5, FIRE_SEATS = 6, FIRE_SEAT_RADIUS = 1.8;
  const FIRE_CONTACT_RADIUS = 0.65, FIRE_AVOID_RADIUS = 1.25, FIRE_BOTTOM = 0.12, FIRE_TOP = 0.85;
  const NIGHT = 0.5, FIRE_SEAT_CHANCE = 0.5;
  // Clock-face degrees to a meadow point: 0 is -z (far), 90 is +x (right).
  const polar = (deg, r) => ({ x: Math.sin(deg * DEG) * r, z: -Math.cos(deg * DEG) * r });
  const BUILD_DEGREES = [12, 40, 66, 80, 102, 165, 195, 212, 282, 297, 312, 340];
  const BUILD_RADIUS = 13;
  const NUDGES = [0, -2, 2, -4, 4, -6, 6, -8, 8];
  const PATH_GEOMETRY = new WeakMap();
  const TIMECHAIN_NEAR = 25, TIMECHAIN_OUTER_PERIOD = 180;
  const DRESSED = new WeakMap();
  const DRESSING_LAMPS = BL.dressing.LIGHT_RGB.map(([r, g, b]) => ({ r, g, b, radius: 5.5, glow: 0.9, hide: false }));
  const dressingLights = [];
  const PILE_SCALE = 0.45;
  // How tall a remote visitor's Ooga stands for the crew's walkers (`outsideActorHeight`).
  const REMOTE_BODY_HEIGHT = 2.2;
  const SCENERY_CLEARANCE = 0.25;
  const OBL_REPO = "oogaboogax/oogaboogaland";
  const MEADOW_INNER = 5, MEADOW_OUTER = MEADOW - 1.5, CLIFF_INNER = MEADOW + 1.5, CLIFF_OUTER = RADIUS - 1;
  const DOCK_DEG = 105, LADDER_Z = -3.6, LADDER_LEAN = 0.65;
  const CLOUD_COUNT = 30, CLOUD_WRAP = 60, CLOUD_NEAR = 36;
  const CLOUD_GAP = 0.35, CLOUD_LOOK = 36, CLOUD_PLAN_STEP = 2;
  const CLOUD_SIDE_RATE = 0.7, CLOUD_RISE_RATE = 0.55;
  const CLOUD_SIDE_OFFSETS = [0, -7, 7, -14, 14, -24, 24];
  const CLOUD_HEIGHT_OFFSETS = [0, -6, 6, -12, 12];
  const WANDER_COUNT = 36, WANDER_INNER = 5.5;
  const ALTAR_HEIGHT = 0.34, ALTAR_BLOCK_WIDTH = 0.2, ALTAR_BLOCK_ARC = 0.3, ALTAR_RING_GAP = 0.02, ALTAR_MAX_BLOCKS = 512;
  const RIPEN = 25, TREE_CHANCE = 0.5, BUSH_CHANCE = 0.25;
  const PROP_TIPS = { tree: "Tree · shake it", bush: "Bush · rustle it", rock: "Rock · hit to break", crate: "Box · hit to break", barrel: "Barrel · hit to break", flower: "Flowers", torch: "Torch · warm", firepit: "Fire pit", bedroll: "Somebody's bed", ladder: "Ladder · wobbly", dock: "Dock · creaky", magazine: "Spare magazine · walk into it to collect", plane: "Ooga Drop · tap to fly", sign: "Ooga Drop · the plane flies from here", launchpad: "Ooga Orbit · tap to build a rocket", rocket: "Ooga Orbit · tap to fly", tower: "Launch tower · steady", orbitsign: "Ooga Orbit · the pad past the bridge", bridge: "Rope bridge · to the launch pad", poolbridge: "Vine bridge · to the Mempool island", poolstair: "The Mempool · tap to climb down", poolsign: "The Mempool · the cave reads the chain", chainsign: "The chain, at a glance · tap to read it", weathersign: "Reading the weather · tap for the key", poolrock: "Mossy rock", poolfern: "Fern · rustle it", poollog: "Fallen log · something lives in it", jaguar: "Jaguar · do not poke", monkey: "Monkey · it watches you", toucan: "Toucan · big beak", canopy: "Rainforest tree · shake it", windsock: "Windsock · a fair wind", jumbotron: "Jumbotron · OogaBoogaX on the big screen · tap the screen for a close-up", palm: "Palm · shake it", gate: null };
  const RETICLE_PROPS = new Set(["tree", "bush", "rock", "crate", "barrel", "flower", "torch", "firepit", "ladder", "plane", "sign", "launchpad", "rocket", "tower", "orbitsign", "poolstair", "poolsign", "chainsign", "weathersign", "poolfern", "poollog", "jaguar", "monkey", "toucan", "canopy", "jumbotron", "palm", "timechainentrance", "timechainboard", "timechainchair", "timechainbeer"]);
  const workCave = (slot) => slot.repo && (slot.status === "open" || slot.status === "mirror")
    && (slot.repo !== OBL_REPO || slot.status === "mirror");
  const MATRIX_LIVING_PROPS = new Set(["tree"]);
  const SOLID_PROPS = new Set(["tree", "rock", "crate", "barrel", "firepit", "dock", "jumbotron", "launchpad", "rocket", "tower", "bridge", "orbitsign", "poolbridge", "poolstair", "poolrock", "canopy"]);
  const BUSH_WORDS = ["Something rustles.", "A beetle. Ooga leaves it.", "Just a bush."];
  const PALM_WORDS = ["Coconuts. Ooga wanted bananas.", "A coconut thuds down. Ooga dodges.", "The fronds swish."];
  const LEAF = models.particleGeometry("#4a8530", 0.12, 0);
  const PETALS = ["#e04a3a", "#f2c94c", "#f3efe4"].map((c) => models.particleGeometry(c, 0.09, 0));
  const CHIP = models.particleGeometry("#6b625a", 0.1, 0);
  const SPARK = models.particleGeometry("#ffb13b", 0.08, 1);
  const DUST = models.particleGeometry("#a3874f", 0.1, 0);
  // Fireworks reuse the board's own stat colors, fully emissive so they read at night.
  const FIREWORK = ["#46ff70", "#3fd1c5", "#6f9fca", "#f5c542", "#e04a3a"].map((c) => models.particleGeometry(c, 0.11, 1));
  const FIRE_VIEW = { coverage: 0, ember: 0, soot: 0 };
  const FIRE_SPECKS = new Float32Array(96 * 4);
  {
    const random = mulberry32(fnv1a("first-person-fire"));
    for (let i = 0; i < FIRE_SPECKS.length; i += 4) {
      FIRE_SPECKS[i] = random();
      FIRE_SPECKS[i + 1] = random();
      FIRE_SPECKS[i + 2] = 0.0025 + random() * 0.009;
      FIRE_SPECKS[i + 3] = 0.35 + random() * 0.65;
    }
  }
  // Where eaters arrive from away
  const WALK_IN = { x: 0, z: -(MEADOW + 0.5) };
  const TICKER_AT = { x: 0, y: 0, z: -(RADIUS - 2) };
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  const mark = (name) => {
    performance.clearMarks(`ooga:${name}`);
    performance.mark(`ooga:${name}`);
  };

  // One visit's state: created in enter, dropped in leave.
  let jumbotronSpot, oogatronUnsub, renderer, game, world, go, lootEnabled, testBananas, root, camera, overlayCanvas, island, terrainRampRoof, pathNode, altar, hud, hooks, input, pilot, fx, cameraCover, bananaCover, solids, rockGuides, objectGuides, sightGuides, bananaGuides, pileGuides, platformGuides, mirrorGuides, pile, crew, remotes, pileSound, crates, critters, clock, presets, entering, mirrorCave, matrixCave, matrixControl, gateRain, fire, headquarters, dockStairs, jumbotron, positionDebug, pitGate;
  let magazine, magazineState, breakables, clankers, clankerPlay, clankerMeshes, clankerPartOwners, entropyLab;
  const clankerEquipment = [];
  const terrainSections = [], caveSections = [];
  // Above the island and its cave roofs; never interpolate from the renderer's
  // infinite/no-cut sentinel or the scan would happen only in its last frame.
  const CUTAWAY_TOP = 16, CUTAWAY_REGION_CAP = 8;
  const CUTAWAY_RAMP_START = 0.12, CUTAWAY_RAMP_END = 0.88;
  const CUTAWAY_FLOOR_RATE = 56, CUTAWAY_FLOOR_DEADBAND = 0.015;
  let cutawayHeight = NaN, cutawayFeet = 0, cutawayPlayer = null;
  let cutawayX = 0, cutawayZ = 0, cutawayHeadY = 0, cutawayHill = false;
  let cutawayProgress = NaN, cutawayLevel = 0, cutawayHillMix = 0;
  let cutawayTravelRamp = null, cutawayTravelChannel = -1, cutawayTravelStation = 0;
  const CUTAWAY_PATH_STATE = { lo: new Uint16Array(4), hi: new Uint16Array(4), mix: new Float32Array(4), windowMix: new Float32Array(2), active: 0, version: 1 };
  const cutawayHiddenNodes = [];
  const addTerrainSection = (source, parent, worldY = 0, region = null, sections = region ? caveSections : terrainSections) => {
    const cap = BL.terrainCutaway.create(source, renderer.releaseGeometry);
    addChild(parent, cap.node);
    const entry = { cap, worldY, region, targetY: region ? region.y : 0, paths: !region && !!source.cutawayPaths };
    sections.push(entry);
    return entry;
  };
  const cutawayHeightAt = (x, z) => {
    let y = RENDER_OPTS.cutawayMaxY;
    for (let i = 0; i < Math.min(CUTAWAY_REGION_CAP, RENDER_OPTS.cutawayRegionCount); i++) {
      const r = RENDER_OPTS.cutawayRegions[i], dx = x - r.x, dz = z - r.z;
      if (Math.abs(dx * r.cos - dz * r.sin) < r.halfWidth && Math.abs(dx * r.sin + dz * r.cos) < r.halfDepth) y = Math.min(y, r.y);
    }
    const paths = island?.cutawayPaths;
    if (paths) {
      const gx = Math.floor((x - paths.origin.x) / paths.unit), gz = Math.floor((z - paths.origin.z) / paths.unit);
      if (gx >= 0 && gz >= 0 && gx < paths.width && gz < paths.height) {
        const cell = gx * paths.height + gz, key = paths.keys[cell];
        for (let channel = 0; channel < 4; channel++) {
          const station = key >>> (channel * 8) & 255, mix = CUTAWAY_PATH_STATE.mix[channel];
          if (station && mix > 0 && station >= CUTAWAY_PATH_STATE.lo[channel] && station <= CUTAWAY_PATH_STATE.hi[channel]) {
            y = Math.min(y, lerp(CUTAWAY_TOP, paths.bottoms[cell], mix));
          }
        }
      }
    }
    return y;
  };
  const cutawayPathsActive = () => CUTAWAY_PATH_STATE.mix[0] > 0 || CUTAWAY_PATH_STATE.mix[1] > 0
    || CUTAWAY_PATH_STATE.mix[2] > 0 || CUTAWAY_PATH_STATE.mix[3] > 0;
  const cutawayActorY = (region, y) => {
    const dx = cutawayX - region.x, dz = cutawayZ - region.z;
    return Math.abs(dx * region.cos - dz * region.sin) < region.halfWidth + PLAYER_RADIUS && Math.abs(dx * region.sin + dz * region.cos) < region.halfDepth + PLAYER_RADIUS
      ? Math.max(y, cutawayHeadY) : y;
  };
  const clearCutawayHidden = () => {
    for (let i = 0; i < cutawayHiddenNodes.length; i++) {
      const node = cutawayHiddenNodes[i];
      node.cameraHidden = node.cutawayCameraHidden;
      node.cutawayWholeHidden = false;
    }
    cutawayHiddenNodes.length = 0;
  };
  const hideForCutaway = (node) => {
    if (node.cutawayWholeHidden) return;
    node.cutawayCameraHidden = node.cameraHidden;
    node.cutawayWholeHidden = true;
    node.cameraHidden = true;
    cutawayHiddenNodes.push(node);
  };
  const nodeCrossesCutaway = (node) => {
    if (!node.visible) return false;
    const geometry = node.geometry, w = node.world;
    if (geometry && !geometry.cutawayPreserve) {
      const bounds = BL.scene.boundsOf(geometry), low = bounds.min, high = bounds.max;
      const lx = (low[0] + high[0]) * 0.5, ly = (low[1] + high[1]) * 0.5, lz = (low[2] + high[2]) * 0.5;
      const hx = (high[0] - low[0]) * 0.5, hy = (high[1] - low[1]) * 0.5, hz = (high[2] - low[2]) * 0.5;
      const cx = w[0] * lx + w[4] * ly + w[8] * lz + w[12], cz = w[2] * lx + w[6] * ly + w[10] * lz + w[14];
      const rx = Math.abs(w[0]) * hx + Math.abs(w[4]) * hy + Math.abs(w[8]) * hz;
      const rz = Math.abs(w[2]) * hx + Math.abs(w[6]) * hy + Math.abs(w[10]) * hz;
      const cy = w[1] * lx + w[5] * ly + w[9] * lz + w[13];
      const ry = Math.abs(w[1]) * hx + Math.abs(w[5]) * hy + Math.abs(w[9]) * hz;
      let mayCross = cutawayPathsActive() || cy + ry > RENDER_OPTS.cutawayMaxY + 1e-6;
      for (let i = 0; !mayCross && i < Math.min(CUTAWAY_REGION_CAP, RENDER_OPTS.cutawayRegionCount); i++) {
        const r = RENDER_OPTS.cutawayRegions[i], dx = cx - r.x, dz = cz - r.z;
        const across = dx * r.cos - dz * r.sin, along = dx * r.sin + dz * r.cos;
        const acrossReach = Math.abs(r.cos) * rx + Math.abs(r.sin) * rz;
        const alongReach = Math.abs(r.sin) * rx + Math.abs(r.cos) * rz;
        mayCross = cy + ry > r.y + 1e-6 && Math.abs(across) < r.halfWidth + acrossReach && Math.abs(along) < r.halfDepth + alongReach;
      }
      if (!mayCross) {
        for (let i = 0; i < node.children.length; i++) if (nodeCrossesCutaway(node.children[i])) return true;
        return false;
      }
      const vertices = geometry.verts;
      for (let i = 0; i < vertices.length; i += 3) {
        const x = w[0] * vertices[i] + w[4] * vertices[i + 1] + w[8] * vertices[i + 2] + w[12];
        const y = w[1] * vertices[i] + w[5] * vertices[i + 1] + w[9] * vertices[i + 2] + w[13];
        const z = w[2] * vertices[i] + w[6] * vertices[i + 1] + w[10] * vertices[i + 2] + w[14];
        if (y > cutawayHeightAt(x, z) + 1e-6) return true;
      }
    }
    for (let i = 0; i < node.children.length; i++) if (nodeCrossesCutaway(node.children[i])) return true;
    return false;
  };
  const hideNodeIfCut = (node) => {
    updateWorld(node, node.parent?.world || null);
    if (nodeCrossesCutaway(node)) hideForCutaway(node);
  };
  const updateCutawayWholeVisibility = () => {
    // Props and actors disappear as one object on the first frame that either
    // the global floor scan or a local aperture would remove their top.
    if (!RENDER_OPTS.birdsEyeCutaway || RENDER_OPTS.cutawayMaxY >= 1e5 && !RENDER_OPTS.cutawayRegionCount && !cutawayPathsActive()) return;
    for (let i = 0; i < crew.list.length; i++) hideNodeIfCut(crew.list[i].root);
    for (let i = 0; i < props.length; i++) hideNodeIfCut(props[i].node);
    for (let i = 0; i < crates.list.length; i++) hideNodeIfCut(crates.list[i].node);
    for (let i = 0; i < clankers.list.length; i++) hideNodeIfCut(clankers.list[i].root);
    for (let i = 0; i < clankerEquipment.length; i++) hideNodeIfCut(clankerEquipment[i].node);
    for (let i = 0; i < headquarters.mattresses.length; i++) hideNodeIfCut(headquarters.mattresses[i].node);
    for (let i = 0; i < headquarters.roomSigns.length; i++) hideNodeIfCut(headquarters.roomSigns[i].node);
    hideNodeIfCut(headquarters.firepit);
    if (pitGate) for (const control of pitGate.controls) hideNodeIfCut(control.root);
    if (matrixControl?.button) hideNodeIfCut(matrixControl.button);
    for (let i = 0; i < crew.list.length; i++) {
      const drops = crew.list[i].stunGear.drops;
      for (let j = 0; j < drops.length; j++) if (drops[j].active && drops[j].node) hideNodeIfCut(drops[j].node);
    }
    if (magazine?.node) hideNodeIfCut(magazine.node);
  };
  const CLANKER_FIRE = [models.particleGeometry("#ff8a2a", 0.18, 1), models.particleGeometry("#ffc148", 0.16, 1)];
  const CLANKER_SMOKE = models.particleGeometry("#70685f", 0.2, 0);
  const CLANKER_HIT = { node: null, owner: null, type: "none", distance: Infinity, x: 0, y: 0, z: 0 };
  const clankerGroundTarget = (owner) => owner.kind === "prop" && (owner.prop === "crate" || owner.prop === "barrel" || owner.prop === "rock");
  const CLANKER_CAVITY = { floor: 0, ceiling: 0, caveIndex: 0 };
  const JETPACK_HUD_STATE = { owned: false, equipped: false, fuel: 1, blocked: false };
  let enteringTween = null, pitDeparting = false, pitArrival = null;
  const pitArrivalPoint = { x: 0, y: 0, z: 0 };
  const pitPrevious = { x: 0, y: 0, z: 0 };
  let stateTimer = 0, hintTimer = 0, meterTimer = 0, now = 0, hour = 12, unsubscribeActivity = null, unsubscribeAccount = null, ownOogaClaimed = false;
  let weather = null, unsubscribeMempool = null, unsubscribeChain = null, mempoolIsland = null, timechainIsland = null;
  // The two boards across the hole from the vine bridge, one reading the chain and one reading the
  // weather. Each holds its canvas, its panel node and the reading it last drew, so a snapshot saying
  // nothing new replaces no geometry.
  let chainSign = null;
  // The rainforest animals, by node, so a poke finds the one that was tapped.
  const beasts = new Map();
  const BEAST_CRIES = {
    jaguar: ["RRAAWR!", "*low growl*", "GRRR..."],
    monkey: ["OOK OOK!", "EEE EEE!", "*chatters*"],
    toucan: ["SQUAWK!", "KRRK-KRRK!", "*clacks beak*"]
  };
  let positionDebugNext = 0, positionDebugJSON = "";
  function createPositionPose() {
    return { version: 1, character: "", mode: "detached", closeWanted: false, combat: false, birdsEyeNorthUp: false, position: [0, 0, 0], target: [0, 0, -1], direction: [0, 0, -1], up: [0, 1, 0], fov: 48 * Math.PI / 180,
      actor: [0, 0, 0], body: [0, 0, 0], head: [0, 0, 0], bodyQuaternion: [0, 0, 0, 1], headQuaternion: [0, 0, 0, 1], bodyRolled: false, headRolled: false,
      orbit: [0, 0.62, 6, 0, 0, 0], headOffset: [0, 0, 0], headOrbit: false, shoulderSide: 0.6, closeMix: 0, ads: 0,
      selectedSlot: 1, ammo: 30, unlimited: false, magazines: [0, 0], magazineCount: 0, aimYaw: 0, aimPitch: 0, jetpack: false, fuel: 1, hop: 0, hopV: 0, lift: 0 };
  }
  function readPositionPose(value) {
    if (!value || value.length > 8192) return null;
    let data;
    try { data = JSON.parse(value); } catch { return null; }
    if (!data || data.version !== 1 || !["carry", "shoulder", "first-person", "orbit", "birds-eye", "detached", "eye-level"].includes(data.mode)) return null;
    if (data.closeWanted === undefined) data.closeWanted = data.mode === "first-person" || data.mode === "eye-level" || data.mode === "detached" && data.closeMix >= 0.5;
    // Replay URLs written before combat/birds-eye remain readable at this boundary.
    if (data.combat === undefined) data.combat = data.battle ?? (data.mode === "shoulder" || data.mode === "first-person" || data.mode === "birds-eye");
    if (data.birdsEyeNorthUp === undefined) data.birdsEyeNorthUp = false;
    const pose = createPositionPose();
    for (const key of Object.keys(pose)) {
      const supplied = data[key], target = pose[key];
      if (Array.isArray(target)) {
        if (!Array.isArray(supplied) || supplied.length !== target.length || !supplied.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100000)) return null;
        for (let i = 0; i < target.length; i++) target[i] = supplied[i];
      } else if (typeof target === "number") {
        if (!Number.isFinite(supplied) || Math.abs(supplied) > 100000) return null;
        pose[key] = supplied;
      } else if (typeof supplied !== typeof target) return null;
      else pose[key] = supplied;
    }
    // Projection fields are optional for older replay URLs.
    if (data.orthoMix !== undefined) {
      if (!Number.isFinite(data.orthoMix)) return null;
      pose.orthoMix = clamp(data.orthoMix, 0, 1);
    }
    if (data.orthoHeight !== undefined) {
      if (!Number.isFinite(data.orthoHeight) || data.orthoHeight < 0 || data.orthoHeight > 1000) return null;
      pose.orthoHeight = data.orthoHeight;
    }
    if (pose.character.length > 80 || pose.fov <= 0.05 || pose.fov >= Math.PI || pose.orbit[2] <= 0 || pose.orbit[2] > 200) return null;
    if (Math.hypot(...pose.up) < 0.001 || Math.hypot(...pose.bodyQuaternion) < 0.001 || Math.hypot(...pose.headQuaternion) < 0.001) return null;
    const dx = pose.target[0] - pose.position[0], dy = pose.target[1] - pose.position[1], dz = pose.target[2] - pose.position[2];
    if (Math.hypot(dx, dy, dz) < 0.001 || Math.hypot(dy * pose.up[2] - dz * pose.up[1], dz * pose.up[0] - dx * pose.up[2], dx * pose.up[1] - dy * pose.up[0]) < 1e-6) return null;
    for (const rotation of [pose.bodyQuaternion, pose.headQuaternion]) { const length = Math.hypot(...rotation); for (let i = 0; i < 4; i++) rotation[i] /= length; }
    pose.closeMix = clamp(pose.closeMix, 0, 1); pose.ads = clamp(pose.ads, 0, 1); pose.fuel = clamp(pose.fuel, 0, 1);
    pose.ammo = clamp(Math.floor(pose.ammo), 0, 30); pose.magazineCount = clamp(Math.floor(pose.magazineCount), 0, 2);
    return pose;
  }
  const POSITION_POSE = createPositionPose();
  const positionText = value => value.map(n => n.toFixed(5)).join(",");
  let phase = null;
  const updatePositionDebug = (force = false) => {
    if (!positionDebug || !camera || !pilot) return;
    pilot.capturePose(POSITION_POSE);
    const p = camera.position, t = camera.target, up = camera.up;
    const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
    const inverseLength = 1 / Math.max(1e-12, Math.hypot(dx, dy, dz));
    POSITION_POSE.position[0] = p.x; POSITION_POSE.position[1] = p.y; POSITION_POSE.position[2] = p.z;
    POSITION_POSE.target[0] = t.x; POSITION_POSE.target[1] = t.y; POSITION_POSE.target[2] = t.z;
    POSITION_POSE.direction[0] = dx * inverseLength; POSITION_POSE.direction[1] = dy * inverseLength; POSITION_POSE.direction[2] = dz * inverseLength;
    POSITION_POSE.up[0] = up ? up.x : 0; POSITION_POSE.up[1] = up ? up.y : 1; POSITION_POSE.up[2] = up ? up.z : 0;
    POSITION_POSE.fov = camera.fov;
    const json = JSON.stringify(POSITION_POSE);
    if (!force && json === positionDebugJSON) return;
    positionDebugJSON = json;
    positionDebug.dataset.pose = json;
    positionDebug.dataset.copied = "false";
    const pose = POSITION_POSE, first = pose.mode === "first-person";
    positionDebug.textContent = `${pose.character || "free camera"} · mode=${pose.mode}${pose.character ? ` · ${pose.combat ? "combat" : "carry"} · weapon=${pose.selectedSlot} ammo=${pose.unlimited ? "unlimited" : pose.ammo}` : ""}`
      + (pose.character ? `\npos=${positionText(pose.actor)}\nbody=${positionText(pose.body)}  head=${positionText(pose.head)} (rad)` : "")
      + (first ? "" : `\ncamera=${positionText(pose.position)}`)
      + `\nlook=${positionText(pose.target)}  dir=${positionText(pose.direction)}`
      + `\n${pilot.poseHeld ? "Restored pose · move/look to resume · " : ""}click to copy exact replay URL`;
  };
  const copyPositionDebug = () => {
    updatePositionDebug(true);
    const url = new URL(location.href);
    for (const key of ["pos", "body", "head", "camera", "look", "mode", "combat", "battle", "firstperson", "weapon", "ammo", "view", "jetpack", "mag"]) url.searchParams.delete(key);
    url.searchParams.set("debug", "1");
    if (POSITION_POSE.character) url.searchParams.set("character", POSITION_POSE.character);
    else url.searchParams.delete("character");
    url.searchParams.set("pose", positionDebugJSON);
    const value = url.href;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).catch(() => {});
    else {
      const field = document.createElement("textarea");
      field.value = value;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    positionDebug.dataset.copied = "true";
    positionDebug.blur();
  };
  const restorePositionDebug = () => {
    if (!DEBUG) return;
    const vector = key => {
      const value = params.get(key);
      if (!value || value.length > 100) return null;
      const parts = value.split(",");
      if (parts.length !== 3 || parts.some(part => !part.trim())) return null;
      const numbers = parts.map(Number);
      return numbers.every(n => Number.isFinite(n) && Math.abs(n) <= 10000) ? numbers : null;
    };
    const position = vector("pos"), body = vector("body"), head = vector("head");
    let eye = vector("camera"), look = vector("look");
    const mode = ["carry", "shoulder", "first-person", "orbit", "birds-eye", "detached", "eye-level"].includes(preloadedMode) ? preloadedMode : null;
    if (!preloadedPose && !position && !body && !head && !eye && !look && !mode && !params.has("combat") && !params.has("battle")) return;
    const pose = preloadedPose || pilot.capturePose(createPositionPose()), cave = pilot.player;
    const combatParam = params.get("combat") ?? params.get("battle");
    if (combatParam !== null) pose.combat = combatParam !== "0" && combatParam !== "false";
    if (preloadedPose && cave) {
      crew.configureWeapon(cave, pose.selectedSlot, pose.ammo, pose.unlimited);
      crew.removeMagazines(cave);
      for (let i = 0; i < pose.magazineCount; i++) crew.collectMagazine(cave);
      for (let i = 0; i < pose.magazineCount; i++) cave.weapon.spareAmmo[i] = clamp(Math.floor(pose.magazines[i]), 0, 30);
      if (cave.jet) cave.jetFuel = pose.fuel;
    }
    if (position && cave) {
      for (let i = 0; i < 3; i++) { const delta = position[i] - pose.actor[i]; pose.position[i] += delta; pose.target[i] += delta; pose.orbit[i + 3] += delta; pose.actor[i] = position[i]; }
    }
    if (body) { pose.body = body; pose.bodyRolled = false; }
    if (head) { pose.head = head; pose.headRolled = false; }
    const candidateEye = eye || pose.position, candidateLook = look || pose.target;
    const dx = candidateLook[0] - candidateEye[0], dy = candidateLook[1] - candidateEye[1], dz = candidateLook[2] - candidateEye[2];
    if (Math.hypot(dx, dy, dz) < 0.001) eye = look = null;
    else if (Math.hypot(dy * pose.up[2] - dz * pose.up[1], dz * pose.up[0] - dx * pose.up[2], dx * pose.up[1] - dy * pose.up[0]) < 1e-6) {
      // A manually requested vertical debug view needs a horizontal up axis.
      pose.up[0] = 0; pose.up[1] = Math.abs(dy) < Math.hypot(dx, dy, dz) * 0.9 ? 1 : 0; pose.up[2] = pose.up[1] ? 0 : 1;
    }
    if (eye) pose.position = eye;
    if (look && Math.hypot(look[0] - pose.position[0], look[1] - pose.position[1], look[2] - pose.position[2]) > 0.001) pose.target = look;
    if (mode) {
      pose.mode = mode;
      if (params.has("mode")) pose.closeWanted = mode === "first-person" || mode === "eye-level";
      if (mode === "birds-eye") {
        pose.combat = true;
        if (!preloadedPose && !eye && !look) pose.orbit[2] = BIRDS_EYE_MIN;
      }
    }
    if (!cave && (pose.mode === "carry" || pose.mode === "shoulder" || pose.mode === "first-person" || pose.mode === "birds-eye")) pose.mode = pose.mode === "first-person" ? "eye-level" : "detached";
    if (!preloadedPose) {
      pose.closeMix = pose.closeWanted ? 1 : 0;
      if (eye || look) {
        const dx = pose.position[0] - pose.target[0], dy = pose.position[1] - pose.target[1], dz = pose.position[2] - pose.target[2];
        pose.orbit[0] = Math.atan2(dx, dz); pose.orbit[1] = Math.atan2(dy, Math.hypot(dx, dz));
        pose.orbit[2] = Math.max(0.1, Math.hypot(dx, dy, dz));
        for (let i = 0; i < 3; i++) pose.orbit[i + 3] = pose.target[i];
      } else if (body || head) {
        pose.orbit[0] = pose.body[1] + pose.head[1] + Math.PI;
        if (pose.mode === "first-person" || pose.mode === "shoulder") pose.orbit[1] = pose.head[0];
      }
    }
    if (!preloadedPose || params.has("mode")) {
      pose.orthoMix = (pose.mode === "birds-eye" || pose.mode === "orbit" && pose.combat) ? 1 : 0;
      pose.orthoHeight = 2 * Math.tan(pose.fov / 2) * pose.orbit[2];
    }
    pilot.restorePose(pose, !!preloadedPose || !!eye || !!look);
    updatePositionDebug(true);
  };
  const placed = [];
  const targets = [];
  const claimed = [];
  const clouds = [];
  const cloudObstacles = [];
  let launchCloudSpot = null;
  const lamps = [];
  const entranceLights = [];
  const fireSeats = [];
  const fireHazards = [];
  const workZones = [];
  const closedCaveZones = [];
  const sleepers = [];
  const labels = [];
  const spots = [];
  const openMouths = [];
  const headquartersRimLintels = [];
  const launchers = [];
  const props = [];
  const scenery = [];
  const sceneryClaims = [];
  const matrixInteriors = [];
  const matrixGates = [];
  const sealedCaves = [];
  let sceneryVisible = 0, sceneryRadiusCulled = 0, sceneryPathCulled = 0, sceneryFixedCulled = 0, sceneryReflows = 0;
  const addTarget = (node, owner, opts) => {
    input.add(node, owner, opts);
    targets.push(node);
  };
  // Poking the set dressing. Every piece a baked set placed (`baked.picks`) gets a pick sphere on a node kept off
  // the scene graph, over one shared faceless geometry: never drawn, never baked into outlines or the GPU, and
  // released with the visit's other targets. `toWorld` maps a piece's set coordinates to the island, or null to
  // leave it out (the garage furniture inside a mouth belongs to the cave, not the facade).
  const PICK_GEOMETRY = { verts: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], faces: [], lines: [] };
  const addPieceTargets = (picks, toWorld) => {
    for (let i = 0; i < picks.length; i += 6) {
      const at = toWorld(picks[i + 2], picks[i + 3], picks[i + 4]);
      if (!at) continue;
      const node = createNode({ position: at, geometry: PICK_GEOMETRY });
      BL.scene.updateWorld(node);
      addTarget(node, { kind: "piece", piece: picks[i], variant: picks[i + 1], node, x: at.x, y: at.y, z: at.z, next: 0, weaponType: "none" }, { radius: Math.max(0.35, picks[i + 5]) });
    }
  };
  // What each piece says when poked: its tooltip, the particles it throws and the lines it answers with.
  const PIECES = {
    lanternPost: ["Lantern post", "spark", ["The lantern swings. Ooga squints.", "Warm glass. Ooga licks a finger."]],
    crate: ["Crate", "dust", ["Nailed shut. Ooga knocks anyway.", "Something rattles inside."]],
    coalCrate: ["Coal crate", "dust", ["Coal for the Lightning Factory.", "Ooga gets coal on its nose."]],
    dynamiteCrate: ["Dynamite · do not poke", "spark", ["DO NOT POKE. Ooga pokes.", "Fizz... phew."]],
    barrel: ["Barrel", "dust", ["Sloshes. Ooga drank half.", "Smells like banana brew."]],
    cart: ["Ore cart", "chip", ["The wheels squeak.", "Full of shiny rocks."]],
    rails: ["Mine rails", "chip", ["Clank."]],
    banner: ["Banner", "dust", ["The banner flaps.", "Ooga salutes the banner."]],
    tireStack: ["Tyres", "dust", ["Boing!", "Bouncy. Ooga bounces."]],
    flag: ["Flag", "dust", ["The flag snaps in the wind."]],
    cone: ["Cone", "dust", ["Boop.", "Ooga wears it as a hat. Briefly."]],
    barrier: ["Barrier", "chip", ["Solid. Don't crash into it."]],
    fuelPump: ["Fuel pump", "spark", ["Smells like banana fuel.", "Empty. The karts drank it all."]],
    startLights: ["Start lights", "spark", ["Red... amber... GO!"]],
    die: ["Big die · roll it", "dust", null],
    flaskBench: ["Flasks", "spark", ["Bubbles. Ooga does not drink it.", "It fizzes. Science!"]],
    terminal: ["Terminal", "spark", ["beep boop", "It prints random numbers. Ooga approves."]],
    chalkboard: ["Chalkboard", "dust", ["More entropy, more bananas.", "Ooga adds a doodle."]],
    pickRack: ["Pickaxes", "chip", ["Sharp. Ooga counts three picks."]],
    oreHeap: ["Ore heap", "chip", ["Shiny rocks!", "Ooga finds a glint of gold."]],
    monolith: ["Monolith", "spark", ["The glyphs hum.", "Cold stone. It watches back."]],
    runeStone: ["Rune stone", "spark", ["The rune glows at Ooga."]],
    coil: ["Coil · zap", "spark", ["ZAP!", "Ooga's fur stands on end."]],
    gauge: ["Gauge", "spark", ["The needle twitches.", "Pressure high. Ooga fine."]],
    rubble: ["Rubble", "chip", ["Loose rocks.", "Ooga kicks a pebble."]],
    sack: ["Sack", "dust", ["A sack of banana flour.", "Soft. Good pillow."]],
    bench: ["Log bench", "dust", ["A good log for sitting."]],
    vine: ["Vines", "leaf", ["The vines swing.", "Rustle rustle."]],
    boards: ["Boarded up · coming soon", "dust", ["Boarded up. Coming soon.", "Ooga peeks through a gap. Dark."]]
  };
  const PIECE_BURST = { spark: SPARK, dust: DUST, chip: CHIP, leaf: LEAF };
  const pokePiece = (o) => {
    if (now < o.next) return;
    o.next = now + 0.6;
    const words = PIECES[o.piece];
    if (!words) return;
    fx.burst(o.x, o.y, o.z, words[1] === "spark" ? 10 : 7, [PIECE_BURST[words[1]]], 1.3);
    // A throwaway roll: nothing rides on it, so Math.random is fine here.
    hud.toast(words[2] ? words[2][fnv1a(`${o.piece}/${Math.floor(now * 2)}`) % words[2].length] : `Ooga rolls the big die: ${1 + Math.floor(Math.random() * 6)}!`);
  };
  const clampDrag = (p) => {
    const max = island.meadowRadius - 0.5, r = Math.hypot(p.x, p.z);
    if (r > max) {
      p.x *= max / r;
      p.z *= max / r;
    }
    return p;
  };

  const buildMatrixPortal = (m) => {
    const cr = Math.cos(m.ry), sr = Math.sin(m.ry);
    return {
      inside: false, previousValid: false, previousX: 0, previousY: 0, previousZ: 0,
      lastCrossingDirection: "none",
      plane: { center: { x: m.x + sr * PORTAL_Z, y: m.floorY + 1.5, z: m.z + cr * PORTAL_Z }, normal: { x: sr, y: 0, z: cr } },
      opening: { minX: PORTAL_MIN_X, maxX: PORTAL_MAX_X, minY: PORTAL_MIN_Y, maxY: PORTAL_MAX_Y, planeZ: PORTAL_Z },
      rejected: { above: 0, below: 0, beside: 0 }
    };
  };
  const matrixModulo = (value, range) => value - Math.floor(value / range) * range;
  const matrixTravelDistance = (x, z, caveIndex = 0) => {
    if (!caveIndex) return Math.hypot(x - MATRIX_WORLD.origin[0], z - MATRIX_WORLD.origin[2]);
    const offset = (caveIndex - 1) * 4, descriptor = MATRIX_WORLD.caves;
    const depth = Math.max(0, descriptor[offset + 2] - x * descriptor[offset] - z * descriptor[offset + 1]);
    return Math.hypot(x + descriptor[offset] * depth - MATRIX_WORLD.origin[0], z + descriptor[offset + 1] * depth - MATRIX_WORLD.origin[2]) + depth;
  };
  const matrixCoverage = (x, z, caveIndex = 0) => {
    if (!MATRIX_WORLD.active) return 0;
    const amount = Math.max(0, Math.min(1, (MATRIX_WORLD.radius - matrixTravelDistance(x, z, caveIndex)) / MATRIX_FRONT_WIDTH));
    return amount * amount * (3 - 2 * amount);
  };
  const matrixEntranceMinimum = (m, minX, maxX) => {
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const x = m.x + sr * PORTAL_Z - MATRIX_WORLD.origin[0], z = m.z + cr * PORTAL_Z - MATRIX_WORLD.origin[2];
    const cross = Math.max(minX, Math.min(maxX, -(x * cr - z * sr)));
    return Math.hypot(x + cr * cross, z - sr * cross);
  };
  // Hanging-glyph code is separate from the surface-following lanes.
  // Prepare fixed columns inside the real carved volume, never the old flat liner.
  const buildCaveRain = (slot, m, group, caveIndex) => {
    // Falling ceiling glyphs belong to the upper caves only.
    // HQ keeps surface glyphs through both ramp systems and floors, with no airborne rain batches.
    if (slot.status === "headquarters") return { streams: [], nodes: [], perGlyphCapacity: 0, capacity: 0, bufferBytes: 0,
      spacing: MATRIX_RAIN_GAP, activeGlyphCount: 0, brightTipCount: 0, updates: 0, densityRankLimit: 0 };
    const canvas = renderer.kind === "canvas2d", limit = canvas ? 18 : 48, trainLength = canvas ? 9 : 14;
    const cr = Math.cos(m.ry), sr = Math.sin(m.ry), rand = mulberry32(fnv1a(`${slot.id}:rain`));
    const streams = [], nodes = [], obstacles = [], column = { caveIndex: 0, floor: 0, ceiling: 0 };
    const footprint = 0.055, halfHeight = 0.0605, clearance = 0.02;
    const visit = (node) => {
      if (node.geometry && !node.mirror) {
        const verts = node.geometry.verts, transform = node.world;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < verts.length; i += 3) {
          const x = verts[i], y = verts[i + 1], z = verts[i + 2];
          const wx = transform[0] * x + transform[4] * y + transform[8] * z + transform[12] - m.x;
          const wy = transform[1] * x + transform[5] * y + transform[9] * z + transform[13];
          const wz = transform[2] * x + transform[6] * y + transform[10] * z + transform[14] - m.z;
          const lx = cr * wx - sr * wz, lz = sr * wx + cr * wz;
          minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
          minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
          minZ = Math.min(minZ, lz); maxZ = Math.max(maxZ, lz);
        }
        if (minZ < -0.6) obstacles.push({ minX, maxX, minY, maxY, minZ, maxZ });
      }
      for (let i = 0; i < node.children.length; i++) visit(node.children[i]);
    };
    visit(group);
    for (let attempt = 0; attempt < limit * 16 && streams.length < limit; attempt++) {
      const side = rand() - 0.5, depth = rand();
      const lx = side * 5, lz = streams.length < limit * 0.65 ? -0.7 - depth * 1.55 : -2.55 - depth * 3.2;
      const x = m.x + cr * lx + sr * lz, z = m.z - sr * lx + cr * lz;
      let minY = -Infinity, maxY = Infinity, valid = true;
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        if (!island.cavityAt(x + ix * footprint, z + iz * footprint, column, caveIndex) || column.caveIndex !== caveIndex || !Number.isFinite(column.ceiling)) valid = false;
        else { minY = Math.max(minY, column.floor); maxY = Math.min(maxY, column.ceiling); }
      }
      minY += halfHeight + clearance; maxY -= halfHeight + clearance;
      if (!valid || maxY - minY < 1) continue;
      const blocked = [];
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (lx + footprint < o.minX || lx - footprint > o.maxX || lz + footprint < o.minZ || lz - footprint > o.maxZ) continue;
        blocked.push(o.minY - halfHeight - clearance, o.maxY + halfHeight + clearance);
      }
      const seed = fnv1a(`${slot.id}:rain:${streams.length}`), yaw = m.ry + (rand() - 0.5) * 0.18;
      const period = maxY - minY + (trainLength - 1) * MATRIX_RAIN_GAP;
      streams.push({ x, z, minY, maxY, yaw, cr: Math.cos(yaw), sr: Math.sin(yaw), period, trainLength, seed,
        speed: MATRIX_STREAM_SPEED_MIN + rand() * MATRIX_STREAM_SPEED_RANGE, phase: rand() * period, brightness: 0.62 + rand() * 0.32,
        rank: canvas ? 0 : streams.length % 8, distance: matrixTravelDistance(x, z, caveIndex), blocked });
    }
    const perGlyphCapacity = streams.length * Math.ceil(trainLength / MATRIX_TYPES);
    for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) {
      const node = createNode({ geometry: { ...hubModels.matrixGlyph(glyph), matrixCave: caveIndex }, instanceData: new Float32Array(perGlyphCapacity * 20), instanceCount: 0, drawInstanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
      addChild(root, node); placed.push(node); nodes.push(node);
    }
    return { streams, nodes, perGlyphCapacity, capacity: perGlyphCapacity * MATRIX_TYPES, bufferBytes: perGlyphCapacity * MATRIX_TYPES * 80,
      spacing: MATRIX_RAIN_GAP, activeGlyphCount: 0, brightTipCount: 0, updates: 0, densityRankLimit: 0 };
  };
  const buildGateRain = (gate) => {
    const canvas = renderer.kind === "canvas2d", columns = canvas ? 8 : 14, depths = canvas ? 1 : 2, trainLength = canvas ? 9 : 14;
    const rand = mulberry32(fnv1a("old-gate:rain")), streams = [], nodes = [];
    const minY = gate.position.y + 0.09, maxY = gate.position.y + 3.91;
    for (let depth = 0; depth < depths; depth++) for (let column = 0; column < columns; column++) {
      const x = gate.position.x + lerp(-0.84, 0.84, (column + 0.5) / columns);
      const z = gate.position.z + (depths === 1 ? 0 : depth ? 0.18 : -0.18);
      const seed = fnv1a(`old-gate:rain:${streams.length}`), period = maxY - minY + (trainLength - 1) * MATRIX_RAIN_GAP;
      streams.push({ x, z, minY, maxY, yaw: 0, cr: 1, sr: 0, period, trainLength, seed,
        speed: MATRIX_STREAM_SPEED_MIN + rand() * MATRIX_STREAM_SPEED_RANGE, phase: rand() * period, brightness: 0.62 + rand() * 0.32,
        rank: canvas ? 0 : streams.length % 8, distance: matrixTravelDistance(x, z), blocked: [] });
    }
    const perGlyphCapacity = streams.length * Math.ceil(trainLength / MATRIX_TYPES);
    for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) {
      const node = createNode({ geometry: { ...hubModels.matrixGlyph(glyph) }, instanceData: new Float32Array(perGlyphCapacity * 20), instanceCount: 0, drawInstanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
      addChild(root, node); placed.push(node); nodes.push(node);
    }
    return { streams, nodes, perGlyphCapacity, capacity: perGlyphCapacity * MATRIX_TYPES, bufferBytes: perGlyphCapacity * MATRIX_TYPES * 80,
      spacing: MATRIX_RAIN_GAP, activeGlyphCount: 0, brightTipCount: 0, updates: 0, densityRankLimit: 0,
      minX: gate.position.x - 0.84, maxX: gate.position.x + 0.84, minY, maxY, minZ: gate.position.z - 0.18, maxZ: gate.position.z + 0.18 };
  };
  const updateCaveRain = (rain, elapsed, visible, densityRankLimit, permanent = false) => {
    rain.activeGlyphCount = rain.brightTipCount = 0;
    rain.densityRankLimit = densityRankLimit;
    for (let glyph = 0; glyph < rain.nodes.length; glyph++) rain.nodes[glyph].instanceCount = rain.nodes[glyph].drawInstanceCount = 0;
    if (!visible) return;
    for (let i = 0; i < rain.streams.length; i++) {
      const s = rain.streams[i];
      if (s.rank >= densityRankLimit || !permanent && s.distance - MATRIX_GLYPH_REACH >= MATRIX_WORLD.radius) continue;
      const head = s.maxY - matrixModulo(elapsed * s.speed + s.phase, s.period);
      const version = Math.floor(elapsed * MATRIX_GLYPH_HZ + (s.seed & 15) / 16);
      for (let character = 0; character < s.trainLength; character++) {
        const y = head + character * MATRIX_RAIN_GAP;
        if (y < s.minY || y > s.maxY) continue;
        let blocked = false;
        for (let b = 0; b < s.blocked.length; b += 2) if (y >= s.blocked[b] && y <= s.blocked[b + 1]) { blocked = true; break; }
        if (blocked) continue;
        const glyph = (character + version + (s.seed & 7)) & 7, node = rain.nodes[glyph], slot = node.instanceCount++;
        if (slot >= rain.perGlyphCapacity) throw new Error("Cave Matrix rain instance capacity exceeded");
        const data = node.instanceData, offset = slot * 20;
        data[offset] = s.cr; data[offset + 1] = 0; data[offset + 2] = -s.sr; data[offset + 3] = 0;
        data[offset + 4] = 0; data[offset + 5] = 1; data[offset + 6] = 0; data[offset + 7] = 0;
        data[offset + 8] = s.sr; data[offset + 9] = 0; data[offset + 10] = s.cr; data[offset + 11] = 0;
        data[offset + 12] = s.x; data[offset + 13] = y; data[offset + 14] = s.z; data[offset + 15] = 1;
        data[offset + 16] = s.brightness * (0.48 + (1 - character / s.trainLength) * 0.52);
        data[offset + 17] = 0; data[offset + 18] = character === 0 ? 1 : character === 1 ? 0.55 : 0;
        // Free-standing voxels, unlike surface glyphs, must be visible from behind.
        data[offset + 19] = 0;
        rain.activeGlyphCount++; if (character < 2) rain.brightTipCount++;
      }
    }
    for (let glyph = 0; glyph < rain.nodes.length; glyph++) {
      const node = rain.nodes[glyph];
      node.drawInstanceCount = node.instanceCount;
      if (rain.activeGlyphCount) node.instanceVersion++;
    }
    if (rain.activeGlyphCount) rain.updates++;
  };
  const clearMatrixDraw = (cave) => {
    cave.activeGlyphCount = cave.revealedGlyphCount = cave.drawnGlyphCount = cave.brightTipCount = cave.movingGapCount = 0;
    const counts = cave.activeSurfaceCounts;
    counts.floor = counts.ceiling = counts.wall = counts.prop = 0;
    for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) {
      const node = cave.nodes[glyph];
      node.instanceCount = node.drawInstanceCount = 0;
    }
  };
  // Intersect a lane's full width with the union of coplanar terrain faces; V intervals have linear edges.
  // Keep endpoint limits at hole vertices, where a point sample alone would join the intervals across a hole.
  const matrixSupportIntervals = (supports, left, right) => {
    const cuts = [left, right];
    for (const support of supports) for (const point of support.polygon) {
      if (point[0] > left && point[0] < right) cuts.push(point[0]);
    }
    cuts.sort((a, b) => a - b);
    let allowed = null;
    for (let slab = 1; slab < cuts.length; slab++) {
      const loU = cuts[slab - 1], hiU = cuts[slab];
      if (hiU - loU < 1e-8) continue;
      const middle = (loU + hiU) * 0.5, intervals = [];
      for (const support of supports) {
        const polygon = support.polygon;
        let lo = Infinity, hi = -Infinity, loLeft = 0, loRight = 0, hiLeft = 0, hiRight = 0;
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i], b = polygon[(i + 1) % polygon.length];
          if (middle <= Math.min(a[0], b[0]) || middle >= Math.max(a[0], b[0])) continue;
          const slope = (b[1] - a[1]) / (b[0] - a[0]);
          const v = a[1] + (middle - a[0]) * slope;
          const atLeft = a[1] + (loU - a[0]) * slope, atRight = a[1] + (hiU - a[0]) * slope;
          if (v < lo) { lo = v; loLeft = atLeft; loRight = atRight; }
          if (v > hi) { hi = v; hiLeft = atLeft; hiRight = atRight; }
        }
        if (hi > lo) intervals.push({ lo, hi, loLeft, loRight, hiLeft, hiRight });
      }
      intervals.sort((a, b) => a.lo - b.lo);
      const union = [];
      for (let i = 0; i < intervals.length;) {
        const first = intervals[i++];
        let hi = first.hi, hiLeft = first.hiLeft, hiRight = first.hiRight;
        while (i < intervals.length && intervals[i].lo <= hi + 1e-8) {
          const next = intervals[i++];
          if (next.hi > hi) { hi = next.hi; hiLeft = next.hiLeft; hiRight = next.hiRight; }
        }
        const lo = Math.max(first.loLeft, first.loRight), top = Math.min(hiLeft, hiRight);
        if (top > lo) union.push([lo, top]);
      }
      if (allowed === null) allowed = union;
      else {
        const intersection = [];
        for (let a = 0, b = 0; a < allowed.length && b < union.length;) {
          const lo = Math.max(allowed[a][0], union[b][0]), hi = Math.min(allowed[a][1], union[b][1]);
          if (hi > lo) intersection.push([lo, hi]);
          if (allowed[a][1] < union[b][1]) a++; else b++;
        }
        allowed = intersection;
      }
      if (!allowed.length) break;
    }
    return allowed || [];
  };
  // Island faces bucketed per cave plus access-ramp faces, computed once and memoised on the island.
  // All caves share the original eight voxel meshes and immutable backing geometry.
  const EMPTY_FACES = [];
  const islandFaceIndex = () => {
    if (island.faceIndex) return island.faceIndex;
    const byCave = new Map(), ramps = [];
    for (let i = 0; i < island.geometry.faces.length; i++) {
      const face = island.geometry.faces[i];
      if (face.headquartersRamp || face.headquartersBasementRamp) ramps.push(face);
      if (face.matrixCave === undefined || face.matrixWorldGlyphSurface) continue;
      let list = byCave.get(face.matrixCave);
      if (!list) byCave.set(face.matrixCave, list = []);
      list.push(face);
    }
    return island.faceIndex = { byCave, ramps };
  };
  const buildCaveGlyphs = (slot, m, group) => {
    const caveIndex = island.mouths.indexOf(m) + 1, cr = Math.cos(m.ry), sr = Math.sin(m.ry);
    const portalInset = slot.status === "mirror" ? 0 : 0.02;
    if (slot.status === "mirror") {
      // Voxel-centre ownership leaves unlabelled floor fragments behind the
      // glass. Only nearby candidates need the renderer's exact bounded lookup.
      const geometry = island.geometry, verts = geometry.verts;
      for (const face of geometry.faces) {
        if (face.matrixCave) continue;
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const index of face.i) {
          const at = index * 3, dx = verts[at] - m.x, dz = verts[at + 2] - m.z;
          const x = cr * dx - sr * dz, y = verts[at + 1] - m.floorY, z = sr * dx + cr * dz;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        if (minX <= 2.5 && maxX >= -2.5 && minY >= -1e-6 && maxY <= 1e-6 && minZ <= PORTAL_Z && maxZ >= 0) face.matrixPermanentFallback = true;
      }
    }
    const sections = [], streams = [], entries = [], nodes = [], horizontalDomains = [];
    const surfaceCounts = { floor: 0, ceiling: 0, wall: 0, prop: 0 };
    const halfX = 0.0395, halfY = 0.0605, halfZ = 0.005, clearance = 0.01;
    let maximumLocalZ = -Infinity, minEntranceX = Infinity, maxEntranceX = -Infinity, propFaces = 0, terrainFaces = 0, perGlyphCapacity = 0;
    const addStream = (section, column, flowMin, flowMax) => {
      const { nx, ny, nz, ux, uz, vx, vz, plane, horizontal } = section;
      const cross = column * MATRIX_SURFACE_PITCH;
      const seed = fnv1a(`${slot.id}:${Math.round(nx * 1000)}:${Math.round(ny * 1000)}:${Math.round(nz * 1000)}:${column}`);
      const rand = mulberry32(seed), trainLength = MATRIX_TRAIN_MIN + Math.floor(rand() * MATRIX_TRAIN_RANGE), gapLength = MATRIX_TRAIN_GAP_MIN + Math.floor(rand() * MATRIX_TRAIN_GAP_RANGE);
      const sequence = trainLength + gapLength, span = sequence * MATRIX_SURFACE_GAP;
      const speed = MATRIX_STREAM_SPEED_MIN + rand() * MATRIX_STREAM_SPEED_RANGE, phase = rand() * span, brightness = 0.58 + rand() * 0.36;
      const direction = horizontal && ny > 0 ? 1 : -1;
      const characters = Math.ceil((flowMax - flowMin) / MATRIX_SURFACE_GAP) + 1, rank = matrixModulo(column, 8);
      const stream = { section: sections.length, cross, speed, phase, brightness, trainLength, gapLength, direction, flowMin, flowMax, flowRange: span, seed, head: 0, gap: 0, rank, entryStart: entries.length, entryCount: 0 };
      const streamIndex = streams.length;
      streams.push(stream);
      if (renderer.kind !== "canvas2d" || rank < MATRIX_DENSITY.canvas2d) {
        for (let character = 0; character < characters; character++) entries.push({ stream: streamIndex, character, rank });
        stream.entryCount = characters;
        // Advected cell identities cover every glyph once per eight consecutive slots (MATRIX_TYPES).
        perGlyphCapacity += Math.ceil(characters / MATRIX_TYPES);
      }
      section.streamCount++;
      section.glyphCount += characters;
      const portalU = sr * ux + cr * uz, portalV = sr * vx + cr * vz, portalN = sr * nx + cr * nz;
      for (let edge = 0; edge < 2; edge++) {
        const flow = edge ? flowMax : flowMin;
        const localZ = portalU * cross + portalV * flow + portalN * (plane + halfZ + clearance) - sr * m.x - cr * m.z;
        maximumLocalZ = Math.max(maximumLocalZ, localZ + Math.abs(portalU) * halfX + Math.abs(portalV) * halfY + Math.abs(portalN) * halfZ);
      }
    };
    const addFace = (geometry, face, transform, source) => {
      const points = [];
      for (let i = 0; i < face.i.length; i++) {
        const p = face.i[i] * 3, x = geometry.verts[p], y = geometry.verts[p + 1], z = geometry.verts[p + 2];
        points.push(transform ? [transform[0] * x + transform[4] * y + transform[8] * z + transform[12], transform[1] * x + transform[5] * y + transform[9] * z + transform[13], transform[2] * x + transform[6] * y + transform[10] * z + transform[14]] : [x, y, z]);
      }
      const a = points[0];
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i], q = points[(i + 1) % points.length];
        nx += (p[1] - q[1]) * (p[2] + q[2]);
        ny += (p[2] - q[2]) * (p[0] + q[0]);
        nz += (p[0] - q[0]) * (p[1] + q[1]);
      }
      const length = Math.hypot(nx, ny, nz);
      if (length < 1e-8) return;
      nx /= length; ny /= length; nz /= length;
      const horizontal = Math.abs(ny) > 0.999;
      let vx = horizontal ? sr * (ny > 0 ? -1 : 1) : -ny * nx;
      let vy = horizontal ? 0 : 1 - ny * ny;
      let vz = horizontal ? cr * (ny > 0 ? -1 : 1) : -ny * nz;
      const vLength = Math.hypot(vx, vy, vz);
      vx /= vLength; vy /= vLength; vz /= vLength;
      const ux = vy * nz - vz * ny, uy = vz * nx - vx * nz, uz = vx * ny - vy * nx;
      const plane = nx * a[0] + ny * a[1] + nz * a[2], polygon = [];
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      for (let i = 0; i < points.length; i++) {
        const p = points[i], u = ux * p[0] + uy * p[1] + uz * p[2], v = vx * p[0] + vy * p[1] + vz * p[2];
        const entranceX = cr * (p[0] - m.x) - sr * (p[2] - m.z);
        minEntranceX = Math.min(minEntranceX, entranceX); maxEntranceX = Math.max(maxEntranceX, entranceX);
        polygon.push([u, v]);
        minU = Math.min(minU, u); maxU = Math.max(maxU, u);
        minV = Math.min(minV, v); maxV = Math.max(maxV, v);
      }
      if (source === "terrain" && horizontal) {
        let domain = null;
        for (let i = 0; i < horizontalDomains.length; i++) {
          const candidate = horizontalDomains[i];
          if (candidate.ny === ny && candidate.plane === plane) { domain = candidate; break; }
        }
        if (!domain) {
          domain = { source, category: ny > 0 ? "floor" : "ceiling", face: null, polygon: null, supports: [], constraints: [], ux, uy, uz, vx, vy, vz, nx, ny, nz, plane, clearance, horizontal, minU, maxU, streamStart: 0, streamCount: 0, glyphCount: 0 };
          horizontalDomains.push(domain);
        }
        domain.supports.push({ face, polygon });
        domain.minU = Math.min(domain.minU, minU); domain.maxU = Math.max(domain.maxU, maxU);
        terrainFaces++;
        return;
      }
      let area = 0;
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i], q = polygon[(i + 1) % polygon.length];
        area += p[0] * q[1] - q[0] * p[1];
      }
      const winding = area < 0 ? -1 : 1, constraints = [];
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i], q = polygon[(i + 1) % polygon.length];
        const cu = winding * (q[1] - p[1]), cv = winding * (p[0] - q[0]);
        constraints.push([cu, cv, cu * p[0] + cv * p[1] - Math.abs(cu) * halfX - Math.abs(cv) * halfY]);
      }
      // Account for the entire extruded glyph at the real portal, not only its centre.
      const portalU = sr * ux + cr * uz, portalV = sr * vx + cr * vz, portalN = sr * nx + cr * nz;
      constraints.push([portalU, portalV, PORTAL_Z - portalInset + sr * m.x + cr * m.z - portalN * (plane + halfZ + clearance) - Math.abs(portalU) * halfX - Math.abs(portalV) * halfY - Math.abs(portalN) * halfZ]);
      const category = source === "prop" ? "prop" : horizontal ? ny > 0 ? "floor" : "ceiling" : "wall";
      const section = { source, category, face, polygon, constraints, ux, uy, uz, vx, vy, vz, nx, ny, nz, plane, clearance, horizontal, streamStart: streams.length, streamCount: 0, glyphCount: 0 };
      for (let column = Math.ceil((minU + halfX) / MATRIX_SURFACE_PITCH); column * MATRIX_SURFACE_PITCH <= maxU - halfX + 1e-8; column++) {
        const cross = column * MATRIX_SURFACE_PITCH;
        let flowMin = minV + halfY, flowMax = maxV - halfY, valid = true;
        for (let i = 0; i < constraints.length; i++) {
          const constraint = constraints[i], remain = constraint[2] - constraint[0] * cross;
          if (constraint[1] > 1e-8) flowMax = Math.min(flowMax, remain / constraint[1]);
          else if (constraint[1] < -1e-8) flowMin = Math.max(flowMin, remain / constraint[1]);
          else if (remain < -1e-8) { valid = false; break; }
        }
        if (!valid || flowMax - flowMin < 1e-6) continue;
        addStream(section, column, flowMin, flowMax);
      }
      if (section.streamCount) {
        sections.push(section);
        surfaceCounts[category] += section.glyphCount;
      }
      if (source === "terrain") terrainFaces++; else propFaces++;
    };
    const caveFaces = islandFaceIndex().byCave.get(caveIndex) || EMPTY_FACES;
    for (let i = 0; i < caveFaces.length; i++) addFace(island.geometry, caveFaces[i], null, "terrain");
    for (const section of horizontalDomains) {
      section.streamStart = streams.length;
      const portalU = sr * section.ux + cr * section.uz, portalV = sr * section.vx + cr * section.vz;
      const portalN = sr * section.nx + cr * section.nz;
      const portalLimit = PORTAL_Z - portalInset + sr * m.x + cr * m.z - portalN * (section.plane + halfZ + clearance) - Math.abs(portalU) * halfX - Math.abs(portalV) * halfY - Math.abs(portalN) * halfZ;
      section.constraints.push([portalU, portalV, portalLimit]);
      for (let column = Math.ceil((section.minU + halfX) / MATRIX_SURFACE_PITCH); column * MATRIX_SURFACE_PITCH <= section.maxU - halfX + 1e-8; column++) {
        const cross = column * MATRIX_SURFACE_PITCH;
        const intervals = matrixSupportIntervals(section.supports, cross - halfX, cross + halfX);
        for (let i = 0; i < intervals.length; i++) {
          let flowMin = intervals[i][0] + halfY, flowMax = intervals[i][1] - halfY;
          const remain = portalLimit - portalU * cross;
          if (portalV > 1e-8) flowMax = Math.min(flowMax, remain / portalV);
          else if (portalV < -1e-8) flowMin = Math.max(flowMin, remain / portalV);
          else if (remain < -1e-8) continue;
          if (flowMax - flowMin >= 1e-6) addStream(section, column, flowMin, flowMax);
        }
      }
      if (section.streamCount) {
        sections.push(section);
        surfaceCounts[section.category] += section.glyphCount;
      }
    }
    BL.scene.updateWorld(group);
    const visit = (node, inheritedLiving = false, inheritedEmissive = false, inheritedExterior = false) => {
      const living = inheritedLiving || !!node.matrixLiving, emissiveLiving = inheritedEmissive || !!node.matrixEmissiveLiving, exterior = inheritedExterior || !!node.matrixExterior;
      if (node.geometry && !node.geometry.matrixGlyph && !node.geometry.matrixLocalGlyphSurface && !node.mirror && !exterior) {
        const original = node.geometry, faces = [], transform = node.world;
        let owned = false;
        for (let f = 0; f < original.faces.length; f++) {
          const face = original.faces[f];
          let inside = true, touches = false;
          for (let i = 0; i < face.i.length; i++) {
            const p = face.i[i] * 3, x = original.verts[p], y = original.verts[p + 1], z = original.verts[p + 2];
            const wx = transform[0] * x + transform[4] * y + transform[8] * z + transform[12];
            const wz = transform[2] * x + transform[6] * y + transform[10] * z + transform[14];
            const behind = sr * (wx - m.x) + cr * (wz - m.z) <= PORTAL_Z - portalInset;
            if (behind) touches = true;
            else { inside = false; if (slot.status !== "mirror") break; }
          }
          if (inside || slot.status === "mirror" && touches) {
            // A crossing rim face needs procedural glyphs on both sides when
            // the world wave arrives. Native lanes remain on wholly owned faces.
            const local = { ...face, matrixCave: caveIndex, matrixLocalGlyphSurface: inside, matrixWorldGlyphSurface: !inside };
            faces.push(local);
            if (inside && !living && !(emissiveLiving && face.emissive > 0)) addFace(original, local, transform, "prop");
            owned = true;
          } else faces.push(face);
        }
        if (owned) node.geometry = { ...original, faces, matrixSourceGeometry: original };
      }
      for (let i = 0; i < node.children.length; i++) visit(node.children[i], living, emissiveLiving, exterior);
    };
    visit(group);
    for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) {
      // A record owns one raw instance buffer; its geometry wrapper is per cave.
      // The immutable voxel vertices and faces themselves stay shared.
      const node = createNode({ geometry: { ...hubModels.matrixGlyph(glyph), matrixCave: caveIndex }, instanceData: new Float32Array(perGlyphCapacity * 20), instanceCount: 0, drawInstanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
      addChild(root, node); placed.push(node); nodes.push(node);
    }
    let registryHash = 2166136261, minBrightness = Infinity, maxBrightness = 0, minTrainLength = Infinity, maxTrainLength = 0, minGapLength = Infinity, maxGapLength = 0;
    let surfaceMetadataBytes = 0;
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      registryHash = Math.imul(registryHash ^ Math.round(section.plane * 1000) ^ section.streamCount, 16777619) >>> 0;
      surfaceMetadataBytes += 128 + section.constraints.length * 24;
      if (section.supports) {
        for (const support of section.supports) surfaceMetadataBytes += 32 + support.polygon.length * 16;
      } else surfaceMetadataBytes += section.polygon.length * 16;
    }
    for (let i = 0; i < streams.length; i++) {
      const stream = streams[i];
      registryHash = Math.imul(registryHash ^ stream.seed ^ Math.round(stream.flowMin * 1000) ^ Math.round(stream.flowMax * 1000), 16777619) >>> 0;
      minBrightness = Math.min(minBrightness, stream.brightness); maxBrightness = Math.max(maxBrightness, stream.brightness);
      minTrainLength = Math.min(minTrainLength, stream.trainLength); maxTrainLength = Math.max(maxTrainLength, stream.trainLength);
      minGapLength = Math.min(minGapLength, stream.gapLength); maxGapLength = Math.max(maxGapLength, stream.gapLength);
    }
    const cave = {
      id: slot.id, caveIndex, mouth: m, cr, sr, nodes, sections, streams, entries, surfaceCounts, activeSurfaceCounts: { floor: 0, ceiling: 0, wall: 0, prop: 0 },
      rain: buildCaveRain(slot, m, group, caveIndex),
      glyphCount: surfaceCounts.floor + surfaceCounts.ceiling + surfaceCounts.wall + surfaceCounts.prop,
      perGlyphCapacity, capacity: perGlyphCapacity * MATRIX_TYPES, bufferBytes: perGlyphCapacity * MATRIX_TYPES * 80,
      registryBytes: entries.length * 24 + streams.length * 112 + surfaceMetadataBytes, surfaceMetadataBytes, registryHash: registryHash.toString(16).padStart(8, "0"),
      activeGlyphCount: 0, revealedGlyphCount: 0, drawnGlyphCount: 0, brightTipCount: 0, movingGapCount: 0, maximumLocalZ,
      minimumTravelDistance: matrixEntranceMinimum(m, minEntranceX, maxEntranceX), terrainFaces, propFaces, updates: 0, allocationCount: MATRIX_TYPES, rebuildCount: 1,
      quality: renderer.kind === "canvas2d" ? "canvas2d" : renderer.quality, densityRankLimit: MATRIX_DENSITY[renderer.kind === "canvas2d" ? "canvas2d" : renderer.quality], glyphVersion: -1, previousGlyphVersion: -1, mutationHash: 0, firstGlyphY: 0,
      minBrightness, maxBrightness, minTrainLength, maxTrainLength, minGapLength, maxGapLength, visible: false, drawEnabled: false
    };
    // One world-space sphere around the whole interior lets the renderer skip the cave's batches.
    // Sized for a portal at local z .5 out to depth 7.
    const cullSphere = new Float32Array([m.x + sr * -3.25, m.floorY + 2.1, m.z + cr * -3.25, 5.6]);
    for (let i = 0; i < nodes.length; i++) nodes[i].cullSphere = cullSphere;
    for (let i = 0; i < cave.rain.nodes.length; i++) cave.rain.nodes[i].cullSphere = cullSphere;
    matrixInteriors.push(cave);
    return cave;
  };
  const updateCaveGlyphs = (elapsed, visible, densityRankLimit) => {
    for (let c = 0; c < matrixInteriors.length; c++) {
      const cave = matrixInteriors[c];
      const permanent = cave.caveIndex === MATRIX_WORLD.permanentCave;
      cave.visible = cave.drawEnabled = permanent || visible && MATRIX_WORLD.radius > cave.minimumTravelDistance;
      cave.quality = renderer.kind === "canvas2d" ? "canvas2d" : renderer.quality;
      cave.densityRankLimit = densityRankLimit;
      updateCaveRain(cave.rain, elapsed, cave.visible, densityRankLimit, permanent);
      if (!permanent && (!visible || MATRIX_WORLD.radius <= cave.minimumTravelDistance)) {
        clearMatrixDraw(cave);
        continue;
      }
      const nodes = cave.nodes, streams = cave.streams, sections = cave.sections, radius = MATRIX_WORLD.radius;
      for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) nodes[glyph].instanceCount = 0;
      const counts = cave.activeSurfaceCounts;
      counts.floor = counts.ceiling = counts.wall = counts.prop = 0;
      let active = 0, revealed = 0, bright = 0, gaps = 0, first = true, mutationHash = 2166136261;
      // Entries are contiguous per stream with ascending character.
      // One pass over the streams visits them in registry order with every per-stream term hoisted.
      for (let s = 0; s < streams.length; s++) {
        const stream = streams[s], direction = stream.direction, travel = elapsed * stream.speed + stream.phase;
        if (stream.entryCount && stream.rank < densityRankLimit) {
          const section = sections[stream.section], flowMin = stream.flowMin, flowMax = stream.flowMax, trainLength = stream.trainLength;
          const sequence = trainLength + stream.gapLength, shift = direction * travel, brightness = stream.brightness;
          const base = Math.ceil((flowMin - shift) / MATRIX_SURFACE_GAP), plane = section.plane + 0.015, cross = stream.cross;
          const ux = section.ux, uy = section.uy, uz = section.uz, vx = section.vx, vy = section.vy, vz = section.vz, nx = section.nx, ny = section.ny, nz = section.nz;
          const xu = ux * cross, yu = uy * cross, zu = uz * cross, xn = nx * plane, yn = ny * plane, zn = nz * plane;
          const pick = Math.floor(elapsed * MATRIX_GLYPH_HZ + (stream.seed & 15) / 16) + (stream.seed & 7);
          const from = stream.entryStart, to = from + stream.entryCount;
          let streamActive = 0;
          for (let i = from; i < to; i++) {
            const cell = base + (i - from), flow = cell * MATRIX_SURFACE_GAP + shift;
            if (flow < flowMin || flow > flowMax) continue;
            const x = xu + vx * flow + xn, z = zu + vz * flow + zn;
            let distance = 0;
            if (!permanent) {
              distance = matrixTravelDistance(x, z, cave.caveIndex);
              if (distance - MATRIX_GLYPH_REACH >= radius) continue;
            }
            const trainPosition = matrixModulo(-direction * cell, sequence);
            if (trainPosition >= trainLength) { gaps++; continue; }
            const tip = trainPosition === 0 ? 1 : trainPosition === 1 ? 0.55 : 0;
            const glyph = (cell + pick) & 7;
            const node = nodes[glyph], slot = node.instanceCount++;
            if (slot >= cave.perGlyphCapacity) throw new Error("Cave Matrix glyph instance capacity exceeded");
            const data = node.instanceData, offset = slot * 20;
            data[offset] = ux; data[offset + 1] = uy; data[offset + 2] = uz; data[offset + 3] = 0;
            data[offset + 4] = vx; data[offset + 5] = vy; data[offset + 6] = vz; data[offset + 7] = 0;
            data[offset + 8] = nx; data[offset + 9] = ny; data[offset + 10] = nz; data[offset + 11] = 0;
            data[offset + 12] = x;
            data[offset + 13] = yu + vy * flow + yn;
            data[offset + 14] = z;
            data[offset + 15] = 1; data[offset + 16] = brightness * (0.48 + (1 - trainPosition / trainLength) * 0.52); data[offset + 17] = 0; data[offset + 18] = tip; data[offset + 19] = 1;
            if (DEBUG) mutationHash = Math.imul(mutationHash ^ glyph ^ Math.imul(i + 1, 16777619), 16777619) >>> 0;
            if (first && !section.horizontal) { cave.firstGlyphY = data[offset + 13]; first = false; }
            streamActive++; if (permanent || distance < radius) revealed++; if (tip) bright++;
          }
          counts[section.category] += streamActive; active += streamActive;
        }
        const wrapped = matrixModulo(travel, stream.flowRange);
        stream.head = direction * wrapped;
        stream.gap = direction * matrixModulo(wrapped - stream.trainLength * MATRIX_SURFACE_GAP, stream.flowRange);
      }
      for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) {
        const node = nodes[glyph];
        node.drawInstanceCount = node.instanceCount;
        if (active) node.instanceVersion++;
      }
      cave.activeGlyphCount = cave.drawnGlyphCount = active;
      cave.revealedGlyphCount = revealed;
      cave.brightTipCount = bright; cave.movingGapCount = gaps; if (active) cave.updates++;
      cave.previousGlyphVersion = cave.glyphVersion;
      cave.glyphVersion = Math.floor(elapsed * MATRIX_GLYPH_HZ);
      cave.mutationHash = mutationHash;
    }
  };
  const matrixWorldStreamSample = (stream, time, downward) => {
    const hash = (n) => {
      let value = n | 0;
      value ^= value >>> 16;
      value = Math.imul(value, 2146121005);
      value ^= value >>> 15;
      value = Math.imul(value, -2073254261);
      value ^= value >>> 16;
      return (value >>> 8) / 16777216;
    };
    const speed = MATRIX_STREAM_SPEED_MIN + hash(stream + 19) * MATRIX_STREAM_SPEED_RANGE;
    const trainLength = MATRIX_TRAIN_MIN + Math.floor(hash(stream) * MATRIX_TRAIN_RANGE);
    const gapLength = MATRIX_TRAIN_GAP_MIN + Math.floor(hash(stream + 41) * MATRIX_TRAIN_GAP_RANGE);
    const sequenceLength = trainLength + gapLength, span = sequenceLength * MATRIX_SURFACE_GAP;
    const phase = hash(stream + 73) * span, direction = downward ? -1 : 1;
    const brightness = 0.58 + hash(stream + 101) * 0.36;
    return {
      stream, time, speed, trainLength, gapLength, span, direction, brightness,
      leadingGlow: brightness,
      secondGlow: brightness * (0.48 + 0.52 * (trainLength - 1) / trainLength),
      trailingGlow: brightness * (0.48 + 0.52 / trainLength),
      head: direction * matrixModulo(time * speed + phase + (trainLength - 1) * MATRIX_SURFACE_GAP, span),
      gap: direction * matrixModulo(time * speed + phase + trainLength * MATRIX_SURFACE_GAP, span)
    };
  };
  const MATRIX_CAMERA_COLUMN = { caveIndex: 0, floor: 0, ceiling: 0 };
  const updateMatrixWorld = (dt, elapsed) => {
    if (!matrixCave) return;
    const quality = renderer.kind === "canvas2d" ? "canvas2d" : renderer.quality;
    const densityRankLimit = MATRIX_DENSITY[quality] || MATRIX_DENSITY.high;
    MATRIX_WORLD.time = elapsed;
    MATRIX_WORLD.density = densityRankLimit / MATRIX_DENSITY.high;
    if (MATRIX_WORLD.direction > 0) {
      MATRIX_WORLD.radius = Math.min(MATRIX_WORLD.maxRadius, MATRIX_WORLD.radius + dt * MATRIX_WORLD.speed);
      if (MATRIX_WORLD.radius === MATRIX_WORLD.maxRadius) MATRIX_WORLD.direction = 0;
    }
    else if (MATRIX_WORLD.direction < 0) {
      MATRIX_WORLD.radius = Math.max(0, MATRIX_WORLD.radius - dt * MATRIX_WORLD.retreatSpeed);
      if (MATRIX_WORLD.radius === 0) MATRIX_WORLD.direction = 0;
    }
    MATRIX_WORLD.active = MATRIX_WORLD.radius > 0 ? 1 : 0;
    const mirrorReveal = mirrorCave.damage.broken || matrixCave.unlocked ? 1 : matrixCave.portal.inside ? Math.max(0, Math.min(1, (MATRIX_WORLD.radius - matrixCave.mirrorDistance) / MATRIX_MIRROR_HEIGHT)) : 0;
    matrixCave.mirrorNode.mirrorReveal = mirrorReveal;
    matrixCave.mirrorNode.mirrorPortal = mirrorReveal === 1;
    updateCaveGlyphs(elapsed, !!MATRIX_WORLD.active, densityRankLimit);
    if (gateRain) updateCaveRain(gateRain, elapsed, !!MATRIX_WORLD.active, densityRankLimit);
    if (mirrorGuides) {
      const eye = camera.position;
      // A trailing eye can pass through a cave wall while its Ooga stays outdoors.
      // Read the eye's actual empty cavity rather than its owner.
      const inside = !!pilot.player && !matrixCave.portal.inside
        && island.cavityAt(eye.x, eye.z, MATRIX_CAMERA_COLUMN, matrixCave.caveIndex, eye.y) && MATRIX_CAMERA_COLUMN.caveIndex === matrixCave.caveIndex
        && eye.y >= MATRIX_CAMERA_COLUMN.floor && eye.y < MATRIX_CAMERA_COLUMN.ceiling && island.clearAt(eye.x, eye.y, eye.z, 1e-5, 2e-5);
      mirrorGuides.updateDoorway(camera, inside, elapsed, MATRIX_WORLD.density);
    }
  };
  const inMatrixCave = () => {
    return !!matrixCave && matrixCave.portal.inside;
  };
  const matrixOverlayVisible = (x, y, z) => {
    if (RENDER_OPTS.birdsEyeCutaway) return y <= cutawayHeightAt(x, z);
    if (!matrixCave || !matrixCave.portal.inside) return true;
    const m = matrixCave.mouth;
    const cdx = camera.position.x - m.x, cdz = camera.position.z - m.z;
    const tdx = x - m.x, tdz = z - m.z;
    const cx = matrixCave.cr * cdx - matrixCave.sr * cdz;
    const cz = matrixCave.sr * cdx + matrixCave.cr * cdz;
    const tx = matrixCave.cr * tdx - matrixCave.sr * tdz;
    const tz = matrixCave.sr * tdx + matrixCave.cr * tdz;
    if (tz <= 0.5) return true;
    const amount = (0.5 - cz) / (tz - cz);
    if (amount <= 0 || amount >= 1) return false;
    const ix = cx + (tx - cx) * amount;
    const iy = camera.position.y - m.floorY + (y - camera.position.y) * amount;
    return ix >= PORTAL_MIN_X && ix <= PORTAL_MAX_X && iy >= PORTAL_MIN_Y && iy <= PORTAL_MAX_Y;
  };
  const SLEEP_SCREEN = { x: 0, y: 0, depth: 0 };
  let sleepSightFrame = 0;
  const sleepSightAt = (x, y, z) => {
    if (!matrixOverlayVisible(x, y, z)) return false;
    const screen = renderer.project(x, y, z, SLEEP_SCREEN);
    if (!screen || screen.x < 0 || screen.y < 0 || screen.x > renderer.size.width || screen.y > renderer.size.height) return false;
    const eye = camera.position, dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
    if (!entranceSegmentClear(eye.x, eye.y, eye.z, x, y, z, 0.002) || !bedSegmentClear(eye.x, eye.y, eye.z, x, y, z, 0.002, 0.004)) return false;
    // Short exact sweeps keep long sight rays from scanning an island-sized box.
    // The point checks also include the continuous ramp surfaces.
    const distance = Math.hypot(dx, dy, dz);
    const outside = Math.max(0, Math.hypot(eye.x, eye.y, eye.z) - Math.hypot(island.radius, island.undersideDepth, terrain.MAX_HEIGHT) - island.unit);
    const start = Math.min(1, outside / Math.max(distance, 1e-7));
    const steps = Math.max(1, Math.ceil(distance * (1 - start) / (island.unit * 0.5)));
    let px = eye.x + dx * start, py = eye.y + dy * start, pz = eye.z + dz * start;
    for (let i = 1; i <= steps; i++) {
      const k = start + (1 - start) * i / steps, nx = eye.x + dx * k, ny = eye.y + dy * k, nz = eye.z + dz * k;
      if (!island.clearAt(nx, ny, nz, 0.002, 0.004) || !island.voxelSegmentClearAt(px, py, pz, nx, ny, nz, 0.002, 0.004)) return false;
      px = nx; py = ny; pz = nz;
    }
    return true;
  };
  const sleepOpeningVisible = (x, y, z, cr, sr, halfWidth, halfHeight) => {
    if (sleepSightAt(x, y, z)) return true;
    for (let i = 0; i < 4; i++) {
      const across = (i & 1 ? 1 : -1) * halfWidth, lift = (i & 2 ? 1 : -1) * halfHeight;
      if (sleepSightAt(x + cr * across, y + lift, z + sr * across)) return true;
    }
    return false;
  };
  const sleepMarksVisible = (cave, x, y, z) => {
    if (!cave) return sleepSightAt(x, y, z);
    const bed = cave.bedroll;
    if (cave.state !== "sleeping" || cave.bedTravel.mode !== "rest" || !bed || bed.sleeper !== cave) return false;
    if (bed.sightFrame === sleepSightFrame) return bed.sightVisible;
    bed.sightFrame = sleepSightFrame;
    const head = cave.sleepHead, body = cave.root.position, room = bed.room, window = bed.window;
    bed.sightVisible = sleepSightAt(head.x, head.y, head.z) || sleepSightAt(body.x, body.y, body.z)
      || sleepOpeningVisible(room.entrance.x, room.floor + 1.8, room.entrance.z, bed.cr, -bed.sr, (room.corridorWidth ?? room.width - 1.3) * 0.35, 1.1)
      || !!window && sleepOpeningVisible(window.x, window.y, window.z, Math.cos(window.angle), Math.sin(window.angle), window.width * 0.35, window.height * 0.35);
    return bed.sightVisible;
  };
  const viewInsideMatrix = (lookOut = false) => {
    const m = matrixCave.mouth, targetZ = lookOut ? 0.45 : -5.45;
    const target = { x: m.x + matrixCave.sr * targetZ, y: m.floorY + 1.75, z: m.z + matrixCave.cr * targetZ };
    const orbit = pilot.orbit, yaw = m.ry + (lookOut ? Math.PI : 0);
    if (!matrixCave.portal.inside) {
      setCameraCave(0);
      setVec(CAMERA_PREVIOUS, m.x + matrixCave.sr * (PORTAL_Z + 0.01), m.floorY + 1.75, m.z + matrixCave.cr * (PORTAL_Z + 0.01));
      cameraPreviousValid = true;
    }
    orbit.target = target;
    orbit.tx = target.x;
    orbit.ty = target.y;
    orbit.tz = target.z;
    orbit.yaw = orbit.tYaw = yaw;
    orbit.pitch = orbit.tPitch = 0.08;
    orbit.dist = orbit.tDist = 3.5;
    pilot.update(0.1);
  };
  const viewMatrixApproach = () => {
    const m = matrixCave.mouth;
    const target = { x: m.x + matrixCave.sr * 0.5, y: m.floorY + 1.5, z: m.z + matrixCave.cr * 0.5 };
    const orbit = pilot.orbit;
    orbit.target = target;
    orbit.tx = target.x;
    orbit.ty = target.y;
    orbit.tz = target.z;
    orbit.yaw = orbit.tYaw = m.ry;
    orbit.pitch = orbit.tPitch = 0.08;
    orbit.dist = orbit.tDist = 12;
    pilot.update(0.1);
  };

  const addProp = (kind, node, x, z, radius) => {
    const owner = { kind: "prop", prop: kind, node, x, z, ripe: 0, pickRadius: radius, active: true };
    if (kind === "tree" || kind === "bush" || kind === "flower" || kind === "grass" || kind === "palm") owner.weaponType = "none";
    addTarget(node, owner, { radius });
    props.push(owner);
    if (SOLID_PROPS.has(kind)) solids.add(node);
    return owner;
  };
  const place = (geometry, x, z, ry = 0, y = island.surfaceAt(x, z), kind = null, radius = 0) => {
    const node = createNode({ position: { x, y, z }, rotation: { x: 0, y: ry, z: 0 }, geometry, matrixLiving: MATRIX_LIVING_PROPS.has(kind) });
    addChild(root, node);
    placed.push(node);
    if (kind) addProp(kind, node, x, z, radius);
    return node;
  };
  const claim = (x, z, r) => {
    const value = { x, z, r, scenery: null };
    claimed.push(value);
    return value;
  };
  const free = (x, z, r) => {
    for (const c of claimed) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
    return true;
  };
  const nearPath = (x, z, d) => {
    if (island.isPath(x, z)) return true;
    for (let i = 0; i < 16; i++) {
      const c = Math.cos(i / 16 * Math.PI * 2), s = Math.sin(i / 16 * Math.PI * 2);
      if (island.isPath(x + c * d, z + s * d) || island.isPath(x + c * d / 2, z + s * d / 2)) return true;
    }
    return false;
  };
  const nearMouth = (x, z, d) => {
    for (const m of island.mouths) if (Math.hypot(m.x - x, m.z - z) < d) return true;
    return false;
  };
  // The full roster can gather at a repository. Reserve the firing rows and
  // the two-corner pedestrian detour, including later breakable respawns.
  const workSceneryClear = (x, z, radius) => {
    const row = Math.max(0, Math.ceil(contributors.activeRoster.length / 4) - 1);
    const front = 2.8 + row * 1.35 + 4.15 * 0.16, margin = radius + PLAYER_RADIUS;
    const sideNear = 3.4 + 0.9, sideFar = Math.max(3.4, 4.15 + 0.8) + 0.9;
    const frontNear = 5.8 + 0.9, frontFar = Math.max(5.8, front + 0.8) + 0.9;
    for (let i = 0; i < workZones.length; i++) {
      const zone = workZones[i], dx = x - zone.x, dz = z - zone.z;
      const across = Math.abs(dx * zone.cr - dz * zone.sr), along = dx * zone.sr + dz * zone.cr;
      if (across < 4.15 + margin && along > 2.8 - margin && along < front + margin) return false;
      if (across > sideNear - margin && across < sideFar + margin && along > 2.8 - margin && along < frontFar + margin) return false;
      if (across < sideFar + margin && along > frontNear - margin && along < frontFar + margin) return false;
    }
    return true;
  };
  const spotAt = (deg, r, margin) => {
    for (const off of NUDGES) {
      const p = polar(deg + off, r);
      if (!nearPath(p.x, p.z, margin) && island.surfaceAt(p.x, p.z) === 0) return p;
    }
    return polar(deg, r);
  };
  const addLamp = (node, kind, x, y, z, light = true, order = lamps.length, id = `lamp:${lamps.length}`) => {
    node.glow = LAMP_OFF;
    node.flare = 0;
    const lamp = { node, kind, x, y, z, light, order, id, k: 0, lit: false, selected: false, approximated: false, debug: null };
    lamps.push(lamp);
    return lamp;
  };
  const updateLamps = (dt, elapsed, spark) => {
    const lights = RENDER_OPTS.lights;
    const webgl = renderer.kind === "webgl2";
    const limit = webgl ? LIGHT_CAPACITY : 0;
    let count = 0, approximated = 0, registered = 0;
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i], node = l.node;
      if (l.light) registered++;
      const k = l.always ? 1 : Math.min(1, Math.max(0, (RENDER_OPTS.torch - l.order * LAMP_STAGGER) / LAMP_RAMP));
      const lit = k > 0.05;
      if (lit && !l.lit && spark) fx.burst(l.x, l.y, l.z, 5, [SPARK], 1.3);
      l.lit = lit;
      l.k = k;
      const flicker = Math.sin(elapsed * 11 + i * 2.3) * 0.15;
      node.glow = LAMP_OFF + k * (l.kind.glow + flicker) + node.flare * 1.5;
      if (node.flare > 0) node.flare = Math.max(0, node.flare - dt * 2);
      // kind.hide: the node is hidden while unlit, so a cold fire shows no flame at all.
      if (l.kind.hide) node.visible = lit;
      l.selected = false;
      l.approximated = false;
      if (l.debug) {
        l.debug.factor = k;
        l.debug.lit = lit;
        l.debug.selected = false;
        l.debug.approximated = false;
      }
    }
    // Registration order is spatially stable: camera movement never swaps lamp profiles.
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      if (!l.lit || !l.light) continue;
      if (count < limit) {
        l.selected = true;
        if (l.debug) l.debug.selected = true;
        LIGHTING_DEBUG.selectedIds[count] = l.id;
        const o = count++ * 8;
        lights[o] = l.x;
        lights[o + 1] = l.y;
        lights[o + 2] = l.z;
        lights[o + 3] = l.kind.radius;
        lights[o + 4] = l.kind.r * l.k;
        lights[o + 5] = l.kind.g * l.k;
        lights[o + 6] = l.kind.b * l.k;
      } else {
        l.approximated = true;
        if (l.debug) l.debug.approximated = true;
        LIGHTING_DEBUG.approximatedIds[approximated++] = l.id;
      }
    }
    for (let i = count; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.selectedIds[i] = null;
    for (let i = approximated; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.approximatedIds[i] = null;
    RENDER_OPTS.lightCount = count;
    LIGHTING_DEBUG.registeredLampCount = registered;
    LIGHTING_DEBUG.activeFullLightCount = count;
    LIGHTING_DEBUG.approximatedLightCount = approximated;
    LIGHTING_DEBUG.configuredLightCapacity = limit;
    LIGHTING_DEBUG.selectedCount = count;
    LIGHTING_DEBUG.approximatedCount = approximated;
    LIGHTING_DEBUG.tier = webgl ? renderer.quality : "canvas2d";
    if (headquarters) {
      // The underground hearth stays lit for the windowless common room.
      // Its emissive flame still breathes with the same flicker as the campfire.
      const hearth = headquarters.hearth;
      hearth.node.glow = LAMP_OFF + LAMP.fire.glow + Math.sin(elapsed * 11 + hearth.phase) * 0.15;
    }
    if (headquarters && camera.position.y < -1 && cameraCaveIndex && CAMERA_OPENINGS[cameraCaveIndex - 1].headquarters) {
      const underground = headquarters.sources;
      // The upper hearth cannot cast through the rock into the basement.
      const below = camera.position.y < island.headquarters.floor;
      const total = below ? 0 : Math.min(limit, underground.length);
      for (let i = 0; i < underground.length; i++) underground[i].selected = false;
      for (let i = 0; i < total; i++) {
        let nearest = null, distance = Infinity;
        for (let n = 0; n < underground.length; n++) {
          const l = underground[n];
          const d = (l.x - camera.position.x) ** 2 + (l.y - camera.position.y) ** 2 + (l.z - camera.position.z) ** 2;
          if (!l.selected && d < distance) { nearest = l; distance = d; }
        }
        const l = nearest, o = i * 8, sky = l.daylight ? 0.12 + RENDER_OPTS.day * 0.88 : 1;
        l.selected = true;
        lights[o] = l.x;
        lights[o + 1] = l.y;
        lights[o + 2] = l.z;
        lights[o + 3] = l.daylight ? 11 : 9;
        lights[o + 4] = (l.daylight ? 0.8 : 1) * sky;
        lights[o + 5] = (l.daylight ? 0.88 : 0.65) * sky;
        lights[o + 6] = (l.daylight ? 1 : 0.3) * sky;
        lights[o + 7] = 0;
        LIGHTING_DEBUG.selectedIds[i] = l.id;
      }
      for (let i = total; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.selectedIds[i] = null;
      RENDER_OPTS.lightCount = LIGHTING_DEBUG.activeFullLightCount = LIGHTING_DEBUG.selectedCount = total;
    }
  };
  const buildFire = () => {
    let p = null;
    for (const deg of FIRE_DEGREES) {
      const c = polar(deg, FIRE_RADIUS);
      if (island.surfaceAt(c.x, c.z) === 0 && free(c.x, c.z, 1.6) && !nearPath(c.x, c.z, 1.8)) {
        p = c;
        break;
      }
    }
    if (!p) throw new Error("No clear spot for the fire pit");
    const pit = place(hubModels.firepit(), p.x, p.z, 0, 0, "firepit", 1.2);
    const flame = createNode({ geometry: hubModels.fireFlame(), matrixEmissiveLiving: true });
    addChild(pit, flame);
    fireHazards.push({ node: flame, pit, x: p.x, y: pit.position.y, z: p.z, avoidRadius: FIRE_AVOID_RADIUS });
    addLamp(flame, LAMP.fire, p.x, 0.6, p.z, true, 3, "firepit").always = true;
    claim(p.x, p.z, 1.4);
    for (let i = 0; i < FIRE_SEATS; i++) {
      const a = (i + 0.5) / FIRE_SEATS * Math.PI * 2;
      const x = p.x + Math.cos(a) * FIRE_SEAT_RADIUS, z = p.z + Math.sin(a) * FIRE_SEAT_RADIUS;
      fireSeats.push({ x, z, ry: Math.atan2(p.x - x, p.z - z) });
    }
    return p;
  };
  // Mouth local frame: +z leads out of the cave.
  const sealedCaveVariant = (id) => id === "c3" ? 1 : id === "c10" ? 2 : 0;
  // Every cave wears its own facade from the shared voxel kit: two lantern posts, a string over the lintel,
  // vines off the rim, and the theme's own things either side of the path (lab dice and flasks, rally tyres and
  // start lights, mine picks and ore, the mirror's glyph monoliths, the Lightning Factory's coil and coal). The
  // Headquarters ramps run down a cutting rather than into a cliff and wear none. Each mouth bakes to one solid, one hanging and one glowing mesh, memoised per island
  // so a revisit only places nodes. Pieces are [kind, x, z, quarter turns, variant, lift] in the mouth's frame.
  const THEMES = {
    lab: { glass: 1, icon: "die", string: ["bulb", 1], pieces: [["flaskBench", -5.3, 1.1], ["die", -4.1, 2.8, 0, 1], ["die", -3.5, 3.6, 1, 3], ["die", -4.1, 2.8, 1, 4, 0.5], ["terminal", 5.2, 1.0], ["chalkboard", 6.5, 2.5], ["die", 4.3, 3.2, 1, 2], ["banner", -6.7, 0.7, 0, 1], ["sack", 6.0, 3.6, 0, 1]] },
    rally: { glass: 0, icon: "flag", string: ["pennant", 0], inside: [["checkerMat", 0, -3.6, 0, 0, 0], ["toolWall", -3.15, -4.4, 1], ["workbench", -2.55, -4.4, 1], ["tireRack", 3.1, -4.6, 3], ["oilDrum", 2.6, -5.9, 0, 0], ["oilDrum", 2.9, -2.3, 0, 1], ["cone", -2.2, -1.6], ["cone", 2.3, -1.2]], ceiling: [[-2.2, 2.2, -1.4, -6.2, 3.05, [0.2, 0.5, 0.8]]], pieces: [["tireStack", -5.0, 0.9, 0, 0], ["tireStack", -5.8, 2.0, 0, 1], ["tireStack", -5.8, 2.0, 0, 0, 0.56], ["cone", -3.6, 3.0], ["cone", -4.0, 3.7], ["fuelPump", -6.6, 3.2], ["startLights", 5.0, 0.9], ["barrier", 5.7, 2.5, 0, 0], ["flag", 6.6, 0.9, 0, 0], ["flag", 3.7, 3.5, 0, 1], ["tireStack", 6.7, 3.4, 0, 1]] },
    mine: { glass: 0, icon: "pick", string: ["hanging", 0, [0.28, 0.72]], pieces: [["pickRack", -5.4, 0.9], ["dynamiteCrate", -4.3, 2.6], ["oreHeap", -6.3, 2.7, 0, 0], ["coalCrate", 5.0, 1.0, 0, 2], ["oreHeap", 6.1, 2.6, 0, 1], ["barrel", 4.3, 3.0, 0, 1], ["banner", 6.7, 0.8, 0, 3], ["crate", 5.1, 2.1, 0, 0]] },
    matrix: { glass: 2, icon: "glyph", string: ["bulb", 2], pieces: [["monolith", -5.0, 0.9, 0, 0], ["monolith", 5.0, 0.9, 0, 1], ["runeStone", -4.2, 2.8, 0, 0], ["runeStone", 4.4, 2.9, 0, 1], ["banner", 6.5, 0.8, 0, 4], ["banner", -6.5, 0.8, 0, 4], ["rubble", -6.3, 2.6, 0, 1]] },
    lightning: { glass: 0, icon: "bolt", string: ["hanging", 0, [0.3, 0.7]], boards: true, pieces: [["coalCrate", -5.1, 0.8, 0, 3], ["crate", -5.4, 2.1, 1, 0], ["crate", -5.4, 2.1, 0, 1, 0.75], ["barrel", -4.3, 2.9, 0, 1], ["sack", -3.5, 2.8, 1, 0], ["rubble", -6.4, 0.9, 0, 1], ["gauge", 5.0, 0.9], ["cart", 5.7, 2.4, 1], ["banner", 6.6, 0.8, 0, 0], ["coil", 3.8, 3.4], ["coalCrate", 6.4, 3.4, 0, 1]] },
  };
  const THEME_ICON = (slot) => THEMES[slot.theme]?.icon || null;
  const mouthDressing = (slot, m) => {
    let byIsland = DRESSED.get(island);
    if (!byIsland) DRESSED.set(island, byIsland = new Map());
    let baked = byIsland.get(slot.id);
    if (baked) return baked;
    const theme = THEMES[slot.theme];
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const set = BL.dressing.set(), ground = [];
    // Ground pieces stand on the island itself; one whose spot is inside the cliff or over a drop is left out.
    const stand = (kind, lx, lz, turns = 0, variant = 0, lift = 0) => {
      const y = island.surfaceAt(m.x + cr * lx + sr * lz, m.z - sr * lx + cr * lz) - m.floorY;
      if (Math.abs(y) > 0.9) return;
      set.put(kind, lx, y + lift, lz, turns, variant);
      if (!lift) ground.push(lx, lz);
    };
    stand("lanternPost", -4.4, 1.6, 0, theme.glass);
    stand("lanternPost", 4.4, 1.6, 2, theme.glass);
    for (const piece of theme.pieces) stand(...piece);
    const [lamp, variant, at] = theme.string;
    set.cable(-3.05, 3.42, 1.1, 3.05, 3.42, 1.1, 0.3, at || [0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9], lamp, variant);
    set.cable(-4.44, 2.98, 1.6, -3.05, 3.42, 1.1, 0.12);
    set.cable(4.44, 2.98, 1.6, 3.05, 3.42, 1.1, 0.12);
    set.put("vine", -3.0, 3.5, 1.06, 0, 0);
    set.put("vine", 2.6, 3.5, 1.06, 0, 1);
    // A dark cave's rock stands flush with the rim's face, so the planks go on in front of both.
    if (theme.boards) set.put("boards", 0, 0.2, 1.06);
    // Inside the mouth the floor is the cave's own, level with the doorway.
    for (const [kind, lx, lz, turns = 0, variant = 0, lift = 0] of theme.inside || []) set.put(kind, lx, lift, lz, turns, variant);
    for (const [ax, bx, az, bz, y, lamps] of theme.ceiling || []) {
      set.cable(ax, y, az, ax, y, bz, 0.15, lamps, "hanging", theme.glass);
      set.cable(bx, y, az, bx, y, bz, 0.15, lamps, "hanging", theme.glass);
    }
    baked = { ...set.build(), ground };
    byIsland.set(slot.id, baked);
    return baked;
  };
  // A baked set's nodes under `parent`: the solid collides, the glowing layers breathe with the lamps.
  const addDressing = (baked, parent, x, y, z, id, track) => {
    for (const node of BL.dressing.nodes(baked, { living: true })) {
      addChild(parent, node);
      if (track) placed.push(node);
      if (node.geometry === baked.solid) solids.add(node);
      else if (node.geometry === baked.glow || node.geometry === baked.swingGlow) addLamp(node, LAMP.lantern, x, y, z, false, lamps.length, `${id}:${lamps.length}`).always = true;
    }
  };
  const dressMouth = (slot, m, group) => {
    // The Canvas 2D fallback draws every face on the CPU; it keeps the plain island.
    if (renderer.kind === "canvas2d" || !THEMES[slot.theme]) return;
    const baked = mouthDressing(slot, m);
    addDressing(baked, group, m.x, m.floorY + 2.4, m.z, `${slot.id}:dressing`, false);
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry), g = baked.ground, lit = baked.lights;
    for (let i = 0; i < lit.length; i += 4) dressingLights.push(m.x + cr * lit[i] + sr * lit[i + 2], m.floorY + lit[i + 1], m.z - sr * lit[i] + cr * lit[i + 2], lit[i + 3]);
    addPieceTargets(baked.picks, (lx, ly, lz) => lz < 0.3 ? null : { x: m.x + cr * lx + sr * lz, y: m.floorY + ly, z: m.z - sr * lx + cr * lz });
    // Headquarters and a sealed cave that is coming soon still hang their name over the door.
    if (slot.status !== "open" && slot.status !== "mirror" && slot.name) addChild(group, createNode({ position: { x: 0, y: 4.5, z: 0.52 }, geometry: hubModels.caveSign(slot.name, THEME_ICON(slot)) }));
    for (let i = 0; i < g.length; i += 2) claim(m.x + cr * g[i] + sr * g[i + 1], m.z - sr * g[i] + cr * g[i + 1], 0.8);
  };
  // The meadow from the same kit, in world axes: lantern posts beside the paths with their arms over them, a
  // camp of stores round the fire, and rubble in the grass. Spots are chosen by the same claims and path tests
  // the scatter uses, before it runs; the whole island bakes to one solid, one hanging and one glowing mesh.
  const meadowDressing = (fire) => {
    if (renderer.kind === "canvas2d") return;
    let byIsland = DRESSED.get(island);
    if (!byIsland) DRESSED.set(island, byIsland = new Map());
    let baked = byIsland.get("meadow");
    if (!baked) {
      const set = BL.dressing.set(), ground = [];
      const ok = (x, z, r) => island.surfaceAt(x, z) === 0 && free(x, z, r) && workSceneryClear(x, z, r) && !nearMouth(x, z, 7);
      const stand = (kind, x, z, turns, variant, r) => {
        set.put(kind, x, 0, z, turns, variant);
        ground.push(x, z, r);
        claim(x, z, r);
      };
      const ARM = [[1, 0], [0, -1], [-1, 0], [0, 1]];
      const posts = [];
      for (let r = 7; r <= island.meadowRadius - 2; r += 3.5) for (let deg = 0; deg < 360; deg += 6) {
        const p = polar(deg + r * 7, r);
        if (!nearPath(p.x, p.z, 1.7) || nearPath(p.x, p.z, 1.0) || !ok(p.x, p.z, 0.7)) continue;
        if (posts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 8)) continue;
        let turns = -1;
        for (let q = 0; q < 4 && turns < 0; q++) if (island.isPath(p.x + ARM[q][0] * 1.4, p.z + ARM[q][1] * 1.4)) turns = q;
        if (turns < 0) continue;
        posts.push(p);
        stand("lanternPost", p.x, p.z, turns, 0, 0.7);
      }
      const CAMP = [["bench", 0.9], ["barrel", 0.55], ["coalCrate", 0.6], ["crate", 0.6], ["sack", 0.5], ["banner", 0.6, 5], ["rubble", 0.8]];
      let placed = 0;
      for (let k = 0; k < 16 && placed < CAMP.length; k++) {
        const a = k / 16 * Math.PI * 2 + 0.3, x = fire.x + Math.cos(a) * 3.1, z = fire.z + Math.sin(a) * 3.1;
        const [kind, r, variant = placed] = CAMP[placed];
        if (!ok(x, z, r) || nearPath(x, z, 0.8)) continue;
        stand(kind, x, z, k & 3, variant, r);
        placed++;
      }
      let rubble = 0;
      for (let deg = 17; deg < 360 && rubble < 12; deg += 29) {
        const p = polar(deg, 9 + (deg * 37 % 17));
        if (!ok(p.x, p.z, 0.9) || nearPath(p.x, p.z, 1.2)) continue;
        stand("rubble", p.x, p.z, deg & 3, rubble, 0.9);
        rubble++;
      }
      baked = { ...set.build(), ground };
      byIsland.set("meadow", baked);
    } else for (let i = 0; i < baked.ground.length; i += 3) claim(baked.ground[i], baked.ground[i + 1], baked.ground[i + 2]);
    addDressing(baked, root, fire.x, 2.4, fire.z, "meadow:dressing", true);
    addPieceTargets(baked.picks, (x, y, z) => ({ x, y, z }));
    // Every dressing lantern is a real light at dusk, registered after the torches and the fire so the
    // renderer's tier keeps those first; the lanterns' glass glows through the shared glow node above.
    const lit = baked.lights;
    for (let i = 0; i < lit.length; i += 4) dressingLights.push(lit[i], lit[i + 1], lit[i + 2], lit[i + 3]);
    for (let i = 0; i < dressingLights.length; i += 4) {
      addLamp({ glow: 0, flare: 0, visible: true }, DRESSING_LAMPS[dressingLights[i + 3]], dressingLights[i], dressingLights[i + 1], dressingLights[i + 2], true, (i / 4) % 5, `dressing:${i / 4}`);
    }
    dressingLights.length = 0;
  };
  // The lawn: swaying tufts in small clumps across the meadow's grass as one fixed instanced batch, a single
  // draw. Clumps with bare grass between them read as tufts, not a carpet of blades. It follows the painted
  // paths, so it is laid again whenever the island's paths change.
  const LAWN_CAP = 300;
  // Every tuft owns its slot: it keeps a tuft's width off the roads, off anything claimed on the island (props,
  // dressing, palms, scenery) and a cell apart from every other tuft, checked through a grid of the tufts
  // already laid (tuft index + 1 per cell). The grid is allocated once a page and cleared on each relay.
  const LAWN_CELL = 0.45, LAWN_SPAN = Math.ceil(2 * MEADOW_OUTER / LAWN_CELL) + 5;
  let lawn = null, lawnGrid = null;
  const lawnCell = (v) => Math.floor((v + MEADOW_OUTER) / LAWN_CELL) + 2;
  const layLawn = () => {
    const data = lawn.node.instanceData, rand = mulberry32(fnv1a("lawn"));
    const inner = Math.max(MEADOW_INNER, island.path.debug.ringOuterRadius + 0.6);
    if (lawnGrid) lawnGrid.fill(0);
    else lawnGrid = new Int16Array(LAWN_SPAN * LAWN_SPAN);
    const tuftClear = (x, z) => {
      const cx = lawnCell(x), cz = lawnCell(z);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const t = lawnGrid[(cz + dz) * LAWN_SPAN + cx + dx];
        if (t && Math.hypot(data[(t - 1) * 20 + 12] - x, data[(t - 1) * 20 + 14] - z) < LAWN_CELL) return false;
      }
      return true;
    };
    let n = 0;
    for (let tries = 0; n < LAWN_CAP && tries < LAWN_CAP * 3; tries++) {
      const p = polar(rand() * 360, Math.sqrt(lerp(inner * inner, MEADOW_OUTER * MEADOW_OUTER, rand())));
      for (let k = 1 + Math.floor(rand() * 3); k > 0 && n < LAWN_CAP; k--) {
        const x = p.x + (rand() - 0.5) * 1.1, z = p.z + (rand() - 0.5) * 1.1;
        const yaw = rand() * Math.PI * 2, s = 0.75 + rand() * 0.5;
        if (!island.isGrassAt(x, z) || island.path.overlaps(x, z, 0.3) || !free(x, z, 0.2) || !tuftClear(x, z)) continue;
        lawnGrid[lawnCell(z) * LAWN_SPAN + lawnCell(x)] = n + 1;
        const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s, o = n++ * 20;
        data[o] = c; data[o + 1] = 0; data[o + 2] = -sn; data[o + 3] = 0;
        data[o + 4] = 0; data[o + 5] = s; data[o + 6] = 0; data[o + 7] = 0;
        data[o + 8] = sn; data[o + 9] = 0; data[o + 10] = c; data[o + 11] = 0;
        data[o + 12] = x; data[o + 13] = island.surfaceAt(x, z); data[o + 14] = z; data[o + 15] = 1;
        data[o + 16] = data[o + 17] = data[o + 18] = data[o + 19] = 0;
      }
    }
    lawn.node.instanceCount = n;
    lawn.node.instanceVersion++;
    lawn.version = island.path.version;
  };
  // Palms: a pair beside every dressed mouth, groves of one to three along the meadow's edge under the cliffs and
  // on the cliff tops. Each is its own node on one of three shared geometries, so the wind bends every crown on
  // its own phase for three draws; each claims its own slot, so nothing else stands in its trunk or crown.
  const plantPalms = () => {
    if (renderer.kind === "canvas2d") return;
    const rand = mulberry32(fnv1a("palms"));
    let n = 0;
    const plant = (x, z) => {
      const y = island.surfaceAt(x, z);
      if (nearPath(x, z, 1.1) || !free(x, z, 1.2)) return false;
      // Level ground only: every side within a quarter metre of the foot.
      for (let i = 0; i < 4; i++) if (Math.abs(island.surfaceAt(x + Math.cos(i * 1.571) * 0.6, z + Math.sin(i * 1.571) * 0.6) - y) > 0.26) return false;
      const node = createNode({ geometry: BL.dressing.palm(n++ % 3), position: { x, y, z }, rotation: { x: 0, y: rand() * Math.PI * 2, z: 0 }, sightHidden: true });
      addChild(root, node);
      placed.push(node);
      solids.add(node);
      addProp("palm", node, x, z, 1.6);
      claim(x, z, 1.2);
      return true;
    };
    // A grove: up to `size` palms round a centre a trunk-and-crown apart (2.9 m), each standing only where it fits.
    const grove = (cx, cz, size, fits) => {
      if (size === 1) return fits(cx, cz) && plant(cx, cz) ? 1 : 0;
      let planted = 0;
      const a0 = rand() * Math.PI * 2, r = size === 2 ? 1.45 : 1.68;
      for (let k = 0; k < size; k++) {
        const a = a0 + k * Math.PI * 2 / size, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (fits(x, z) && plant(x, z)) planted++;
      }
      return planted;
    };
    const groveSize = () => {
      const r = rand();
      return r < 0.25 ? 1 : r < 0.65 ? 2 : 3;
    };
    for (const m of island.mouths) {
      const slot = caves.slots.find((candidate) => candidate.id === m.id);
      if (!THEMES[slot.theme]) continue;
      const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      for (const lx of [-7.6, 7.6]) {
        let planted = 0;
        for (const lz of [1.4, 4.4, 2.9]) if (planted < 2 && plant(m.x + cr * (lx + Math.sign(lx) * (lz - 1.4) * 0.3) + sr * lz, m.z - sr * (lx + Math.sign(lx) * (lz - 1.4) * 0.3) + cr * lz)) planted++;
      }
    }
    const meadowEdge = (x, z) => !nearMouth(x, z, 6) && island.surfaceAt(x, z) === 0;
    for (let deg = 5; deg < 360; deg += 38) {
      const size = groveSize();
      for (let k = 0; k < 4; k++) {
        const p = polar(deg + (rand() - 0.5) * 12, MEADOW_OUTER - 3 - rand() * 3.5);
        if (grove(p.x, p.z, size, meadowEdge)) break;
      }
    }
    // Along the cliff tops, where they break the skyline.
    const cliffTop = (x, z) => island.surfaceAt(x, z) > 2.5 && !nearMouth(x, z, 5);
    for (let deg = 11, placedTop = 0; deg < 360 && placedTop < 16; deg += 34) {
      const size = groveSize();
      for (let k = 0; k < 5; k++) {
        const p = polar(deg + (rand() - 0.5) * 14, lerp(CLIFF_INNER, CLIFF_OUTER, rand()));
        const planted = grove(p.x, p.z, size, cliffTop);
        if (planted) { placedTop += planted; break; }
      }
    }
  };
  // The sea far below and the islands on it, standing well out past the clouds.
  const SEA_Y = -70;
  const raiseIslets = () => {
    if (renderer.kind === "canvas2d") return;
    const spots = [[25, 260], [95, 330], [160, 240], [215, 300], [290, 280], [340, 360]];
    spots.forEach(([deg, r], i) => {
      const p = polar(deg, r);
      // Scenery on the horizon: no outlines, sight tests or cover ever need it.
      const node = createNode({ geometry: BL.dressing.islet(i % 3), position: { x: p.x, y: SEA_Y - 2, z: p.z }, rotation: { x: 0, y: deg * 0.7, z: 0 }, sightHidden: true });
      addChild(root, node);
      placed.push(node);
    });
  };
  // Life over the sea: gulls wheeling round the island and sails out on the water.
  let life = null;
  const buildLife = () => {
    if (renderer.kind === "canvas2d") return;
    const gulls = BL.dressing.flock({ count: 22, radius: [28, 70], height: [8, 30], seed: 3 });
    const shore = BL.dressing.flock({ count: 10, radius: [90, 150], height: [SEA_Y + 6, SEA_Y + 20], seed: 8, scale: 3 });
    const boats = BL.dressing.fleet({ sea: SEA_Y, spots: [[140, 0.4, 9], [190, 2.2, 11], [230, 3.9, 10], [170, 5.1, 8], [260, 1.3, 12]] });
    for (const node of [gulls.node, shore.node, ...boats.nodes]) {
      addChild(root, node);
      placed.push(node);
    }
    life = { gulls, shore, boats };
  };
  const buildLawn = () => {
    if (renderer.kind === "canvas2d") return;
    const node = createNode({ geometry: hubModels.lawnTuft(), instanceData: new Float32Array(LAWN_CAP * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
    addChild(root, node);
    placed.push(node);
    lawn = { node, version: -1 };
    layLawn();
  };
  const buildMouth = (slot, m) => {
    const ax = Math.sin(m.ry), az = Math.cos(m.ry);
    const caveIndex = island.mouths.indexOf(m) + 1;
    const group = createNode({ position: { x: m.x, y: m.floorY, z: m.z }, rotation: { x: 0, y: m.ry, z: 0 } });
    const rim = createNode({ position: { x: 0, y: 0, z: 0.5 }, geometry: hubModels.caveMouthRim(slot.status === "headquarters" ? 1 : 0), sightSolid: true });
    addChild(group, rim);
    solids.add(rim);
    if (slot.status === "headquarters") {
      const lintel = createNode({ position: { x: 0, y: 0, z: 0.5 }, geometry: hubModels.caveMouthRim(2), sightSolid: true });
      addChild(group, lintel);
      solids.add(lintel);
      headquartersRimLintels.push(lintel);
    }
    if (slot.status === "dark") {
      const geometry = hubModels.sealedCaveFace(sealedCaveVariant(slot.id));
      const seal = createNode({ position: { x: 0, y: 0, z: 0.52 }, geometry, matrixExterior: true, sightSolid: true });
      addChild(group, seal);
      solids.add(seal);
      sealedCaves.push({ caveIndex, mouth: m, node: seal, sr: ax, cr: az, stopZ: seal.position.z + geometry.frontZ + 0.01 });
      closedCaveZones.push({ active: true, x: m.x, z: m.z, floor: m.floorY, sr: ax, cr: az, half: PORTAL_MAX_X + 0.25, front: seal.position.z + geometry.frontZ + 0.26 });
    } else {
      const opening = rim.geometry.openingBounds;
      const geometry = { ...hubModels.matrixPrisonBars(), matrixCave: caveIndex, clipMinY: m.floorY + opening.floorY, clipMaxY: m.floorY + opening.ceilingY };
      const bars = createNode({ position: { x: 0, y: MATRIX_GATE_HIDDEN_Y, z: 0.78 }, geometry, visible: false, matrixExterior: true });
      addChild(group, bars);
      const bounds = BL.scene.boundsOf(geometry);
      matrixGates.push({ kind: "matrix-gate", caveIndex, mouth: m, node: bars, sr: ax, cr: az, open: false, localOpen: false, locked: false, raising: false, held: false, floor: opening.floorY, ceiling: opening.ceilingY, bottom: bounds.min[1], top: bounds.max[1], minX: bounds.min[0], maxX: bounds.max[0], minZ: bars.position.z + bounds.min[2], maxZ: bars.position.z + bounds.max[2], distance: matrixTravelDistance(m.x + ax * bars.position.z, m.z + az * bars.position.z) });
    }
    if (slot.status === "open" && slot.scene === "race") {
      const kart = BL.raceModels.kart("#d98a2e");
      Object.assign(kart.node.position, { x: 0, y: 0.5, z: RALLY_KART_Z });
      kart.node.rotation.y = 0.5;
      const plinth = createNode({ position: { x: 0, y: 0, z: RALLY_KART_Z }, geometry: hubModels.altarSlab() });
      Object.assign(plinth.scale, { x: 1.4, y: 0.5, z: 1.4 });
      const wheels = createNode({ position: { x: -1.7, y: 0, z: -2.6 } });
      for (let i = 0; i < 3; i++) addChild(wheels, createNode({ position: { x: 0, y: 0.12 + i * 0.24, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI / 2 }, geometry: BL.raceModels.kartWheel() }));
      const crate = createNode({ position: { x: 1.7, y: 0, z: -3 }, rotation: { x: 0, y: 0.3, z: 0 }, geometry: hubModels.woodCrate() });
      const barrel = createNode({ position: { x: 1.9, y: 0, z: -1.9 }, geometry: hubModels.barrel() });
      addChild(group, plinth, kart.node, wheels, crate, barrel);
      solids.add(plinth); solids.add(kart.node); solids.add(wheels); solids.add(crate); solids.add(barrel);
      const roof = dropModels.roofSpot(island, m, {}, 0.8);
      const plane = dropModels.plane();
      Object.assign(plane.node.position, { x: 0, y: roof.y - m.floorY, z: dropModels.ROOF_BACK });
      Object.assign(plane.node.scale, { x: 0.8, y: 0.8, z: 0.8 });
      plane.node.rotation.x = dropModels.PARK_PITCH;
      plane.node.matrixExterior = true;
      const sockX = 3.2, sockZ = dropModels.ROOF_BACK + 0.6;
      const sock = createNode({ position: { x: sockX, y: roof.y - m.floorY, z: sockZ }, geometry: dropModels.windsock() });
      sock.matrixExterior = true;
      addChild(group, plane.node, sock);
      solids.add(plane.node);
      addProp("plane", plane.node.children[0], roof.x, roof.z, 2.6).roof = roof;
      addProp("windsock", sock, m.x + ax * sockZ + Math.cos(m.ry) * sockX, m.z + az * sockZ - Math.sin(m.ry) * sockX, 1);
      const signX = m.x + ax * dropModels.SIGN_AT.z + Math.cos(m.ry) * dropModels.SIGN_AT.x, signZ = m.z + az * dropModels.SIGN_AT.z - Math.sin(m.ry) * dropModels.SIGN_AT.x;
      const sign = createNode({ position: { x: dropModels.SIGN_AT.x, y: island.surfaceAt(signX, signZ) - m.floorY, z: dropModels.SIGN_AT.z }, geometry: dropModels.roofSign() });
      sign.matrixExterior = true;
      sign.matrixSignLiving = true;
      addChild(group, sign);
      addProp("sign", sign, signX, signZ, 1);
      claim(roof.x, roof.z, 3.8);
      launchers.push(roof);
    } else if (slot.status === "headquarters") {
      addChild(group, createNode({ position: { x: 0, y: 0, z: 0 }, geometry: headquartersModels.entranceRamp(), depthBias: 0.25 }));
    } else if (slot.status === "open" && slot.scene === "mine") {
      // Ooga Mine's mouth: a track out of the dark, a cart of glowing ore, timbers and a rack blinking inside.
      const cart = createNode({ position: { x: 0, y: 0, z: -1.9 }, rotation: { x: 0, y: 0.05, z: 0 }, geometry: BL.mineModels.hubCart() });
      const rack = createNode({ position: { x: 1.3, y: 0, z: -4.6 }, rotation: { x: 0, y: -0.5, z: 0 }, geometry: BL.mineModels.hubRack() });
      addChild(group, createNode({ geometry: BL.mineModels.hubTrack() }), cart, rack);
      solids.add(cart);
      solids.add(rack);
    } else if (slot.status === "open" && slot.scene === "lab") {
      const lab = hubModels.entropyLab(m.room, m.floorY);
      addChild(group, lab.node);
      for (const node of lab.solids) solids.add(node);
      for (const display of lab.displays) if (display.node.geometry.imageSurface) {
        addTarget(display.node, { kind: "lab-link", priority: 2, weaponType: "none" });
      }
      const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      const stations = lab.stations.map((station) => ({ ...station,
        x: m.x + cr * station.x + sr * station.z, y: m.floorY + (station.y || 0),
        z: m.z - sr * station.x + cr * station.z, heading: m.ry + station.heading }));
      for (const item of lab.equipment) {
        const p = item.pickup, x = p.x, z = p.z;
        p.x = m.x + cr * x + sr * z; p.y += m.floorY; p.z = m.z - sr * x + cr * z;
        item.holder = null;
      }
      entropyLab = { ...lab, group, mouth: m, opening: rim.geometry.openingBounds, stations, phase: null };
    } else if (slot.status === "open") {
      const geometry = hubModels.caveShelves(), back = -6.5 - BL.scene.boundsOf(geometry).min[2];
      for (const x of [-1.3, 1.3]) {
        const shelves = createNode({ position: { x, y: 0, z: back }, geometry });
        addChild(group, shelves); solids.add(shelves);
      }
    } else if (slot.status === "mirror") {
      // Sit inside the rim so the cave floor ends behind the reflection.
      const node = createNode({ position: { x: 0, y: 1.5, z: 0.5 }, geometry: hubModels.mirrorPanel(), mirror: true, mirrorWalkThrough: true, mirrorReveal: 0 });
      addChild(group, node);
      mirrorCave = { slot, mouth: m, group, rim, node, sign: null };
      addTarget(node, { kind: "cave", slot, priority: 1 });
      // Keep the chamber floor clear. The compact control belongs to the cave's
      // glyph field; the labels stay living, with the grip and rails lit when latched.
      const buttonZ = -m.room.to + 0.04;
      const button = createNode({ position: { x: 0, y: 1.2, z: buttonZ }, scale: { x: 0.82, y: 0.82, z: 0.82 }, geometry: { ...hubModels.matrixLeverPlate(), matrixCave: caveIndex }, matrixExterior: true, glow: 0.45 });
      const lights = createNode({ geometry: { ...hubModels.matrixLeverLights(), matrixCave: caveIndex }, glow: 0.25 });
      const hub = createNode({ position: { x: 0, y: 0, z: 0.27 }, rotation: { x: Math.PI / 2, y: 0, z: 0 }, geometry: { ...hubModels.matrixLeverHub(), matrixCave: caveIndex } });
      const lever = createNode({ position: { x: 0, y: 0, z: 0.48 }, rotation: { x: Math.PI - 0.42, y: 0, z: 0 }, geometry: { ...hubModels.matrixLeverArm(), matrixCave: caveIndex }, glow: 0.45 });
      const grip = createNode({ geometry: { ...hubModels.matrixLeverGrip(), matrixCave: caveIndex }, glow: 0.25 });
      const labels = createNode({ geometry: { ...hubModels.matrixLeverLabels(), matrixCave: caveIndex }, matrixLiving: true, glow: 0.5 });
      addChild(lever, grip);
      addChild(button, lights, hub, lever, labels);
      addChild(group, button);
      matrixControl = {
        button, lights, lever, grip, x: m.x + ax * buttonZ, z: m.z + az * buttonZ,
        pressed: false, near: false, promptPressed: false, promptPlayer: null, promptAction: null, promptJet: false, promptRecovering: false
      };
      addTarget(button, { kind: "matrix-button", priority: 2 }, { radius: 0.72 });
    } else if (slot.status === "sleeping") {
      // Bedrolls lie along +x, as the sleep pose assumes.
      addChild(group, createNode({ position: { x: 0, y: 0.05, z: -4.5 }, rotation: { x: 0, y: -m.ry, z: 0 }, geometry: hubModels.bedroll(), depthBias: 0.3 }));
      sleepers.push({ x: m.x + ax * 0.8, y: 4.4, z: m.z + az * 0.8, timer: sleepers.length * 0.7 });
    }
    if (slot.status === "open" || slot.status === "mirror") {
      const torchGeometry = hubModels.torch();
      const torchZ = rim.position.z + rim.geometry.frontZ - torchGeometry.backZ + CAVE_TORCH_GAP;
      for (let i = 0; i < 2; i++) {
        const side = i ? "right" : "left", localX = (i ? 1 : -1) * rim.geometry.jambCenterX;
        const torch = createNode({ position: { x: localX, y: 0, z: torchZ }, geometry: torchGeometry, flare: 0, matrixEmissiveLiving: true });
        addChild(group, torch);
        const tx = m.x + ax * torchZ + Math.cos(m.ry) * localX;
        const ty = m.floorY + torchGeometry.flameY;
        const tz = m.z + az * torchZ - Math.sin(m.ry) * localX;
        const id = `${slot.id}:torch:${side}`;
        const lamp = addLamp(torch, LAMP.torch, tx, ty, tz, !slot.glowOnly, i, id);
        const debug = { id, caveId: slot.id, kind: "torch", side, localPosition: [localX, torchGeometry.flameY, torchZ], worldPosition: [tx, ty, tz], registered: !slot.glowOnly, factor: 0, lit: false, selected: false, approximated: false, rimFront: rim.position.z + rim.geometry.frontZ, fixtureBack: torchZ + torchGeometry.backZ, gap: CAVE_TORCH_GAP };
        lamp.debug = debug;
        entranceLights.push(debug);
        claim(tx, tz, 0.5);
        addProp("torch", torch, tx, tz, 0.7);
      }
      const sign = createNode({ position: { x: 0, y: 4.5, z: 0.52 }, geometry: hubModels.caveSign(slot.name, THEME_ICON(slot)), matrixEmissiveLiving: true, sightHidden: slot.scene === "lab" });
      addChild(group, sign);
      const halfW = sign.geometry.signWidth * 0.5, halfH = sign.geometry.signHeight * 0.5;
      const x = m.x + ax * sign.position.z, y = m.floorY + sign.position.y, z = m.z + az * sign.position.z;
      const tx = Math.cos(m.ry), tz = -Math.sin(m.ry);
      labels.push({
        x, y, z, ax, az, text: slot.name, node: sign,
        world: [
          { x: x - tx * halfW, y: y + halfH, z: z - tz * halfW },
          { x: x + tx * halfW, y: y + halfH, z: z + tz * halfW },
          { x: x + tx * halfW, y: y - halfH, z: z + tz * halfW },
          { x: x - tx * halfW, y: y - halfH, z: z - tz * halfW }
        ]
      });
      if (mirrorCave && mirrorCave.slot === slot) mirrorCave.sign = sign;
      const lantern = createNode({ position: { x: halfW + 0.1, y: sign.position.y + halfH + 0.14, z: 0.52 }, geometry: hubModels.lantern() });
      addChild(group, lantern);
      const lx = lantern.position.x, ly = lantern.position.y - 0.27, lz = lantern.position.z;
      const wx = m.x + Math.cos(m.ry) * lx + ax * lz;
      const wy = m.floorY + ly;
      const wz = m.z - Math.sin(m.ry) * lx + az * lz;
      const id = `${slot.id}:lantern:right`;
      const lamp = addLamp(lantern, LAMP.lantern, wx, wy, wz, !slot.glowOnly, 2, id);
      const debug = { id, caveId: slot.id, kind: "lantern", side: "right", localPosition: [lx, ly, lz], worldPosition: [wx, wy, wz], registered: !slot.glowOnly, factor: 0, lit: false, selected: false, approximated: false, rimFront: null, fixtureBack: null, gap: null };
      lamp.debug = debug;
      entranceLights.push(debug);
    }
    dressMouth(slot, m, group);
    addChild(root, group);
    placed.push(group);
    const glyphs = buildCaveGlyphs(slot, m, group);
    if (slot.status === "mirror") {
      matrixCave = glyphs;
      MATRIX_WORLD.permanentCave = matrixCave.caveIndex;
      MATRIX_WORLD.permanentPlane[0] = ax;
      MATRIX_WORLD.permanentPlane[1] = 0;
      MATRIX_WORLD.permanentPlane[2] = az;
      MATRIX_WORLD.permanentPlane[3] = -(m.x * ax + m.z * az + mirrorCave.node.position.z);
      const opening = mirrorCave.rim.geometry.openingBounds, aperture = MATRIX_WORLD.permanentAperture;
      aperture[0] = opening.maxX;
      aperture[1] = opening.ceilingY;
      aperture[2] = mirrorCave.node.position.z - mirrorCave.rim.position.z - opening.minZ;
      aperture[3] = 0.5 * (Math.abs(ax) + Math.abs(az));
      matrixCave.portal = buildMatrixPortal(m);
      matrixCave.mirrorNode = mirrorCave.node;
      matrixCave.mirrorDistance = matrixEntranceMinimum(m, PORTAL_MIN_X, PORTAL_MAX_X);
      matrixCave.unlocked = false;
      const gate = matrixGates.find((candidate) => candidate.caveIndex === matrixCave.caveIndex);
      mirrorCave.gate = gate;
      const gateShift = MIRROR_GATE_Z - gate.node.position.z;
      gate.node.position.z = MIRROR_GATE_Z;
      gate.minZ += gateShift;
      gate.maxZ += gateShift;
      gate.distance = matrixCave.mirrorDistance + MATRIX_MIRROR_HEIGHT;
      gate.locked = MIRROR_GATE_CLOSED;
      if (gate.locked) {
        gate.node.position.y = gate.floor;
        gate.node.visible = true;
        closedCaveZones.push({ active: true, x: m.x, z: m.z, floor: m.floorY, sr: ax, cr: az, half: PORTAL_MAX_X + 0.25, front: PORTAL_Z + 0.25 });
      }
    }
    return rim;
  };
  const buildPitGate = () => {
    const basement = island.headquarters.basement, hole = basement.hole;
    const distance = (hole.mouthRadius + basement.room.radius) / 2;
    // Find the clearest bearing between authored room approaches and ramp paths.
    // Keep the return landing on the flat annulus, away from the lip and circulation routes.
    let best = -Infinity, x = 0, z = 0;
    const segmentDistance = (px, pz, ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(px - ax - dx * t, pz - az - dz * t);
    };
    for (let i = 0; i < 64; i++) {
      const angle = i * Math.PI / 32, px = hole.x + Math.sin(angle) * distance, pz = hole.z + Math.cos(angle) * distance;
      let clearance = Infinity;
      for (const room of basement.rooms) {
        const length = Math.hypot(room.approach.x - hole.x, room.approach.z - hole.z);
        const ax = hole.x + (room.approach.x - hole.x) / length * hole.mouthRadius, az = hole.z + (room.approach.z - hole.z) / length * hole.mouthRadius;
        clearance = Math.min(clearance, segmentDistance(px, pz, ax, az, room.approach.x, room.approach.z) - room.corridorWidth / 2);
      }
      for (const ramp of basement.ramps) for (let j = 1; j < ramp.samples.length; j++) {
        const a = ramp.samples[j - 1], b = ramp.samples[j];
        clearance = Math.min(clearance, segmentDistance(px, pz, a.x, a.z, b.x, b.z) - ramp.width / 2);
      }
      if (clearance > best) { best = clearance; x = px; z = pz; }
    }
    if (best < 0.8) throw new Error("No clear basement Ooga Portal arrival placement");
    const controls = [];
    pitGate = BL.oogaPortal.create({ radius: hole.radius, outerRadius: hole.mouthRadius,
      position: { x: hole.x, y: hole.floor, z: hole.z }, floorMounted: true,
      manual: true, menuHint: "Choose a destination, then use either wall lever to switch the Ooga Portal on or off.",
      onDestination: entry => { for (const control of controls) control.label.geometry = BL.oogaPortalModels.destinationLabel(entry.label); },
      destinations: [{ id: "dsb", label: "DSB Land", enabled: true }, ...Array.from({ length: 4 }, (_, i) => ({ id: "quarantine-" + i, label: "Quarantined - Replicator Infestation - Clean Up In Progress", enabled: false }))],
      onTraverse: id => {
        if (entering || pitArrival || !pilot.player || id !== "dsb") return;
        entering = pitDeparting = true;
        releaseForScene(id);
        pilot.controls.reset(); input.reset(); pilot.setActive(false);
        go(id);
      },
      onMenu: open => { pilot.setActive(!open); pilot.controls.reset(); input.reset(); hud.tooltip.hide(); }
    });
    pitGate.arrivalAnchor = { x, y: basement.floor, z, clearance: best };
    pitGate.controls = controls;
    addChild(root, pitGate.root);
    // Centre each assembly on the stone between a side balcony and the southern bed corridors.
    for (const side of [1, -1]) {
      const balcony = basement.balconies.find(entry => entry.side === side);
      const edge = side > 0 ? balcony.endAngle : balcony.startAngle;
      const room = basement.rooms[side > 0 ? 6 : 9];
      const roomAngle = room.angle - (side < 0 ? Math.PI * 2 : 0) - side * Math.asin(room.corridorWidth / 2 / basement.room.radius);
      const angle = (edge + roomAngle) / 2, sx = Math.sin(angle), sz = -Math.cos(angle);
      const control = BL.oogaPortalModels.wallControl(), radius = basement.room.radius - 0.75;
      if (side < 0) {
        control.button.position.x = -control.button.position.x;
        control.screen.position.x = -control.screen.position.x;
      }
      Object.assign(control.root.position, { x: hole.x + sx * radius, y: basement.floor + 1.35, z: hole.z + sz * radius });
      control.root.rotation.y = Math.atan2(-sx, -sz);
      // Interaction is at the lever face, safely in front of the voxel wall.
      const cr = Math.cos(control.root.rotation.y), sr = Math.sin(control.root.rotation.y);
      control.x = control.root.position.x + cr * control.button.position.x + sr * 0.48;
      control.y = control.root.position.y;
      control.z = control.root.position.z - sr * control.button.position.x + cr * 0.48;
      control.screenPoint = { x: control.root.position.x + cr * control.screen.position.x + sr * 0.225, y: control.root.position.y, z: control.root.position.z - sr * control.screen.position.x + cr * 0.225 };
      control.approach = { x: control.x - sx, y: basement.floor, z: control.z - sz };
      controls.push(control); placed.push(control.root); addChild(root, control.root);
      solids.add(control.root);
      control.label.geometry = BL.oogaPortalModels.destinationLabel(pitGate.selected.label);
      addTarget(control.button, { kind: "ooga-portal-lever", control, priority: 2 }, { radius: 0.72 });
      addTarget(control.screen, { kind: "ooga-portal-screen", control, priority: 2 });
    }
  };
  const buildHeadquarters = () => {
    const floor = island.headquarters.floor, basement = island.headquarters.basement;
    const room = createNode({ position: { x: 0, y: floor, z: 0 }, geometry: headquartersModels.room() });
    addChild(root, room);
    placed.push(room);
    solids.add(room);
    const benches = [];
    for (const x of [-2.6, 2.6]) for (const z of [-0.55, 0.55]) benches.push({ kind: "bench", x, y: floor + 0.58, z, floor, ry: Math.atan2(-x, -z), sitter: null, walkAt: { x: x - Math.sign(x) * 0.85, z } });
    const entrances = [], lights = [], mattresses = [], roomSigns = [], rampMarkers = [];
    FLY.yMin = basement.floor - 1;
    const addEntrance = (node, roomIndex, lower, ramp = false) => {
      node.sightSolid = true;
      addChild(root, node);
      placed.push(node);
      solids.add(node, true);
      const bounds = BL.scene.boundsOf(node.geometry);
      entrances.push({ roomIndex, node, basement: lower, ramp, sr: Math.sin(node.rotation.y), cr: Math.cos(node.rotation.y), radius: Math.hypot(Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])) * node.scale.x, Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]))), minY: node.position.y + bounds.min[1], maxY: node.position.y + bounds.max[1] });
    };
    const torchAt = (x, y, z) => {
      const node = createNode({ position: { x, y, z }, geometry: hubModels.torch(), glow: 0.85, matrixEmissiveLiving: true });
      addChild(root, node);
      placed.push(node);
      lights.push({ id: `headquarters:${lights.length}`, node, x, y: y + 1.6, z });
    };
    for (const level of [island.headquarters, basement]) for (const cave of level.rooms) {
      const i = cave.index, angle = cave.angle;
      const entrance = createNode({ position: { x: cave.entrance.x, y: cave.floor, z: cave.entrance.z }, rotation: { x: 0, y: -angle, z: 0 }, scale: { x: (cave.corridorWidth ?? cave.width - 1.3) / 3.86, y: 1, z: 1 }, geometry: headquartersModels.roomEntrance(i) });
      addEntrance(entrance, i, level === basement);
      const dimensions = headquartersModels.MATTRESS, across = -(cave.width / 2 - dimensions.wallInset - dimensions.width / 2), along = cave.depth / 2 - dimensions.wallInset - dimensions.depth / 2;
      const sx = Math.sin(angle), cx = Math.cos(angle), geometry = headquartersModels.mattress(cave);
      const sign = createNode({ position: { x: cave.entrance.x - sx * 0.28, y: cave.floor + 3.78, z: cave.entrance.z + cx * 0.28 }, rotation: { x: 0, y: -angle, z: 0 }, geometry: headquartersModels.roomSign(cave), matrixSignLiving: true });
      addChild(root, sign);
      placed.push(sign);
      const hanging = { roomIndex: i, basement: level === basement, room: cave, node: sign, sr: -sx, cr: cx, velocity: 0, hits: 0, contacts: 0 };
      roomSigns.push(hanging);
      addTarget(sign, { kind: "room-sign", roomSign: hanging });
      const node = createNode({ position: { x: cave.x + cx * across + sx * along, y: cave.floor, z: cave.z + sx * across - cx * along }, rotation: { x: 0, y: -angle, z: 0 }, geometry });
      addChild(root, node);
      placed.push(node);
      const side = dimensions.width / 2 + 0.5;
      mattresses.push({ roomIndex: i, basement: level === basement, corner: "rear-left", room: cave, node, ...geometry.mattress,
        x: node.position.x, y: cave.floor, z: node.position.z, sr: -sx, cr: cx, sleeper: null, sleep: dimensions,
        window: island.headquarters.windows.find((window) => window.kind === "room" && window.roomIndex === i && window.basement === (level === basement)), sightFrame: -1, sightVisible: false,
        collisionBoxes: new Float64Array([-dimensions.width / 2, 0, -dimensions.depth / 2, dimensions.width / 2, dimensions.surface, dimensions.depth / 2,
          -0.45, dimensions.surface, dimensions.pillowZ - 0.25, 0.45, dimensions.pillowTop, dimensions.pillowZ + 0.25]),
        walkAt: { x: node.position.x + cx * side, y: cave.floor, z: node.position.z + sx * side }
      });
    }
    for (const ramp of basement.ramps) {
      const p = ramp.entrance;
      // Scale so the model's inner opening, including the voxel edge, clears the tunnel.
      const entrance = createNode({ position: { x: p.x, y: p.y, z: p.z }, rotation: { x: 0, y: -ramp.angle, z: 0 }, scale: { x: (ramp.width + island.unit * Math.SQRT2) / 3.86, y: 1, z: 1 }, geometry: headquartersModels.rampEntrance(ramp.index) });
      addEntrance(entrance, ramp.index, false, true);
    }
    const addRampMarker = (ramp, label, floor, channel) => {
      const first = ramp.samples[0], ahead = ramp.samples[Math.min(3, ramp.samples.length - 1)];
      const dx = ahead.x - first.x, dz = ahead.z - first.z, length = Math.hypot(dx, dz) || 1;
      const direction = { x: dx / length, z: dz / length };
      const at = (distance) => {
        let i = 1; while (i < ramp.samples.length - 1 && ramp.samples[i].s < distance) i++;
        const from = ramp.samples[i - 1], to = ramp.samples[i], k = (distance - from.s) / (to.s - from.s);
        return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
      };
      // Both smaller marks sit inside the opening and follow the real ramp
      // pitch. The label comes first; its arrow continues farther downhill.
      const fitted = (distance, geometry) => {
        const half = Math.min(0.35, distance * 0.3), point = at(distance), from = at(distance - half), to = at(distance + half);
        const tx = to.x - from.x, ty = to.y - from.y, tz = to.z - from.z, horizontal = Math.hypot(tx, tz) || 1;
        return { point, node: createNode({ position: { x: point.x, y: point.y + 0.035, z: point.z }, rotation: { x: Math.atan2(-ty, horizontal), y: Math.atan2(tx, tz), z: 0 },
          scale: { x: 0.72, y: 0.72, z: 0.72 }, geometry, visible: false, depthBias: 0.35 }) };
      };
      const labelDistance = Math.min(0.85, ramp.length * 0.12), arrowDistance = Math.min(1.85, ramp.length * 0.24);
      const labelMark = fitted(labelDistance, null);
      const arrowMark = fitted(arrowDistance, headquartersModels.rampMarkerArrow());
      const frame = labelMark.node, arrow = arrowMark.node, labelPoint = labelMark.point, arrowPoint = arrowMark.point;
      const node = createNode({ geometry: headquartersModels.rampMarkerLabel(label), depthBias: 0.35 });
      const yaw = frame.rotation.y, pitch = frame.rotation.x;
      const across = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
      const downhill = { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      addChild(frame, node);
      addChild(root, frame, arrow);
      placed.push(frame, arrow);
      rampMarkers.push({ node, frame, arrow, label, across, downhill, channel, ramp, direction, labelDistance, arrowDistance, labelPoint, arrowPoint });
    };
    for (let i = 0; i < island.headquarters.ramps.length; i++) addRampMarker(island.headquarters.ramps[i], "HQ", 0, i);
    for (let i = 0; i < basement.ramps.length; i++) addRampMarker(basement.ramps[i], "B1", floor, i + 2);
    for (const ramp of island.headquarters.ramps) {
      const p = ramp.samples[30], angle = Math.atan2(p.x, -p.z), radius = Math.hypot(p.x, p.z) - 1.6;
      torchAt(Math.sin(angle) * radius, p.y + 0.6, -Math.cos(angle) * radius);
    }
    const firepit = createNode({ position: { x: 0, y: floor, z: 0 }, geometry: hubModels.firepit() });
    solids.add(firepit);
    const flame = createNode({ geometry: hubModels.fireFlame(), glow: 0.9, matrixEmissiveLiving: true });
    addChild(firepit, flame);
    fireHazards.push({ node: flame, pit: firepit, x: 0, y: floor, z: 0, avoidRadius: FIRE_AVOID_RADIUS });
    addChild(root, firepit);
    placed.push(firepit);
    const hearth = { id: "headquarters:hearth", node: flame, x: 0, y: floor + 0.6, z: 0, phase: 23 };
    lights.push(hearth);
    // The hearth is the only shared HQ point light.
    // Windows and ramp torches stay physical/emissive; no camera-proximity light spills into an unclaimed room.
    const sources = [hearth];
    return { node: room, entrances, mattresses, roomSigns, rampMarkers, benches, fireHazards, lights, sources, hearth, firepit, rooms: island.headquarters.rooms, windows: island.headquarters.windows, ramps: island.headquarters.ramps, openFloor: island.headquarters.room, basement, sleepMarksVisible };
  };
  // The launch islet (bridge, pad, tower, sign) is all solid, so an Ooga walks over the bridge onto the pad.
  const buildLaunchSite = () => {
    const { SITE } = rocketModels;
    const spot = rocketModels.siteSpot(island, {});
    launchCloudSpot = spot;
    const site = rocketModels.site(spot);
    addChild(root, site.node);
    placed.push(site.node);
    addTerrainSection(site.islet.geometry.cutawaySource, site.node, spot.y);
    solids.add(site.islet);
    addProp("launchpad", site.pad, spot.x, spot.z, SITE.padR);
    addProp("tower", site.tower, spot.x + SITE.towerX, spot.z, 1.4);
    addProp("bridge", site.bridge, spot.x, spot.bridgeZ + SITE.span / 2, SITE.width);
    addProp("orbitsign", site.sign, spot.x + site.sign.position.x, spot.z + site.sign.position.z, 1);
    const saved = game.state.orbit.build;
    const rocket = rocketModels.assemble(saved && rocketParts.check(saved).ok ? saved : rocketParts.PRESETS[0].stack);
    Object.assign(rocket.node.position, { x: spot.x, y: spot.padY, z: spot.z });
    addChild(root, rocket.node);
    placed.push(rocket.node);
    for (const part of rocket.parts) addProp("rocket", part.node, spot.x, spot.z, part.part.r + 0.3);
    claim(spot.x, spot.z, SITE.isletR + 1);
    // Claim the meadow-to-bridge-head walk so scatter keeps scenery off it.
    for (let z = spot.bridgeZ; z > spot.bridgeZ - 7; z -= 1.5) claim(spot.x, z, 2.4);
    launchers.push({ x: spot.x, y: spot.padY, z: spot.z, scene: "orbit" });
    presets.orbit = { yaw: -0.64, pitch: 0.3, dist: 22 + rocket.height, target: { x: spot.x, y: spot.padY + rocket.height * 0.45, z: spot.z } };
  };
  // An invisible one-way staircase continues from the dock into the sky. It
  // only arms from a grounded step off the outer deck: arriving from the air,
  // or jumping once on it, leaves every tread intangible until the visitor
  // returns to the dock. The small fixed glyph pool reveals only fresh foot
  // contacts, without adding collision meshes or per-frame allocations.
  const buildDockStairs = (dock) => {
    const START = 4.25, RUN = 0.62, RISE = 0.5, HALF_WIDTH = 0.78, EFFECT_TIME = 0.62;
    const base = dock.position.y, count = Math.ceil((FLY.yMax - base) / RISE), end = START + count * RUN;
    const ry = dock.rotation.y, ux = Math.cos(ry), uz = -Math.sin(ry), vx = Math.sin(ry), vz = Math.cos(ry);
    const glyphs = [];
    for (let i = 0; i < MATRIX_TYPES; i++) {
      const node = createNode({ visible: false, rotation: { x: -Math.PI / 2, y: ry, z: 0 }, geometry: hubModels.matrixGlyph(i), glow: 1 });
      node.dockLife = 0;
      addChild(root, node);
      placed.push(node);
      glyphs.push(node);
    }
    let active = false, owner = null, lastStep = 0, nextGlyph = 0, contacts = 0, jumpRejects = 0;
    const alongAt = (x, z) => (x - dock.position.x) * ux + (z - dock.position.z) * uz;
    const acrossAt = (x, z) => (x - dock.position.x) * vx + (z - dock.position.z) * vz;
    const indexAt = (along, across, radius = PLAYER_RADIUS) => {
      if (Math.abs(across) > HALF_WIDTH + radius || along < START - radius || along > end + radius) return 0;
      return Math.min(count, Math.max(1, Math.floor((along + radius - START) / RUN) + 1));
    };
    const floorAt = (index) => Math.min(FLY.yMax, base + index * RISE);
    const groundedOnDock = (actor) => {
      if (!actor || actor !== pilot?.player || actor.hop !== 0 || actor.hopV > 0 || actor.jet?.thrust) return false;
      const p = actor.root.position, feet = p.y - actor.baseY, along = alongAt(p.x, p.z), across = acrossAt(p.x, p.z);
      return along >= 3 - PLAYER_RADIUS && along <= START + 0.1 && Math.abs(across) <= 1 + PLAYER_RADIUS && Math.abs(feet - base) < 0.08;
    };
    const reset = (jumped = false) => {
      if (jumped && active) jumpRejects++;
      active = false; owner = null; lastStep = 0;
    };
    const supportAt = (x, z, y, maxStep, actor, entering) => {
      if (actor !== pilot?.player) return -Infinity;
      if (active && (actor !== owner || actor.hop > 1e-7 || actor.hopV > 0 || actor.jet?.thrust)) reset(true);
      const along = alongAt(x, z), across = acrossAt(x, z), index = indexAt(along, across);
      if (!active) {
        // Only a real walking destination may arm the first tread. Camera,
        // spawn and ordinary ground probes pass entering=false.
        if (!entering || index !== 1 || !groundedOnDock(actor)) return -Infinity;
        active = true; owner = actor; lastStep = 0;
      }
      if (!index) return -Infinity;
      const floor = floorAt(index);
      return floor <= y + maxStep + 1e-7 ? floor : -Infinity;
    };
    const emit = (actor, index) => {
      const node = glyphs[nextGlyph];
      nextGlyph = (nextGlyph + 1) % glyphs.length;
      const p = actor.root.position, across = acrossAt(p.x, p.z), along = START + (index - 0.5) * RUN;
      node.position.x = dock.position.x + ux * along + vx * across;
      node.position.y = floorAt(index) + 0.018;
      node.position.z = dock.position.z + uz * along + vz * across;
      node.scale.x = node.scale.y = 2.8;
      node.scale.z = 1;
      node.glow = 1;
      node.dockLife = EFFECT_TIME;
      node.visible = true;
      contacts++;
    };
    const update = (dt, actor) => {
      for (let i = 0; i < glyphs.length; i++) {
        const node = glyphs[i];
        if (node.dockLife <= 0) continue;
        node.dockLife = Math.max(0, node.dockLife - dt);
        const k = node.dockLife / EFFECT_TIME;
        node.scale.x = node.scale.y = 1.8 + k;
        node.glow = 0.35 + k * 0.65;
        if (!node.dockLife) node.visible = false;
      }
      if (!active || actor !== owner) return;
      if (actor.hop > 1e-7 || actor.hopV > 0 || actor.jet?.thrust) { reset(true); return; }
      const p = actor.root.position, along = alongAt(p.x, p.z), across = acrossAt(p.x, p.z), index = indexAt(along, across);
      if (!index) {
        if (along <= START && Math.abs(across) <= 1 + PLAYER_RADIUS) reset(false);
        return;
      }
      const feet = p.y - actor.baseY;
      if (Math.abs(feet - floorAt(index)) < 0.08 && index !== lastStep) {
        lastStep = index;
        emit(actor, index);
      }
    };
    return {
      supportAt, update, reset, alongAt, acrossAt, indexAt, floorAt,
      base, start: START, run: RUN, rise: RISE, halfWidth: HALF_WIDTH, count, end, top: FLY.yMax, glyphs,
      get active() { return active; }, get lastStep() { return lastStep; }, get contacts() { return contacts; }, get jumpRejects() { return jumpRejects; }
    };
  };
  // A poked animal cries out from the shared bubble pool and startles: its own brain decides what that means
  // (the jaguar bolts, the monkey makes for a tree, the toucan takes off, a sleeper wakes).
  const pokeBeast = (node, kind) => {
    const beast = beasts.get(node);
    if (!beast) return;
    const cries = BEAST_CRIES[kind];
    fx.sayAt(beast.wx, beast.wy + (kind === "toucan" ? 0.9 : 1.1), beast.wz, cries[fnv1a(`${kind}/${Math.floor(now * 3)}`) % cries.length], 1.8);
    mempoolIsland.wildlife.startle(beast);
  };
  // The Mempool island off the west rim: jungle floor, a vine bridge and the cave that reads the
  // chain. Everything solid, so an Ooga walks across and in. The scatter is claimed off the crossing.
  const buildMempoolIsland = () => {
    const P = poolModels, S = P.SITE, DIR = P.DIR, SITE_SHAFT_REACH = S.shaftR + 1.2;
    // How much ground an animal keeps to itself, measured against each plant's own footprint.
    const BEAST_CLEAR = 1.3;
    const place = P.spot(island, {});
    const site = P.build(place);
    // The group is turned by `place.ry`, so a local point reaches world through that same rotation:
    // local +x runs to (cos ry, -sin ry) and local +z to (sin ry, cos ry).
    const cos = Math.cos(place.ry), sin = Math.sin(place.ry);
    const worldX = (lx, lz) => place.x + lx * cos + lz * sin;
    const worldZ = (lx, lz) => place.z - lx * sin + lz * cos;
    const atNode = (kind, node, radius) => addProp(kind, node, worldX(node.position.x, node.position.z), worldZ(node.position.x, node.position.z), radius);
    addChild(root, site.node);
    placed.push(site.node);
    addTerrainSection(site.ground.geometry.cutawaySource, site.node, place.y);
    solids.add(site.ground);
    addProp("poolbridge", site.bridge, worldX(0, place.bridgeLocalZ + S.span / 2), worldZ(0, place.bridgeLocalZ + S.span / 2), S.width);
    atNode("poolstair", site.stair, SITE_SHAFT_REACH);
    atNode("poolsign", site.sign, 1.4);
    // The bridge arrives along local +z and the cave sign stands between it and the hole, so both boards
    // go on the far side at -z: with no turn at all their faces already look back up the crossing. They
    // stand a little apart and toe in, so from the bridge head the pair reads as one post.
    const B = P.CHAIN_BOARD;
    const boardNode = createNode({ position: { x: 0, y: 0, z: -(S.shaftR + 2.6) }, geometry: P.chainBoard() });
    // The panel is centred on the face from the board's own numbers, so resizing the board moves it.
    const panelNode = createNode({
      position: { x: -CHAIN_PANEL_W * B.px / 2, y: B.y + (B.h - CHAIN_PANEL_H * B.px) / 2, z: B.d / 2 + 0.02 }
    });
    addChild(boardNode, panelNode);
    addChild(site.node, boardNode);
    atNode("chainsign", boardNode, B.w * 0.55);
    // A small post beside it: the weather is the other half of what the chain is saying here.
    const infoNode = createNode({
      position: { x: B.w / 2 + 1, y: 0, z: -(S.shaftR + 2.6) }, rotation: { x: 0, y: -0.3, z: 0 }, geometry: P.infoSign()
    });
    addChild(site.node, infoNode);
    atNode("weathersign", infoNode, 1);
    {
      const canvas = document.createElement("canvas");
      canvas.width = CHAIN_PANEL_W;
      canvas.height = CHAIN_PANEL_H;
      // willReadFrequently: every refresh reads the panel back, and without it Chrome warns.
      chainSign = { node: panelNode, ctx2d: canvas.getContext("2d", { alpha: false, willReadFrequently: true }), printed: "" };
    }
    for (const torch of site.torches) atNode("torch", torch, 0.5);
    // The animals' starting spots are claimed before the scatter, so no plant is seeded where one stands; they
    // come alive once the forest is placed (`pool-wildlife.js`), since they walk round its trunks and climb them.
    const ANIMALS = [
      ["jaguar", -7.4, 5.2, 2.1], ["jaguar", 8.1, 6.6, -0.6],
      ["monkey", 5.6, -7.8, 1.2], ["monkey", -8.6, -3.4, -2.3],
      ["toucan", -4.2, -8.6, 0.4], ["toucan", 9.4, 1.8, 2.7]
    ];
    const claimed = ANIMALS.map(([, x, z]) => ({ x, z, r: BEAST_CLEAR }));
    // What the animals keep off, in the island group's frame: the stairwell, the pond, the boards, the cave
    // sign and its torches, then every trunk, rock and log the scatter places.
    const obstacles = [
      { x: 0, z: 0, r: S.shaftR + 1.2 }, { x: 6.4, z: -4.6, r: 2.8 },
      { x: -2.6, z: -(S.shaftR + 2.6), r: 1.1 }, { x: 0, z: -(S.shaftR + 2.6), r: 1.1 }, { x: 2.6, z: -(S.shaftR + 2.6), r: 1.1 }, { x: B.w / 2 + 1, z: -(S.shaftR + 2.6), r: 0.7 },
      { x: 0, z: S.shaftR + 2.1, r: 1.3 }, { x: -(S.shaftR + 1.5), z: S.shaftR * 0.7, r: 0.4 }, { x: S.shaftR + 1.5, z: S.shaftR * 0.7, r: 0.4 }
    ];
    const trees = [], logs = [];
    // Rainforest: three canopy heights, ferns and shrubs under them, each species one shared geometry
    // and one prop kind, so every plant answers a tap the way the home island's own scatter does.
    // `r` is both the footprint it claims and the radius a pointer picks it by.
    const SCATTER = [
      { upTo: 0.30, kind: "canopy", r: 0.6 },
      { upTo: 0.50, kind: "bush", r: 0.55 },
      { upTo: 0.72, kind: "poolfern", r: 0.5 },
      { upTo: 0.88, kind: "flower", r: 0.6 },
      { upTo: 0.95, kind: "poolrock", r: 0.7 },
      { upTo: 2, kind: "poollog", r: 1.7 }
    ];
    const rand = mulberry32(4242);
    const geometryFor = (kind) => kind === "canopy" ? P.CANOPY[(rand() * P.CANOPY.length) | 0]()
      : kind === "bush" ? P.shrub() : kind === "poolfern" ? P.fern() : kind === "flower" ? P.flowers()
      : kind === "poolrock" ? P.mossRock() : P.log();
    for (let i = 0; i < 74; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (S.isletR - 1.6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // Keep the stairwell, its approach from the bridge and the pond clear.
      if (Math.hypot(x, z) < S.shaftR + 4) continue;
      if (Math.abs(x) < 2.6 && z > 0) continue;
      if (Math.hypot(x - 6.4, z + 4.6) < 3.2) continue;
      const roll = rand();
      const pick = SCATTER.find((e) => roll < e.upTo);
      // Nothing grows through an animal. Plants still crowd each other, which is what makes it jungle.
      if (claimed.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pick.r)) continue;
      const geometry = geometryFor(pick.kind);
      // A little scale and turn per copy: free variety, since every copy shares one cached build.
      const k = 0.82 + rand() * 0.45;
      const node = createNode({ position: { x, y: 0, z }, rotation: { x: 0, y: rand() * Math.PI * 2, z: 0 }, scale: { x: k, y: 0.9 + rand() * 0.3, z: k }, geometry });
      // Undergrowth stays out of the outline registry, as the home scatter's bushes and flowers do.
      if (pick.kind === "bush" || pick.kind === "poolfern" || pick.kind === "flower") node.sightHidden = true;
      addChild(site.node, node);
      atNode(pick.kind, node, pick.r * k);
      const feature = { x, z, ry: node.rotation.y, k, sy: node.scale.y, geometry };
      if (pick.kind === "canopy") { trees.push(feature); obstacles.push({ x, z, r: 0.45 * k }); }
      else if (pick.kind === "poolrock") obstacles.push({ x, z, r: 0.75 * k });
      else if (pick.kind === "poollog") {
        logs.push(feature);
        const ax = Math.cos(feature.ry), az = -Math.sin(feature.ry);
        for (const t of [-1.2, 0, 1.2]) obstacles.push({ x: x + ax * t * k, z: z + az * t * k, r: 0.4 * k });
      }
    }
    const WORLD_AT = (lx, lz, out) => { out.x = worldX(lx, lz); out.z = worldZ(lx, lz); return out; };
    const wildlife = BL.poolWildlife.create({
      parent: site.node, obstacles, trees, logs, baseY: place.y, toWorld: WORLD_AT,
      animals: ANIMALS.map(([kind, x, z, heading]) => ({ kind, x, z, heading })),
      sleepy: () => phase === "night" || phase === "midnight"
    });
    // Each animal answers a tap through its body part, and its pick owner follows it about the island.
    for (const beast of wildlife.list) {
      beast.wx = worldX(beast.x, beast.z); beast.wy = place.y; beast.wz = worldZ(beast.x, beast.z);
      beast.owner = addProp(beast.kind, beast.node, beast.wx, beast.wz, 0.7);
      beasts.set(beast.node, beast);
    }
    // The islet and the rim-to-bridge-head walk are claimed after the home scatter, not before it.
    // Claiming first made the scatter's seeded retries draw different numbers, reshuffling trees all
    // over the island; claiming after leaves the scatter exactly as it is without this island, and
    // reflow then hides only what actually stands on the walk.
    const claimGround = () => {
      claim(place.x, place.z, S.isletR + 1);
      for (let k = 0; k < 7; k += 1.5) claim(DIR.x * (place.rimRadius - k), DIR.z * (place.rimRadius - k), 2.4);
    };
    // Look down the stairwell from just above the kerb.
    presets.pool = { yaw: -2.1, pitch: 0.62, dist: 11, target: { x: place.x, y: place.y - 1.2, z: place.z } };
    // The weather stands over this island: its centre, its top face, and the ground the rain lands on.
    const centre = { x: place.x, y: place.y, z: place.z };
    const groundAt = (gx, gz) => {
      const dx = gx - place.x, dz = gz - place.z, d2 = dx * dx + dz * dz;
      // Rain that finds the stairwell falls all the way to the landing at the bottom of it.
      if (d2 <= S.shaftR * S.shaftR) return place.y - S.shaftDepth + 0.1;
      if (d2 <= S.isletR * S.isletR) return place.y;
      return island.surfaceAt(gx, gz);
    };
    return { site, place, centre, groundAt, worldX, worldZ, claimGround, wildlife };
  };
  const buildTimechainIsland = () => {
    const T = BL.timechainModels, site = T.build(island), p = site.place;
    const cos = Math.cos(p.ry), sin = Math.sin(p.ry);
    addChild(root, site.node);
    placed.push(site.node);
    for (const node of [site.ground, site.shell, site.entrance, site.bridge, site.chair]) solids.add(node);
    // Match the visible grass tiles, not the bounding sphere around the cliff.
    for (const [kind, node, radius] of [["timechainentrance", site.entrance, 3], ["timechainbridge", site.bridge, 1.5], ["timechainchair", site.chair, 1.5]]) {
      const x = node.position.x, z = node.position.z;
      addProp(kind, node, p.x + x * cos + z * sin, p.z - x * sin + z * cos, radius);
    }
    presets.timechain = { yaw: p.ry, pitch: 0.03, dist: 3, target: { x: p.x, y: p.y + 4.4, z: p.z } };
    const claimGround = () => {
      claim(p.x, p.z, T.SITE.radius + 1);
      for (let r = p.approachFrom - 1; r <= p.rim; r += 1) claim(T.DIR.x * r, T.DIR.z * r, 2.4);
    };
    const hangout = [[-2, -1], [-2, 2], [1, 1]].map(([x, z]) => ({ x: p.x + x * cos + z * sin, z: p.z - x * sin + z * cos, ry: p.ry }));
    const x = site.chair.position.x, z = site.chair.position.z;
    const seat = { x: p.x + x * cos + z * sin, z: p.z - x * sin + z * cos, angle: Math.PI, speed: 0, phase: 0, active: false };
    const beer = BL.timechainBeer.create(site);
    solids.add(beer.dispenser); solids.add(beer.cabinet); solids.add(beer.bin);
    addProp("timechainbeer", beer.mug, site.chair.position.x - 0.95, site.chair.position.z, 0.3);
    return { site, place: p, boards: null, seat, beer, claimGround, hangout, residentPlaced: false, show: T.show(site) };
  };
  // The Sphere's walls and their feed (six slow API calls, then polls, each repainting a wall) wait until the camera
  // comes near, so a visit that never goes there never pays for them. They sit on the shell's inner face, which keeps
  // its outline, so they stay out of the outline registry.
  const addTimechainBoards = () => {
    const T = timechainIsland, p = T.place, cos = Math.cos(p.ry), sin = Math.sin(p.ry);
    const boards = BL.timechainBoards.create(T.site.node, renderer, () => { timechainVersion++; });
    boards.entries.forEach((entry, index) => {
      const node = entry.node, x = node.position.x, z = node.position.z;
      node.sightHidden = entry.panel.sightHidden = true;
      const owner = addProp("timechainboard", node, p.x + x * cos + z * sin, p.z - x * sin + z * cos, 15);
      owner.boardIndex = index; owner.weaponType = "none"; owner.pickRay = ray => boards.pickScreen(ray, index);
    });
    T.boards = boards;
  };
  const spinTimechainChair = () => {
    if (timechainIsland?.seat.active) timechainIsland.beer.act("spin", timechainIsland.seat);
  };
  const chugTimechainGlass = () => {
    if (timechainIsland?.seat.active) timechainIsland.beer.act("chug", timechainIsland.seat);
  };
  const timechainResidentPose = (cave, dt) => {
    if (!timechainIsland || cave.traits.name !== "SaniExp") return false;
    const T = timechainIsland, s = T.seat, parts = cave.parts;
    if (cave === pilot?.player || contributors.debugState) {
      T.beer.pause();
      if (s.active) {
        s.active = false; cave.root.rotation.x = cave.root.rotation.z = 0;
        parts.legL.rotation.x = parts.legR.rotation.x = 0;
        parts.armL.rotation.x = parts.armR.rotation.x = -0.2;
        parts.head.rotation.x = 0;
      }
      return false;
    }
    const h = cave.traits.height;
    s.active = true; s.phase = (s.phase + dt * 7) % (Math.PI * 2);
    cave.walk = null; cave.hop = cave.hopV = cave.cheer = cave.catchT = 0;
    cave.act.kind = "idle"; cave.act.until = Infinity;
    cave.root.visible = true; cave.root.quaternion = null;
    cave.root.position.x = s.x; cave.root.position.z = s.z; cave.root.position.y = T.place.y + 0.88 * h;
    cave.root.rotation.x = -0.23; cave.root.rotation.z = 0; cave.root.rotation.y = T.place.ry + s.angle;
    T.site.chair.scale.x = T.site.chair.scale.y = T.site.chair.scale.z = h;
    parts.legL.rotation.x = parts.legR.rotation.x = -1.05;
    parts.armL.quaternion = parts.armR.quaternion = null;
    parts.armL.rotation.x = -0.95 + Math.sin(s.phase) * 0.035;
    parts.armR.rotation.x = -0.95 - Math.sin(s.phase) * 0.035;
    parts.armL.rotation.z = -0.12; parts.armR.rotation.z = 0.12;
    parts.head.rotation.x = 0.28;
    parts.club.visible = parts.gun.visible = parts.snack.visible = false;
    T.beer.update(cave, s, dt);
    return true;
  };
  // Dock over the drop and ladder on the bluff
  const buildRim = () => {
    const d = polar(DOCK_DEG, CLIFF_OUTER);
    const dock = place(hubModels.dock(), d.x, d.z, Math.PI / 2 - DOCK_DEG * DEG, island.surfaceAt(d.x, d.z), "dock", 2.2);
    dockStairs = buildDockStairs(dock);
    headquarters.dockStairs = dockStairs;
    claim(d.x, d.z, 2.5);
    let faceX = MEADOW - 1;
    while (island.surfaceAt(faceX + island.unit / 2, LADDER_Z) < 3) faceX += island.unit;
    const foot = faceX - LADDER_LEAN - 0.06;
    const lean = createNode({ position: { x: foot, y: 0, z: LADDER_Z }, rotation: { x: 0, y: 0, z: -Math.asin(LADDER_LEAN / 4) } });
    const rungs = createNode({ rotation: { x: 0, y: Math.PI / 2, z: 0 }, geometry: hubModels.ladder() });
    addChild(lean, rungs);
    addChild(root, lean);
    placed.push(lean);
    claim(foot, LADDER_Z, 1);
    addProp("ladder", rungs, foot, LADDER_Z, 1.2).lean = lean;
    spots.push({ x: foot - 1.1, z: LADDER_Z, ry: Math.PI / 2 });
  };
  // Rejection sampling: scatter props, keeping off paths and mouths.
  const scatter = () => {
    const rand = mulberry32(SEED);
    const treeGroundClear = (geometry, x, z, y) => {
      // Scan every voxel column touched by the solid crown and a walking body's
      // radius. Four corner samples miss narrow, higher steps on cave roofs.
      const reach = geometry.treeSolidRadius + PLAYER_RADIUS, unit = island.unit, half = unit / 2;
      // Reserve a full voxel above two units for the tallest helmeted head-look envelope.
      const rootRadius = Math.hypot(0.5, 0.25), ceiling = y + geometry.treeSolidCanopyFloor - 2.25;
      const grid = island.sightGrid, minX = Math.floor((x - reach - grid[1]) / unit), maxX = Math.floor((x + reach - grid[1]) / unit);
      const minZ = Math.floor((z - reach - grid[3]) / unit), maxZ = Math.floor((z + reach - grid[3]) / unit);
      for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
        const px = grid[1] + (gx + 0.5) * unit, pz = grid[3] + (gz + 0.5) * unit;
        const distance = Math.hypot(Math.max(0, Math.abs(px - x) - half), Math.max(0, Math.abs(pz - z) - half));
        if (distance > reach) continue;
        const floor = island.surfaceAt(px, pz);
        if (floor > ceiling || distance < rootRadius && floor > y) return false;
      }
      return true;
    };
    const candidateFree = (x, z, radius) => {
      for (let i = 0; i < sceneryClaims.length; i++) {
        const c = sceneryClaims[i];
        if (Math.hypot(c.x - x, c.z - z) < c.r + radius) return false;
      }
      return true;
    };
    // Grass is dressing: it reflows with the rest but answers no tap or Space.
    const addScenery = (geometry, x, z, ry, y, kind, footprint) => {
      const reservation = claim(x, z, footprint);
      sceneryClaims.push(reservation);
      const quiet = kind === "grass";
      const pickRadius = kind === "tree" ? BL.scene.boundsOf(geometry).radius : footprint + 0.3;
      const node = place(geometry, x, z, ry, y, quiet ? null : kind, pickRadius);
      if (quiet || kind === "flower" || kind === "bush") node.sightHidden = true;
      if (MATRIX_LIVING_PROPS.has(kind)) node.matrixLiving = true;
      const owner = quiet ? { kind: "prop", prop: kind, node, x, z, ripe: 0, pickRadius: 0, active: true } : props[props.length - 1];
      owner.footprint = footprint;
      owner.scenery = true;
      owner.reservation = reservation;
      reservation.scenery = owner;
      scenery.push(owner);
      return node;
    };
    const meadow = (count, radius, kind, geometryAt, square = false) => {
      for (let n = 0, tries = 0; n < count && tries < 1500; tries++) {
        const { x, z } = polar(rand() * 360, Math.sqrt(lerp(MEADOW_INNER * MEADOW_INNER, MEADOW_OUTER * MEADOW_OUTER, rand())));
        if (island.surfaceAt(x, z) > 0 || nearMouth(x, z, 3.5) || !workSceneryClear(x, z, radius) || !candidateFree(x, z, radius) || !free(x, z, radius) || island.path.overlaps(x, z, radius)) continue;
        addScenery(geometryAt(n), x, z, square ? Math.floor(rand() * 4) * Math.PI / 2 + (rand() - 0.5) * 0.4 : rand() * Math.PI * 2, 0, kind, radius);
        n++;
      }
    };
    const cliff = (count, radius, minHeight, kind, geometryAt, grove = false) => {
      // Safe root ledges are rarer than decorative bush sites (48000 tree tries vs 1200).
      // Bounds the seeded search while retaining the full grove on the cliffs.
      let n = 0;
      const tryAt = (x, z) => {
        const h = island.surfaceAt(x, z);
        if (h < minHeight || !free(x, z, radius)) return false;
        let clear = true;
        for (let i = 0; i < 4 && clear; i++) {
          const a = (i + 0.5) * Math.PI / 2;
          if (island.surfaceAt(x + Math.cos(a) * 1.2, z + Math.sin(a) * 1.2) > h + 1.5) clear = false;
        }
        if (!clear || nearMouth(x, z, 4) || !candidateFree(x, z, radius)) return false;
        let geometry = geometryAt(n);
        if (kind === "tree" && !treeGroundClear(geometry, x, z, h)) {
          // A narrower crown can fit a ledge that cannot clear the next variant.
          // Try each cached shape once rather than exhaust the search on that tree.
          let fits = false;
          for (let variant = 0; variant < 4 && !fits; variant++) {
            const alternate = hubModels.tree(variant);
            if (alternate === geometry) continue;
            if (treeGroundClear(alternate, x, z, h)) { geometry = alternate; fits = true; }
          }
          if (!fits) return false;
        }
        addScenery(geometry, x, z, rand() * Math.PI * 2, h, kind, radius);
        n++;
        return true;
      };
      for (let tries = 0; n < count && tries < (kind === "tree" ? 48000 : 1200); tries++) {
        const { x, z } = polar(rand() * 360, lerp(CLIFF_INNER, CLIFF_OUTER, rand()));
        if (!tryAt(x, z) || !grove) continue;
        // Copses: most trees take one or two neighbours just over a footprint apart, so the cliffs read as
        // groves rather than a ring of singles. A neighbour that does not fit its ledge is simply skipped.
        const r = rand(), extra = r < 0.25 ? 0 : r < 0.65 ? 1 : 2, a0 = rand() * Math.PI * 2;
        for (let k = 0; k < extra && n < count; k++) {
          const a = a0 + k * 2.1 + (rand() - 0.5) * 0.5, d = radius * 2 + 0.2 + rand() * 0.6;
          tryAt(x + Math.cos(a) * d, z + Math.sin(a) * d);
        }
      }
    };
    cliff(40, 1.4, 3, "tree", (n) => hubModels.tree(n % 4 === 3 ? 3 : n % 3), true);
    cliff(30, 1, 0.5, "bush", (n) => hubModels.bush(n % 3));
    meadow(30, 0.7, "bush", (n) => hubModels.bush(n % 3));
    meadow(8, 0.9, "rock", () => hubModels.rock(0));
    meadow(10, 0.7, "crate", () => hubModels.woodCrate(2), true);
    meadow(8, 0.6, "barrel", () => hubModels.barrel(1));
    meadow(50, 0.35, "flower", () => hubModels.flowerTuft());
    meadow(18, 0.3, "grass", () => hubModels.grass());
  };
  const sceneryReason = (o) => {
    const clearance = island.path.debug.ringOuterRadius + SCENERY_CLEARANCE;
    if (o.node.position.y < 2 && !workSceneryClear(o.x, o.z, o.footprint)) return 3;
    if (Math.hypot(o.x, o.z) - o.footprint < clearance - 1e-9) return 1;
    if (island.path.overlaps(o.x, o.z, o.footprint)) return 2;
    for (let i = 0; i < claimed.length; i++) {
      const c = claimed[i];
      if (!c.scenery && Math.hypot(c.x - o.x, c.z - o.z) < c.r + o.footprint) return 3;
    }
    return 0;
  };
  const setSceneryActive = (o, active) => {
    if (o.active === active) return;
    o.active = active;
    o.node.visible = active;
    if (!o.pickRadius) return;
    if (active) input.add(o.node, o, { radius: o.pickRadius });
    else input.remove(o.node);
  };
  const reflowScenery = () => {
    if (!scenery.length) return;
    let visible = 0, radiusCulled = 0, pathCulled = 0, fixedCulled = 0;
    for (let i = 0; i < scenery.length; i++) {
      const o = scenery[i], reason = sceneryReason(o);
      setSceneryActive(o, reason === 0 && !o.breakable?.broken);
      if (!reason) { if (o.active) visible++; }
      else if (reason === 1) radiusCulled++;
      else if (reason === 2) pathCulled++;
      else fixedCulled++;
    }
    sceneryVisible = visible;
    sceneryRadiusCulled = radiusCulled;
    sceneryPathCulled = pathCulled;
    sceneryFixedCulled = fixedCulled;
    sceneryReflows++;
    if (magazine && !magazine.revealed && !magazine.host.active) attachMagazineHost();
  };
  const deactivateBreakable = (owner) => {
    if (owner.active) sceneryVisible--;
    setSceneryActive(owner, false);
    owner.node.highlight = 0;
    solids.sync();
  };
  const relocateBreakable = (owner) => {
    const radius = owner.footprint + SCENERY_CLEARANCE;
    const inner = Math.max(MEADOW_INNER, island.path.debug.ringOuterRadius + radius);
    if (inner >= MEADOW_OUTER) return false;
    const bounds = BL.scene.boundsOf(owner.node.geometry), height = bounds.max[1] - bounds.min[1];
    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(lerp(inner * inner, MEADOW_OUTER * MEADOW_OUTER, Math.random()));
      const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance;
      if (island.surfaceAt(x, z) !== 0 || island.path.overlaps(x, z, radius) || nearMouth(x, z, radius + 3.5) || !workSceneryClear(x, z, radius)) continue;
      let clear = true;
      for (let i = 0; i < 8 && clear; i++) {
        const a = i * Math.PI / 4;
        if (island.surfaceAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius) !== 0) clear = false;
      }
      // Keep dormant scenery's reservation too: a shrinking pile may reveal it.
      for (let i = 0; i < claimed.length && clear; i++) {
        const c = claimed[i];
        if (c !== owner.reservation && Math.hypot(c.x - x, c.z - z) < c.r + radius) clear = false;
      }
      if (!clear || !solids.clearAt(x, 0.01, z, radius, height, owner.node)) continue;
      for (let i = 0; i < crew.list.length; i++) {
        const cave = crew.list[i];
        const p = cave.root.position, feet = p.y - cave.baseY;
        if (feet < height && feet + cave.bodyHeight > 0 && Math.hypot(p.x - x, p.z - z) < radius + cave.bodyRadius) { clear = false; break; }
      }
      if (clankers) for (let i = 0; i < clankers.list.length && clear; i++) {
        const other = clankers.list[i], p = other.root.position;
        if (other.active && p.y < height && p.y + other.height > 0 && Math.hypot(p.x - x, p.z - z) < radius + other.radius) clear = false;
      }
      for (let i = 0; i < crates.list.length && clear; i++) {
        const c = crates.list[i], p = c.slot || c.node.position;
        if (Math.hypot(p.x - x, p.z - z) < radius + 0.9) clear = false;
      }
      for (let i = 0; i < breakables.list.length && clear; i++) {
        const other = breakables.list[i];
        if (other.reward && Math.hypot(other.node.position.x - x, other.node.position.z - z) < radius + 0.6) clear = false;
      }
      if (magazine && Math.hypot(magazine.node.position.x - x, magazine.node.position.z - z) < radius + 0.4) clear = false;
      if (!clear) continue;
      owner.x = owner.node.position.x = owner.reservation.x = x;
      owner.z = owner.node.position.z = owner.reservation.z = z;
      owner.clankerHomeX = x; owner.clankerHomeZ = z;
      owner.node.position.y = 0;
      owner.node.rotation.y = Math.random() * Math.PI * 2;
      setSceneryActive(owner, true);
      sceneryVisible++;
      solids.sync();
      return true;
    }
    return false;
  };
  const collectBreakableReward = (kind, amount, cave) => {
    if (kind === "banana") {
      const added = crew.collectAmmo(amount, cave);
      if (added) hud.toast(`+${added} ammo`);
      pilot.showAct();
      return true;
    }
    if (kind === "magazine") {
      if (!crew.collectMagazine(cave)) return false;
      pilot.showAct();
      hud.toast("Full magazine collected · 30 rounds");
      return true;
    }
    return false;
  };
  const syncMirrorDamage = (quiet = false) => {
    const damage = mirrorCave.damage;
    if (mirrorCave.damageVersion === damage.version) return;
    const wasDamaged = mirrorCave.damageStage > 0;
    mirrorCave.damageStage = damage.stage;
    mirrorCave.damageVersion = damage.version;
    if (damage.broken && !mirrorCave.shattered) {
      mirrorCave.shattered = world.mirrorBroken = true;
      const gate = mirrorCave.gate;
      gate.locked = false;
      gate.localOpen = gate.open = gate.raising = false;
      mirrorCave.node.mirrorReveal = 1;
      mirrorCave.node.mirrorPortal = true;
      input.remove(mirrorCave.node);
      drop(targets, mirrorCave.node);
      addTarget(gate.node, { kind: "matrix-gate", gate, priority: 2, weaponType: "none" });
      if (!quiet) hud.toast("The mirror shatters. Move close to open the gate.");
    } else if (!quiet && !wasDamaged && damage.stage > 0) hud.toast("The mirror cracks. Glyphs glow behind the glass.");
    refreshObjectGuides();
  };
  const weaponImpact = (source, hit, dx, dy, dz, power = 1) => {
    if (hit.owner.kind === "caveman") {
      crew.damage(hit.owner.cave, power);
      return;
    }
    if (hit.node === mirrorCave.node) {
      if (mirrorCave.damage.hit(power, hit.x, hit.y, hit.z)) syncMirrorDamage();
      return;
    }
    if (breakables && breakables.hit(source, hit, power)) return;
    hitRoomSign(source, hit, dx, dy, dz);
  };
  const drop = (list, value) => {
    const i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1);
  };
  const jetpackHudStatus = (cave) => {
    JETPACK_HUD_STATE.owned = !!(cave && cave.jetpackOwned);
    JETPACK_HUD_STATE.equipped = !!(cave && cave.jet);
    JETPACK_HUD_STATE.fuel = JETPACK_HUD_STATE.owned ? cave.jetFuel : 1;
    JETPACK_HUD_STATE.blocked = JETPACK_HUD_STATE.owned && (cave ? !jetpackAllowed(cave) : cameraCaveIndex !== 0);
    return JETPACK_HUD_STATE;
  };
  const equipJetpack = (cave) => {
    if (!cave || !cave.jetpackOwned) return false;
    if (cave.jet) return true;
    if (!crew.wearJetpack(cave, hubModels.jetpack(), hubModels.jetFlame())) return false;
    pilot.showAct();
    const p = cave.root.position;
    fx.burst(p.x, p.y + 0.7, p.z, 14, [SPARK, DUST], 2.2);
    fx.say(cave, "OOGA FLY!", 2);
    hud.toast("Jetpack!");
    hud.hint(cave.jetRecovering ? "Fuel recovering · jump until the gauge is above 20%" : COARSE ? "Hold Blast off to climb · stick to fly" : "Hold Space to climb · WASD to fly", 5000);
    return true;
  };
  const grantJetpack = (cave, wear = false) => {
    if (!cave) return false;
    crew.setJetpackOwnership(cave, true, hubModels.jetpack(), hubModels.jetFlame());
    pilot.showAct();
    return !wear || equipJetpack(cave);
  };
  const toggleJetpack = () => {
    const cave = crew.player;
    if (!cave) {
      hud.toast("Double-tap an Ooga Booga first");
      return false;
    }
    if (cave.jet) {
      crew.removeJetpack(cave);
      pilot.showAct();
      hud.toast("Jetpack off");
      return true;
    }
    if (!jetpackAllowed(cave)) {
      hud.toast("No jetpacks under ground");
      return false;
    }
    return equipJetpack(cave);
  };
  const attachMagazineHost = () => {
    let host = null, best = Infinity;
    for (const o of scenery) {
      if (!o.active || o.prop !== "bush" && o.prop !== "tree") continue;
      // Meadow bushes can be walked through. Keep the hidden spare reachable
      // without needing the other pickup, even when the pile resizes scenery.
      const score = (o.prop === "bush" ? 0 : 1000000) + Math.abs(o.node.position.y) * 100 + fnv1a(`${o.x}/${o.z}/magazine`) / 4294967296;
      if (score < best) { host = o; best = score; }
    }
    if (!host) throw new Error("No scenery can hide the spare magazine");
    magazine.host = host;
    const p = magazine.node.position, bounds = BL.scene.boundsOf(host.node.geometry);
    p.x = host.x; p.z = host.z;
    p.y = magazine.y = host.node.position.y + bounds.max[1] * host.node.scale.y + 0.4;
  };
  const spawnMagazinePickup = () => {
    if (magazine) return;
    const visual = models.spareMagazine(), node = visual.node;
    node.visible = false;
    node.scale.x = node.scale.y = node.scale.z = MAGAZINE_SCALE;
    addChild(root, node); placed.push(node);
    magazine = { node, model: visual, host: null, owner: null, revealed: false, y: 0, ammo: 30 };
    attachMagazineHost();
    trackMirrorObject(node, 1);
  };
  const revealMagazine = (host = magazine && magazine.host) => {
    if (!magazine || magazine.revealed || host !== magazine.host || !host.active) return false;
    const node = magazine.node;
    magazine.revealed = node.visible = true;
    magazine.owner = addProp("magazine", node, node.position.x, node.position.z, 0.2);
    refreshObjectGuides();
    hud.toast("A full spare magazine!");
    hud.hint(pilot.player ? "Walk into the magazine to collect it." : "Double-tap an Ooga, then walk into the magazine.", 5000);
    return true;
  };
  const removeMagazinePickup = () => {
    if (!magazine) return;
    const { node, owner } = magazine;
    untrackMirrorObject(node);
    if (owner) { input.remove(node); drop(targets, node); drop(props, owner); }
    removeChild(root, node); drop(placed, node);
    magazine = null;
    refreshObjectGuides();
  };
  const grantMagazine = (cave = pilot.player) => {
    // Debug grants still create a full spare after the hidden pickup is gone.
    if (!magazine) return crew.collectMagazine(cave);
    const available = magazine.ammo;
    const remaining = crew.collectGroundMagazine(available, cave);
    if (remaining === available) return false;
    const added = available - remaining;
    if (remaining) {
      magazine.ammo = remaining;
      magazine.model.setAmmo(remaining);
    } else removeMagazinePickup();
    pilot.showAct();
    return added;
  };
  const loseAbyssAmmo = (cave = pilot.player) => {
    if (!cave) return false;
    const hadMagazines = crew.hasMagazine(cave), hadAmmo = cave.weapon.ammo > 0;
    if (!hadMagazines && !hadAmmo) return false;
    crew.stopBurst(cave);
    crew.stopReload(cave, true);
    if (hadMagazines) {
      crew.removeMagazines(cave);
      spawnMagazinePickup();
    }
    cave.weapon.ammo = 0;
    pilot.showAct();
    hud.toast(hadMagazines && hadAmmo ? "Spare magazines and loaded AK-47 ammo lost to the abyss"
      : hadMagazines ? "Spare magazines lost to the abyss" : "Loaded AK-47 ammo lost to the abyss");
    return true;
  };
  const buildSpots = () => {
    spots.push({ x: 0, z: -(MEADOW + 2.5), ry: Math.PI });
    for (const m of island.mouths) {
      // Empty caves are sealed rock, not places for the crew to visit.
      const slot = caves.slots.find((slot) => slot.id === m.id);
      if (slot.status === "dark" || slot.status === "mirror" && MIRROR_GATE_CLOSED) continue;
      spots.push({ x: m.apron.x, z: m.apron.z, ry: Math.atan2(m.x - m.apron.x, m.z - m.apron.z) });
    }
    const rand = mulberry32(SEED + 5);
    for (let n = 0, tries = 0; n < WANDER_COUNT && tries < 1500; tries++) {
      const { x, z } = polar(rand() * 360, Math.sqrt(lerp(WANDER_INNER * WANDER_INNER, MEADOW_OUTER * MEADOW_OUTER, rand())));
        if (island.surfaceAt(x, z) !== 0 || nearMouth(x, z, 3) || npcClosedCaveAt(x, z) || !free(x, z, 0.9)) continue;
      spots.push({ x, z, ry: NaN });
      n++;
    }
  };
  const seatTaken = (s) => {
    for (let caveIndex = 0; caveIndex < crew.list.length; caveIndex++) {
      const cave = crew.list[caveIndex];
      const a = cave.act;
      if ((a.kind === "wander" || a.kind === "idle") && a.spot.x === s.x && a.spot.z === s.z) return true;
    }
    return false;
  };
  const freeSeat = () => {
    const start = Math.floor(Math.random() * fireSeats.length);
    for (let i = 0; i < fireSeats.length; i++) {
      const s = fireSeats[(start + i) % fireSeats.length];
      if (!seatTaken(s)) return s;
    }
    return null;
  };
  const npcWanderPointClear = (s, cave) => {
    const feet = island.surfaceAt(s.x, s.z), height = cave ? cave.bodyHeight : 1.5;
    return !npcClosedCaveAt(s.x, s.z, feet, height) && !npcPileAt(s.x, feet, s.z, height) && !npcWorkZoneAt(cave, s.x, feet, s.z) && npcFireClear(s.x, feet, s.z, s.x, feet, s.z, height) && walkable(s.x, s.z, s.x, s.z, feet, height, cave);
  };
  const wanderSpot = (out, cave = null) => {
    if (timechainIsland && cave?.traits.name === "SaniExp" && cave.override === "chilling" && !contributors.debugState) {
      const p = timechainIsland.place, pos = cave.root.position, dir = BL.timechainModels.DIR;
      if (timechainIsland.residentPlaced && Math.hypot(pos.x - p.x, pos.z - p.z) > BL.timechainModels.SITE.radius - 2) {
        const along = pos.x * dir.x + pos.z * dir.z, across = Math.abs(pos.x * dir.z - pos.z * dir.x);
        const radius = along < p.approachFrom || across > 1 ? p.approachFrom - 0.5 : along < p.rim - 0.5 ? p.rim : Math.hypot(p.x, p.z) - p.bridgeZ + 1;
        out.x = dir.x * radius; out.z = dir.z * radius; out.ry = p.ry + Math.PI;
        return true;
      }
      const home = timechainIsland.hangout[cave.act.trips % timechainIsland.hangout.length];
      timechainIsland.residentPlaced = true;
      out.x = home.x; out.z = home.z; out.ry = home.ry;
      return true;
    }
    const chilling = cave?.state === "chilling";
    let s = (chilling && Math.random() < 0.35 || RENDER_OPTS.stars > NIGHT && Math.random() < FIRE_SEAT_CHANCE) ? freeSeat() : null;
    if (s && !npcWanderPointClear(s, cave)) s = null;
    if (!s) {
      const start = Math.floor(Math.random() * spots.length);
      for (let i = 0; i < spots.length; i++) {
        const candidate = spots[(start + i) % spots.length];
        if (candidate.x === out.x && candidate.z === out.z
          || seatTaken(candidate)
          || chilling && Math.hypot(candidate.x, candidate.z) < island.path.debug.ringOuterRadius + 1.5
          || !npcWanderPointClear(candidate, cave)) continue;
        s = candidate; break;
      }
    }
    if (!s) return false;
    out.x = s.x;
    out.z = s.z;
    out.ry = s.ry;
    return true;
  };
  // Surface caves and the headquarters can share a column below the same roof.
  const supportAt = (x, z, y = Infinity) => island.supportAt(x, z, y, STEP_MAX);
  const playerSupportAt = (x, z, y = 0, previousY = y, player = pilot?.player, dockEntry = false) => {
    const step = player ? player.hop === 0 && player.hopV <= 0 : !pilot.freeFalling;
    const height = player ? player.bodyHeight + Math.max(0, player.viewLift) : CLOSE_VIEW.eyeHeight + CAMERA_RADIUS;
    const from = Math.max(y, previousY), rise = step ? STEP_MAX : 0;
    return Math.max(island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR, PLAYER_RADIUS), bedSupportAt(x, z, from, STEP_MAX, PLAYER_RADIUS), cloudFloorAt(x, z, from, rise, height, player), propSupportAt(x, z, from, rise, player), dockStairs ? dockStairs.supportAt(x, z, from, rise, player, dockEntry) : -Infinity);
  };
  const abyssAt = (x, z, y, actor = pilot?.player) => playerSupportAt(x, z, y, y, actor) === ABYSS_FLOOR;
  const visualSupportAt = (x, z, y) => {
    const floor = Math.max(cloudFloorAt(x, z, y, STEP_MAX), bedSupportAt(x, z, y, STEP_MAX, PLAYER_RADIUS), propSupportAt(x, z, y, STEP_MAX, pilot.player), dockStairs ? dockStairs.supportAt(x, z, y, STEP_MAX, pilot.player, false) : -Infinity);
    return floor > -Infinity && floor > island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR, PLAYER_RADIUS) ? floor : island.smoothSupportAt(x, z, y, STEP_MAX, PLAYER_RADIUS);
  };
  const PLAYER_RADIUS = 0.3;
  const BODY_RADIUS = 0.38;
  const BODY_PARTS_SOLID = ["torso", "head", "armL", "armR", "legL", "legR"];
  const BODY_BOUNDS = new Float64Array(6);
  const CLANKER_SUPPORT = { node: null }, CLANKER_RIDER_INVERSE = math.mat4.create(), CLANKER_RIDER_POINT = new Float64Array(3);
  // A swept circle restricted to the time the body overlaps the solid's height.
  // Also catches a fast move across a thin post or another Ooga.
  const cylinderSegmentClear = (x, y, z, toX, toY, toZ, radius, height, cx, cz, bottom, top, solidRadius) => {
    const dy = toY - y;
    let lo = 0, hi = 1;
    if (dy) {
      const a = (bottom - height + 1e-7 - y) / dy, b = (top - 1e-7 - y) / dy;
      lo = Math.max(0, Math.min(a, b)); hi = Math.min(1, Math.max(a, b));
      if (hi < lo) return true;
    } else if (y >= top - 1e-7 || y + height <= bottom + 1e-7) return true;
    const dx = toX - x, dz = toZ - z, length = dx * dx + dz * dz;
    // Actors can arrive at a shared spawn or be placed by a pointer.
    // Let an existing overlap separate, while still rejecting any move farther in.
    const startDistance = (x - cx) ** 2 + (z - cz) ** 2, endDistance = (toX - cx) ** 2 + (toZ - cz) ** 2;
    if (y < top - 1e-7 && y + height > bottom + 1e-7
      && startDistance < (radius + solidRadius) ** 2 && endDistance > startDistance + 1e-9 && (x - cx) * dx + (z - cz) * dz >= 0) return true;
    const t = length ? Math.max(lo, Math.min(hi, ((cx - x) * dx + (cz - z) * dz) / length)) : lo;
    const ox = x + dx * t - cx, oz = z + dz * t - cz, reach = radius + solidRadius;
    return ox * ox + oz * oz >= reach * reach - 1e-8;
  };
  const actorBounds = (cave) => {
    const p = cave.root.position;
    if (cave.root.quaternion && cave.solidBounds) return cave.solidBounds;
    BODY_BOUNDS[0] = p.x - BODY_RADIUS; BODY_BOUNDS[2] = p.z - BODY_RADIUS;
    BODY_BOUNDS[3] = p.x + BODY_RADIUS; BODY_BOUNDS[5] = p.z + BODY_RADIUS;
    BODY_BOUNDS[1] = p.y - cave.baseY; BODY_BOUNDS[4] = BODY_BOUNDS[1] + cave.bodyHeight;
    return BODY_BOUNDS;
  };
  const updateSleepingSolids = () => {
    for (let index = 0; index < crew.list.length; index++) {
      const cave = crew.list[index];
      if (!cave.root.visible || !cave.root.quaternion) continue;
      const out = cave.solidBounds;
      out[0] = out[1] = out[2] = Infinity; out[3] = out[4] = out[5] = -Infinity;
      BL.scene.updateWorld(cave.root);
      for (let i = 0; i < BODY_PARTS_SOLID.length; i++) {
        const part = cave.parts[BODY_PARTS_SOLID[i]];
        if (!part?.geometry || !part.visible) continue;
        const b = BL.scene.boundsOf(part.geometry), m = part.world;
        for (let k = 0; k < 8; k++) {
          const x = k & 1 ? b.max[0] : b.min[0], y = k & 2 ? b.max[1] : b.min[1], z = k & 4 ? b.max[2] : b.min[2];
          const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
          out[0] = Math.min(out[0], wx); out[1] = Math.min(out[1], wy); out[2] = Math.min(out[2], wz);
          out[3] = Math.max(out[3], wx); out[4] = Math.max(out[4], wy); out[5] = Math.max(out[5], wz);
        }
      }
    }
  };
  const bodyOverlaps = (cave, b, x, z, radius) => {
    if (!cave.root.quaternion) { const p = cave.root.position; return (p.x - x) ** 2 + (p.z - z) ** 2 < (radius + BODY_RADIUS) ** 2 - 1e-8; }
    const dx = Math.max(b[0] - x, 0, x - b[3]), dz = Math.max(b[2] - z, 0, z - b[5]);
    return dx * dx + dz * dz < radius * radius - 1e-8;
  };
  const uprightCharacter = (cave) => cave.root.visible && cave.state !== "sleeping" && !cave.root.quaternion && !cave.camp.seat && !cave.camp.rolling;
  const standingPassenger = (cave) => uprightCharacter(cave) && cave.hop <= 1e-7 && cave.hopV <= 0 && !cave.jet?.thrust;
  const passengerOf = (cave, support) => {
    if (!support || !cave.riding.support || !uprightCharacter(support)) return false;
    // Links exist only during the crew's ordered update.
    // Bound chains by the roster in case two bodies were placed into an invalid shared position.
    for (let n = 0; cave && n < crew.cavemen.size; n++) {
      if (!standingPassenger(cave)) return false;
      cave = cave.riding.support;
      if (cave === support) return true;
    }
    return false;
  };
  const characterSupportAt = (cave) => {
    if (!standingPassenger(cave)) return null;
    const p = cave.root.position, feet = p.y - cave.baseY;
    let support = null, distance = Infinity;
    for (let otherIndex = 0; otherIndex < crew.list.length; otherIndex++) {
      const other = crew.list[otherIndex];
      if (other === cave || !uprightCharacter(other)) continue;
      const b = actorBounds(other);
      if (Math.abs(b[4] - feet) > 1e-6 || !bodyOverlaps(other, b, p.x, p.z, PLAYER_RADIUS)) continue;
      const q = other.root.position, d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
      if (d < distance) { support = other; distance = d; }
    }
    return support && Math.abs(playerSupportAt(p.x, p.z, feet, feet, cave) - feet) <= 1e-6 ? support : null;
  };
  const propSupportAt = (x, z, y, rise, actor) => {
    let floor = solids ? solids.supportAt(x, z, y, rise, PLAYER_RADIUS) : -Infinity;
    if (clankerMeshes) floor = Math.max(floor, clankerMeshes.supportAt(x, z, y, rise, PLAYER_RADIUS));
    if (altar && ALTAR_HEIGHT <= y + rise + 1e-7 && Math.hypot(x, z) < altar.platformRadius + PLAYER_RADIUS - 1e-7) floor = Math.max(floor, ALTAR_HEIGHT);
    if (crew) for (let i = 0; i < crew.list.length; i++) {
      const other = crew.list[i];
      if (other === actor || !other.root.visible) continue;
      const b = actorBounds(other);
      if (b[4] > floor && b[4] <= y + rise + 1e-7 && bodyOverlaps(other, b, x, z, PLAYER_RADIUS)) floor = b[4];
    }
    return floor;
  };
  const propCeilingAt = (x, z, y, radius, actor) => {
    let ceiling = solids ? solids.ceilingAt(x, z, y, radius) : Infinity;
    if (clankerMeshes && actor) ceiling = Math.min(ceiling, clankerMeshes.ceilingAt(x, z, y, radius));
    if (altar && y < ALTAR_HEIGHT - 1e-7 && Math.hypot(x, z) < altar.platformRadius + radius - 1e-7) ceiling = Math.min(ceiling, 0);
    if (crew) for (let i = 0; i < crew.list.length; i++) {
      const other = crew.list[i];
      if (other === actor || !other.root.visible || passengerOf(other, actor)) continue;
      const b = actorBounds(other);
      if (b[1] > y + 1e-7 && y < b[4] - 1e-7 && bodyOverlaps(other, b, x, z, radius)) ceiling = Math.min(ceiling, b[1]);
    }
    return ceiling;
  };
  const clankerBodySegmentClear = (other, x, y, z, toX, toY, toZ, radius, height) => {
    const shape = BL.agent.footprint, p = other.root.position;
    if (Math.min(y, toY) > p.y + other.height || Math.max(y, toY) + height < p.y) return true;
    const count = shape.count(other), size = shape.radius(other), first = shape.offset(other, 0);
    const last = count > 1 ? shape.offset(other, count - 1) : first;
    // The ordered capsule centres all lie between the first and last offsets.
    // Reject a distant sweep before evaluating each capsule, retaining the exact
    // overlap/escape tests whenever the enclosing boxes can touch.
    const reach = radius + size + Math.max(Math.abs(first), Math.abs(last)) + 1e-7;
    if (Math.min(x, toX) > p.x + reach || Math.max(x, toX) < p.x - reach
      || Math.min(z, toZ) > p.z + reach || Math.max(z, toZ) < p.z - reach) return true;
    const sine = Math.sin(other.heading), cosine = Math.cos(other.heading);
    for (let part = 0; part < count; part++) {
      const offset = part === 0 ? first : part === count - 1 ? last : shape.offset(other, part);
      if (!cylinderSegmentClear(x, y, z, toX, toY, toZ, radius, height,
        p.x + sine * offset, p.z + cosine * offset, p.y, p.y + other.height, size)) return false;
    }
    return true;
  };
  const clankerSegmentClear = (x, y, z, toX, toY, toZ, radius, height, ignore = null) => {
    // The landing surface and its sides use the same animated mesh. The broad
    // companion envelopes intentionally include empty air above a hunched back.
    // Keep the established full-arm gap for an ordinary walk at ground level.
    if (clankers) for (let i = 0; i < clankers.list.length; i++) {
      const other = clankers.list[i];
      if (other !== ignore && other.active && Math.min(y, toY) <= other.root.position.y + STEP_MAX + 1e-5
        && !clankerBodySegmentClear(other, x, y, z, toX, toY, toZ, Math.max(radius, BODY_RADIUS), height)) return false;
    }
    return !clankerMeshes || clankerMeshes.segmentClear(x, y, z, toX, toY, toZ,
      Math.max(radius, BODY_RADIUS), height, ignore && ignore.root);
  };
  const propSegmentClear = (x, y, z, toX, toY, toZ, radius, height, actor, carrying = false, ignoreClanker = null) => {
    if (solids && !solids.segmentClear(x, y, z, toX, toY, toZ, radius, height)) return false;
    if (altar && !cylinderSegmentClear(x, y, z, toX, toY, toZ, radius, height, 0, 0, 0, ALTAR_HEIGHT, altar.platformRadius)) return false;
    if (crew) for (let otherIndex = 0; otherIndex < crew.list.length; otherIndex++) {
      const other = crew.list[otherIndex];
      if (other === actor || !other.root.visible || passengerOf(other, actor) || carrying && passengerOf(actor, other)) continue;
      const b = actorBounds(other), p = other.root.position;
      if (other.root.quaternion) {
        if (!terrain.segmentBoxClear(x, y, z, toX - x, toY - y, toZ - z, radius, height, b[0], b[1], b[2], b[3], b[4], b[5])) return false;
      } else if (!cylinderSegmentClear(x, y, z, toX, toY, toZ, radius, height, p.x, p.z, b[1], b[4], BODY_RADIUS)) return false;
    }
    return clankerSegmentClear(x, y, z, toX, toY, toZ, radius, height, ignoreClanker);
  };
  const bedSupportAt = (x, z, y, maxStep, radius) => {
    let floor = -Infinity;
    if (!headquarters) return floor;
    for (const bed of headquarters.mattresses) {
      if (y + maxStep < bed.y || !bed.node.visible || bed.node.parent !== root) continue;
      const dx = x - bed.x, dz = z - bed.z, lx = dx * bed.cr - dz * bed.sr, lz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      for (let i = 0; i < boxes.length; i += 6) {
        const top = bed.y + boxes[i + 4];
        if (top <= floor || top > y + maxStep + 1e-7) continue;
        const ox = Math.max(boxes[i] - lx, 0, lx - boxes[i + 3]), oz = Math.max(boxes[i + 2] - lz, 0, lz - boxes[i + 5]);
        if (radius ? ox * ox + oz * oz < radius * radius - 1e-9 : ox === 0 && oz === 0) floor = top;
      }
    }
    return floor;
  };
  const bedCeilingAt = (x, z, y, radius) => {
    let ceiling = Infinity;
    if (!headquarters) return ceiling;
    for (const bed of headquarters.mattresses) {
      if (y >= bed.y + bed.sleep.pillowTop - 1e-7 || !bed.node.visible || bed.node.parent !== root) continue;
      const dx = x - bed.x, dz = z - bed.z, lx = dx * bed.cr - dz * bed.sr, lz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      for (let i = 0; i < boxes.length; i += 6) {
        if (y >= bed.y + boxes[i + 4] - 1e-7) continue;
        const ox = Math.max(boxes[i] - lx, 0, lx - boxes[i + 3]), oz = Math.max(boxes[i + 2] - lz, 0, lz - boxes[i + 5]);
        if (radius ? ox * ox + oz * oz < radius * radius - 1e-9 : ox === 0 && oz === 0) ceiling = Math.min(ceiling, bed.y + boxes[i + 1]);
      }
    }
    return ceiling;
  };
  const bedSegmentClear = (x, y, z, toX, toY, toZ, radius, height) => {
    if (!headquarters) return true;
    const dx = toX - x, dy = toY - y, dz = toZ - z;
    for (const bed of headquarters.mattresses) {
      if (Math.min(y, toY) >= bed.y + bed.sleep.pillowTop - 1e-7 || Math.max(y, toY) + height <= bed.y || !bed.node.visible || bed.node.parent !== root) continue;
      const lx = (x - bed.x) * bed.cr - (z - bed.z) * bed.sr, lz = (x - bed.x) * bed.sr + (z - bed.z) * bed.cr;
      const vx = dx * bed.cr - dz * bed.sr, vz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      for (let i = 0; i < boxes.length; i += 6) if (!terrain.segmentBoxClear(lx, y - bed.y, lz, vx, dy, vz, radius, height, boxes[i], boxes[i + 1], boxes[i + 2], boxes[i + 3], boxes[i + 4], boxes[i + 5])) return false;
    }
    return true;
  };
  let cloudHit = null;
  // Clouds are one-way platforms; their cached rects are the mesh's actual upward faces.
  // Air below and beside them stays freely flyable.
  const cloudFloorAt = (x, z, y, maxStep = 0, height = 0, actor = pilot?.player) => {
    let floor = -Infinity;
    cloudHit = null;
    for (let i = 0; i < clouds.length; i++) {
      const cloud = clouds[i], node = cloud.node, p = node.position;
      if (!node.visible || node.parent !== root) continue;
      const lx = x - p.x, lz = z - p.z, bounds = cloud.bounds;
      if (lx < bounds[0] - PLAYER_RADIUS || lx > bounds[2] + PLAYER_RADIUS || lz < bounds[1] - PLAYER_RADIUS || lz > bounds[3] + PLAYER_RADIUS) continue;
      const tops = cloud.tops;
      for (let j = 0; j < tops.length; j += 5) {
        const top = p.y + tops[j + 4];
        if (top <= floor || top > y + maxStep + 1e-7) continue;
        const dx = Math.max(tops[j] - lx, 0, lx - tops[j + 2]), dz = Math.max(tops[j + 1] - lz, 0, lz - tops[j + 3]);
        if (dx * dx + dz * dz >= PLAYER_RADIUS * PLAYER_RADIUS - 1e-9) continue;
        if (top > y + 1e-7 && height && (!physicalClearAt(x, top, z, PLAYER_RADIUS, height, actor) || !island.voxelSegmentClearAt(x, y, z, x, top, z, PLAYER_RADIUS, height))) continue;
        floor = top;
        cloudHit = cloud;
      }
    }
    return floor;
  };
  const cloudAt = (x, z, y, maxStep = 0) => {
    const floor = cloudFloorAt(x, z, y, maxStep);
    return floor > island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR, PLAYER_RADIUS) ? cloudHit : null;
  };
  const prepareCloudSupport = (cave) => {
    const p = cave.root.position, feet = p.y - cave.baseY, previous = cave.cloudSupport;
    const grounded = cave.hop === 0 && cave.hopV <= 0;
    const height = cave.bodyHeight + Math.max(0, cave.viewLift);
    if (previous && grounded && !previous.wrapped && previous.node.visible && previous.node.parent === root) {
      const x = p.x + previous.dx, z = p.z + previous.dz, floor = Math.max(feet, cloudFloorAt(x, z, feet, STEP_MAX, height, cave));
      if (flyable(p.x, p.z, x, z, feet, height, cave) && physicalClearAt(x, floor, z, PLAYER_RADIUS, height, cave) && island.voxelSegmentClearAt(p.x, feet, p.z, x, floor, z, PLAYER_RADIUS, height)) {
        p.x = x; p.z = z;
      }
    }
    const floor = cloudFloorAt(p.x, p.z, feet, grounded ? STEP_MAX : 0, height, cave), current = cloudHit;
    const ground = Math.max(island.supportAt(p.x, p.z, feet, STEP_MAX, ABYSS_FLOOR, PLAYER_RADIUS), bedSupportAt(p.x, p.z, feet, STEP_MAX, PLAYER_RADIUS), propSupportAt(p.x, p.z, feet, grounded ? STEP_MAX : 0, cave));
    if (previous || floor > ground) {
      const support = Math.max(floor, ground);
      cave.hop = Math.max(0, feet - support);
      p.y = cave.baseY + support + cave.hop;
    }
    // Remember the support layer during flight too.
    // If that cloud drifts away before landing, hop must rebase onto the abyss without a snap.
    cave.cloudSupport = floor > ground ? current : null;
  };
  // Stone frames are rendered boxes, separate from the carved terrain.
  // Rotate the cylinder into each fixed arch's axes; its footprint stays round.
  const entranceCeilingAt = (x, z, y, radius) => {
    let ceiling = Infinity;
    for (let i = 0; i < headquarters.entrances.length; i++) {
      const entry = headquarters.entrances[i], node = entry.node;
      const dx = x - node.position.x, dz = z - node.position.z, reach = entry.radius + radius;
      if (y >= entry.maxY - 1e-7 || dx * dx + dz * dz > reach * reach) continue;
      const lx = dx * entry.cr - dz * entry.sr, lz = dx * entry.sr + dz * entry.cr, scale = node.scale.x, boxes = node.geometry.collisionBoxes;
      for (let j = 0; j < boxes.length; j += 6) {
        if (y >= node.position.y + boxes[j + 4] - 1e-7) continue;
        const ox = Math.max(boxes[j] * scale - lx, 0, lx - boxes[j + 3] * scale), oz = Math.max(boxes[j + 2] - lz, 0, lz - boxes[j + 5]);
        if (ox * ox + oz * oz < radius * radius - 1e-9) ceiling = Math.min(ceiling, node.position.y + boxes[j + 1]);
      }
    }
    return ceiling;
  };
  const ROOM_SIGN_LIMIT = 1.35, ROOM_SIGN_HEAD_RADIUS = 0.22;
  const swingRoomSign = (sign, direction, velocity, additive = false) => {
    const impulse = direction * velocity;
    sign.velocity = additive ? clamp(sign.velocity + impulse, -7, 7) : impulse;
    sign.hits++;
  };
  // Sweep the head through the board's rotated coordinates.
  // These light hanging props yield to the body; the stone frame still owns collision.
  const roomSignHeadClear = (sign, x, y, z, dx, dy, dz) => {
    const a = sign.node.rotation.x, c = Math.cos(a), s = Math.sin(a), b = sign.node.geometry.roomLifehashSign.board, r = ROOM_SIGN_HEAD_RADIUS;
    return terrain.segmentBoxClear(x, y * c + z * s - r, z * c - y * s, dx, dy * c + dz * s, dz * c - dy * s, r, r * 2, b[0], b[1], b[2], b[3], b[4], b[5]);
  };
  const moveRoomSigns = (cave, x, y, z, dt) => {
    const p = cave.root.position, dx = p.x - x, dy = p.y - y, dz = p.z - z, bit = 1 << cave.index;
    const continuous = Math.hypot(dx, dz) <= (JET_SPEED + pilotMod.WALK.speed) * dt + 1e-5 && Math.abs(dy) <= Math.abs(cave.hopV) * dt + STEP_MAX + 1e-5;
    for (const sign of headquarters.roomSigns) {
      const ox = x - sign.node.position.x, oz = z - sign.node.position.z;
      const lx = ox * sign.cr - oz * sign.sr, lz = ox * sign.sr + oz * sign.cr;
      const ly = y - cave.baseY + cave.bodyHeight + cave.viewLift - ROOM_SIGN_HEAD_RADIUS - sign.node.position.y;
      const vx = dx * sign.cr - dz * sign.sr, vz = dx * sign.sr + dz * sign.cr;
      if (!sign.node.visible || !continuous || Math.abs(lx + vx) > sign.node.geometry.roomLifehashSign.width / 2 + ROOM_SIGN_HEAD_RADIUS
        || Math.abs(lz + vz) > 1.1 || ly + dy < -1.1 || ly + dy > 0.3) { sign.contacts &= ~bit; continue; }
      if (roomSignHeadClear(sign, lx, ly, lz, vx, dy, vz)) continue;
      const direction = sign.contacts & bit ? Math.sign(sign.node.rotation.x || sign.velocity) : Math.abs(vz) > 1e-6 ? -Math.sign(vz) : lz >= 0.07 ? 1 : -1;
      if (!(sign.contacts & bit)) {
        swingRoomSign(sign, direction, Math.min(7, 2 + Math.hypot(dx, dy, dz) / dt * 0.65));
        sign.contacts |= bit;
      }
      // Resolve overlap by moving the board, preserving the jump's velocity.
      // The bounded angular steps let the head push it farther as it passes.
      for (let n = 0; n < 68 && !roomSignHeadClear(sign, lx + vx, ly + dy, lz + vz, 0, 0, 0); n++) {
        const angle = clamp(sign.node.rotation.x + direction * 0.04, -ROOM_SIGN_LIMIT, ROOM_SIGN_LIMIT);
        if (angle === sign.node.rotation.x) break;
        sign.node.rotation.x = angle;
      }
    }
  };
  const updateRoomSigns = (dt) => {
    for (const sign of headquarters.roomSigns) {
      if (!sign.velocity && !sign.node.rotation.x) continue;
      let remaining = Math.min(dt, 0.1);
      while (remaining > 1e-7) {
        const step = Math.min(remaining, 1 / 120);
        sign.velocity += (-18 * sign.node.rotation.x - 4 * sign.velocity) * step;
        sign.node.rotation.x += sign.velocity * step;
        if (Math.abs(sign.node.rotation.x) > ROOM_SIGN_LIMIT) { sign.node.rotation.x = clamp(sign.node.rotation.x, -ROOM_SIGN_LIMIT, ROOM_SIGN_LIMIT); sign.velocity *= -0.2; }
        remaining -= step;
      }
      if (Math.abs(sign.velocity) < 0.001 && Math.abs(sign.node.rotation.x) < 0.001) sign.velocity = sign.node.rotation.x = 0;
    }
  };
  const hitRoomSign = (_source, hit, dx, dy, dz) => {
    const sign = hit.owner && hit.owner.roomSign;
    if (!sign || !sign.node.visible) return;
    const localZ = dx * sign.sr + dz * sign.cr;
    const ox = hit.x - sign.node.position.x, oz = hit.z - sign.node.position.z;
    const hitZ = ox * sign.sr + oz * sign.cr;
    const direction = Math.abs(localZ) > 1e-6 ? -Math.sign(localZ) : hitZ >= 0 ? 1 : -1;
    swingRoomSign(sign, direction, 3.5, true);
  };
  const legacyCopy = (value) => {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed"; field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (_) {}
    field.remove();
    return copied;
  };
  const tapRoomSign = (sign) => {
    if (!sign || !sign.node.visible) return;
    const meta = sign.node.geometry.roomLifehashSign;
    const dx = camera.position.x - sign.node.position.x, dz = camera.position.z - sign.node.position.z;
    const localZ = dx * sign.sr + dz * sign.cr;
    const direction = Math.abs(localZ) > 1e-6 ? -Math.sign(localZ) : sign.hits & 1 ? -1 : 1;
    swingRoomSign(sign, direction, 3.5, true);
    const copied = () => { if (hud) hud.toast(`Room hash ${meta.lines[0]} copied to clipboard`); };
    const fallback = () => legacyCopy(meta.lines[0]) ? copied() : hud && hud.toast("Could not copy the room hash");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(meta.lines[0]).then(copied, fallback);
    else fallback();
  };
  const moveCampBody = (cave, x, y, z, dt) => {
    moveRoomSigns(cave, x, y, z, dt);
    if (cave.camp.burning || cave.camp.rolling || cave.camp.cooldown > 0) return;
    const p = cave.root.position, dx = p.x - x, dz = p.z - z, distance = dx * dx + dz * dz;
    for (const hazard of fireHazards) {
      if (!hazard.node.visible) continue;
      const t = distance ? clamp(((hazard.x - x) * dx + (hazard.z - z) * dz) / distance, 0, 1) : 0;
      const feet = y + (p.y - y) * t - cave.baseY;
      if (feet < hazard.y + FIRE_TOP && feet + cave.bodyHeight > hazard.y + FIRE_BOTTOM
        && (x + dx * t - hazard.x) ** 2 + (z + dz * t - hazard.z) ** 2 < FIRE_CONTACT_RADIUS ** 2) { crew.ignite(cave); break; }
    }
  };
  // Flames are traversable by the visitor, but voluntary NPC steps keep a
  // margin around the entire pit: ash, logs and stone enclosure included.
  // The pit stays excluded when its flame is off, while the vertical sweep
  // still lets another storey or a safely high jump pass over it.
  const npcFireClear = (x, y, z, toX, toY, toZ, height) => {
    const dx = toX - x, dy = toY - y, dz = toZ - z, length = dx * dx + dz * dz;
    for (const hazard of fireHazards) {
      if (!hazard.pit.visible) continue;
      const low = hazard.y + FIRE_BOTTOM - height, high = hazard.y + FIRE_TOP;
      let enter = 0, exit = 1;
      if (dy) {
        const a = (low - y) / dy, b = (high - y) / dy;
        enter = Math.max(0, Math.min(a, b)); exit = Math.min(1, Math.max(a, b));
        if (enter >= exit) continue;
      } else if (y <= low || y >= high) continue;
      const ox = x - hazard.x, oz = z - hazard.z, before = ox * ox + oz * oz;
      // A fire can light beneath a walker: let them move outward, never deeper in.
      // A stationary point inside is still an unsafe goal.
      if (y > low && y < high && before < hazard.avoidRadius ** 2 && length > 0
        && ox * dx + oz * dz >= 0 && (ox + dx) ** 2 + (oz + dz) ** 2 > before) continue;
      const t = length ? clamp(-(ox * dx + oz * dz) / length, enter, exit) : enter;
      if ((ox + dx * t) ** 2 + (oz + dz * t) ** 2 < hazard.avoidRadius ** 2) return false;
    }
    return true;
  };
  const physicalClearAt = (x, y, z, radius, height, actor = pilot?.player) => island.clearAt(x, y, z, radius, height) && y + height <= Math.min(entranceCeilingAt(x, z, y, radius), bedCeilingAt(x, z, y, radius), propCeilingAt(x, z, y, radius, actor)) + 1e-7 && (!solids || solids.clearAt(x, y, z, radius, height));
  const JETPACK_COLUMN = { caveIndex: 0, floor: 0, ceiling: 0 };
  const jetpackAllowed = (cave) => {
    const p = cave.root.position, feet = p.y - cave.baseY;
    const basement = island.headquarters.basement, hole = basement.hole;
    // Keep thrust through the open shaft and its bevel until the whole body clears the lip.
    // The basement ceiling still separates it from HQ above.
    if (feet < basement.ceiling && Math.hypot(p.x - hole.x, p.z - hole.z) <= hole.mouthRadius + PLAYER_RADIUS) return true;
    return !island.cavityAt(p.x, p.z, JETPACK_COLUMN, island.headquarters.caveIndex, feet) || feet < JETPACK_COLUMN.floor - 1e-6 || feet >= JETPACK_COLUMN.ceiling;
  };
  // Interaction reach follows clear air, including stacked rooms.
  // Sweep solid walls and frames exactly; substeps also check the rendered ramp slopes.
  const actionReachable = (x, y, z, toX, toY, toZ, margin = 0.025) => {
    if (crossesSealedCave(x, z, toX, toZ, y) || !island.voxelSegmentClearAt(x, y - margin, z, toX, toY - margin, toZ, margin, margin * 2) || !entranceSegmentClear(x, y, z, toX, toY, toZ, margin)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - x, toY - y, toZ - z) / 0.12));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!island.clearAt(lerp(x, toX, t), lerp(y, toY, t) - margin, lerp(z, toZ, t), margin, margin * 2)) return false;
    }
    return true;
  };
  const actionWithinReach = (x, y, z, toX, toY, toZ, reach) => Math.hypot(toX - x, toY - y, toZ - z) < reach && actionReachable(x, y, z, toX, toY, toZ);
  const MIRROR_ACTOR_RADII = new WeakMap();
  const mirrorPartReach = (geometry, m, x, y, z) => {
    const b = BL.scene.boundsOf(geometry);
    let reach = 0;
    for (let corner = 0; corner < 8; corner++) {
      const px = corner & 1 ? b.max[0] : b.min[0], py = corner & 2 ? b.max[1] : b.min[1], pz = corner & 4 ? b.max[2] : b.min[2];
      reach = Math.max(reach, Math.hypot(m[0] * px + m[4] * py + m[8] * pz + m[12] - x,
        m[1] * px + m[5] * py + m[9] * pz + m[13] - y,
        m[2] * px + m[6] * py + m[10] * pz + m[14] - z));
    }
    return reach;
  };
  const mirrorHeadReach = (node, x, y, z) => {
    if (!node.visible) return 0;
    let reach = node.geometry ? mirrorPartReach(node.geometry, node.world, x, y, z) : 0;
    for (let i = 0; i < node.children.length; i++) reach = Math.max(reach, mirrorHeadReach(node.children[i], x, y, z));
    return reach;
  };
  const mirrorActorRadius = (actor) => {
    let radius = MIRROR_ACTOR_RADII.get(actor);
    if (radius !== undefined) return radius;
    BL.scene.updateWorld(actor.root, actor.root.parent?.world);
    // Away actors still need current accessory transforms when gear changes.
    BL.scene.updateWorld(actor.parts.head, actor.root.world);
    const head = actor.parts.head, m = head.world;
    const reach = Math.max(mirrorHeadReach(head, m[12], m[13], m[14]), mirrorPartReach(actor.headClosed, m, m[12], m[13], m[14]));
    // A sphere about the head pivot contains every yaw/pitch, including hats
    // and masks. Held weapons stay outside this physical clearance envelope.
    // The close view uses a 0.1 m near plane; reserve its oblique corners too.
    radius = Math.max(PLAYER_RADIUS, actor.bodyRadius, Math.hypot(actor.sleepParts.headX, actor.sleepParts.headZ) + reach, CLOSE_VIEW.eyeForward + 0.2) + 0.015;
    MIRROR_ACTOR_RADII.set(actor, radius);
    return radius;
  };
  const mirrorActorSegmentClear = (x, y, z, toX, toY, toZ, height, actor) => {
    if (!actor || mirrorCave.damage.broken) return true;
    const m = mirrorCave.mouth, sr = matrixCave.sr, cr = matrixCave.cr;
    const bounds = BL.scene.boundsOf(mirrorCave.node.mirrorCaptureGeometry), radius = mirrorActorRadius(actor);
    const bottom = mirrorCave.node.position.y + bounds.min[1], top = mirrorCave.node.position.y + bounds.max[1];
    if (Math.min(y, toY) >= m.floorY + top || Math.max(y, toY) + height <= m.floorY + bottom) return true;
    const lx = (x - m.x) * cr - (z - m.z) * sr, lz = (x - m.x) * sr + (z - m.z) * cr;
    const dx = (toX - x) * cr - (toZ - z) * sr, dz = (toX - x) * sr + (toZ - z) * cr;
    if (Math.min(lz, lz + dz) > PORTAL_Z + radius || Math.max(lz, lz + dz) < PORTAL_Z - radius) return true;
    // Partly broken glass still keeps the complete actor outside. The gate
    // remains a separate barrier after the final pane shatters.
    return terrain.segmentBoxClear(lx, y - m.floorY, lz, dx, toY - y, dz, radius, height,
      bounds.min[0], bottom, PORTAL_Z, bounds.max[0], top, PORTAL_Z);
  };
  // A glyph gate is one barrier including the gaps between its bars; sweep the full cylinder.
  // Keep separate from camera/terrain clearance: free eyes still pass it.
  const matrixGateSegmentClear = (x, y, z, toX, toY, toZ, radius, height, clankerPass = false) => {
    const dx = toX - x, dy = toY - y, dz = toZ - z;
    for (let i = 0; i < matrixGates.length; i++) {
      const gate = matrixGates[i], m = gate.mouth;
      if (clankerPass && m === mirrorCave.mouth) continue;
      const bottom = Math.max(gate.floor, gate.node.position.y + gate.bottom), top = Math.min(gate.ceiling, gate.node.position.y + gate.top);
      if (bottom >= top || Math.min(y, toY) >= m.floorY + top || Math.max(y, toY) + height <= m.floorY + bottom) continue;
      const lx = (x - m.x) * gate.cr - (z - m.z) * gate.sr, lz = (x - m.x) * gate.sr + (z - m.z) * gate.cr;
      if (!terrain.segmentBoxClear(lx, y - m.floorY, lz, dx * gate.cr - dz * gate.sr, dy, dx * gate.sr + dz * gate.cr, radius, height, gate.minX, bottom, gate.minZ, gate.maxX, top, gate.maxZ)) return false;
    }
    return true;
  };
  const matrixGateCeilingAt = (x, z, y) => {
    let ceiling = Infinity;
    for (let i = 0; i < matrixGates.length; i++) {
      const gate = matrixGates[i], m = gate.mouth;
      const bottom = Math.max(gate.floor, gate.node.position.y + gate.bottom), top = Math.min(gate.ceiling, gate.node.position.y + gate.top);
      if (bottom >= top || y >= m.floorY + top - 1e-7) continue;
      const lx = (x - m.x) * gate.cr - (z - m.z) * gate.sr, lz = (x - m.x) * gate.sr + (z - m.z) * gate.cr;
      const ox = Math.max(gate.minX - lx, 0, lx - gate.maxX), oz = Math.max(gate.minZ - lz, 0, lz - gate.maxZ);
      if (ox * ox + oz * oz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-9) ceiling = Math.min(ceiling, m.floorY + bottom);
    }
    return ceiling;
  };
  const ceilingAt = (x, z, y, actor = pilot?.player, passengers = true) => {
    let ceiling = Math.min(island.ceilingAt(x, y, z, PLAYER_RADIUS), entranceCeilingAt(x, z, y, PLAYER_RADIUS), bedCeilingAt(x, z, y, PLAYER_RADIUS), matrixGateCeilingAt(x, z, y), propCeilingAt(x, z, y, PLAYER_RADIUS, actor));
    for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
      const entry = CAMERA_OPENINGS[i], m = entry.mouth, rim = entry.rim;
      const dx = x - m.x, dz = z - m.z, along = dx * entry.sr + dz * entry.cr, across = dx * entry.cr - dz * entry.sr;
      if (y < m.floorY - STEP_MAX || y > m.floorY + rim.ceilingY || along < rim.minZ + PORTAL_Z - PLAYER_RADIUS || along > rim.maxZ + PORTAL_Z + PLAYER_RADIUS || across < rim.minX - PLAYER_RADIUS || across > rim.maxX + PLAYER_RADIUS) continue;
      ceiling = Math.min(ceiling, m.floorY + rim.ceilingY);
    }
    if (passengers && actor && crew && (actor.hopV > 0 || y > actor.riding.y - actor.baseY + 1e-7)) for (let riderIndex = 0; riderIndex < crew.list.length; riderIndex++) {
      const rider = crew.list[riderIndex];
      if (rider === actor || !passengerOf(rider, actor)) continue;
      const from = actor.riding, riding = rider.riding;
      const offset = riding.y - rider.baseY - from.y + actor.baseY;
      const roof = ceilingAt(x + riding.x - from.x, z + riding.z - from.z, y + offset, rider, false);
      // Convert each passenger's headroom into a limit for the lower body.
      // Upward motion cannot push it through a roof; level travel may leave a passenger at a wall.
      ceiling = Math.min(ceiling, roof - offset - rider.bodyHeight - Math.max(0, rider.viewLift) + actor.bodyHeight + Math.max(0, actor.viewLift));
    }
    return ceiling;
  };
  const birdsEyeCeiling = (cave) => {
    const p = cave.root.position, feet = p.y - cave.baseY;
    // Clip architectural roofs, not the floor the actor is standing on. Outdoors
    // the taller cut also preserves nearby gorillas and carried equipment.
    const roof = Math.min(island.ceilingAt(p.x, feet + 0.02, p.z, PLAYER_RADIUS), entranceCeilingAt(p.x, p.z, feet + 0.02, PLAYER_RADIUS));
    return Math.max(feet + cave.bodyHeight + Math.max(0, cave.viewLift) + 0.08,
      Math.min(feet + Math.max(4, cave.bodyHeight + 0.35), roof - 0.06));
  };
  const cutawayBlend = (progress, from, to) => {
    const t = clamp((progress - from) / (to - from), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const cutawayLinear = (progress, from, to) => clamp((progress - from) / (to - from), 0, 1);
  const updateCutawayTravelRamp = () => {
    let bestRamp = null, bestChannel = -1, bestDistance = Infinity, bestStation = 0;
    const ramps = island.cutawayPaths.ramps;
    for (let channel = 0; channel < ramps.length; channel++) {
      const ramp = ramps[channel], samples = ramp.samples;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i], dx = b.x - a.x, dz = b.z - a.z;
        const length2 = dx * dx + dz * dz, t = clamp(((cutawayX - a.x) * dx + (cutawayZ - a.z) * dz) / (length2 || 1), 0, 1);
        const x = a.x + dx * t, y = a.y + (b.y - a.y) * t, z = a.z + dz * t;
        const ox = cutawayX - x, oz = cutawayZ - z, distance = ox * ox + oz * oz;
        const reach = ramp.width / 2 + PLAYER_RADIUS + 0.18;
        if (distance <= reach * reach && Math.abs(cutawayFeet - y) <= STEP_MAX + 0.4 && distance < bestDistance) {
          bestRamp = ramp; bestChannel = channel; bestDistance = distance;
          bestStation = a.s + (b.s - a.s) * t;
        }
      }
    }
    cutawayTravelRamp = bestRamp;
    cutawayTravelChannel = bestChannel;
    cutawayTravelStation = bestStation;
    return bestChannel >= 0;
  };
  const resetCutawayPaths = () => {
    let changed = CUTAWAY_PATH_STATE.active !== 0;
    CUTAWAY_PATH_STATE.active = 0;
    for (let channel = 0; channel < 4; channel++) {
      if (CUTAWAY_PATH_STATE.mix[channel] > 0) changed = true;
      CUTAWAY_PATH_STATE.mix[channel] = 0;
    }
    CUTAWAY_PATH_STATE.windowMix.fill(0);
    if (changed) CUTAWAY_PATH_STATE.version++;
    terrainRampRoof?.update(CUTAWAY_PATH_STATE);
  };
  const updateCutawayPaths = (sliceY, slicing, rockMix) => {
    const paths = island.cutawayPaths;
    updateCutawayTravelRamp();
    // The initial basement entrances open as the scan reaches HQ; travel and
    // floor progress extend those openings farther down the routes.
    const lowerLevelMix = Number.isFinite(cutawayProgress) ? cutawayLinear(cutawayProgress - 1, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END) : 0;
    const lowerCoverDepth = (island.headquarters.ceiling - 0.06) - sliceY;
    const lowerCoverMix = slicing ? cutawayLinear(lowerCoverDepth, paths.unit, paths.unit * 2) : 0;
    const lowerEntranceMix = slicing ? cutawayLinear(lowerCoverDepth, -paths.unit, 0) : 0;
    const terrainMix = 1 - cutawayBlend(cutawayHillMix, 0, 1);
    let changed = CUTAWAY_PATH_STATE.active !== 1;
    CUTAWAY_PATH_STATE.active = 1;
    CUTAWAY_PATH_STATE.windowMix[0] = rockMix * terrainMix * cutawayBlend(cutawayProgress, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END);
    CUTAWAY_PATH_STATE.windowMix[1] = rockMix * terrainMix * cutawayBlend(cutawayProgress - 1, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END);
    for (let channel = 0; channel < 4; channel++) {
      let lo = 1;
      if (slicing) for (let station = 1; station <= 255; station++) {
        const bottom = paths.bottomByStation[channel * 256 + station];
        if (Number.isFinite(bottom) && bottom >= sliceY - 0.01) lo = station + 1;
      }
      const initial = paths.initial[channel];
      // Once a floor transition has consumed part of a ramp, leaving its
      // narrow travel corridor must not put that roof back. Height progress is
      // the stable baseline; proximity may only reveal farther ahead.
      const levelProgress = clamp(cutawayProgress - (channel >= 2 ? 1 : 0), 0, 1);
      let hi = Math.max(initial, 1 + Math.round(levelProgress * 254));
      if (channel === cutawayTravelChannel && lo <= 255) {
        const station = 1 + Math.round(clamp(cutawayTravelStation / paths.lengths[channel], 0, 1) * 254);
        // The globally scanned prefix remains visibly open behind the player.
        // Match that full distance ahead, while the authored entrance length is
        // a hard minimum, so stepping onto a ramp can never make it contract.
        hi = Math.min(255, Math.max(hi, station + Math.max(0, station - 1)));
      }
      let lowerPathMix = Math.max(lowerEntranceMix, lowerLevelMix * lowerCoverMix);
      if (channel >= 2 && channel === cutawayTravelChannel && lo <= 255) {
        // The globally scanned prefix has no roof left over the actor. Fade the
        // active lower route completely before their leading edge reaches the
        // first roof cell below the settled HQ cut. The fixed boundary also
        // prevents the roof from returning midway down as the global scan
        // consumes progressively deeper cells.
        let firstCoveredStation = 1;
        while (firstCoveredStation <= 255 && paths.bottomByStation[channel * 256 + firstCoveredStation] >= island.headquarters.ceiling - 0.07) firstCoveredStation++;
        const firstCovered = (firstCoveredStation - 1) / 254 * paths.lengths[channel];
        const clearBy = Math.max(paths.unit, firstCovered - PLAYER_RADIUS - paths.unit);
        lowerPathMix = Math.max(lowerPathMix, cutawayBlend(cutawayTravelStation, 0, clearBy));
      }
      const nextMix = rockMix * terrainMix * (channel < 2 ? 1 : lowerPathMix);
      if (CUTAWAY_PATH_STATE.lo[channel] !== lo || CUTAWAY_PATH_STATE.hi[channel] !== hi
        || (CUTAWAY_PATH_STATE.mix[channel] > 0) !== (nextMix > 0)) changed = true;
      CUTAWAY_PATH_STATE.lo[channel] = lo;
      CUTAWAY_PATH_STATE.hi[channel] = hi;
      CUTAWAY_PATH_STATE.mix[channel] = nextMix;
    }
    if (changed) CUTAWAY_PATH_STATE.version++;
    terrainRampRoof.update(CUTAWAY_PATH_STATE);
  };
  const updateBirdsEyeCutaway = (dt) => {
    clearCutawayHidden();
    const player = pilot.player, cameraMix = player && pilot.birdsEye ? pilot.birdsEyeMix : 0;
    const showRampMarkers = cameraMix > 0.5;
    for (const lintel of headquartersRimLintels) lintel.visible = !showRampMarkers;
    for (const marker of headquarters.rampMarkers) {
      marker.node.visible = marker.frame.visible = marker.arrow.visible = showRampMarkers;
      if (!showRampMarkers) continue;
      // Turn the whole inscription in its fitted floor plane. Its baseline
      // stays horizontal on screen, with +x reading right and -z reading up;
      // the separate arrow remains fixed to the downhill route.
      const up = camera.up, across = marker.across, downhill = marker.downhill;
      const x = up.x * across.x + up.y * across.y + up.z * across.z;
      const z = up.x * downhill.x + up.y * downhill.y + up.z * downhill.z;
      marker.node.rotation.y = Math.atan2(-x, -z);
    }
    const mix = cameraMix, active = mix > 0;
    // Scan through the full camera blend in both directions, including reversals.
    const rockMix = mix;
    RENDER_OPTS.birdsEyeCutaway = active;
    RENDER_OPTS.cutawayFade = RENDER_OPTS.cutawayCloudMix = mix;
    RENDER_OPTS.cutawayRockMix = rockMix;
    RENDER_OPTS.cutawayRegionCount = 0;
    if (!active) {
      RENDER_OPTS.cutawayMaxY = 1e6; cutawayHeight = cutawayProgress = NaN;
      cutawayTravelRamp = null; cutawayTravelChannel = -1; cutawayTravelStation = 0;
      resetCutawayPaths();
      for (const entry of terrainSections) entry.cap.node.visible = false;
      for (const entry of caveSections) entry.cap.node.visible = false;
      return;
    }
    const hq = island.headquarters;
    if (cameraMix > 0) {
      const p = player.root.position, fresh = player !== cutawayPlayer || !Number.isFinite(cutawayProgress);
      // Hop is relative to the next supporting floor, including the abyss
      // sentinel. Only world-space feet describe the level actually on screen.
      cutawayFeet = p.y - player.baseY;
      cutawayX = p.x; cutawayZ = p.z;
      cutawayHeadY = cutawayFeet + player.bodyHeight + Math.max(0, player.viewLift) + 0.08;
      const surface = island.surfaceAt(p.x, p.z);
      const elevation = cutawayFeet - Math.max(STEP_MAX, surface - STEP_MAX);
      cutawayHill = elevation > (fresh ? 0 : cutawayHill ? -0.12 : 0.12);
      if (fresh) cutawayHillMix = cutawayHill ? 1 : 0;
      else cutawayHillMix += clamp((cutawayHill ? 1 : 0) - cutawayHillMix, -dt / 0.3, dt / 0.3);
      // Progress uses actual height between floors, not the support underneath
      // a jump or the long flat tail at the end of a ramp. A small deadband
      // retains the approach direction through stops and tiny reversals.
      const progress = cutawayFeet >= hq.floor ? clamp(cutawayFeet / hq.floor, 0, 1)
        : 1 + clamp((hq.floor - cutawayFeet) / (hq.floor - hq.basement.floor), 0, 1);
      // Settle exactly on authored floors. The motion deadband belongs only to
      // a ramp reversal; retaining its last in-band value at a landing left a
      // few terminal roof cells dependent on the actor's lateral position.
      cutawayProgress = fresh || Math.abs(progress - Math.round(progress)) < 1e-6
        ? progress : clamp(cutawayProgress, progress - CUTAWAY_FLOOR_DEADBAND, progress + CUTAWAY_FLOOR_DEADBAND);
      cutawayLevel = cutawayBlend(cutawayProgress, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END)
        + cutawayBlend(cutawayProgress - 1, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END);
      cutawayPlayer = player;
    }
    const feet = cutawayFeet;
    RENDER_OPTS.cutawayCloudY = feet - 2;
    // Scan between floor ceilings across the ramp's travel so upper levels
    // peel away progressively instead of switching in a narrow midpoint band.
    // Head clearance remains authoritative during a jump, jet flight or fall.
    if (cameraMix > 0) {
      let target = cutawayLevel <= 1 ? lerp(CUTAWAY_TOP, hq.ceiling - 0.06, cutawayLevel)
        : lerp(hq.ceiling - 0.06, hq.basement.ceiling - 0.06, cutawayLevel - 1);
      if (feet < hq.basement.floor - STEP_MAX) target = Math.min(target, birdsEyeCeiling(player));
      if (!Number.isFinite(cutawayHeight)) cutawayHeight = target;
      else cutawayHeight += clamp(target - cutawayHeight, -CUTAWAY_FLOOR_RATE * dt, CUTAWAY_FLOOR_RATE * dt);
      cutawayHeight = Math.max(cutawayHeight, cutawayHeadY);
    }
    const slicing = cutawayHeight < CUTAWAY_TOP - 0.01;
    const sliceY = Math.max(cutawayHeadY, lerp(CUTAWAY_TOP, cutawayHeight, rockMix));
    RENDER_OPTS.cutawayMaxY = slicing ? sliceY : 1e6;
    updateCutawayPaths(sliceY, slicing, rockMix);
    for (const entry of terrainSections) {
      if (slicing) entry.cap.update(sliceY - entry.worldY, null, entry.paths ? CUTAWAY_PATH_STATE : null);
      else entry.cap.node.visible = false;
    }
    const caveRoofMix = 1 - cutawayBlend(cutawayHillMix, 0, 1);
    for (const entry of caveSections) {
      const r = entry.region;
      r.y = cutawayActorY(r, lerp(CUTAWAY_TOP, entry.targetY, rockMix));
      r.mix = caveRoofMix;
      // Hills and jet flight restore cave roofs at the same character-relative
      // height as ramp cover. Keep the aperture alive through the fade, then
      // drop it only after the roof is fully opaque again.
      const reveal = caveRoofMix > 0 && (!slicing || r.y < sliceY);
      entry.cap.node.visible = reveal;
      if (reveal) {
        RENDER_OPTS.cutawayRegions[RENDER_OPTS.cutawayRegionCount++] = r;
        entry.cap.update(r.y, r);
        for (let i = 0; i < entry.cap.node.children.length; i++) entry.cap.node.children[i].smokeOpacity = caveRoofMix;
      }
    }
    RENDER_OPTS.cutawayRegionCount = Math.min(CUTAWAY_REGION_CAP, RENDER_OPTS.cutawayRegionCount);
    updateCutawayWholeVisibility();
  };
  const crossesSealedCave = (fromX, fromZ, toX, toZ, y = 0) => {
    for (let i = 0; i < sealedCaves.length; i++) {
      const sealed = sealedCaves[i], m = sealed.mouth, sr = sealed.sr, cr = sealed.cr;
      if (y < m.floorY - STEP_MAX || y > m.floorY + PORTAL_MAX_Y) continue;
      const a = (fromX - m.x) * sr + (fromZ - m.z) * cr - sealed.stopZ;
      const b = (toX - m.x) * sr + (toZ - m.z) * cr - sealed.stopZ;
      if (a * b > 0 || a === b) continue;
      const k = a / (a - b), x = lerp(fromX, toX, k), z = lerp(fromZ, toZ, k);
      const across = (x - m.x) * cr - (z - m.z) * sr;
      if (across >= PORTAL_MIN_X && across <= PORTAL_MAX_X) return true;
    }
    return false;
  };
  // Bananas are passable; the visitor must jump onto their stone platform.
  const walkable = (fromX, fromZ, toX, toZ, y, height = 1.5, actor = pilot?.player) => {
    if (Math.hypot(toX, toZ) > FLY_BOUND || crossesSealedCave(fromX, fromZ, toX, toZ, y)) return false;
    // Sweep the feet before ordinary step assistance lifts them. Once above
    // the rim, jumping, landing and walking off keep their normal clearance.
    if (altar && actor && actor === pilot.player && !cylinderSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height, 0, 0, 0, ALTAR_HEIGHT, altar.platformRadius)) return false;
    const floor = playerSupportAt(toX, toZ, y, y, actor, true), feet = Math.max(y, floor);
    if (floor - y > STEP_MAX) return false;
    // Feet may mount an ordinary voxel step.
    // Torso and head must fit across their whole footprint at the destination's actual elevation.
    return feet + height <= ceilingAt(toX, toZ, feet, actor) + 1e-7 && physicalClearAt(toX, feet + STEP_MAX, toZ, PLAYER_RADIUS, Math.max(0, height - STEP_MAX), actor) && propSegmentClear(fromX, feet + STEP_MAX, fromZ, toX, feet + STEP_MAX, toZ, PLAYER_RADIUS, Math.max(0, height - STEP_MAX), actor) && matrixGateSegmentClear(fromX, y, fromZ, toX, feet, toZ, PLAYER_RADIUS, height) && mirrorActorSegmentClear(fromX, y, fromZ, toX, feet, toZ, height, actor);
  };
  const flyable = (fromX, fromZ, toX, toZ, y = 0, height = 1.5, actor = pilot?.player) => Math.hypot(toX, toZ) <= FLY_BOUND && !crossesSealedCave(fromX, fromZ, toX, toZ, y) && y + height <= ceilingAt(toX, toZ, y, actor) + 1e-7 && physicalClearAt(toX, y, toZ, PLAYER_RADIUS, height, actor) && propSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height, actor) && bedSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height) && matrixGateSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height) && mirrorActorSegmentClear(fromX, y, fromZ, toX, y, toZ, height, actor);
  const characterCarryClear = (cave, x, y, z, toX, toY, toZ, ignoreClanker = null) => {
    const height = cave.bodyHeight + Math.max(0, cave.viewLift), feet = y + 1e-7, toFeet = toY + 1e-7;
    return Math.hypot(toX, toZ) <= FLY_BOUND && !crossesSealedCave(x, z, toX, toZ, Math.min(y, toY))
      && toY + height <= ceilingAt(toX, toZ, toY, cave) + 1e-7
      && physicalClearAt(toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7, cave)
      && island.voxelSegmentClearAt(x, feet, z, toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7)
      && propSegmentClear(x, feet, z, toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7, cave, true, ignoreClanker)
      && bedSegmentClear(x, feet, z, toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7)
      && matrixGateSegmentClear(x, feet, z, toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7)
      && mirrorActorSegmentClear(x, feet, z, toX, toFeet, toZ, height - 1e-7, cave);
  };
  const carryCharacter = (cave, dx, dy, dz) => {
    if (!standingPassenger(cave) || !cave.riding.support || !uprightCharacter(cave.riding.support)) return;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-9) return;
    const p = cave.root.position, steps = Math.max(1, Math.ceil(distance / 0.125));
    dx /= steps; dy /= steps; dz /= steps;
    for (let n = 0; n < steps; n++) {
      const feet = p.y - cave.baseY;
      if (characterCarryClear(cave, p.x, feet, p.z, p.x + dx, feet + dy, p.z + dz)) {
        p.x += dx; p.y += dy; p.z += dz;
        continue;
      }
      // Preserve contact with the obstacle instead of crossing it or losing a frame of safe movement near a wall.
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {
        const t = (lo + hi) / 2;
        if (characterCarryClear(cave, p.x, feet, p.z, p.x + dx * t, feet + dy * t, p.z + dz * t)) lo = t;
        else hi = t;
      }
      p.x += dx * lo; p.y += dy * lo; p.z += dz * lo;
      break;
    }
  };
  const prepareClankerRiders = () => {
    for (let i = 0; i < crew.list.length; i++) {
      const cave = crew.list[i], ride = cave.clankerRide;
      ride.entry = ride.node = null;
      if (!standingPassenger(cave)) continue;
      const p = cave.root.position, feet = p.y - cave.baseY;
      const floor = clankerMeshes.supportAt(p.x, p.z, feet + 1e-5, 0, PLAYER_RADIUS, null, CLANKER_SUPPORT);
      if (!CLANKER_SUPPORT.node || Math.abs(floor - feet) > 1e-4) continue;
      const entry = clankerPartOwners.get(CLANKER_SUPPORT.node);
      if (!entry.active || entry.fire.rolling) continue;
      ride.entry = entry; ride.node = CLANKER_SUPPORT.node;
      ride.x = p.x; ride.y = feet; ride.z = p.z;
      const carrier = entry.root.position;
      ride.carrierX = carrier.x; ride.carrierY = carrier.y; ride.carrierZ = carrier.z; ride.heading = entry.heading;
      math.mat4.invert(CLANKER_RIDER_INVERSE, ride.node.world);
      math.mat4.transformPoint(CLANKER_RIDER_POINT, CLANKER_RIDER_INVERSE, p.x, feet, p.z);
      ride.localX = CLANKER_RIDER_POINT[0]; ride.localY = CLANKER_RIDER_POINT[1]; ride.localZ = CLANKER_RIDER_POINT[2];
    }
  };
  const clankerRidersClear = (entry, x, y, z, toX, toY, toZ, fromHeading, toHeading) => {
    for (let i = 0; i < crew.list.length; i++) {
      const cave = crew.list[i], ride = cave.clankerRide;
      if (!ride || ride.entry !== entry) continue;
      // The controller may take several substeps before the mesh and rider
      // advance. Predict each destination from the same frame-start transform.
      const turn = toHeading - ride.heading, sine = Math.sin(turn), cosine = Math.cos(turn);
      const dx = ride.x - ride.carrierX, dz = ride.z - ride.carrierZ;
      if (!characterCarryClear(cave, ride.x, ride.y, ride.z,
        toX + cosine * dx + sine * dz, ride.y + toY - ride.carrierY, toZ - sine * dx + cosine * dz, entry)) return false;
    }
    return true;
  };
  const carryClankerRiders = () => {
    for (let i = 0; i < crew.list.length; i++) {
      const cave = crew.list[i], ride = cave.clankerRide, entry = ride.entry;
      if (!entry) continue;
      if (!entry.active || entry.fire.rolling || !standingPassenger(cave)) { ride.entry = ride.node = null; continue; }
      math.mat4.transformPoint(CLANKER_RIDER_POINT, ride.node.world, ride.localX, ride.localY, ride.localZ);
      const x = CLANKER_RIDER_POINT[0], y = CLANKER_RIDER_POINT[1], z = CLANKER_RIDER_POINT[2];
      const floor = clankerMeshes.supportAt(x, z, y, STEP_MAX, PLAYER_RADIUS, null, CLANKER_SUPPORT);
      const p = cave.root.position, feet = p.y - cave.baseY, height = cave.bodyHeight + Math.max(0, cave.viewLift);
      // Contact follows the animated supporting part, not the body's bounding
      // cylinder. Once it rolls away or loses contact, ordinary gravity takes over.
      if (!CLANKER_SUPPORT.node || clankerPartOwners.get(CLANKER_SUPPORT.node) !== entry
        || Math.abs(floor - y) > STEP_MAX || Math.hypot(x - ride.x, y - ride.y, z - ride.z) > 1
        || !clankerMeshes.clearAt(x, floor + 1e-5, z, PLAYER_RADIUS, height - 1e-5)
        || !characterCarryClear(cave, p.x, feet, p.z, x, floor, z, entry)) {
        ride.entry = ride.node = null;
        continue;
      }
      p.x = x; p.y = cave.baseY + floor; p.z = z;
      cave.hop = 0; cave.hopV = 0;
    }
  };
  const releaseClankerDrag = (entry) => {
    const drag = entry.drag, cave = drag.cave;
    if (!cave) return;
    drag.cave = null; drag.time = 0;
    entry.motion.dragging = false;
    cave.clankerDragged = false;
    cave.root.rotation.x = 0;
    cave.root.position.y = cave.baseY + island.supportAt(cave.root.position.x, cave.root.position.z,
      cave.root.position.y - cave.baseY, 0.52);
    cave.hop = cave.hopV = 0;
  };
  const grabClankerOoga = (entry) => {
    const p = entry.root.position;
    let nearest = null, distance = 2.6;
    for (let i = 0; i < crew.list.length; i++) {
      const cave = crew.list[i], q = cave.root.position;
      if (!cave.root.visible || cave.state === "sleeping" || cave.health.stunned || cave.clankerDragged || cave.bedTravel.mode) continue;
      const gap = Math.hypot(p.x - q.x, p.z - q.z);
      if (gap < distance && Math.abs(p.y - (q.y - cave.baseY)) < 1.5) { nearest = cave; distance = gap; }
    }
    if (!nearest) return false;
    entry.drag.cave = nearest; entry.drag.time = 2;
    entry.motion.dragging = true;
    nearest.clankerDragged = true;
    nearest.riding.support = null;
    nearest.hop = nearest.hopV = 0;
    return true;
  };
  const updateClankerDrags = (dt) => {
    for (let i = 0; i < clankers.list.length; i++) {
      const entry = clankers.list[i], drag = entry.drag, cave = drag.cave;
      if (!cave) continue;
      if (!entry.controlled || !entry.active || !cave.root.visible || entry.fire.rolling || (drag.time -= dt) <= 0) {
        releaseClankerDrag(entry); continue;
      }
      const p = entry.root.position, q = cave.root.position;
      const x = p.x - Math.sin(entry.heading) * 1.25, z = p.z - Math.cos(entry.heading) * 1.25;
      const floor = island.supportAt(x, z, p.y, 0.52), fromY = q.y - cave.baseY;
      if (!characterCarryClear(cave, q.x, fromY, q.z, x, floor, z, entry)) {
        releaseClankerDrag(entry); continue;
      }
      q.x = x; q.y = cave.baseY + floor + 0.48; q.z = z;
      cave.root.rotation.x = -Math.PI / 2;
      cave.root.rotation.y = entry.heading;
    }
  };
  const inBananas = (cave, x = cave.root.position.x, z = cave.root.position.z) => bananaCover.intersectsBody(x, cave.root.position.y - cave.baseY, z, cave.bodyHeight);
  const npcPileAt = (x, feet, z, height) => feet <= ALTAR_HEIGHT + STEP_MAX && feet + height > 0 && Math.hypot(x, z) < altar.platformRadius + PLAYER_RADIUS
    || bananaCover.intersectsBody(x, feet, z, height);
  const workZoneTraveler = (cave) => cave && cave !== crew?.player && (cave.state !== "working" || cave.bedTravel.mode);
  const refreshWorkZones = () => {
    for (const zone of workZones) { zone.active = false; zone.half = 3.4; zone.front = 5.8; }
    for (let i = 0; i < crew.list.length; i++) {
      const cave = crew.list[i];
      if (!cave.root.visible || cave === crew.player || cave.state !== "working" || !cave.work.phase) continue;
      const zone = workZones[cave.work.site], p = cave.work.position;
      if (!zone) continue;
      zone.active = true;
      if (cave.work.phase !== "outbound" && cave.work.phase !== "station" && cave.work.phase !== "shoot") continue;
      const dx = p.x - zone.x, dz = p.z - zone.z;
      zone.half = Math.max(zone.half, Math.abs(dx * zone.cr - dz * zone.sr) + 0.8);
      zone.front = Math.max(zone.front, dx * zone.sr + dz * zone.cr + 0.8);
    }
  };
  const workZoneContains = (zone, x, y, z, height) => {
    if (!zone.active || y + height <= zone.floor || y >= zone.floor + 3.5) return false;
    const dx = x - zone.x, dz = z - zone.z, across = dx * zone.cr - dz * zone.sr, along = dx * zone.sr + dz * zone.cr;
    const ox = Math.max(Math.abs(across) - zone.half, 0), oz = Math.max(-7 - along, 0, along - zone.front);
    return ox * ox + oz * oz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-9;
  };
  const workZoneSegmentClear = (zone, x, y, z, toX, toY, toZ, height) => {
    const dx = x - zone.x, dz = z - zone.z, vx = toX - x, vz = toZ - z;
    return terrain.segmentBoxClear(dx * zone.cr - dz * zone.sr, y, dx * zone.sr + dz * zone.cr,
      vx * zone.cr - vz * zone.sr, toY - y, vx * zone.sr + vz * zone.cr, PLAYER_RADIUS, height,
      -zone.half, zone.floor, -7, zone.half, zone.floor + 3.5, zone.front);
  };
  const npcClosedCaveAt = (x, z, y = null, height = 1.5) => {
    for (const zone of closedCaveZones) if (workZoneContains(zone, x, y === null ? zone.floor : y, z, height)) return true;
    return false;
  };
  // Cave-mouth frames are narrow structural ledges, not NPC destinations.
  // Recovery may otherwise jump onto the top bar and find no legal walking
  // step back down to the apron.
  const npcCaveRimAt = (x, y, z) => {
    for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
      const entry = CAMERA_OPENINGS[i], m = entry.mouth;
      if (y <= m.floorY + STEP_MAX) continue;
      const dx = x - m.x, dz = z - m.z;
      const across = dx * entry.cr - dz * entry.sr, along = dx * entry.sr + dz * entry.cr;
      if (Math.abs(across) <= 3 + PLAYER_RADIUS && along >= -PLAYER_RADIUS && along <= 1 + PLAYER_RADIUS) return true;
    }
    return false;
  };
  const npcClosedCaveClear = (x, y, z, toX, toY, toZ, height) => {
    for (const zone of closedCaveZones) {
      // A released player may already be beside the boards. Keep the way out open.
      if (workZoneContains(zone, x, y, z, height)) {
        const dx = x - zone.x, dz = z - zone.z, tx = toX - zone.x, tz = toZ - zone.z;
        const across = Math.abs(dx * zone.cr - dz * zone.sr), toAcross = Math.abs(tx * zone.cr - tz * zone.sr);
        const along = dx * zone.sr + dz * zone.cr, toAlong = tx * zone.sr + tz * zone.cr;
        if (toAlong >= along - 1e-7 || toAcross > across + 1e-7) continue;
        return false;
      }
      if (!workZoneSegmentClear(zone, x, y, z, toX, toY, toZ, height)) return false;
    }
    return true;
  };
  const npcWorkZoneAt = (cave, x, y, z) => {
    if (!workZoneTraveler(cave)) return false;
    for (const zone of workZones) if (workZoneContains(zone, x, y, z, cave.bodyHeight)) return true;
    return false;
  };
  const npcWorkZoneClear = (cave, x, y, z, toX, toY, toZ) => {
    if (!workZoneTraveler(cave)) return true;
    const p = cave.root.position, feet = p.y - cave.baseY;
    for (const zone of workZones) {
      // A shift may start around someone. Their exit remains open.
      if (!zone.active || workZoneContains(zone, p.x, feet, p.z, cave.bodyHeight)) continue;
      if (!workZoneSegmentClear(zone, x, y, z, toX, toY, toZ, cave.bodyHeight)) return false;
    }
    return true;
  };
  const npcWorkDetour = (cave, tx, tz, targetY = cave.root.position.y - cave.baseY) => {
    const out = cave.avoidance.detour, p = cave.root.position, feet = p.y - cave.baseY;
    if (!workZoneTraveler(cave)) { out.site = -1; return false; }
    if (out.goalX !== tx || out.goalZ !== tz) { out.site = -1; out.goalX = tx; out.goalZ = tz; }
    if (out.site < 0) {
      for (let i = 0; i < workZones.length; i++) {
        const zone = workZones[i];
        if (!zone.active) continue;
        const inside = workZoneContains(zone, p.x, feet, p.z, cave.bodyHeight);
        const path = cave.pathing;
        if (!inside && workZoneSegmentClear(zone, p.x, feet, p.z, tx, targetY, tz, cave.bodyHeight)
          && (path.tx !== tx || path.tz !== tz || workZoneSegmentClear(zone, p.x, feet, p.z, path.targetX, targetY, path.targetZ, cave.bodyHeight))) continue;
        const localX = (p.x - zone.x) * zone.cr - (p.z - zone.z) * zone.sr;
        out.site = i; out.phase = 0; out.entryX = inside ? localX : (localX < 0 ? -1 : 1) * (zone.half + 0.9);
        out.side = (tx - zone.x) * zone.cr - (tz - zone.z) * zone.sr < 0 ? -1 : 1;
        cave.avoidance.navigation.mode = 0; cave.avoidance.tx = NaN;
        break;
      }
      if (out.site < 0) return false;
    }
    const zone = workZones[out.site];
    if (!zone.active) { out.site = -1; cave.pathing.tx = NaN; return false; }
    // Two front corners avoid both the line of fire and the occupied fan.
    // Keep this direct detour until its original goal, so painted-path hints
    // cannot pull the walker back toward an intermediate point inside it.
    if (out.phase === 0) {
      out.x = zone.x + zone.cr * out.entryX + zone.sr * (zone.front + 0.9);
      out.z = zone.z - zone.sr * out.entryX + zone.cr * (zone.front + 0.9);
      if (Math.hypot(out.x - p.x, out.z - p.z) < 0.12) out.phase = 1;
    }
    if (out.phase === 1) {
      if (workZoneSegmentClear(zone, p.x, feet, p.z, tx, targetY, tz, cave.bodyHeight)) out.phase = 2;
      else {
        const x = out.side * (zone.half + 0.9), z = zone.front + 0.9;
        out.x = zone.x + zone.cr * x + zone.sr * z; out.z = zone.z - zone.sr * x + zone.cr * z;
        if (Math.hypot(out.x - p.x, out.z - p.z) < 0.12) out.phase = 2;
      }
    }
    if (out.phase === 2) { out.x = tx; out.z = tz; }
    cave.pathing.tx = NaN; cave.pathing.index = cave.pathing.count;
    cave.pathing.targetX = out.x; cave.pathing.targetZ = out.z;
    return true;
  };
  const npcDestinationBlocked = (cave, x, z) => {
    // Stroll destinations are on the surface. Evaluate their own floor,
    // not the walker's current elevation at the bottom of a staircase.
    const onTimechain = timechainIsland && Math.hypot(x - timechainIsland.place.x, z - timechainIsland.place.z) < BL.timechainModels.SITE.radius - 1;
    const feet = onTimechain ? playerSupportAt(x, z, Infinity, Infinity, cave) : island.surfaceAt(x, z);
    return npcClosedCaveAt(x, z, feet, cave.bodyHeight) || npcPileAt(x, feet, z, cave.bodyHeight) || npcWorkZoneAt(cave, x, feet, z) || !npcFireClear(x, feet, z, x, feet, z, cave.bodyHeight) || !walkable(x, z, x, z, feet, cave.bodyHeight, cave);
  };
  const npcWalkable = (fromX, fromZ, toX, toZ, y, height, actor) => {
    if (!walkable(fromX, fromZ, toX, toZ, y, height, actor)) return false;
    // Sweep to the actual downhill support too.
    // Checking at the previous, higher floor can clear a move whose lowered torso intersects the wall.
    const feet = playerSupportAt(toX, toZ, y, y, actor);
    if (!npcClosedCaveClear(fromX, y, fromZ, toX, feet, toZ, height)) return false;
    if (!npcWorkZoneClear(actor, fromX, y, fromZ, toX, feet, toZ)) return false;
    if (!npcFireClear(fromX, y, fromZ, toX, feet, toZ, height)) return false;
    // Voluntary walkers go around fruit, but a growing pile or a landing may put one inside.
    // Keep their way out passable rather than trapping them.
    if (!npcPileAt(fromX, y, fromZ, height)) {
      const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / 0.15));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (npcPileAt(lerp(fromX, toX, t), lerp(y, feet, t), lerp(fromZ, toZ, t), height)) return false;
      }
    }
    // Supported ascent lifts onto a tread before moving across it. A diagonal
    // torso sweep from the old floor would falsely hit a legal half-metre
    // riser at its outer corner. Descents still sweep the actual falling edge.
    const sweepY = Math.max(y, feet);
    return island.clearAt(toX, feet + 1e-5, toZ, 0, 0.01) && island.clearAt(toX, feet + 0.3, toZ, PLAYER_RADIUS, height - 0.3)
      && (feet <= y || island.clearAt(fromX, sweepY + 0.3, fromZ, PLAYER_RADIUS, height - 0.3))
      && island.voxelSegmentClearAt(fromX, sweepY + 0.3, fromZ, toX, feet + 0.3, toZ, PLAYER_RADIUS, height - 0.3);
  };
  // The route graph describes connected architecture only.
  // Scenery and other walkers are avoided by the same swept steps used during the actual walk.
  const sleepRouteClear = (fromX, fromZ, toX, toZ, y, height) => {
    const feet = Math.max(y, supportAt(toX, toZ, y), bedSupportAt(toX, toZ, y, STEP_MAX, PLAYER_RADIUS));
    return !crossesSealedCave(fromX, fromZ, toX, toZ, y) && feet - y <= STEP_MAX && feet + height <= Math.min(island.ceilingAt(toX, feet, toZ, PLAYER_RADIUS), entranceCeilingAt(toX, toZ, feet, PLAYER_RADIUS), bedCeilingAt(toX, toZ, feet, PLAYER_RADIUS)) + 1e-7 && island.clearAt(toX, feet + STEP_MAX, toZ, PLAYER_RADIUS, Math.max(0, height - STEP_MAX));
  };
  // Upward thrust follows the outside of the spherical underside; slide out beneath its notches before rising.
  // Same full-body clearance as flight; interior ceilings and unsupported idle falls stay put.
  const glideJetCeiling = (cave, dt) => {
    const p = cave.root.position, feet = p.y - cave.baseY, height = cave.bodyHeight + Math.max(0, cave.viewLift);
    if (feet >= 0 || !abyssAt(p.x, p.z, feet)) return false;
    const ceiling = ceilingAt(p.x, p.z, feet), radius = Math.hypot(p.x, p.z);
    if (!radius || ceiling - feet - height > 0.15) return false;
    const distance = JET_SPEED * dt, x = p.x + p.x / radius * distance, z = p.z + p.z / radius * distance;
    if (!flyable(p.x, p.z, x, z, feet, height, cave) || !island.voxelSegmentClearAt(p.x, feet, p.z, x, feet, z, PLAYER_RADIUS, height)) return false;
    p.x = x; p.z = z;
    return true;
  };
  const cloudBox = (x0, y0, z0, x1, y1, z1) => cloudObstacles.push({ x0, y0, z0, x1, y1, z1 });
  const cloudBridgeBox = (x0, z0, x1, z1, y, width) => {
    const reach = width / 2 + 0.7;
    cloudBox(Math.min(x0, x1) - reach, y - 1.5, Math.min(z0, z1) - reach,
      Math.max(x0, x1) + reach, y + 3.5, Math.max(z0, z1) + reach);
  };
  const buildCloudObstacles = () => {
    cloudObstacles.length = 0;
    cloudBox(-RADIUS - 4, -30, -RADIUS - 4, RADIUS + 4, 24, RADIUS + 4);
    const launch = launchCloudSpot, launchSite = rocketModels.SITE;
    cloudBox(launch.x - launchSite.isletR - 2, launch.y - launchSite.isletDepth - 1, launch.z - launchSite.isletR - 2,
      launch.x + launchSite.isletR + 2, launch.y + 24, launch.z + launchSite.isletR + 2);
    cloudBridgeBox(launch.x, launch.bridgeZ, launch.x, launch.bridgeZ + launchSite.span, launch.y, launchSite.width);
    const pool = mempoolIsland.place, poolSite = poolModels.SITE, poolDir = poolModels.DIR;
    cloudBox(pool.x - poolSite.isletR - 4, pool.y - poolSite.isletDepth - 1, pool.z - poolSite.isletR - 4,
      pool.x + poolSite.isletR + 4, pool.y + 25, pool.z + poolSite.isletR + 4);
    cloudBridgeBox(pool.bridgeX, pool.bridgeZ, pool.x - poolDir.x * (poolSite.isletR - 1),
      pool.z - poolDir.z * (poolSite.isletR - 1), pool.y, poolSite.width);
    const sphere = timechainIsland.place, sphereSite = BL.timechainModels.SITE, sphereDir = BL.timechainModels.DIR;
    cloudBox(sphere.x - sphereSite.radius - 0.25, sphere.y + 3 - sphereSite.radius - 0.25,
      sphere.z - sphereSite.radius - 0.25, sphere.x + sphereSite.radius + 0.25,
      sphere.y + 3 + sphereSite.radius + 0.25, sphere.z + sphereSite.radius + 0.25);
    cloudBridgeBox(sphere.x - sphereDir.x * sphere.bridgeZ, sphere.z - sphereDir.z * sphere.bridgeZ,
      sphere.x - sphereDir.x * (sphere.bridgeZ + sphereSite.span),
      sphere.z - sphereDir.z * (sphere.bridgeZ + sphereSite.span), sphere.y, sphereSite.width);
  };
  const cloudToward = (value, target, distance) => value + clamp(target - value, -distance, distance);
  const cloudClearAt = (cloud, x, y, z, ahead = 0) => {
    const b = cloud.fullBounds;
    const x0 = x + b[0], y0 = y + b[1], z0 = z + b[2], x1 = x + b[3], y1 = y + b[4], z1 = z + b[5];
    for (let i = 0; i < cloudObstacles.length; i++) {
      const o = cloudObstacles[i];
      if (x0 < o.x1 + CLOUD_GAP && x1 > o.x0 - CLOUD_GAP && y0 < o.y1 + CLOUD_GAP && y1 > o.y0 - CLOUD_GAP
        && z0 < o.z1 + CLOUD_GAP && z1 > o.z0 - CLOUD_GAP) return false;
    }
    for (let i = 0; i < clouds.length; i++) {
      const other = clouds[i];
      if (other === cloud) continue;
      const p = other.node.position, travel = other.speed * ahead;
      if ((other.beside ? p.z : p.x) + travel > CLOUD_WRAP) continue;
      const ox = other.beside ? cloudToward(p.x, other.goalSide, CLOUD_SIDE_RATE * ahead) : p.x + travel;
      const oz = other.beside ? p.z + travel : cloudToward(p.z, other.goalSide, CLOUD_SIDE_RATE * ahead);
      const oy = cloudToward(p.y, other.goalY, CLOUD_RISE_RATE * ahead), q = other.fullBounds;
      if (x0 < ox + q[3] + CLOUD_GAP && x1 > ox + q[0] - CLOUD_GAP && y0 < oy + q[4] + CLOUD_GAP
        && y1 > oy + q[1] - CLOUD_GAP && z0 < oz + q[5] + CLOUD_GAP && z1 > oz + q[2] - CLOUD_GAP) return false;
    }
    return true;
  };
  const cloudRouteTime = (cloud, side, height, horizon) => {
    const p = cloud.node.position, axis = cloud.beside ? p.z : p.x, lateral = cloud.beside ? p.x : p.z;
    for (let t = 0; t <= horizon + CLOUD_PLAN_STEP; t += CLOUD_PLAN_STEP) {
      t = Math.min(t, horizon);
      const along = axis + cloud.speed * t, across = cloudToward(lateral, side, CLOUD_SIDE_RATE * t);
      const y = cloudToward(p.y, height, CLOUD_RISE_RATE * t);
      if (!cloudClearAt(cloud, cloud.beside ? across : along, y, cloud.beside ? along : across, t)) return t;
      if (t === horizon) break;
    }
    return horizon + CLOUD_PLAN_STEP;
  };
  const considerCloudRoute = (cloud, side, height, horizon) => {
    side = clamp(side, -84, 84); height = clamp(height, -35, 35);
    const time = cloudRouteTime(cloud, side, height, horizon), p = cloud.node.position;
    const lateral = cloud.beside ? p.x : p.z;
    const cost = Math.abs(side - lateral) + Math.abs(height - p.y) * 1.2
      + (side === cloud.goalSide && height === cloud.goalY ? 0 : 0.2);
    if (time > cloud.bestTime || time === cloud.bestTime && cost < cloud.bestCost) {
      cloud.bestTime = time; cloud.bestCost = cost; cloud.bestSide = side; cloud.bestY = height;
    }
  };
  const planCloud = (cloud) => {
    const p = cloud.node.position, axis = cloud.beside ? p.z : p.x, side = cloud.beside ? p.x : p.z;
    const horizon = Math.min(CLOUD_LOOK, (CLOUD_WRAP - axis) / cloud.speed);
    if (horizon <= 0) return;
    cloud.bestTime = -1; cloud.bestCost = Infinity;
    considerCloudRoute(cloud, cloud.goalSide, cloud.goalY, horizon);
    for (let i = 0; i < CLOUD_SIDE_OFFSETS.length; i++) considerCloudRoute(cloud, side + CLOUD_SIDE_OFFSETS[i], p.y, horizon);
    for (let i = 1; i < CLOUD_HEIGHT_OFFSETS.length; i++) considerCloudRoute(cloud, side, p.y + CLOUD_HEIGHT_OFFSETS[i], horizon);
    if (cloud.bestTime <= horizon) {
      for (let si = 0; si < 2; si++) for (let yi = 0; yi < 2; yi++) {
        considerCloudRoute(cloud, side + (si ? 14 : -14), p.y + (yi ? 6 : -6), horizon);
      }
    }
    cloud.goalSide = cloud.bestSide; cloud.goalY = cloud.bestY;
  };
  // Clouds ring the island and plan a lane before reaching an island, bridge or another cloud.
  const buildClouds = () => {
    const rand = mulberry32(SEED + 77);
    const surfaces = new Map();
    buildCloudObstacles();
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const beside = i % 2 === 0;
      const node = createNode({ geometry: hubModels.cloud(Math.min(2, i % 4)), matrixCloud: true });
      let surface = surfaces.get(node.geometry);
      if (!surface) {
        const tops = [], bounds = [Infinity, Infinity, -Infinity, -Infinity], v = node.geometry.verts;
        const full = BL.scene.boundsOf(node.geometry);
        for (const face of node.geometry.faces) {
          const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3;
          if ((v[b + 2] - v[a + 2]) * (v[c] - v[a]) - (v[b] - v[a]) * (v[c + 2] - v[a + 2]) <= 0) continue;
          let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
          for (const vertex of face.i) {
            minX = Math.min(minX, v[vertex * 3]); maxX = Math.max(maxX, v[vertex * 3]);
            minZ = Math.min(minZ, v[vertex * 3 + 2]); maxZ = Math.max(maxZ, v[vertex * 3 + 2]);
          }
          tops.push(minX, minZ, maxX, maxZ, v[a + 1]);
          bounds[0] = Math.min(bounds[0], minX); bounds[1] = Math.min(bounds[1], minZ);
          bounds[2] = Math.max(bounds[2], maxX); bounds[3] = Math.max(bounds[3], maxZ);
        }
        let centerTop = -Infinity;
        for (let j = 0; j < tops.length; j += 5) if (tops[j] <= 0 && tops[j + 2] >= 0 && tops[j + 1] <= 0 && tops[j + 3] >= 0) centerTop = Math.max(centerTop, tops[j + 4]);
        surface = { tops: new Float64Array(tops), bounds: new Float64Array(bounds), centerTop,
          fullBounds: new Float64Array([...full.min, ...full.max]) };
        surfaces.set(node.geometry, surface);
      }
      const cloud = { node, speed: 0.4 + rand() * 0.4, beside, tops: surface.tops, bounds: surface.bounds,
        fullBounds: surface.fullBounds, centerTop: surface.centerTop, dx: 0, dz: 0, wrapped: false,
        goalSide: 0, goalY: 0, planTimer: i / CLOUD_COUNT, bestTime: 0, bestCost: 0, bestSide: 0, bestY: 0 };
      let placedCloud = false;
      for (let attempt = 0; attempt < 96; attempt++) {
        const out = (rand() < 0.5 ? -1 : 1) * lerp(CLOUD_NEAR, CLOUD_WRAP, rand());
        const span = lerp(-CLOUD_WRAP, CLOUD_WRAP, rand());
        const y = beside ? lerp(-9, 11, rand()) : lerp(-3, 13, rand());
        const x = beside ? out : span, z = beside ? span : -Math.abs(out);
        if (!cloudClearAt(cloud, x, y, z)) continue;
        node.position.x = x; node.position.y = y; node.position.z = z;
        cloud.goalSide = beside ? x : z; cloud.goalY = y;
        placedCloud = true;
        break;
      }
      if (!placedCloud) {
        node.position.x = beside ? -CLOUD_WRAP : -CLOUD_WRAP + i;
        node.position.y = 35 + i * 7;
        node.position.z = beside ? -CLOUD_WRAP + i : -CLOUD_WRAP;
        while (!cloudClearAt(cloud, node.position.x, node.position.y, node.position.z)) node.position.y += 7;
        cloud.goalSide = beside ? node.position.x : node.position.z; cloud.goalY = node.position.y;
      }
      addChild(root, node);
      placed.push(node);
      clouds.push(cloud);
    }
    for (let i = 0; i < clouds.length; i++) planCloud(clouds[i]);
  };
  const updateClouds = (dt) => {
    for (let i = 0; i < clouds.length; i++) {
      const cloud = clouds[i], p = cloud.node.position;
      if ((cloud.planTimer -= dt) <= 0) { planCloud(cloud); cloud.planTimer = 0.8; }
      const x = p.x, y = p.y, z = p.z, along = (cloud.beside ? z : x) + cloud.speed * dt;
      cloud.wrapped = false;
      if (along > CLOUD_WRAP) {
        let found = false;
        for (let si = 0; !found && si < CLOUD_SIDE_OFFSETS.length; si++) for (let yi = 0; yi < CLOUD_HEIGHT_OFFSETS.length; yi++) {
          const side = clamp(cloud.goalSide + CLOUD_SIDE_OFFSETS[si], -84, 84);
          const height = clamp(cloud.goalY + CLOUD_HEIGHT_OFFSETS[yi], -35, 35);
          const nx = cloud.beside ? side : -CLOUD_WRAP, nz = cloud.beside ? -CLOUD_WRAP : side;
          if (!cloudClearAt(cloud, nx, height, nz)) continue;
          p.x = nx; p.y = height; p.z = nz;
          cloud.goalSide = side; cloud.goalY = height; cloud.planTimer = 0;
          cloud.wrapped = found = true;
          break;
        }
      } else {
        const side = cloudToward(cloud.beside ? x : z, cloud.goalSide, CLOUD_SIDE_RATE * dt);
        const height = cloudToward(y, cloud.goalY, CLOUD_RISE_RATE * dt);
        const nx = cloud.beside ? side : along, nz = cloud.beside ? along : side;
        if (cloudClearAt(cloud, nx, height, nz)) { p.x = nx; p.y = height; p.z = nz; }
        else if (cloudClearAt(cloud, cloud.beside ? side : x, height, cloud.beside ? z : side)) {
          if (cloud.beside) p.x = side; else p.z = side;
          p.y = height;
          cloud.planTimer = 0;
        } else cloud.planTimer = 0;
      }
      cloud.dx = cloud.wrapped ? 0 : p.x - x;
      cloud.dz = cloud.wrapped ? 0 : p.z - z;
    }
  };
  // The dais and its flush, one block-wide perimeter grow continuously with the pile.
  const buildAltar = () => {
    const node = createNode();
    const slab = createNode({ geometry: hubModels.altarSlab(), depthBias: 0.15 });
    const rings = [];
    addChild(node, slab);
    for (let i = 0; i < 3; i++) {
      const ring = createNode({ geometry: hubModels.altarBlock(i), instanceData: new Float32Array(Math.ceil(ALTAR_MAX_BLOCKS / 3) * 20), instanceCount: 0, instanceVersion: 0, depthBias: 0.2 });
      rings.push(ring);
      addChild(node, ring);
    }
    addChild(root, node);
    placed.push(node);
    const result = { node, slab, rings, radius: 0, platformRadius: 0, outerRingRadius: 0, outerRingInnerRadius: 0, height: ALTAR_HEIGHT, ringCount: 1, blockCount: 0, setRadius: null };
    result.setRadius = (radius) => {
      result.radius = radius;
      const halfWidth = ALTAR_BLOCK_WIDTH * 0.5;
      const outer = radius + ALTAR_RING_GAP + halfWidth;
      const wanted = Math.min(ALTAR_MAX_BLOCKS, Math.max(8, Math.round(outer * Math.PI * 2 / ALTAR_BLOCK_ARC)));
      const arc = outer * Math.PI * 2 / wanted * 0.88;
      result.blockCount = wanted;
      result.outerRingRadius = outer;
      result.outerRingInnerRadius = outer - halfWidth;
      result.platformRadius = outer + halfWidth;
      setVec(slab.scale, result.outerRingInnerRadius, ALTAR_HEIGHT, result.outerRingInnerRadius);
      for (let i = 0; i < rings.length; i++) rings[i].instanceCount = 0;
      for (let i = 0; i < wanted; i++) {
        const angle = i / wanted * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const ring = rings[i % rings.length];
        const offset = ring.instanceCount++ * 20;
        const data = ring.instanceData;
        data[offset] = cos * ALTAR_BLOCK_WIDTH;
        data[offset + 1] = 0;
        data[offset + 2] = sin * ALTAR_BLOCK_WIDTH;
        data[offset + 3] = 0;
        data[offset + 4] = 0;
        data[offset + 5] = ALTAR_HEIGHT;
        data[offset + 6] = 0;
        data[offset + 7] = 0;
        data[offset + 8] = -sin * arc;
        data[offset + 9] = 0;
        data[offset + 10] = cos * arc;
        data[offset + 11] = 0;
        data[offset + 12] = cos * outer;
        data[offset + 13] = 0;
        data[offset + 14] = sin * outer;
        data[offset + 15] = 1;
        data[offset + 16] = 1;
        data[offset + 17] = 0;
        data[offset + 18] = 0;
        data[offset + 19] = 0;
      }
      for (let i = 0; i < rings.length; i++) rings[i].instanceVersion++;
    };
    result.setRadius(PILE_SCALE);
    return result;
  };

  const celebrate = (donation, bananas) => {
    for (const cave of crew.workingCavemen()) {
      if (cave.build) continue;
      cave.cheer = 1.6;
      fx.say(cave, ["OOGA!", "BOOGA!", "BANANA!"][fnv1a(`${donation.id}/${cave.traits.name}`) % 3], 1.8);
    }
    fx.burst(0, DROP_HEIGHT - 0.2, 0, 26, CONFETTI, 2.2);
    fx.showTicker(`THANKS ${donation.handle ? "@" + donation.handle.toUpperCase() : "ANON"} · ${bananas} BANANAS`, 4.5);
  };
  // The Bitcoin feed: a block strikes lightning over the island.
  const onMempool = (event) => {
    if (event.type === "block") {
      // Every block mined while the page is open strikes, whatever the weather is doing.
      weather.strike();
      hud.toast(`Block ${event.height} mined${event.txCount ? ` · ${event.txCount} transactions` : ""}`);
    }
  };
  // The chain board's four readings, set in the jumbotron's 5x7 font and run-length merged into quads,
  // exactly as the cave sets its wall panels. The rows are rebuilt only when one of them changed, so a
  // board left standing all day replaces no geometry and holds its size.
  const CHAIN_PANEL_W = 96, CHAIN_PANEL_H = 36, CHAIN_PANEL_BG = [42, 39, 36];
  // A board that has stopped being fed says so by going grey. Holding the last reading out in its
  // usual colours would be the one genuinely misleading thing this island could do.
  const STALE_INK = "#7d766a";
  const chainRows = (s) => {
    const ink = (live) => s.live ? live : STALE_INK;
    return [
      ["BLOCK", s.height ? String(s.height) : "-", ink("#e8c14a")],
      ["PRICE", s.priceUsd ? `$${Math.round(s.priceUsd).toLocaleString("en-US")}` : "-", ink("#8fbf6a")],
      ["MEMPOOL", s.count ? `${gameMod.formatLarge(s.count)} TX` : "-", ink("#e8c14a")],
      ["FAST", s.fastestFee ? `${String(+s.fastestFee.toFixed(s.fastestFee >= 10 ? 0 : 2))} SAT/VB` : "-", ink("#ff9a2a")]
    ];
  };
  const refreshChainSign = () => {
    if (!chainSign) return;
    const rows = chainRows(chain.snapshot);
    const printed = rows.map((r) => r[0] + r[1]).join("|");
    if (printed === chainSign.printed) return;
    chainSign.printed = printed;
    const c2 = chainSign.ctx2d, text = BL.jumbotron.text;
    c2.fillStyle = `rgb(${CHAIN_PANEL_BG[0]},${CHAIN_PANEL_BG[1]},${CHAIN_PANEL_BG[2]})`;
    c2.fillRect(0, 0, CHAIN_PANEL_W, CHAIN_PANEL_H);
    let y = 2;
    for (const [label, value, color] of rows) {
      text.drawText(c2, label, 1, y, "#9b8f7a", 1);
      text.drawText(c2, value, CHAIN_PANEL_W - 1 - text.measureText(value, 1), y, color, 1);
      y += 8;
    }
    const node = chainSign.node;
    if (node.geometry) renderer.releaseGeometry(node.geometry);
    node.geometry = poolModels.panelFrom(c2, CHAIN_PANEL_W, CHAIN_PANEL_H, poolModels.CHAIN_BOARD.px, poolModels.CHAIN_BOARD.px, CHAIN_PANEL_BG);
  };
  // The Mempool island's two boards in the shared board dialog. Each is a list of pages, every page a caption, a
  // note and a drawing in the jumbotron's 5x7 font on the board's own small canvas; `refresh` redraws the shown
  // page and moves `version`, which is all the dialog watches.
  const POOL_BOARD_W = 128, POOL_BOARD_H = 48, POOL_BOARD_BG = "#0f110f", POOL_DIM = "#9b8f7a";
  const poolBoard = (title, pages) => {
    const canvas = document.createElement("canvas");
    canvas.width = POOL_BOARD_W;
    canvas.height = POOL_BOARD_H;
    const c2 = canvas.getContext("2d", { alpha: false });
    const board = {
      title, help: "Live Bitcoin data. Arrow keys flip the pages.", canvas, count: pages.length, index: 0, version: 0, caption: "", note: "",
      go(i) {
        board.index = i;
        board.refresh();
      },
      refresh() {
        const page = pages[board.index];
        c2.fillStyle = POOL_BOARD_BG;
        c2.fillRect(0, 0, POOL_BOARD_W, POOL_BOARD_H);
        page.draw(c2, chain.snapshot);
        board.caption = page.caption;
        board.note = page.note(chain.snapshot);
        board.version++;
      }
    };
    return board;
  };
  // A reading: its label small at the top, its value as large as fits, a line under it and an optional gauge.
  const reading = (c2, label, value, color, under, gauge = -1, gaugeColor = color) => {
    const text = BL.jumbotron.text, centre = (t, y, ink, scale) => text.drawText(c2, t, Math.round((POOL_BOARD_W - text.measureText(t, scale)) / 2), y, ink, scale);
    centre(label, 4, POOL_DIM, 1);
    const scale = text.measureText(value, 2) <= POOL_BOARD_W - 8 ? 2 : 1;
    centre(value, scale === 2 ? 15 : 19, color, scale);
    if (under) centre(under, 34, POOL_DIM, 1);
    if (gauge < 0) return;
    c2.fillStyle = "#2a2724";
    c2.fillRect(14, 43, POOL_BOARD_W - 28, 3);
    c2.fillStyle = gaugeColor;
    c2.fillRect(14, 43, Math.round((POOL_BOARD_W - 28) * clamp(gauge, 0, 1)), 3);
  };
  const chainStatus = (s) => {
    const age = s.at ? Math.round((Date.now() - s.at) / 1000) : 0;
    return !s.height ? "Waiting on the chain."
      : s.live ? `Live. Block ${s.height}, ${gameMod.formatLarge(s.count)} transactions waiting, ${s.deep.toFixed(1)} blocks deep.`
      : `Last heard ${age > 90 ? `${Math.round(age / 60)} min` : `${age}s`} ago from ${s.degraded ? "a fallback source" : "nobody"}; the board has gone grey until the chain answers.`;
  };
  const rowPage = (i, caption, under, note) => ({
    caption,
    draw: (c2, s) => {
      const [label, value, color] = chainRows(s)[i];
      reading(c2, label, value, color, under(s));
    },
    note: () => note
  });
  const chainBoard = poolBoard("The chain", [
    {
      caption: "At a glance",
      draw: (c2, s) => {
        const text = BL.jumbotron.text;
        let y = 5;
        for (const [label, value, color] of chainRows(s)) {
          text.drawText(c2, label, 8, y, POOL_DIM, 1);
          text.drawText(c2, value, POOL_BOARD_W - 8 - text.measureText(value, 1), y, color, 1);
          y += 10;
        }
      },
      note: chainStatus
    },
    rowPage(0, "Block height", (s) => s.lastTxCount ? `${gameMod.formatLarge(s.lastTxCount)} TX IN IT` : "", "The newest block on the chain. Every block mined while you are here throws a bolt over the rainforest."),
    rowPage(1, "Price", () => "US DOLLARS", "Bitcoin's price from a live exchange feed."),
    rowPage(2, "Mempool", (s) => s.count ? `${s.deep.toFixed(1)} BLOCKS DEEP` : "", "Transactions waiting for a block, and how many blocks of space they would fill."),
    rowPage(3, "Next-block fee", (s) => s.hourFee ? `HOUR ${String(+s.hourFee.toFixed(s.hourFee >= 10 ? 0 : 2))} SAT/VB` : "", "The fee rate that gets a transaction into the next block, in sats per virtual byte, with the rate for within the hour under it.")
  ]);
  const weatherBoard = poolBoard("Reading the weather", [
    {
      caption: "Rain",
      draw: (c2, s) => reading(c2, "RAIN", weatherMod.STEPS[weather.state.step].name.toUpperCase(), s.live ? "#8fc3ff" : STALE_INK, "PAYING BACKLOG", s.soak),
      note: () => "The backlog paying at least 1 sat/vB, averaged over ten minutes. Dry, drizzle, light rain, rain, heavy rain, then a downpour as it grows, and it keeps falling until the fee-paying pool clears. The cheap sub-sat pile underneath doesn't count."
    },
    {
      caption: "Wind",
      draw: (c2, s) => reading(c2, "WIND", `${gameMod.formatLarge(Math.round(s.inflow))} VB/S`, s.live ? "#e6f2ff" : STALE_INK, "TRANSACTIONS ARRIVING", s.gale),
      note: () => "Transactions turning up, in vbytes a second. The busier it gets, the further the rain leans over. Rain always slants the way the wind is going, never into it."
    },
    {
      caption: "Lightning",
      draw: (c2, s) => reading(c2, "LAST BLOCK", s.height ? String(s.height) : "-", s.live ? "#ffe066" : STALE_INK, "A BOLT EACH BLOCK"),
      note: () => "Somebody found a block. Every one of them throws a bolt over the island, whatever the weather is doing, and only a block does."
    }
  ]);
  const openPoolBoard = (board) => {
    board.refresh();
    hud.openBoard(board);
  };
  // The standing chain snapshot: how full the pool is, how fast blocks land, how hard they arrive.
  const onChain = (snapshot) => {
    weather.apply(snapshot);
    refreshChainSign();
    // The boards' canvases only feed the dialog, and openPoolBoard repaints on open.
    if (hud.el.board.open) {
      chainBoard.refresh();
      weatherBoard.refresh();
    }
  };
  const onDonation = (donation) => {
    game.recordDonation(donation);
    const bananas = gameMod.bananasFor(donation.sats);
    pile.deliverBananas(bananas);
    celebrate(donation, bananas);
    const loot = lootEnabled ? game.lootFor(donation) : null;
    const who = donation.handle ? `@${donation.handle}` : "anon";
    hud.toast(`+${gameMod.formatLarge(donation.sats)} sats · ${bananas} banana${bananas > 1 ? "s" : ""} · ${who}${loot ? ` · ${loot.tier} crate!` : ""}`);
    if (loot) crates.spawnCrate(donation, loot, 0.9 + Math.min(1.5, bananas / pileMod.DROP_RATE));
    hud.setStats(game.state);
  };

  const tooltipFor = (hit) => {
    const o = hit.owner;
    switch (o.kind) {
      case "ooga-portal-lever":
        return "Ooga Portal · switch " + (pitGate.on ? "off" : "on");
      case "ooga-portal-screen":
        return pitGate.selected.label + " · tap to change destination";
      case "caveman":
        return o.cave.traits.name === "SaniExp" && timechainIsland?.seat.active ? "Sani · tap to spin his chair" : o.cave.traits.display;
      case "clanker":
        return `🦍 ${o.entry.owner.traits.display}`;
      case "crate":
        return `${o.crate.loot.tier} crate · tap to open`;
      case "cave":
        return o.slot.status === "open" ? o.slot.scene === "lab" ? `${o.slot.name} · island workshop` : `${o.slot.name} · tap to enter` : o.slot.status === "headquarters" ? "Headquarters · walk down the ramp" : o.slot.status === "mirror" ? `${o.slot.name} · mirror` : o.slot.status === "sleeping" ? "A project sleeps here · zzz" : o.slot.soon ? `${o.slot.name} · coming soon` : "An empty cave";
      case "gate":
        return `${caves.gate.name} · leads nowhere yet`;
      case "matrix-button":
        return matrixCave.unlocked ? "Matrix gate lever · pull down" : "Matrix gate lever · push up";
      case "matrix-gate":
        return "Glyph gate · tap or press Space nearby to open";
      case "room-sign":
        return "Room sign · tap to copy hash";
      case "lab-link":
        return "EntropyLab · open website in a new tab";
      case "prop":
        if (o.prop === "timechainentrance") return "Timechain Sphere - enter the observatory";
        if (o.prop === "timechainbridge") return "Wooden bridge · to Timechain Sphere";
        if (o.prop === "timechainboard") return "Timechain display · tap to expand";
        if (o.prop === "timechainchair") return "Sani's recliner · tap to spin and spill the glass";
        if (o.prop === "timechainbeer") return "500 ml beer · tap to chug";
        return PROP_TIPS[o.prop] || "";
      case "piece":
        return PIECES[o.piece] ? PIECES[o.piece][0] : "";
      default:
        return "";
    }
  };
  const reticleTarget = (hit) => {
    const o = hit.owner;
    if (hit.node === mirrorCave.node || o.kind === "room-sign" || o.kind === "matrix-button" || o.kind === "matrix-gate"
      || o.kind === "ooga-portal-lever" || o.kind === "ooga-portal-screen" || o.kind === "lab-link" || o.kind === "piece") return "object";
    if (o.kind === "cave") return o.slot.status === "open" ? "object" : "none";
    if (o.kind === "prop" && (o.breakable || RETICLE_PROPS.has(o.prop))) return "object";
    return "none";
  };
  const wobble = (node, amp) => {
    if (node.busy) return false;
    node.busy = true;
    const z0 = node.rotation.z;
    addTween({
      dur: 0.6, update: (k) => {
        node.rotation.z = z0 + Math.sin(k * Math.PI * 3) * (1 - k) * amp;
      }, done: () => {
        node.rotation.z = z0;
        node.busy = false;
      }
    });
    return true;
  };
  const dropBanana = (o, chance) => {
    if (now < o.ripe || Math.random() > chance) return false;
    o.ripe = now + RIPEN;
    pile.deliverBananas(1);
    hud.toast("A banana fell out and rolled to the pile!");
    return true;
  };
  const reactProp = (o, p) => {
    if (o.breakable) {
      hud.toast("Swing your melee weapon or shoot to break it");
      return;
    }
    const w = o.node.world;
    const x = w[12], z = w[14];
    const foundMagazine = (o.prop === "tree" || o.prop === "bush") && revealMagazine(o);
    switch (o.prop) {
      case "tree":
        if (!wobble(o.node, 0.1)) return;
        fx.burst(x, 2.6, z, 10, [LEAF], 1.6);
        if (RENDER_OPTS.stars > NIGHT) critters.burst(x, z);
        if (!foundMagazine && !dropBanana(o, TREE_CHANCE)) hud.toast("Leaves. Just leaves.");
        break;
      case "bush":
        if (!wobble(o.node, 0.25)) return;
        fx.burst(x, w[13] + 0.7, z, 6, [LEAF], 1.2);
        if (!foundMagazine && !dropBanana(o, BUSH_CHANCE)) hud.toast(BUSH_WORDS[fnv1a(`${o.x}/${o.z}/${Math.floor(now)}`) % BUSH_WORDS.length]);
        break;
      case "rock":
        fx.burst(x, 0.6, z, 6, [CHIP], 1.4);
        hud.toast("Solid rock. Ow.");
        break;
      case "palm":
        if (!wobble(o.node, 0.05)) return;
        fx.burst(x, w[13] + 3.6, z, 12, [LEAF], 1.6);
        if (!dropBanana(o, TREE_CHANCE)) hud.toast(PALM_WORDS[fnv1a(`${o.x}/${o.z}/${Math.floor(now)}`) % PALM_WORDS.length]);
        break;
      case "jumbotron":
        // Resolve the tap onto the cabinet: the side arrows and the dot strip page the board where
        // it stands, and the screen itself opens the close-up, readable from anywhere on the island.
        if (jumbotron) {
          if (p) {
            renderer.ray(p.x, p.y, camera, TAP_RAY);
            if (jumbotron.tapAt(TAP_RAY) === "screen") openJumbotron();
          } else openJumbotron();
        }
        break;
      case "crate":
        if (!wobble(o.node, 0.12)) return;
        fx.burst(x, 0.9, z, 5, [DUST], 1);
        hud.toast("Locked. Ooga knows the code.");
        break;
      case "barrel":
        if (!wobble(o.node, 0.3)) return;
        hud.toast("Empty. Ooga drank it.");
        break;
      case "flower":
        if (!wobble(o.node, 0.4)) return;
        fx.burst(x, 0.35, z, 8, PETALS, 1.1);
        break;
      case "torch":
        o.node.flare = 1;
        fx.burst(x, w[13] + 1.4, z, 8, [SPARK], 1.3);
        break;
      case "firepit":
        if (RENDER_OPTS.torch < 0.5) {
          hud.toast("Cold ashes. Ooga waits for night.");
          break;
        }
        fire.node.flare = 1;
        fx.burst(x, 0.9, z, 10, [SPARK], 1.6);
        hud.toast("Warm. Ooga likes.");
        break;
      case "bedroll":
        hud.toast("Somebody's bed. Ooga leaves it.");
        break;
      case "ladder":
        if (!wobble(o.lean, 0.05)) return;
        hud.toast("Wobbly. Ooga does not climb.");
        break;
      case "dock":
        hud.toast("The planks creak over the drop.");
        break;
      case "magazine":
        hud.toast(pilot.player ? "Walk into it to collect it." : "Double-tap an Ooga, then walk into it.");
        break;
      case "gate":
        hud.toast(`${caves.gate.name} · leads nowhere yet`);
        break;
      case "plane":
      case "sign":
        enterLaunch();
        break;
      case "launchpad":
      case "rocket":
      case "tower":
      case "orbitsign":
        enterLaunch("orbit");
        break;
      case "bridge":
        hud.toast("The planks sway. Ooga built it.");
        break;
      case "poolstair":
      case "poolsign":
        enterScene(presets.pool, "pool");
        break;
      case "poolbridge":
        hud.toast("Vines and planks. The Mempool is across.");
        break;
      case "timechainentrance":
        navigate("timechain");
        break;
      case "timechainbridge":
        hud.toast("Timechain Island · Sani's hangout. Walk across the wooden bridge.");
        break;
      case "timechainboard":
        openTimechainBoard(o.boardIndex);
        break;
      case "timechainchair":
        spinTimechainChair();
        break;
      case "timechainbeer":
        chugTimechainGlass();
        break;
      case "weathersign":
        openPoolBoard(weatherBoard);
        break;
      case "chainsign":
        openPoolBoard(chainBoard);
        break;
      case "poolrock":
        hud.toast("Moss grows thick on the Mempool island.");
        break;
      case "canopy":
        if (!wobble(o.node, 0.08)) return;
        fx.burst(x, 4.2, z, 10, [LEAF], 1.7);
        if (RENDER_OPTS.stars > NIGHT) critters.burst(x, z);
        if (!dropBanana(o, TREE_CHANCE)) hud.toast("Leaves and lianas.");
        break;
      case "poolfern":
        if (!wobble(o.node, 0.3)) return;
        fx.burst(x, w[13] + 0.5, z, 6, [LEAF], 1.1);
        if (!dropBanana(o, BUSH_CHANCE)) hud.toast("Fronds. Ooga finds nothing.");
        break;
      case "poollog":
        if (!wobble(o.node, 0.1)) return;
        fx.burst(x, w[13] + 0.5, z, 6, [DUST], 1.1);
        hud.toast("Rotten through. Ooga hears something inside.");
        break;
      case "jaguar":
      case "monkey":
      case "toucan":
        pokeBeast(o.node, o.prop);
        break;
      case "windsock":
        hud.toast("A fair wind for a drop.");
        break;
      default:
        break;
    }
  };
  const useProp = (o, p) => {
    if (!o.active) return;
    reactProp(o, p);
  };
  const OOGA_PORTAL_ACTION = { kind: "ooga-portal-lever" };
  const OOGA_PORTAL_MENU_ACTION = { kind: "ooga-portal-screen" };
  const WAKE_ACTION = { kind: "wake" }, ROLL_ACTION = { kind: "roll" }, STAND_ACTION = { kind: "stand" };
  const TAP_RAY = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
  const nearbyAction = (x, y, z, reach) => {
    const player = pilot.player;
    if (player && player.camp.burning) return ROLL_ACTION;
    if (player && player.camp.seat) return STAND_ACTION;
    if (player && crew.sleeping) return WAKE_ACTION;
    if (player && pilot.moving) return null;
    if (pitGate && !pitGate.receiving && !pitGate.isOpen) {
      let nearest = null, distance = Math.min(reach, 2) ** 2;
      for (const control of pitGate.controls) {
        const leverDistance = (control.x - x) ** 2 + (control.y - y) ** 2 + (control.z - z) ** 2;
        if (leverDistance < distance && actionReachable(x, y, z, control.x, control.y, control.z)) {
          nearest = OOGA_PORTAL_ACTION; distance = leverDistance;
        }
        const p = control.screenPoint, screenDistance = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
        if (screenDistance < distance && actionReachable(x, y, z, p.x, p.y, p.z)) {
          nearest = OOGA_PORTAL_MENU_ACTION; distance = screenDistance;
        }
      }
      if (nearest) return nearest;
    }
    if (player && player.hop < 0.03 && player.hopV <= 0 && headquarters) {
      const feet = player.root.position.y - player.baseY;
      const floor = bedSupportAt(x, z, feet + 0.04, 0, PLAYER_RADIUS);
      if (Math.abs(feet - floor) < 0.08) for (const bed of headquarters.mattresses) {
        if (bed.sleeper && bed.sleeper !== player || !bed.node.visible || bed.node.parent !== root) continue;
        const dx = x - bed.x, dz = z - bed.z, lx = dx * bed.cr - dz * bed.sr, lz = dx * bed.sr + dz * bed.cr;
        if (Math.abs(lx) < bed.width / 2 && Math.abs(lz) < bed.depth / 2 && Math.abs(floor - bed.y - bed.sleep.surface) < bed.sleep.pillowTop) return bed;
      }
    }
    if (player) {
      const gate = nearbyMatrixGate(x, y, z, reach);
      if (gate) return gate;
    }
    if (player && matrixControl && matrixControlNear(x, y, z, reach)) return matrixControl;
    if (player && player.hop < 0.03 && player.hopV <= 0 && headquarters) {
      let nearest = null, distance = Math.min(reach, 1.5) ** 2;
      for (const seat of headquarters.benches) {
        const d = (x - seat.x) ** 2 + (z - seat.z) ** 2;
        if (!seat.sitter && d < distance && Math.abs(y - 1.1 - seat.floor) < 0.7) { nearest = seat; distance = d; }
      }
      if (nearest) return nearest;
    }
    for (let i = 0; i < openMouths.length; i++) {
      const entry = openMouths[i], m = entry.m;
      if (entry.slot.scene === "race" && actionWithinReach(x, y, z, entry.actionX, m.floorY + 1.1, entry.actionZ, RALLY_REACH)) return entry;
    }
    for (let i = 0; i < launchers.length; i++) {
      const launcher = launchers[i];
      if (!BL.scenes[launcher.scene || "drop"]) continue;
      if (actionWithinReach(x, y, z, launcher.x, launcher.y + 1.1, launcher.z, LAUNCH_REACH)) return launcher;
    }
    return null;
  };
  const useNearbyAction = (action) => {
    if (action === OOGA_PORTAL_ACTION) pitGate.toggle();
    else if (action === OOGA_PORTAL_MENU_ACTION) pitGate.open();
    else if (action === WAKE_ACTION) crew.wakePlayer();
    else if (action === ROLL_ACTION) crew.dropRoll();
    else if (action === STAND_ACTION) crew.standPlayer();
    else if (action.kind === "bench") crew.sitPlayer(action);
    else if (action.sleep) crew.sleepPlayer(action);
    else if (action.kind === "matrix-gate") {
      action.localOpen = action.open = action.raising = true;
      hud.toast("The glyph gate rises.");
    } else if (action === matrixControl) toggleMatrixControl();
    else if (action.slot) enterCave(action.slot);
    else enterLaunch(action.scene);
  };
  const freeAction = () => {
    const action = nearbyAction(camera.position.x, camera.position.y, camera.position.z, MATRIX_BUTTON_REACH);
    if (!action) return false;
    useNearbyAction(action);
    return true;
  };
  // Stationary functional controls take priority over a jump or jetpack thrust.
  const useNear = (x, z, reach, feetY) => {
    const action = nearbyAction(x, feetY + 1.1, z, reach);
    if (!action) return false;
    useNearbyAction(action);
    return true;
  };
  const releaseForScene = id => {
    if (id === "dsb") world.pilot = pilot.player ? pilot.player.traits.name : null;
    pilot.release(true);
    hud.tooltip.hide();
  };
  const enterScene = (view, id) => {
    if (entering) return;
    // A game still being built is unregistered unless the page opted in (director.js, `wip`).
    if (!BL.scenes[id]) return hud.toast("Not open yet. Ooga still building it.");
    entering = true;
    releaseForScene(id);
    const orbit = pilot.orbit;
    const from = { x: orbit.tx, y: orbit.ty, z: orbit.tz, dist: orbit.dist, yaw: orbit.yaw };
    const turn = Math.atan2(Math.sin(view.yaw - from.yaw), Math.cos(view.yaw - from.yaw));
    orbit.target = view.target;
    orbit.tYaw = from.yaw + turn;
    orbit.tPitch = view.pitch;
    orbit.tDist = ENTER_DIST;
    enteringTween = addTween({
      dur: ENTER_DUR, ease: ease.inOutQuad, update: (k) => {
        orbit.tx = lerp(from.x, view.target.x, k);
        orbit.ty = lerp(from.y, view.target.y, k);
        orbit.tz = lerp(from.z, view.target.z, k);
        orbit.dist = lerp(from.dist, ENTER_DIST, k);
        orbit.yaw = from.yaw + turn * k;
      }, done: () => { enteringTween = null; go(id); }
    });
  };
  // Whoever the visitor is playing goes in with them, as world.pilot; a scene that has a use for it
  // takes it on the way in.
  const enterCave = (slot) => {
    if (slot.scene === "lab") return;
    if (entering) return;
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    enterScene(presets[slot.scene], slot.scene);
  };
  const enterLaunch = (id = "drop") => {
    if (entering) return;
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    enterScene(presets[id], id);
  };
  const portalTapReachable = (control, screen) => {
    const player = pilot.player, at = player ? player.root.position : camera.position;
    const point = screen ? control.screenPoint : control;
    return !pitGate.receiving && !(player && pilot.moving)
      && actionWithinReach(at.x, at.y + (player ? 1.1 - player.baseY : 0), at.z, point.x, point.y, point.z, 2);
  };
  const onTap = (hit, p) => {
    if (pitArrival || pitGate?.isOpen) return;
    if (!hit) return;
    const o = hit.owner;
    switch (o.kind) {
      case "ooga-portal-screen":
        if (portalTapReachable(o.control, true)) pitGate.open();
        else hud.toast("Move closer to an Ooga Portal screen.");
        break;
      case "ooga-portal-lever": {
        if (portalTapReachable(o.control, false)) pitGate.toggle();
        else hud.toast("Move closer to an Ooga Portal lever.");
        break;
      }
      case "caveman":
        if (o.cave.traits.name === "SaniExp" && timechainIsland?.seat.active) spinTimechainChair();
        else crew.pokeCave(o.cave);
        break;
      case "piece":
        pokePiece(o);
        break;
      case "clanker":
        hud.toast(tooltipFor(hit));
        break;
      case "crate":
        crates.openCrate(o.crate);
        break;
      case "cave":
        if (o.slot.status === "open") enterCave(o.slot);
        else hud.toast(tooltipFor(hit));
        break;
      case "gate":
        hud.toast(tooltipFor(hit));
        break;
      case "matrix-button":
        toggleMatrixControl(true);
        break;
      case "room-sign":
        tapRoomSign(o.roomSign);
        break;
      case "lab-link":
        window.open("https://entropylab.online", "_blank", "noopener,noreferrer");
        break;
      case "matrix-gate": {
        const player = pilot.player;
        if (player && nearbyMatrixGate(player.root.position.x, player.root.position.y + 1.1 - player.baseY, player.root.position.z, MATRIX_BUTTON_USE_REACH) === o.gate) useNearbyAction(o.gate);
        else hud.toast(player ? "Move closer to open this gate." : "Double-tap an Ooga, then move close to open the gate.");
        break;
      }
      case "prop":
        useProp(o, p);
        break;
      default:
        break;
    }
  };

  const CAMERA_RADIUS = 0.3, CAMERA_FLOOR = 0.55, CAMERA_STEP_FLOOR = CAMERA_RADIUS + 0.02, CAMERA_VERTICAL_RATE = 3.2, CAMERA_HORIZONTAL_RATE = 8;
  const CAMERA_RECOVERY_SPEED = 16, CAMERA_TRAIL_CAPACITY = 96;
  const CAMERA_PREVIOUS = { x: 0, y: 0, z: 0 };
  const CAMERA_REQUESTED = { x: 0, y: 0, z: 0 };
  const CAMERA_FROM = { x: 0, y: 0, z: 0 };
  const CAMERA_VOLUME_FROM = { x: 0, y: 0, z: 0 };
  const CAMERA_RECOVERY = { x: 0, y: 0, z: 0 };
  const CAMERA_MANUAL_VIEW = { x: 0, y: 0, z: 0 }, CAMERA_MANUAL_BODY = { x: 0, y: 0, z: 0 };
  const CAMERA_TRAIL = new Float64Array(CAMERA_TRAIL_CAPACITY * 3);
  let cameraTrailPlayer = null, cameraTrailCount = 0, cameraTrailNext = 0, cameraTrailSleeping = false, cameraManualContact = false;
  let cameraUnrestricted = false, cameraReentering = false;
  const PLAYER_PREVIOUS = { x: 0, y: 0, z: 0 }, PLAYER_POSITION = { x: 0, y: 0, z: 0 };
  const CAMERA_SPACE = { floor: 0, ceiling: 0 }, CAMERA_COLUMN = { caveIndex: 0, floor: 0, ceiling: 0 };
  const CAMERA_CROSSING = { direction: 0, valid: false, reason: null, amount: 0 };
  const CAMERA_OPENINGS = [];
  const CAMERA_RAMP_CELLS = new Map();
  const buildCameraRamps = () => {
    CAMERA_RAMP_CELLS.clear();
    const v = island.geometry.verts, unit = island.unit;
    const rampFaces = islandFaceIndex().ramps;
    for (let n = 0; n < rampFaces.length; n++) {
      const face = rampFaces[n];
      const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3;
      const key = Math.floor((v[a] + v[b] + v[c]) / (3 * unit)) * 512 + Math.floor((v[a + 2] + v[b + 2] + v[c + 2]) / (3 * unit));
      let faces = CAMERA_RAMP_CELLS.get(key);
      if (!faces) CAMERA_RAMP_CELLS.set(key, faces = []);
      faces.push(face);
    }
  };
  const playerOnAccessRamp = (player) => {
    if (!player || crew.sleeping) return false;
    const p = player.root.position, feet = p.y - player.baseY, v = island.geometry.verts, unit = island.unit, radius = PLAYER_RADIUS;
    for (let x = Math.floor((p.x - radius) / unit); x <= Math.floor((p.x + radius) / unit); x++) for (let z = Math.floor((p.z - radius) / unit); z <= Math.floor((p.z + radius) / unit); z++) {
      const faces = CAMERA_RAMP_CELLS.get(x * 512 + z);
      if (!faces) continue;
      for (const face of faces) {
        const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3;
        const ux = v[b] - v[a], uz = v[b + 2] - v[a + 2], vx = v[c] - v[a], vz = v[c + 2] - v[a + 2], det = ux * vz - uz * vx;
        let tx = p.x, tz = p.z;
        const u = ((tx - v[a]) * vz - (tz - v[a + 2]) * vx) / det, w = (ux * (tz - v[a + 2]) - uz * (tx - v[a])) / det;
        if (u < 0 || w < 0 || u + w > 1) {
          let distance = Infinity;
          for (let edge = 0; edge < 3; edge++) {
            const i = face.i[edge] * 3, j = face.i[(edge + 1) % 3] * 3, dx = v[j] - v[i], dz = v[j + 2] - v[i + 2];
            const t = Math.max(0, Math.min(1, ((p.x - v[i]) * dx + (p.z - v[i + 2]) * dz) / (dx * dx + dz * dz)));
            const ex = v[i] + dx * t, ez = v[i + 2] + dz * t, d = (p.x - ex) ** 2 + (p.z - ez) ** 2;
            if (d < distance) { distance = d; tx = ex; tz = ez; }
          }
          if (distance > radius * radius) continue;
        }
        const s = ((tx - v[a]) * vz - (tz - v[a + 2]) * vx) / det, t = (ux * (tz - v[a + 2]) - uz * (tx - v[a])) / det;
        const floor = v[a + 1] + s * (v[b + 1] - v[a + 1]) + t * (v[c + 1] - v[a + 1]);
        if (feet >= floor - STEP_MAX && feet + player.bodyHeight <= Math.min(floor + island.headquarters.ceiling - island.headquarters.floor, island.ceilingAt(p.x, floor + 1e-5, p.z, PLAYER_RADIUS)) + 1e-7) return true;
      }
    }
    // Basement access galleries become level before joining the common area.
    // Their flat floor is voxel-meshed, so it has no slope triangles.
    const basement = island.headquarters.basement;
    if (Math.hypot(p.x, p.z) > basement.room.radius && Math.abs(feet - basement.floor) <= STEP_MAX) for (const ramp of basement.ramps) {
      for (let i = 1; i < ramp.samples.length; i++) {
        const a = ramp.samples[i - 1], b = ramp.samples[i];
        if (a.y !== basement.floor || b.y !== basement.floor) continue;
        const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t) > ramp.width / 2 + radius) continue;
        if (Math.abs(island.supportAt(p.x, p.z, feet, STEP_MAX, ABYSS_FLOOR, radius) - basement.floor) < 1e-6 && island.ceilingAt(p.x, feet, p.z, radius) >= feet + player.bodyHeight) return true;
      }
    }
    return false;
  };
  let cameraCaveIndex = 0, cameraEntranceIndex = 0, cameraPreviousValid = false, cameraTerrainY = 0, cameraTerrainX = 0, cameraTerrainZ = 0, cameraTerrainValid = false, cameraTerrainRecovering = false, cameraTerrainEntranceIndex = 0;
  let caveEntryPlayer = null, playerCaveIndex = 0;
  const cameraCrossing = (from, to, opening, grounded = false) => {
    const m = opening.mouth, sr = opening.sr, cr = opening.cr;
    const a = (from.x - m.x) * sr + (from.z - m.z) * cr - opening.planeZ;
    const b = (to.x - m.x) * sr + (to.z - m.z) * cr - opening.planeZ;
    const direction = a >= -1e-7 && b < -1e-7 ? 1 : a <= 1e-7 && b > 1e-7 ? -1 : 0;
    CAMERA_CROSSING.direction = direction;
    CAMERA_CROSSING.valid = false;
    CAMERA_CROSSING.reason = null;
    if (!direction) return CAMERA_CROSSING;
    const t = Math.max(0, Math.min(1, a / (a - b))), x = lerp(from.x, to.x, t), y = lerp(from.y, to.y, t) - m.floorY, z = lerp(from.z, to.z, t);
    const across = (x - m.x) * cr - (z - m.z) * sr;
    const floor = opening.headquarters && island.cavityAt(x, z, CAMERA_COLUMN, island.headquarters.caveIndex, y + m.floorY) ? CAMERA_COLUMN.floor - m.floorY - 1e-6 : opening.minY;
    // Feet follow the bend from the flat apron onto the slope.
    // Their straight frame-to-frame sweep cuts just below that bend even while fully supported.
    const followsRamp = grounded && opening.headquarters && Math.abs(from.y - supportAt(from.x, from.z, from.y)) < 1e-6 && Math.abs(to.y - supportAt(to.x, to.z, to.y)) < 1e-6;
    CAMERA_CROSSING.amount = t;
    if (y < floor && !followsRamp) CAMERA_CROSSING.reason = "below";
    else if (y > opening.maxY) CAMERA_CROSSING.reason = "above";
    else if (across < opening.minX || across > opening.maxX) CAMERA_CROSSING.reason = "beside";
    else if (opening.blocked) CAMERA_CROSSING.reason = "sealed";
    else if (caveColumnAt(x - sr * 0.05, z - cr * 0.05, opening, y + m.floorY)) CAMERA_CROSSING.valid = true;
    return CAMERA_CROSSING;
  };
  const setMatrixInside = (inside) => {
    if (!matrixCave) return;
    const portal = matrixCave.portal;
    if (portal.inside === inside) return;
    portal.inside = inside;
    portal.lastCrossingDirection = inside ? "in" : "out";
    const global = inside || matrixCave.unlocked;
    MATRIX_WORLD.livingGlobal = global ? 1 : 0;
    MATRIX_WORLD.direction = global ? MATRIX_WORLD.radius < MATRIX_WORLD.maxRadius ? 1 : 0 : MATRIX_WORLD.radius > 0 ? -1 : 0;
    MATRIX_WORLD.active = global || MATRIX_WORLD.radius > 0 ? 1 : 0;
    // Exiting an unlatched room closes the glass immediately; reentry resumes
    // its reveal only once the outward world front reaches the mirror.
    if (!inside && !matrixCave.unlocked && !mirrorCave.damage.broken) {
      matrixCave.mirrorNode.mirrorReveal = 0;
      matrixCave.mirrorNode.mirrorPortal = false;
    }
  };
  const setMatrixUnlocked = (unlocked, quiet = false) => {
    if (!matrixCave || !matrixControl || matrixCave.unlocked === unlocked) return false;
    matrixCave.unlocked = unlocked;
    MATRIX_WORLD.livingGlobal = unlocked || matrixCave.portal.inside ? 1 : 0;
    matrixControl.pressed = unlocked;
    matrixControl.button.glow = unlocked ? 0.65 : 0.45;
    matrixControl.button.highlight = 0;
    matrixControl.lights.matrixLiving = unlocked;
    matrixControl.lights.glow = unlocked ? 1.35 : 0.25;
    matrixControl.lever.glow = unlocked ? 0.65 : 0.45;
    matrixControl.grip.matrixLiving = unlocked;
    matrixControl.grip.glow = unlocked ? 1.4 : 0.25;
    for (let i = 0; i < matrixGates.length; i++) {
      const gate = matrixGates[i];
      // The inside switch explicitly raises the mirror bars even while glass
      // is intact. The outside nearby release still requires the glass lock.
      if (gate === mirrorCave.gate) {
        gate.localOpen = gate.open = gate.raising = unlocked;
        continue;
      }
      gate.open = unlocked && !gate.locked;
      gate.raising = unlocked && !gate.locked;
      gate.localOpen = false;
    }
    if (unlocked) {
      MATRIX_WORLD.active = 1;
      MATRIX_WORLD.direction = MATRIX_WORLD.radius < MATRIX_WORLD.maxRadius ? 1 : 0;
      matrixCave.mirrorNode.mirrorReveal = 1;
      matrixCave.mirrorNode.mirrorPortal = true;
    } else if (matrixCave.portal.inside) {
      MATRIX_WORLD.active = 1;
      MATRIX_WORLD.direction = MATRIX_WORLD.radius < MATRIX_WORLD.maxRadius ? 1 : 0;
    } else {
      MATRIX_WORLD.direction = MATRIX_WORLD.radius > 0 ? -1 : 0;
      MATRIX_WORLD.active = MATRIX_WORLD.radius > 0 ? 1 : 0;
      matrixCave.mirrorNode.mirrorReveal = mirrorCave.damage.broken ? 1 : 0;
      matrixCave.mirrorNode.mirrorPortal = mirrorCave.damage.broken;
    }
    if (!quiet) hud.toast(unlocked && !mirrorCave.gate.open ? "The outer glyph gates rise. The mirror gate stays shut."
      : unlocked ? "The glyph gates rise. The Matrix stays." : "The glyph gates descend while the mirror is open.");
    return true;
  };
  const respawnAtPile = () => {
    setMatrixUnlocked(false, true);
    setMatrixInside(false);
    // Respawn arrives in the ordinary world immediately, with no retreating wave left in Matrix mode.
    MATRIX_WORLD.active = MATRIX_WORLD.direction = MATRIX_WORLD.radius = 0;
    navigate("pile");
  };
  const matrixControlNear = (x, y, z, reach = MATRIX_BUTTON_REACH) => !!matrixControl && actionWithinReach(x, y, z, matrixControl.x, matrixCave.mouth.floorY + matrixControl.button.position.y, matrixControl.z, reach);
  const playerNearMatrixControl = () => {
    const player = pilot.player;
    return !!player && matrixControlNear(player.root.position.x, player.root.position.y + 1.1 - player.baseY, player.root.position.z, MATRIX_BUTTON_USE_REACH);
  };
  const toggleMatrixControl = (explain = false) => {
    if (playerNearMatrixControl()) return setMatrixUnlocked(!matrixCave.unlocked);
    if (explain) hud.toast(pilot.player ? "Move closer to use the Matrix control." : "Select an Ooga, then move close to use the Matrix control.");
    return false;
  };
  const nearbyMatrixGate = (x, y, z, reach) => {
    let nearest = null, distance = reach;
    for (let i = 0; i < matrixGates.length; i++) {
      const gate = matrixGates[i], m = gate.mouth;
      const mirror = gate === mirrorCave.gate;
      if (gate.locked || gate.localOpen || !mirror && (matrixCave.unlocked || !MATRIX_WORLD.active || MATRIX_WORLD.radius < gate.distance)) continue;
      const lx = (x - m.x) * gate.cr - (z - m.z) * gate.sr, lz = (x - m.x) * gate.sr + (z - m.z) * gate.cr;
      // Ordinary gates release from inside. Broken glass exposes the mirror
      // gate's release on either side, even before the Matrix wave is active.
      if (!mirror && lz > gate.node.position.z || y < m.floorY + gate.floor || y > m.floorY + gate.ceiling) continue;
      const across = Math.max(gate.minX, Math.min(gate.maxX, lx)), along = mirror && lz > gate.node.position.z ? gate.maxZ + 0.035 : gate.minZ - 0.035;
      const tx = m.x + across * gate.cr + along * gate.sr, tz = m.z - across * gate.sr + along * gate.cr;
      const d = Math.hypot(tx - x, tz - z);
      if (d >= distance || !actionReachable(x, y, z, tx, y, tz)) continue;
      distance = d; nearest = gate;
    }
    return nearest;
  };
  const matrixGateDescent = (gate, nextY) => {
    const m = gate.mouth, y = gate.node.position.y;
    gate.held = false;
    // Never lower a barrier into an existing body.
    // Hold it just above that head until the footprint clears; the nearby release stays usable.
    for (let caveIndex = 0; caveIndex < crew.list.length; caveIndex++) {
      const cave = crew.list[caveIndex];
      if (!cave.root.visible) continue;
      const p = cave.root.position, feet = p.y - cave.baseY, head = feet + cave.bodyHeight + Math.max(0, cave.viewLift);
      if (feet >= m.floorY + gate.ceiling || head <= m.floorY + nextY + gate.bottom) continue;
      const lx = (p.x - m.x) * gate.cr - (p.z - m.z) * gate.sr, lz = (p.x - m.x) * gate.sr + (p.z - m.z) * gate.cr;
      const ox = Math.max(gate.minX - lx, 0, lx - gate.maxX), oz = Math.max(gate.minZ - lz, 0, lz - gate.maxZ);
      if (ox * ox + oz * oz >= PLAYER_RADIUS * PLAYER_RADIUS - 1e-9) continue;
      const safe = Math.min(y, head - m.floorY - gate.bottom + 0.02);
      if (safe > nextY) { nextY = safe; gate.held = true; }
    }
    return nextY;
  };
  const updateMatrixControl = (dt, player) => {
    if (!matrixControl) return;
    const gateStep = MATRIX_GATE_SPEED * dt;
    for (let i = 0; i < matrixGates.length; i++) {
      const gate = matrixGates[i], y = gate.node.position.y;
      const mirror = gate === mirrorCave.gate;
      if (!mirror && !MATRIX_WORLD.active || gate.locked && !(mirror && matrixCave.unlocked)) gate.localOpen = false;
      gate.open = mirror && matrixCave.unlocked || !gate.locked && (gate.localOpen || !mirror && matrixCave.unlocked);
      const target = !gate.open && (gate.locked || mirror || MATRIX_WORLD.active && MATRIX_WORLD.radius >= gate.distance) ? gate.floor : MATRIX_GATE_HIDDEN_Y;
      gate.held = false;
      gate.node.position.y = y < target ? Math.min(target, y + gateStep) : y > target ? matrixGateDescent(gate, Math.max(target, y - gateStep)) : y;
      gate.raising = gate.node.position.y < target;
      // Gates descend from the actual stone lintel.
      // Their stored overhead sections are clipped in every render pass, including shadows.
      gate.node.visible = gate.node.position.y + gate.bottom < gate.ceiling && gate.node.position.y + gate.top > gate.floor;
    }
    const leverAngle = matrixControl.pressed ? 0.42 : Math.PI - 0.42;
    matrixControl.lever.rotation.x += (leverAngle - matrixControl.lever.rotation.x) * (1 - Math.exp(-8 * dt));
    const subject = player ? player.root.position : camera.position;
    const action = nearbyAction(subject.x, subject.y + (player ? 1.1 - player.baseY : 0), subject.z, player ? MATRIX_BUTTON_USE_REACH : MATRIX_BUTTON_REACH);
    const equipped = !!(player && player.jet);
    const recovering = !!(player && player.jetRecovering);
    if (action === matrixControl.promptAction && player === matrixControl.promptPlayer && equipped === matrixControl.promptJet && recovering === matrixControl.promptRecovering && matrixControl.pressed === matrixControl.promptPressed && pitGate.on === matrixControl.promptGateOn) return;
    const hadPlayerPrompt = matrixControl.promptAction && matrixControl.promptPlayer;
    matrixControl.near = action === matrixControl;
    matrixControl.promptAction = action;
    matrixControl.promptPlayer = player;
    matrixControl.promptJet = equipped;
    matrixControl.promptRecovering = recovering;
    matrixControl.promptPressed = matrixControl.pressed;
    matrixControl.promptGateOn = pitGate.on;
    if (action) {
      if (action === OOGA_PORTAL_ACTION) {
        hud.hint(COARSE ? "Tap to switch the Ooga Portal " + (pitGate.on ? "off" : "on") : "Press Space to switch the Ooga Portal " + (pitGate.on ? "off" : "on"));
        hud.setAct(pitGate.on ? "TURN OFF" : "TURN ON");
      } else if (action === OOGA_PORTAL_MENU_ACTION) {
        hud.hint(COARSE ? "Tap DESTINATION to choose where the Ooga Portal leads" : "Press Space to choose the Ooga Portal destination");
        hud.setAct("DESTINATION");
      } else if (action === WAKE_ACTION) {
        hud.hint(COARSE ? "Tap WAKE UP! to get up" : "Space wakes up · WASD changes sleeping pose");
        hud.setAct("WAKE UP!");
      } else if (action === ROLL_ACTION) {
        hud.hint(COARSE ? "Tap DROP & ROLL! to put the fire out" : "Press Space to drop and roll until the fire goes out");
        hud.setAct("DROP & ROLL!");
      } else if (action === STAND_ACTION) {
        hud.hint(COARSE ? "Move or tap STAND UP! to get up" : "Move or press Space to stand up");
        hud.setAct("STAND UP!");
      } else if (action.kind === "bench") {
        hud.hint(COARSE ? "Tap SIT to sit facing the fire" : "Press Space to sit facing the fire");
        hud.setAct("SIT");
      } else if (action.sleep) {
        hud.hint(COARSE ? "Tap SLEEP to lie down" : "Press Space to sleep");
        hud.setAct("SLEEP");
      } else if (action.kind === "matrix-gate") {
        hud.hint(COARSE ? "Tap OPEN GATE! to open this gate" : "Press Space to open this gate");
        hud.setAct("OPEN GATE!");
      } else if (action === matrixControl) {
        const label = matrixControl.pressed ? "pull the lever down" : "push the lever up";
        hud.hint(COARSE ? `Tap to ${label}` : `Press Space or tap to ${label}`);
        if (player) hud.setAct(matrixControl.pressed ? "PULL DOWN" : "PUSH UP");
      } else {
        const label = action.slot ? "START RALLY" : action.scene === "orbit" ? "BUILD ROCKET" : "FLY PLANE";
        hud.hint(COARSE ? `Tap ${label} to play` : `Press Space to ${action.slot ? "start Ooga Rally" : action.scene === "orbit" ? "build for Ooga Orbit" : "fly Ooga Drop"}`);
        if (player) hud.setAct(label);
      }
    } else if (hadPlayerPrompt || player) pilot.showAct();
  };
  const syncMatrixInside = (player) => {
    if (!matrixCave) return;
    if (clankerPlay?.active) {
      const p = clankerPlay.player.root.position, m = matrixCave.mouth;
      const dx = p.x - m.x, dz = p.z - m.z;
      const along = dx * matrixCave.sr + dz * matrixCave.cr;
      setMatrixInside(along < PORTAL_Z && p.y + 0.4 < m.floorY + PORTAL_MAX_Y
        && island.cavityAt(p.x, p.z, CLANKER_CAVITY, matrixCave.caveIndex, p.y + 0.4)
        && CLANKER_CAVITY.caveIndex === matrixCave.caveIndex
        && p.y + 0.4 >= CLANKER_CAVITY.floor && p.y + 0.4 < CLANKER_CAVITY.ceiling);
      return;
    }
    // A controlled Ooga owns the portal in both camera modes.
    // The first-person eye follows head-look and must not open/close the mirror while the body is still.
    if (player) {
      setMatrixInside(playerCaveIndex === matrixCave.caveIndex);
      return;
    }
    // The detached camera can keep a cave admission while orbiting above or
    // outside its mouth. Only its actual eye inside the room can start the wave.
    const eye = camera.position, m = matrixCave.mouth;
    const along = (eye.x - m.x) * matrixCave.sr + (eye.z - m.z) * matrixCave.cr;
    setMatrixInside(cameraCaveIndex === matrixCave.caveIndex && along < PORTAL_Z
      && eye.y < m.floorY + PORTAL_MAX_Y
      && island.cavityAt(eye.x, eye.z, MATRIX_CAMERA_COLUMN, matrixCave.caveIndex, eye.y)
      && MATRIX_CAMERA_COLUMN.caveIndex === matrixCave.caveIndex
      && eye.y >= MATRIX_CAMERA_COLUMN.floor && eye.y < MATRIX_CAMERA_COLUMN.ceiling
      && island.clearAt(eye.x, eye.y, eye.z, 1e-5, 2e-5));
  };
  const setCameraCave = (index) => {
    if (cameraCaveIndex === index) return;
    cameraCaveIndex = index;
    // Free-camera crossings have no character owner: commit portal state as soon as the crossing changes caves.
    // Character views sync after pilot.update, when the active eye or Ooga position is final.
    if (!pilot || !pilot.player) syncMatrixInside(null);
  };
  const caveColumnAt = (x, z, opening, y) => {
    const dx = x - opening.mouth.x, dz = z - opening.mouth.z;
    const along = dx * opening.sr + dz * opening.cr, across = dx * opening.cr - dz * opening.sr;
    const caveIndex = opening.headquarters ? island.headquarters.caveIndex : opening.caveIndex;
    if (!island.cavityAt(x, z, CAMERA_COLUMN, caveIndex, y) || CAMERA_COLUMN.caveIndex !== caveIndex) {
      // Rotated voxel columns straddle the doorway plane.
      // Uncarved, open-air apron cells there are still traversable; solid cliff columns are not.
      const ground = island.surfaceAt(x, z);
      if (along < opening.planeZ - island.unit * Math.SQRT2 || along > 3 || across < opening.minX || across > opening.maxX || ground !== opening.mouth.floorY) return false;
      CAMERA_COLUMN.floor = ground;
      CAMERA_COLUMN.ceiling = Infinity;
    }
    // A window can continue below an upper ramp after its room metadata ends.
    // A solid roof between the eye and that ramp makes it a different volume.
    if (opening.headquarters && y < CAMERA_COLUMN.floor && island.ceilingAt(x, y, z) <= CAMERA_COLUMN.floor) return false;
    // Ordinary cave frames have a soffit even where the carved voxel column
    // is open sky. HQ ramp mouths deliberately keep only their side jambs.
    const rim = opening.rim;
    if (along >= rim.minZ + PORTAL_Z && along <= rim.maxZ + PORTAL_Z && (!opening.headquarters || CAMERA_COLUMN.ceiling > opening.mouth.floorY)) {
      if (across < rim.minX || across > rim.maxX) return false;
      if (!opening.headquarters || along >= opening.planeZ) CAMERA_COLUMN.floor = Math.max(CAMERA_COLUMN.floor, opening.mouth.floorY + rim.floorY);
      if (!opening.headquarters) CAMERA_COLUMN.ceiling = Math.min(CAMERA_COLUMN.ceiling, opening.mouth.floorY + rim.ceilingY);
    }
    CAMERA_COLUMN.caveIndex = opening.caveIndex;
    return true;
  };
  // Sample the real quarter-unit cavity around the eye, including the open apron.
  // Bounds ignore Matrix state and cliff-top height; eye height separates a lowered room from the ramp.
  const cameraSpaceAt = (x, z, opening, y) => {
    let floor = -Infinity, ceiling = Infinity;
    for (let i = 0; i < 25; i++) {
      const ox = (i % 5 - 2) * CAMERA_RADIUS * 0.5, oz = (Math.floor(i / 5) - 2) * CAMERA_RADIUS * 0.5;
      if (ox * ox + oz * oz > CAMERA_RADIUS * CAMERA_RADIUS + 1e-7) continue;
      const sx = x + ox, sz = z + oz;
      if (!caveColumnAt(sx, sz, opening, y)) return false;
      floor = Math.max(floor, CAMERA_COLUMN.floor);
      ceiling = Math.min(ceiling, CAMERA_COLUMN.ceiling);
    }
    CAMERA_SPACE.floor = floor + (pilot && pilot.player ? lerp(CAMERA_RADIUS, CAMERA_FLOOR, pilot.closeMix) : CAMERA_FLOOR);
    // Clearance samples can miss a voxel corner: match the full collision footprint so a roof lowers the eye first.
    // An open shaft has no floor: look above the eye, not at rock in the island's underside.
    const base = (Number.isFinite(CAMERA_SPACE.floor) ? CAMERA_SPACE.floor : y) - CAMERA_RADIUS;
    CAMERA_SPACE.ceiling = Math.min(ceiling, island.ceilingAt(x, base, z, CAMERA_RADIUS), entranceCeilingAt(x, z, base, CAMERA_RADIUS)) - CAMERA_RADIUS;
    return CAMERA_SPACE.floor <= CAMERA_SPACE.ceiling;
  };
  const CAMERA_CAVE_DEBUG = {
    get index() { return cameraCaveIndex; },
    get playerIndex() { return playerCaveIndex; },
    get entranceIndex() { return cameraEntranceIndex; },
    get accessRamp() { return playerOnAccessRamp(pilot && pilot.player); },
    get rampAssist() { return false; },
    get transitioning() { return cameraReentering; },
    get constraint() { return cameraCaveIndex ? "interior" : cameraEntranceIndex ? "entrance" : "exterior"; },
    get id() { return cameraCaveIndex ? CAMERA_OPENINGS[cameraCaveIndex - 1].id : null; },
    openings: CAMERA_OPENINGS,
    contains(x, y, z) {
      return !!cameraCaveIndex && caveColumnAt(x, z, CAMERA_OPENINGS[cameraCaveIndex - 1], y) && y >= CAMERA_COLUMN.floor && y < CAMERA_COLUMN.ceiling;
    }
  };
  // The common HQ room belongs to both ramps.
  // Once a body or eye reaches a ramp, bind it to that ramp's entrance, not the seeding arrival's.
  const headquartersOpeningAt = (x, z, clearance) => {
    if (Math.hypot(x, z) < island.headquarters.room.radius - 1.25) return null;
    let nearest = null, nearestDistance = Infinity;
    for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
      const opening = CAMERA_OPENINGS[i];
      if (!opening.ramp) continue;
      const samples = opening.ramp.samples;
      for (let n = 0; n < samples.length; n++) {
        const dx = x - samples[n].x, dz = z - samples[n].z, distance = dx * dx + dz * dz;
        if (distance < nearestDistance) { nearestDistance = distance; nearest = opening; }
      }
    }
    return nearest && nearestDistance <= (nearest.ramp.width / 2 + clearance) ** 2 ? nearest : null;
  };
  const updatePlayerCave = (player) => {
    if (!player) {
      caveEntryPlayer = null;
      playerCaveIndex = 0;
      return;
    }
    const p = player.root.position;
    setVec(PLAYER_POSITION, p.x, p.y - player.baseY, p.z);
    if (caveEntryPlayer !== player) {
      caveEntryPlayer = player;
      playerCaveIndex = 0;
    } else {
      if (playerCaveIndex && CAMERA_OPENINGS[playerCaveIndex - 1].headquarters) {
        const rampOpening = headquartersOpeningAt(p.x, p.z, PLAYER_RADIUS);
        if (rampOpening) playerCaveIndex = rampOpening.caveIndex;
      }
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
        const opening = CAMERA_OPENINGS[i], crossing = cameraCrossing(PLAYER_PREVIOUS, PLAYER_POSITION, opening, player.hop === 0);
        if (!crossing.valid) continue;
        if (!playerCaveIndex && crossing.direction > 0) playerCaveIndex = opening.caveIndex;
        else if (playerCaveIndex && crossing.direction < 0 && (playerCaveIndex === opening.caveIndex || CAMERA_OPENINGS[playerCaveIndex - 1].headquarters && opening.headquarters)) playerCaveIndex = 0;
      }
      if (playerCaveIndex && (!caveColumnAt(p.x, p.z, CAMERA_OPENINGS[playerCaveIndex - 1], PLAYER_POSITION.y) || PLAYER_POSITION.y < CAMERA_COLUMN.floor - 1e-6 || PLAYER_POSITION.y >= CAMERA_COLUMN.ceiling)) playerCaveIndex = 0;
    }
    // Exterior windows are physical entrances too.
    // Movement already checked the body against rock; bind its layer without a main-ramp doorway crossing.
    if (!playerCaveIndex && island.cavityAt(p.x, p.z, CAMERA_COLUMN, island.headquarters.caveIndex, PLAYER_POSITION.y) && PLAYER_POSITION.y >= CAMERA_COLUMN.floor - 1e-6 && PLAYER_POSITION.y + player.bodyHeight <= CAMERA_COLUMN.ceiling && physicalClearAt(p.x, PLAYER_POSITION.y + 1e-5, p.z, PLAYER_RADIUS, player.bodyHeight - 1e-5)) {
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) if (CAMERA_OPENINGS[i].headquarters) {
        playerCaveIndex = CAMERA_OPENINGS[i].caveIndex;
        break;
      }
    }
    setVec(PLAYER_PREVIOUS, PLAYER_POSITION.x, PLAYER_POSITION.y, PLAYER_POSITION.z);
  };
  // Destination placement is explicit travel, not a sweep across the island in between.
  // Validate the arrival volumes, then seed that location's own history.
  const navigationClearAt = (x, y, z, radius, height) => {
    if (!physicalClearAt(x, y, z, radius, height)) return false;
    for (const prop of props) {
      if (!prop.active || prop.prop === "gate" || prop.prop === "timechainboard" || !prop.node.geometry) continue;
      const b = BL.scene.boundsOf(prop.node.geometry), m = prop.node.world;
      const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      const hx = (b.max[0] - b.min[0]) / 2, hy = (b.max[1] - b.min[1]) / 2, hz = (b.max[2] - b.min[2]) / 2;
      const wx = m[0] * cx + m[4] * cy + m[8] * cz + m[12], wy = m[1] * cx + m[5] * cy + m[9] * cz + m[13], wz = m[2] * cx + m[6] * cy + m[10] * cz + m[14];
      const ex = Math.abs(m[0]) * hx + Math.abs(m[4]) * hy + Math.abs(m[8]) * hz, ey = Math.abs(m[1]) * hx + Math.abs(m[5]) * hy + Math.abs(m[9]) * hz, ez = Math.abs(m[2]) * hx + Math.abs(m[6]) * hy + Math.abs(m[10]) * hz;
      if (y >= wy + ey || y + height <= wy - ey) continue;
      const dx = Math.max(0, Math.abs(x - wx) - ex), dz = Math.max(0, Math.abs(z - wz) - ez);
      if (dx * dx + dz * dz < radius * radius) return false;
    }
    return true;
  };
  const navigate = (name) => {
    const destination = NAVIGATION, p = destination.position, target = destination.target;
    const player = pilot.player, close = pilot.closeWanted, basement = name === "basement", underground = name === "underground" || basement;
    if (hud.setDetachedView) hud.setDetachedView(name, !player);
    let x = 0, z = 0, yaw = 0, pitch = 0.18, dist = player ? 6 : 8;
    if (name === "pile") {
      z = Math.max(5, altar.platformRadius + 1.3);
      setVec(target, 0, ALTAR_HEIGHT + Math.max(0.4, pile.pileEdge() * 0.3), 0);
      pitch = player ? 0.22 : 0.28;
      if (!player) dist = Math.max(10, z + 4);
    } else if (name === "gate") {
      // Eye-level arrivals view the arch from the foot of the steps; a trailing camera pulls back from the landing.
      // Neither arrival puts a standing body across the narrow stair treads.
      x = island.gate.x; z = island.gate.z + (close ? 6.75 : 0.75);
      setVec(target, island.gate.x, island.surfaceAt(island.gate.x, island.gate.z) + 2.5, island.gate.z);
      pitch = player ? 0 : 0.2;
      dist = player ? 10 : 12;
    } else if (name === "lab" || name === "mirror") {
      const id = name === "lab" ? "c11" : "c1", m = island.mouths.find((mouth) => mouth.id === id);
      yaw = m.ry;
      const approach = close ? 6 : 4;
      x = m.x + Math.sin(yaw) * approach; z = m.z + Math.cos(yaw) * approach;
      setVec(target, m.x, m.floorY + (close ? 2.5 : 2.1), m.z);
      pitch = player ? 0.06 : 0.16;
      dist = player ? 8 : 9;
    } else if (name === "timechain" && timechainIsland) {
      const site = timechainIsland.place;
      yaw = site.ry;
      // Arrive on the bridge side of the control console, not inside its buttons.
      x = site.x + Math.sin(yaw) * 4.8; z = site.z + Math.cos(yaw) * 4.8;
      setVec(target, site.x, site.y + 0.8, site.z);
      pitch = player ? 0.2 : 0.08;
      dist = player ? 6 : 10;
    } else if (underground) {
      z = 6;
      setVec(target, 0, (basement ? island.headquarters.basement.floor : island.headquarters.floor) + 0.8, 0);
      pitch = player ? 0.4 : 0.15;
      dist = player ? 6 : 8;
    } else return;
    BL.scene.updateWorld(root);
    let found = false;
    for (const offset of NAVIGATION_OFFSETS) {
      p.x = x + Math.cos(yaw) * offset; p.z = z - Math.sin(yaw) * offset;
      p.y = name === "timechain" ? timechainIsland.place.y : underground ? (basement ? island.headquarters.basement.floor : island.headquarters.floor) : island.surfaceAt(p.x, p.z);
      if (name !== "timechain" && !island.onLand(p.x, p.z) || !navigationClearAt(p.x, p.y + 1e-5, p.z, PLAYER_RADIUS, player ? player.bodyHeight : 1.6)) continue;
      destination.yaw = Math.atan2(p.x - target.x, p.z - target.z);
      destination.pitch = close ? Math.atan2(p.y + (player ? player.headOffset * CLOSE_VIEW.eyeRatio : CLOSE_VIEW.eyeHeight) - target.y, Math.hypot(p.x - target.x, p.z - target.z)) : pitch;
      destination.dist = dist;
      let eyeX, eyeY, eyeZ;
      if (close) {
        eyeX = p.x - (player ? Math.sin(destination.yaw) * CLOSE_VIEW.eyeForward : 0);
        eyeY = p.y + (player ? player.headOffset * CLOSE_VIEW.eyeRatio : CLOSE_VIEW.eyeHeight);
        eyeZ = p.z - (player ? Math.cos(destination.yaw) * CLOSE_VIEW.eyeForward : 0);
      } else {
        let viewPitch = pitch;
        if (player) { const t = Math.max(0, Math.min(1, (CLOSE_VIEW.trailingDist - dist) / (CLOSE_VIEW.trailingDist - DIST_MIN))); viewPitch *= 1 - t * t * (3 - 2 * t); }
        eyeX = (player ? p.x : target.x) + Math.sin(destination.yaw) * Math.cos(viewPitch) * dist;
        eyeY = (player ? p.y + FOLLOW.y : target.y) + Math.sin(viewPitch) * dist;
        eyeZ = (player ? p.z : target.z) + Math.cos(destination.yaw) * Math.cos(viewPitch) * dist;
      }
      if (!navigationClearAt(eyeX, eyeY - CAMERA_RADIUS, eyeZ, CAMERA_RADIUS, CAMERA_RADIUS * 2)) continue;
      setVec(CAMERA_PREVIOUS, eyeX, eyeY, eyeZ);
      setVec(camera.position, eyeX, eyeY, eyeZ);
      found = true;
      break;
    }
    if (!found) throw new Error(`No clear navigation arrival for ${name}`);
    if (enteringTween) { enteringTween.alive = false; enteringTween = null; }
    entering = false;
    cameraPreviousValid = cameraTerrainValid = cameraTerrainRecovering = cameraManualContact = false;
    cameraUnrestricted = cameraReentering = false;
    cameraTrailPlayer = null;
    cameraTrailCount = cameraTrailNext = cameraEntranceIndex = cameraTerrainEntranceIndex = 0;
    caveEntryPlayer = player;
    const index = underground ? CAMERA_OPENINGS.find((opening) => opening.headquarters).caveIndex : 0;
    playerCaveIndex = player ? index : 0;
    setCameraCave(index);
    setVec(PLAYER_PREVIOUS, p.x, p.y, p.z);
    setVec(PLAYER_POSITION, p.x, p.y, p.z);
    pilot.navigate(destination);
    if (player && player.jet && !jetpackAllowed(player)) {
      crew.removeJetpack(player);
      pilot.showAct();
    }
    syncMatrixInside(player);
    hud.tooltip.hide();
  };
  // Keep navigation within the world's horizontal extent.
  // An orbit's focal point may pass through the island, independently of its displayed eye.
  const clampTarget = (t) => {
    const r = Math.hypot(t.x, t.z);
    if (r > FLY_BOUND) {
      t.x *= FLY_BOUND / r;
      t.z *= FLY_BOUND / r;
    }
  };
  let exteriorEntranceIndex = 0, exteriorCeiling = Infinity;
  const exteriorCameraFloorAt = (x, y, z, clearance, smoothStep, closeMix, undergroundAir = false) => {
    const physicalFloor = island.surfaceAt(x, z);
    let floor = (smoothStep ? lerp(island.smoothSupportAt(x, z, physicalFloor, STEP_MAX), physicalFloor, closeMix) : physicalFloor) + clearance;
    exteriorEntranceIndex = 0;
    exteriorCeiling = Infinity;
    const player = pilot.player;
    // A jumping face can extend past the ledge while its feet are still over land.
    // Clearance is measured from the abyss there; keep the body-anchored eye and let swept rock constrain it.
    if (player && closeMix > 0.5 && (player.hop > 1e-5 || Math.abs(player.hopV) > 1e-5)) return -Infinity;
    if (player && (abyssAt(player.root.position.x, player.root.position.z, player.root.position.y - player.baseY) || !playerCaveIndex && player.root.position.y - player.baseY < island.surfaceAt(player.root.position.x, player.root.position.z) - STEP_MAX)) return -Infinity;
    if (!player && pilot.freeFalling && abyssAt(x, z, y - CLOSE_VIEW.eyeHeight)) return -Infinity;
    if (!player && closeMix > 0.5 && cloudAt(x, z, y - CLOSE_VIEW.eyeHeight)) return -Infinity;
    if (undergroundAir && y < physicalFloor && cameraClearAt(x, y, z)) {
      exteriorCeiling = island.ceilingAt(x, y - CAMERA_RADIUS, z, CAMERA_RADIUS) - CAMERA_RADIUS;
      return island.onLand(x, z) ? island.supportAt(x, z, y - CAMERA_RADIUS, 0, ABYSS_FLOOR) + CAMERA_RADIUS : -Infinity;
    }
    for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
      const entry = CAMERA_OPENINGS[i], dx = x - entry.mouth.x, dz = z - entry.mouth.z;
      if (entry.blocked) continue;
      const along = dx * entry.sr + dz * entry.cr, across = dx * entry.cr - dz * entry.sr;
      if (along < entry.planeZ - 1e-7 || along > 3 || across < entry.minX + CAMERA_RADIUS || across > entry.maxX - CAMERA_RADIUS || y < entry.mouth.floorY || y > entry.mouth.floorY + entry.maxY) continue;
      const k = (along - entry.planeZ) / (3 - entry.planeZ);
      exteriorEntranceIndex = entry.caveIndex;
      // The lower headquarters can lie beneath the outdoor apron.
      // Only the threshold-height tunnel may constrain an eye approaching from outside.
      const entranceColumn = caveColumnAt(x, z, entry, y) && CAMERA_COLUMN.ceiling > entry.mouth.floorY;
      floor = (entranceColumn ? CAMERA_COLUMN.floor : physicalFloor) + CAMERA_FLOOR + (clearance - CAMERA_FLOOR) * k * k * (3 - 2 * k);
      if (entranceColumn && cameraSpaceAt(x, z, entry, y)) exteriorCeiling = CAMERA_SPACE.ceiling;
      break;
    }
    return floor;
  };
  const cameraClearAt = (x, y, z) => physicalClearAt(x, y - CAMERA_RADIUS, z, CAMERA_RADIUS, CAMERA_RADIUS * 2);
  // The carved throat can extend beyond room-ownership columns; it is still HQ while rock encloses it.
  // Match the whole eye footprint at the sloping edge of an exterior window floor.
  const headquartersWindowAirAt = (x, y, z) => y < -CAMERA_RADIUS && cameraClearAt(x, y, z) && island.ceilingAt(x, y - CAMERA_RADIUS, z, CAMERA_RADIUS) < Infinity && island.supportAt(x, z, y - CAMERA_RADIUS, 0, ABYSS_FLOOR, CAMERA_RADIUS) > ABYSS_FLOOR;
  // Exact frame contacts can occur between the ordinary terrain substeps.
  const entranceSegmentClear = (x, y, z, toX, toY, toZ, radius = CAMERA_RADIUS) => {
    const dx = toX - x, dy = toY - y, dz = toZ - z, span2 = dx * dx + dz * dz;
    for (let i = 0; i < headquarters.entrances.length; i++) {
      const entry = headquarters.entrances[i], node = entry.node;
      if (Math.min(y, toY) - radius >= entry.maxY || Math.max(y, toY) + radius <= entry.minY) continue;
      const k = span2 ? Math.max(0, Math.min(1, ((node.position.x - x) * dx + (node.position.z - z) * dz) / span2)) : 0;
      const ox = x + dx * k - node.position.x, oz = z + dz * k - node.position.z, reach = entry.radius + radius;
      if (ox * ox + oz * oz > reach * reach) continue;
      const lx = (x - node.position.x) * entry.cr - (z - node.position.z) * entry.sr, lz = (x - node.position.x) * entry.sr + (z - node.position.z) * entry.cr;
      const vx = dx * entry.cr - dz * entry.sr, vz = dx * entry.sr + dz * entry.cr, boxes = node.geometry.collisionBoxes, scale = node.scale.x;
      for (let j = 0; j < boxes.length; j += 6) {
        if (!terrain.segmentBoxClear(lx, y - node.position.y - radius, lz, vx, dy, vz, radius, radius * 2, boxes[j] * scale, boxes[j + 1], boxes[j + 2], boxes[j + 3] * scale, boxes[j + 4], boxes[j + 5])) return false;
      }
    }
    return true;
  };
  const cameraSegmentClear = (x, y, z, toX, toY, toZ) => cameraClearAt(toX, toY, toZ) && island.voxelSegmentClearAt(x, y - CAMERA_RADIUS, z, toX, toY - CAMERA_RADIUS, toZ, CAMERA_RADIUS, CAMERA_RADIUS * 2) && entranceSegmentClear(x, y, z, toX, toY, toZ) && bedSegmentClear(x, y - CAMERA_RADIUS, z, toX, toY - CAMERA_RADIUS, toZ, CAMERA_RADIUS, CAMERA_RADIUS * 2);
  const sleepEyeFloorAt = (player) => player.bedroll.y + player.bedroll.sleep.pillowTop + CAMERA_RADIUS;
  const cameraHeadAt = (out, player) => {
    if (crew.sleeping) {
      const head = player.sleepHead;
      // A resting head replaces the upright boom anchor.
      // Keep the eye volume above the actual pillow while the face rolls toward the sheet.
      setVec(out, head.x, Math.max(head.y, sleepEyeFloorAt(player)), head.z);
    } else {
      const p = player.root.position;
      setVec(out, p.x, p.y - player.baseY + player.headOffset * CLOSE_VIEW.eyeRatio, p.z);
    }
  };
  const enterFreeCameraView = (eye) => {
    if (cameraClearAt(eye.x, eye.y, eye.z)) return false;
    // A low orbit focus may overlap a walkable prop or the ground: lift the eye over that support first.
    // A pile focus must not recover to HQ just because its platform became solid.
    const floor = playerSupportAt(eye.x, eye.z, eye.y), raisedY = floor + CLOSE_VIEW.eyeHeight;
    if (floor <= eye.y && raisedY > eye.y && cameraClearAt(eye.x, raisedY, eye.z)) {
      eye.y = raisedY;
      return false;
    }
    // A free orbit can be inside stone: enter walking view from the nearest clear authored circulation point.
    // Then approach the requested eye as far as its real floor and swept camera volume permit.
    const points = headquarters.sleepNavigation.points;
    let best = Infinity, found = false;
    for (const point of points) {
      const y = playerSupportAt(point.x, point.z, point.y) + CLOSE_VIEW.eyeHeight;
      const distance = (point.x - eye.x) ** 2 + (y - eye.y) ** 2 + (point.z - eye.z) ** 2;
      if (distance >= best || !cameraClearAt(point.x, y, point.z)) continue;
      best = distance; found = true;
      setVec(CAMERA_RECOVERY, point.x, y, point.z);
    }
    if (!found) throw new Error("No clear free-camera entry");
    const x = CAMERA_RECOVERY.x, y = CAMERA_RECOVERY.y, z = CAMERA_RECOVERY.z;
    const count = Math.max(1, Math.min(1024, Math.ceil(Math.sqrt(best) / (island.unit * 0.5))));
    for (let i = 1; i <= count; i++) {
      const t = i / count, nx = lerp(x, eye.x, t), nz = lerp(z, eye.z, t), requestedY = lerp(y, eye.y, t);
      const ny = Math.max(requestedY, playerSupportAt(nx, nz, requestedY - CLOSE_VIEW.eyeHeight) + CLOSE_VIEW.eyeHeight);
      if (!cameraSegmentClear(CAMERA_RECOVERY.x, CAMERA_RECOVERY.y, CAMERA_RECOVERY.z, nx, ny, nz)) break;
      setVec(CAMERA_RECOVERY, nx, ny, nz);
    }
    setVec(eye, CAMERA_RECOVERY.x, CAMERA_RECOVERY.y, CAMERA_RECOVERY.z);
    setVec(CAMERA_PREVIOUS, eye.x, eye.y, eye.z);
    setVec(CAMERA_REQUESTED, eye.x, eye.y, eye.z);
    let index = 0;
    if (island.cavityAt(eye.x, eye.z, CAMERA_COLUMN, island.headquarters.caveIndex, eye.y) && eye.y >= CAMERA_COLUMN.floor && eye.y <= CAMERA_COLUMN.ceiling) {
      index = CAMERA_COLUMN.caveIndex;
      if (index === island.headquarters.caveIndex) for (const opening of CAMERA_OPENINGS) if (opening.headquarters) { index = opening.caveIndex; break; }
    }
    setCameraCave(index);
    cameraPreviousValid = true;
    cameraTerrainValid = cameraTerrainRecovering = cameraManualContact = false;
    cameraUnrestricted = cameraReentering = false;
    cameraTrailPlayer = null;
    cameraTrailCount = cameraTrailNext = 0;
    return true;
  };
  const releaseCameraView = (player, eye) => {
    if (cameraClearAt(eye.x, eye.y, eye.z)) return false;
    const p = player.root.position, feet = p.y - player.baseY;
    const floor = playerSupportAt(p.x, p.z, feet), roof = ceilingAt(p.x, p.z, Math.max(floor, feet) + 1e-5) - CAMERA_RADIUS;
    setVec(eye, p.x, Math.min(roof, Math.max(feet + player.headOffset * 0.95, floor + CLOSE_VIEW.eyeHeight)), p.z);
    setVec(CAMERA_PREVIOUS, eye.x, eye.y, eye.z);
    setVec(CAMERA_REQUESTED, eye.x, eye.y, eye.z);
    setCameraCave(playerCaveIndex);
    cameraPreviousValid = true;
    cameraTerrainValid = cameraTerrainRecovering = cameraManualContact = false;
    cameraUnrestricted = cameraReentering = false;
    return true;
  };
  const sweepCameraVolume = (from, p, slide) => {
    const dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z;
    const steps = Math.max(1, Math.min(1024, Math.ceil(Math.hypot(dx, dy, dz) / (island.unit * 0.5))));
    let x = from.x, y = from.y, z = from.z, slid = false;
    for (let i = 0; i < steps; i++) {
      const sx = x + dx / steps, sy = y + dy / steps, sz = z + dz / steps;
      if (cameraSegmentClear(x, y, z, sx, sy, sz)) { x = sx; y = sy; z = sz; continue; }
      if (!slide) {
        let lo = 0, hi = 1;
        for (let n = 0; n < 10; n++) {
          const k = (lo + hi) / 2;
          if (cameraSegmentClear(x, y, z, x + dx / steps * k, y + dy / steps * k, z + dz / steps * k)) lo = k;
          else hi = k;
        }
        x += dx / steps * lo; y += dy / steps * lo; z += dz / steps * lo;
        break;
      }
      slid = true;
      if (dy && cameraSegmentClear(x, y, z, x, sy, z)) y = sy;
      if (cameraSegmentClear(x, y, z, sx, y, sz)) { x = sx; z = sz; }
      else {
        if (dx && cameraSegmentClear(x, y, z, sx, y, z)) x = sx;
        if (dz && cameraSegmentClear(x, y, z, x, y, sz)) z = sz;
      }
    }
    setVec(p, x, y, z);
    if (slid) {
      // A bent slide can leave a clear endpoint whose displayed diagonal cuts the stone.
      // Lower before entering a lintel; leave it before rising.
      sweepCameraVolume(from, p, false);
      if (Math.abs(y - from.y) > 1e-7 && Math.hypot(p.x - x, p.y - y, p.z - z) > 1e-5) {
        const rising = y > from.y;
        setVec(p, rising ? x : from.x, rising ? from.y : y, rising ? z : from.z);
        sweepCameraVolume(from, p, false);
        if (Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z) < 1e-5) {
          setVec(p, rising ? from.x : x, rising ? y : from.y, rising ? from.z : z);
          sweepCameraVolume(from, p, false);
        }
      }
    }
  };
  const followCameraMotion = (p, player, dt, directView, smoothStep, closeMix, requestedStep, falling = false) => {
    cameraHeadAt(CAMERA_VOLUME_FROM, player);
    const body = CAMERA_VOLUME_FROM, y = body.y;
    const previous = (cameraTrailNext + CAMERA_TRAIL_CAPACITY - 1) % CAMERA_TRAIL_CAPACITY * 3;
    const moved = cameraTrailCount ? Math.hypot(body.x - CAMERA_TRAIL[previous], y - CAMERA_TRAIL[previous + 1], body.z - CAMERA_TRAIL[previous + 2]) : Infinity;
    // A fast fall can travel farther than one unit in a frame.
    // Only reset for travel beyond the body's actual speed, so low-rate falls still sweep.
    const sleeping = crew.sleeping;
    // Standing changes the head anchor without teleporting the Ooga.
    // Retain the last eye and sweep that transition around nearby room corners.
    const reset = player !== cameraTrailPlayer || sleeping === cameraTrailSleeping && moved > Math.max(1, (Math.abs(player.hopV) + pilotMod.WALK.speed) * dt + 0.5);
    cameraTrailSleeping = sleeping;
    if (reset) { cameraTrailPlayer = player; cameraTrailCount = cameraTrailNext = 0; }
    if (reset || moved >= 0.125) {
      const at = cameraTrailNext * 3;
      CAMERA_TRAIL[at] = body.x; CAMERA_TRAIL[at + 1] = y; CAMERA_TRAIL[at + 2] = body.z;
      cameraTrailNext = (cameraTrailNext + 1) % CAMERA_TRAIL_CAPACITY;
      cameraTrailCount = Math.min(CAMERA_TRAIL_CAPACITY, cameraTrailCount + 1);
    }
    if (reset || !cameraPreviousValid) return;
    const distance = Math.hypot(p.x - CAMERA_PREVIOUS.x, p.y - CAMERA_PREVIOUS.y, p.z - CAMERA_PREVIOUS.z);
    // Preserve the authored close-view blend and first-person pose; ease the extra correction once the eye clears.
    // Clamp height separately so it never eats the horizontal follow budget, then sweep the full segment.
    const travel = Math.max(CAMERA_RECOVERY_SPEED * dt, closeMix > 0 ? requestedStep : 0);
    const amount = directView ? 1 : Math.min(1, travel / Math.max(distance, 1e-7));
    p.x = lerp(CAMERA_PREVIOUS.x, p.x, amount);
    // Falling follows the body's speed while a newly exposed boom eases its remaining correction.
    // A cliff contact must not release a height snap.
    const verticalTravel = Math.max(CAMERA_RECOVERY_SPEED, Math.abs(player.hopV)) * dt;
    p.y = falling && !directView ? Math.max(CAMERA_PREVIOUS.y - verticalTravel, Math.min(CAMERA_PREVIOUS.y + verticalTravel, p.y)) : lerp(CAMERA_PREVIOUS.y, p.y, amount);
    p.z = lerp(CAMERA_PREVIOUS.z, p.z, amount);
    if (smoothStep && !directView) p.y = Math.max(CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * dt, Math.min(CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * dt, p.y));
    if (cameraReentering) {
      // A room view may begin inside solid rock: ease it into the corridor.
      // Only then does a sweep have a physically clear starting volume.
      if (cameraClearAt(p.x, p.y, p.z) && cameraSegmentClear(body.x, body.y, body.z, p.x, p.y, p.z)) cameraReentering = false;
      return;
    }
    const wantedX = p.x, wantedY = p.y, wantedZ = p.z;
    sweepCameraVolume(CAMERA_PREVIOUS, p, true);
    if (Math.hypot(p.x - wantedX, p.y - wantedY, p.z - wantedZ) < 1e-4) return;
    // Dragging an exterior view into rock is not an Ooga rounding a corner.
    // Keep that wall contact instead of following its trail into the cave.
    if (directView) return true;
    // The last clear boom can bend around a doorway as its Ooga turns.
    // Follow the newest visible trail point rather than cutting the wall or re-pushing the same corner.
    let reached = cameraTrailCount;
    for (let i = 0; i < cameraTrailCount; i++) {
      const at = (cameraTrailNext + CAMERA_TRAIL_CAPACITY - 1 - i) % CAMERA_TRAIL_CAPACITY * 3;
      setVec(CAMERA_RECOVERY, CAMERA_TRAIL[at], CAMERA_TRAIL[at + 1], CAMERA_TRAIL[at + 2]);
      sweepCameraVolume(CAMERA_PREVIOUS, CAMERA_RECOVERY, false);
      if (Math.hypot(CAMERA_RECOVERY.x - CAMERA_TRAIL[at], CAMERA_RECOVERY.y - CAMERA_TRAIL[at + 1], CAMERA_RECOVERY.z - CAMERA_TRAIL[at + 2]) > 1e-4) continue;
      reached = i;
      const span = Math.hypot(CAMERA_RECOVERY.x - CAMERA_PREVIOUS.x, CAMERA_RECOVERY.y - CAMERA_PREVIOUS.y, CAMERA_RECOVERY.z - CAMERA_PREVIOUS.z);
      if (span < 1e-5) break;
      const k = Math.min(1, CAMERA_RECOVERY_SPEED * dt / Math.max(span, 1e-7));
      p.x = lerp(CAMERA_PREVIOUS.x, CAMERA_RECOVERY.x, k);
      p.y = lerp(CAMERA_PREVIOUS.y, CAMERA_RECOVERY.y, k);
      p.z = lerp(CAMERA_PREVIOUS.z, CAMERA_RECOVERY.z, k);
      if (smoothStep) p.y = Math.max(CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * dt, Math.min(CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * dt, p.y));
      sweepCameraVolume(CAMERA_PREVIOUS, p, true);
      if (Math.hypot(p.x - CAMERA_PREVIOUS.x, p.y - CAMERA_PREVIOUS.y, p.z - CAMERA_PREVIOUS.z) > 1e-5) return;
      break;
    }
    // A boom can enter a side passage the Ooga never walked: slide a short, fully swept step along the trail.
    // Revisiting older points after reaching a corner would make the eye walk backward.
    for (let i = reached - 1; i >= 0; i--) {
      const at = (cameraTrailNext + CAMERA_TRAIL_CAPACITY - 1 - i) % CAMERA_TRAIL_CAPACITY * 3;
      const dx = CAMERA_TRAIL[at] - CAMERA_PREVIOUS.x, dy = CAMERA_TRAIL[at + 1] - CAMERA_PREVIOUS.y, dz = CAMERA_TRAIL[at + 2] - CAMERA_PREVIOUS.z;
      const span = Math.hypot(dx, dy, dz), k = Math.min(1, CAMERA_RECOVERY_SPEED * dt / Math.max(span, 1e-7));
      setVec(CAMERA_RECOVERY, CAMERA_PREVIOUS.x + dx * k, CAMERA_PREVIOUS.y + dy * k, CAMERA_PREVIOUS.z + dz * k);
      if (smoothStep) CAMERA_RECOVERY.y = Math.max(CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * dt, Math.min(CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * dt, CAMERA_RECOVERY.y));
      sweepCameraVolume(CAMERA_PREVIOUS, CAMERA_RECOVERY, true);
      if (Math.hypot(CAMERA_TRAIL[at] - CAMERA_RECOVERY.x, CAMERA_TRAIL[at + 1] - CAMERA_RECOVERY.y, CAMERA_TRAIL[at + 2] - CAMERA_RECOVERY.z) >= span - 1e-4) continue;
      setVec(p, CAMERA_RECOVERY.x, CAMERA_RECOVERY.y, CAMERA_RECOVERY.z);
      return;
    }
  };
  const clampCamera = (p, closeMix = 0, closeClearance = CLEARANCE, smoothStep = false, dt = 0, resetSmooth = false, directView = false, freeMove = false, preserveExitAngle = false) => {
    const requestedX = p.x, requestedY = p.y, requestedZ = p.z;
    const player = pilot && pilot.player;
    if (cameraUnrestricted && player && closeMix > 0 && !preserveExitAngle && !(pilot.birdsEyeMix > 0)) {
      cameraHeadAt(CAMERA_VOLUME_FROM, player);
      cameraReentering = !cameraClearAt(CAMERA_PREVIOUS.x, CAMERA_PREVIOUS.y, CAMERA_PREVIOUS.z) || !cameraSegmentClear(CAMERA_PREVIOUS.x, CAMERA_PREVIOUS.y, CAMERA_PREVIOUS.z, CAMERA_VOLUME_FROM.x, CAMERA_VOLUME_FROM.y, CAMERA_VOLUME_FROM.z);
      cameraUnrestricted = false;
      CAMERA_TRAIL[0] = CAMERA_VOLUME_FROM.x; CAMERA_TRAIL[1] = CAMERA_VOLUME_FROM.y; CAMERA_TRAIL[2] = CAMERA_VOLUME_FROM.z;
      cameraTrailPlayer = player; cameraTrailCount = cameraTrailNext = 1; cameraTrailSleeping = crew.sleeping;
    }
    // Orbit views retain their chosen pose everywhere.
    // A close-view dolly starting in rock keeps its authored path to the final head position.
    if (pilot?.birdsEyeMix > 0 || preserveExitAngle || closeMix === 0 || cameraReentering && closeMix < 1) {
      if (pilot?.birdsEyeMix > 0 || preserveExitAngle || closeMix === 0) { cameraUnrestricted = true; cameraReentering = false; }
      cameraManualContact = false;
      let index = 0;
      const owner = player ? playerCaveIndex : cameraCaveIndex;
      const preferred = owner && CAMERA_OPENINGS[owner - 1].headquarters ? island.headquarters.caveIndex : owner;
      if (island.cavityAt(p.x, p.z, CAMERA_COLUMN, preferred, p.y) && p.y >= CAMERA_COLUMN.floor && p.y < CAMERA_COLUMN.ceiling) {
        if (CAMERA_COLUMN.caveIndex === island.headquarters.caveIndex) {
          for (const opening of CAMERA_OPENINGS) if (opening.headquarters && (!index || opening.caveIndex === playerCaveIndex)) index = opening.caveIndex;
        } else index = CAMERA_COLUMN.caveIndex;
      }
      setCameraCave(index); cameraEntranceIndex = 0;
      cameraTerrainValid = cameraTerrainRecovering = false;
      camera.near = 0.1;
      setVec(CAMERA_PREVIOUS, p.x, p.y, p.z);
      setVec(CAMERA_REQUESTED, requestedX, requestedY, requestedZ);
      cameraPreviousValid = true;
      return false;
    }
    cameraReentering = false;
    if (!player) cameraUnrestricted = false;
    const exteriorFlight = player && (abyssAt(player.root.position.x, player.root.position.z, player.root.position.y - player.baseY) || !playerCaveIndex && player.root.position.y - player.baseY < island.surfaceAt(player.root.position.x, player.root.position.z) - STEP_MAX);
    if (exteriorFlight) smoothStep = false;
    if (cameraManualContact && player === cameraTrailPlayer && cameraPreviousValid && !directView && closeMix === 0) {
      const body = player.root.position;
      if (Math.hypot(body.x - CAMERA_MANUAL_BODY.x, body.y - CAMERA_MANUAL_BODY.y, body.z - CAMERA_MANUAL_BODY.z) < 1e-7 && Math.hypot(pilot.orbit.yaw - CAMERA_MANUAL_VIEW.x, pilot.orbit.pitch - CAMERA_MANUAL_VIEW.y, pilot.orbit.dist - CAMERA_MANUAL_VIEW.z) < 1e-7) {
        // Hold the selected view when input and body movement have stopped.
        // Includes an exterior orbit whose Ooga is inside the doorway.
        setVec(p, CAMERA_PREVIOUS.x, CAMERA_PREVIOUS.y, CAMERA_PREVIOUS.z);
        return true;
      }
    }
    cameraManualContact = false;
    const requestedStep = Math.hypot(p.x - CAMERA_REQUESTED.x, p.y - CAMERA_REQUESTED.y, p.z - CAMERA_REQUESTED.z);
    setVec(CAMERA_REQUESTED, requestedX, requestedY, requestedZ);
    if (cameraCaveIndex && CAMERA_OPENINGS[cameraCaveIndex - 1].headquarters) {
      const rampOpening = headquartersOpeningAt(p.x, p.z, CAMERA_RADIUS);
      if (rampOpening) setCameraCave(rampOpening.caveIndex);
    }
    const previousCaveIndex = cameraCaveIndex;
    const undergroundAir = (freeMove || player && player.root.position.y - player.baseY < island.surfaceAt(player.root.position.x, player.root.position.z) - STEP_MAX) && (CAMERA_PREVIOUS.y < -CAMERA_RADIUS || previousCaveIndex && CAMERA_OPENINGS[previousCaveIndex - 1].headquarters);
    const clearance = lerp(player ? CAMERA_RADIUS : CLEARANCE, Math.max(smoothStep ? CAMERA_STEP_FLOOR : CAMERA_FLOOR, closeClearance), closeMix);
    let opening = cameraCaveIndex ? CAMERA_OPENINGS[cameraCaveIndex - 1] : null, start = 0, exit = false;
    setVec(CAMERA_FROM, CAMERA_PREVIOUS.x, CAMERA_PREVIOUS.y, CAMERA_PREVIOUS.z);
    // Physical first-person placement follows the character's actual layer.
    const followOpening = playerCaveIndex ? CAMERA_OPENINGS[playerCaveIndex - 1] : null;
    const followBoom = player && closeMix > 0;
    if (followBoom) {
      opening = followOpening;
      cameraHeadAt(CAMERA_FROM, player);
      if (opening && cameraSpaceAt(CAMERA_FROM.x, CAMERA_FROM.z, opening, CAMERA_FROM.y)) CAMERA_FROM.y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, CAMERA_FROM.y));
    }
    if (cameraPreviousValid) {
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
        const candidate = CAMERA_OPENINGS[i], crossing = cameraCrossing(CAMERA_FROM, p, candidate);
        if (matrixCave && candidate.caveIndex === matrixCave.caveIndex && crossing.reason) {
          const rejected = matrixCave.portal.rejected, reason = crossing.reason;
          rejected[reason] = Math.min(0x7fffffff, rejected[reason] + 1);
        }
        if (crossing.reason === "sealed" && crossing.direction > 0) {
          const fromAlong = (CAMERA_FROM.x - candidate.mouth.x) * candidate.sr + (CAMERA_FROM.z - candidate.mouth.z) * candidate.cr;
          const toAlong = (p.x - candidate.mouth.x) * candidate.sr + (p.z - candidate.mouth.z) * candidate.cr;
          const k = Math.max(0, Math.min(1, (fromAlong - candidate.stopZ) / (fromAlong - toAlong)));
          p.x = lerp(CAMERA_FROM.x, p.x, k);
          p.y = lerp(CAMERA_FROM.y, p.y, k);
          p.z = lerp(CAMERA_FROM.z, p.z, k);
        }
        if (!crossing.valid) continue;
        if (!opening && crossing.direction > 0) {
          opening = candidate;
          start = crossing.amount;
        } else if (opening && crossing.direction < 0 && (opening === candidate || opening.headquarters && candidate.headquarters)) {
          opening = candidate;
          exit = true;
        }
      }
    }
    if (opening) {
      const fromX = lerp(CAMERA_FROM.x, p.x, start), fromY = lerp(CAMERA_FROM.y, p.y, start), fromZ = lerp(CAMERA_FROM.z, p.z, start);
      const dx = p.x - fromX, dy = p.y - fromY, dz = p.z - fromZ;
      const steps = Math.max(1, Math.min(768, Math.ceil(Math.hypot(dx, dz) / (island.unit * 0.5))));
      let x = CAMERA_FROM.x, y = CAMERA_FROM.y, z = CAMERA_FROM.z, outside = false, accepted = false;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps, sx = i ? x + dx / steps : fromX, sz = i ? z + dz / steps : fromZ;
        const along = (sx - opening.mouth.x) * opening.sr + (sz - opening.mouth.z) * opening.cr;
        if (cameraCaveIndex && along > opening.planeZ + 1e-7 && (!opening.headquarters || exit)) {
          if (exit) outside = true;
          break;
        }
        if (!cameraSpaceAt(sx, sz, opening, y)) {
          // Windows are real openings through the island shell.
          // Their clear air need not have room-ownership metadata to be traversable.
          if ((freeMove || player) && opening.headquarters && cameraClearAt(sx, fromY + dy * k, sz)) {
            x = sx; y = fromY + dy * k; z = sz;
            accepted = true;
            continue;
          }
          // Project blocked free movement onto each remaining axis; the accepted point keeps shallow wall tangents.
          // A follow boom stops at its first obstruction to keep line of sight.
          if (!i || followBoom || !freeMove && !player) break;
          if (cameraSpaceAt(sx, z, opening, y)) {
            x = sx;
            y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, fromY + dy * k));
          }
          if (cameraSpaceAt(x, sz, opening, y)) {
            z = sz;
            y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, fromY + dy * k));
          }
          continue;
        }
        if (cameraCaveIndex && opening.headquarters && along > opening.planeZ + 1e-7 && CAMERA_SPACE.ceiling > opening.mouth.floorY) break;
        accepted = true;
        x = sx; z = sz;
        y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, fromY + dy * k));
      }
      if (outside) setCameraCave(0);
      else {
        p.x = x; p.y = y; p.z = z;
        const along = (x - opening.mouth.x) * opening.sr + (z - opening.mouth.z) * opening.cr;
        if (accepted) {
          if ((freeMove || player) && opening.headquarters && (!island.cavityAt(x, z, CAMERA_COLUMN, island.headquarters.caveIndex, y) || y < CAMERA_COLUMN.floor + CAMERA_RADIUS || y > CAMERA_COLUMN.ceiling - CAMERA_RADIUS) && !headquartersWindowAirAt(x, y, z)) setCameraCave(0);
          else if (along < opening.planeZ - 1e-7) setCameraCave(opening.caveIndex);
        }
      }
    }
    let caveView = !!cameraCaveIndex;
    if (freeMove && closeMix > 0.5) {
      // Resolve eye-level support at the accepted horizontal position.
      // A requested point inside a wall must not lift the eye to that wall's top.
      const floor = playerSupportAt(p.x, p.z, CAMERA_PREVIOUS.y - CLOSE_VIEW.eyeHeight);
      const eye = floor + CLOSE_VIEW.eyeHeight;
      if (opening && cameraSpaceAt(p.x, p.z, opening, p.y)) p.y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, pilot.freeFalling ? Math.max(p.y, eye) : eye));
    }
    cameraEntranceIndex = 0;
    if (!cameraCaveIndex) {
      const floor = exteriorCameraFloorAt(p.x, p.y, p.z, clearance, smoothStep, closeMix, undergroundAir);
      cameraEntranceIndex = exteriorEntranceIndex;
      p.y = Math.min(p.y, exteriorCeiling);
      p.y = Math.max(p.y, floor);
    }
    // Walking smooths terrain steps, but entering first person already has an authored blend.
    // Rate-limiting its first half stores an error released as a visible jump halfway through.
    if (smoothStep && closeMix === 0 && !caveView) {
      const moved = Math.hypot(p.x - cameraTerrainX, p.z - cameraTerrainZ);
      const verticalStep = CAMERA_VERTICAL_RATE * Math.min(dt, 0.05);
      const horizontalStep = CAMERA_HORIZONTAL_RATE * Math.min(dt, 0.05);
      if (!cameraTerrainValid || resetSmooth || directView) {
        cameraTerrainY = p.y;
        cameraTerrainRecovering = false;
      } else {
        const targetY = p.y;
        if (targetY > cameraTerrainY + verticalStep) {
          cameraTerrainY += verticalStep;
          cameraTerrainRecovering = true;
        } else if (targetY < cameraTerrainY) cameraTerrainY = Math.max(targetY, cameraTerrainY - verticalStep);
        else cameraTerrainY = targetY;
        if ((cameraEntranceIndex || cameraTerrainEntranceIndex) && moved > horizontalStep) cameraTerrainRecovering = true;
        if (cameraTerrainRecovering && moved > horizontalStep) {
          const k = horizontalStep / moved, x = lerp(cameraTerrainX, p.x, k), z = lerp(cameraTerrainZ, p.z, k);
          if (exteriorCameraFloorAt(x, cameraTerrainY, z, clearance, smoothStep, closeMix) <= cameraTerrainY + 1e-7) {
            p.x = x;
            p.z = z;
          } else {
            p.x = cameraTerrainX;
            p.z = cameraTerrainZ;
          }
        }
        if (cameraTerrainRecovering && moved <= horizontalStep && Math.abs(cameraTerrainY - targetY) <= 1e-7) cameraTerrainRecovering = false;
      }
      p.y = cameraTerrainY;
      exteriorCameraFloorAt(p.x, p.y, p.z, clearance, smoothStep, closeMix);
      cameraEntranceIndex = exteriorEntranceIndex;
      p.y = Math.min(p.y, exteriorCeiling);
      cameraTerrainX = p.x;
      cameraTerrainZ = p.z;
      cameraTerrainEntranceIndex = cameraEntranceIndex;
      cameraTerrainValid = true;
    } else {
      cameraTerrainValid = false;
      cameraTerrainRecovering = false;
      cameraTerrainEntranceIndex = 0;
    }
    if (cameraPreviousValid && freeMove) {
      // Raising clearance over a cliff must not jump the eye through its side.
      // Sweep the whole eye volume, incl. outdoor voxel corners; let the blocked horizontal slide while rising.
      if (!caveView) p.y = Math.min(p.y, Math.max(requestedY, CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * Math.min(dt, 0.05)));
      if (caveView && closeMix <= 0.5 && p.y < requestedY) p.y = Math.max(p.y, CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * Math.min(dt, 0.05));
      if (closeMix > 0.5 && !pilot.freeFalling) p.y = Math.max(CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * Math.min(dt, 0.05), Math.min(CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * Math.min(dt, 0.05), p.y));
      sweepCameraVolume(CAMERA_PREVIOUS, p, true);
      if (previousCaveIndex) {
        const previousOpening = CAMERA_OPENINGS[previousCaveIndex - 1];
        const along = (p.x - previousOpening.mouth.x) * previousOpening.sr + (p.z - previousOpening.mouth.z) * previousOpening.cr;
        if (along < previousOpening.planeZ && caveColumnAt(p.x, p.z, previousOpening, p.y) && p.y < CAMERA_COLUMN.ceiling) setCameraCave(previousCaveIndex);
      }
    } else if (player && followBoom && (!directView || previousCaveIndex)) {
      cameraHeadAt(CAMERA_VOLUME_FROM, player);
      if (cameraClearAt(CAMERA_VOLUME_FROM.x, CAMERA_VOLUME_FROM.y, CAMERA_VOLUME_FROM.z)) sweepCameraVolume(CAMERA_VOLUME_FROM, p, false);
    }
    if (player) {
      // Keep the exterior eye smooth through a doorway. Once it enters HQ,
      // the full swept follow rate keeps up with the continuous descents.
      // At the settled first-person endpoint the camera belongs to the head.
      // Do not tether it to an old eye position on the far side of a prop as
      // the character walks around that prop; only the short head-to-eye
      // segment must be clear.
      const fixedFirstPerson = followBoom && closeMix === 1 && cameraClearAt(p.x, p.y, p.z)
        && cameraSegmentClear(CAMERA_VOLUME_FROM.x, CAMERA_VOLUME_FROM.y, CAMERA_VOLUME_FROM.z, p.x, p.y, p.z);
      cameraManualContact = fixedFirstPerson ? false : followCameraMotion(p, player, dt, directView, smoothStep && closeMix === 0, closeMix, requestedStep, exteriorFlight) === true;
      if (fixedFirstPerson) {
        cameraTrailPlayer = player;
        cameraTrailCount = cameraTrailNext = 1;
        CAMERA_TRAIL[0] = p.x; CAMERA_TRAIL[1] = p.y; CAMERA_TRAIL[2] = p.z;
      }
      // Admission belongs to the resolved eye path. Boom clipping can leave
      // the eye inside even when the originally requested view was outside.
      let index = previousCaveIndex;
      if (cameraPreviousValid) for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
        const entry = CAMERA_OPENINGS[i], crossing = cameraCrossing(CAMERA_PREVIOUS, p, entry);
        if (!crossing.valid) continue;
        if (!index && crossing.direction > 0) index = entry.caveIndex;
        else if (index && crossing.direction < 0 && (index === entry.caveIndex || CAMERA_OPENINGS[index - 1].headquarters && entry.headquarters)) index = 0;
      }
      if (index && CAMERA_OPENINGS[index - 1].headquarters && (!island.cavityAt(p.x, p.z, CAMERA_COLUMN, island.headquarters.caveIndex, p.y) || p.y < CAMERA_COLUMN.floor + CAMERA_RADIUS || p.y > CAMERA_COLUMN.ceiling - CAMERA_RADIUS) && !headquartersWindowAirAt(p.x, p.y, p.z)) index = 0;
      setCameraCave(index);
      if (directView && !index) cameraManualContact = true;
      if (cameraManualContact) {
        setVec(CAMERA_MANUAL_VIEW, pilot.orbit.yaw, pilot.orbit.pitch, pilot.orbit.dist);
        const body = player.root.position;
        setVec(CAMERA_MANUAL_BODY, body.x, body.y, body.z);
      }
    } else {
      cameraTrailPlayer = null;
      cameraTrailCount = cameraTrailNext = 0;
    }
    const headquartersEye = player && followOpening && followOpening.headquarters && (p.y < -CAMERA_RADIUS || (p.x - followOpening.mouth.x) * followOpening.sr + (p.z - followOpening.mouth.z) * followOpening.cr < followOpening.planeZ - 1e-7);
    if ((undergroundAir && p.y < -CAMERA_RADIUS || headquartersEye) && !cameraCaveIndex && island.cavityAt(p.x, p.z, CAMERA_COLUMN, island.headquarters.caveIndex, p.y) && p.y >= CAMERA_COLUMN.floor + CAMERA_RADIUS && p.y < CAMERA_COLUMN.ceiling && cameraClearAt(p.x, p.y, p.z)) {
      // A swept eye can enter an open throat or window after its Ooga; the center identifies its layer.
      // The full cylinder checks rock at open column edges. The Mirror Cave still needs its own crossing.
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) if (CAMERA_OPENINGS[i].headquarters) {
        setCameraCave(CAMERA_OPENINGS[i].caveIndex);
        break;
      }
    }
    caveView = !!cameraCaveIndex;
    if (!caveView) {
      exteriorCameraFloorAt(p.x, p.y, p.z, clearance, smoothStep, closeMix, undergroundAir);
      cameraEntranceIndex = exteriorEntranceIndex;
    }
    const collided = Math.abs(p.x - requestedX) > 1e-7 || Math.abs(p.z - requestedZ) > 1e-7 || (freeMove || !!opening) && Math.abs(p.y - requestedY) > 1e-7;
    // The outdoor near plane is wider than the cave eye clearance.
    // Shorten it at low entrances/interiors so nearby jagged rock is not sliced away.
    camera.near = caveView || cameraEntranceIndex || closeMix > 0.5 || undergroundAir ? 0.1 : 0.5;
    setVec(CAMERA_PREVIOUS, p.x, p.y, p.z);
    cameraPreviousValid = true;
    if (matrixCave) {
      const portal = matrixCave.portal, m = matrixCave.mouth, dx = p.x - m.x, dz = p.z - m.z;
      portal.previousX = matrixCave.cr * dx - matrixCave.sr * dz;
      portal.previousY = p.y - m.floorY;
      portal.previousZ = matrixCave.sr * dx + matrixCave.cr * dz;
      portal.previousValid = true;
    }
    return collided;
  };

  const updateMeter = () => {
    let reloading = 0;
    for (let i = 0; i < crew.list.length; i++) if (crew.list[i].weapon.reloading) reloading++;
    hud.setMeter(world.level, METER_CAPACITY, reloading ? `${reloading} reloading · 6 shots per banana` : world.level < 1 ? "Waiting for bananas" : "Ready for reloads");
  };
  const setPhase = (next) => {
    const first = phase === null;
    phase = next;
    if (first) hud.setSubtitle("an island of caves");
    if (!first) hud.toast(PHASE_TOASTS[next]);
  };
  // The Timechain Sphere's walls in the shared board dialog: a page a wall, its source in the note.
  let timechainVersion = 0;
  const timechainBoard = {
    title: "Timechain Sphere", help: "Six walls of chain data. Arrow keys flip the boards.", wide: true,
    get canvas() { return timechainIsland.boards.entries[timechainIsland.boards.index].canvas; },
    get count() { return BL.timechainData.TITLES.length; }, get index() { return timechainIsland.boards.index; },
    get caption() { return BL.timechainData.TITLES[timechainIsland.boards.index]; },
    // The wall already shows the reading; the note only says where it comes from.
    get note() { return `Source: ${timechainIsland.boards.data[timechainIsland.boards.index].source}`; },
    get version() { return timechainVersion; },
    go: (i) => timechainIsland.boards.select(i)
  };
  const openTimechainBoard = (index) => {
    timechainIsland.boards.select(index);
    timechainVersion++;
    hud.openBoard(timechainBoard);
  };
  // The jumbotron's close-up in the shared board dialog, read straight off the board as it pages and repaints.
  const jumbotronBoard = {
    title: "Jumbotron", help: "OogaBoogaX on the big screen. Arrow keys flip the boards.", note: "",
    get canvas() { return jumbotron.canvas; }, get count() { return jumbotron.count; }, get index() { return jumbotron.index; },
    get caption() { return jumbotron.caption; }, get version() { return jumbotron.version; },
    go: (i) => jumbotron.goToView(i)
  };
  const openJumbotron = () => hud.openBoard(jumbotronBoard);
  // Contribution fireworks: shells rise from the jumbotron and burst in the
  // board's stat colors. Queued with absolute scene-clock times and stepped in
  // update(), so a waiting shell costs nothing per frame.
  const fireworksShells = [];
  const launchFireworks = (strength = 1) => {
    if (!jumbotronSpot || !fx) return 0;
    const shells = Math.min(6, 2 + Math.min(4, strength | 0));
    for (let i = 0; i < shells; i++) {
      fireworksShells.push({
        at: now + i * 0.38 + Math.random() * 0.2,
        phase: "launch",
        x: jumbotronSpot.x + (Math.random() - 0.5) * 2.6,
        y: jumbotronSpot.y,
        z: jumbotronSpot.z + (Math.random() - 0.5) * 1.4,
        rise: 2.2 + Math.random() * 1.4
      });
    }
    return shells;
  };
  const updateFireworks = () => {
    for (let i = fireworksShells.length - 1; i >= 0; i--) {
      const shell = fireworksShells[i];
      if (now < shell.at) continue;
      if (shell.phase === "launch") {
        // The rising shell: a fast spark streak with lift instead of drop.
        fx.spawnParticle(SPARK, shell.x, shell.y, shell.z, 0, shell.rise * 2.4, 0, 0.5, 10, -1.5, 0.03);
        shell.phase = "burst";
        shell.at = now + 0.5;
      } else {
        fx.burst(shell.x, shell.y + shell.rise, shell.z, 26, FIREWORK, 3.4);
        fx.burst(shell.x, shell.y + shell.rise, shell.z, 8, [SPARK], 1.6);
        fireworksShells.splice(i, 1);
      }
    }
  };
  const beginPitArrival = () => {
    const actor = pilot.player, hole = island.headquarters.basement.hole;
    BL.scene.updateWorld(root); solids.sync();
    const plan = BL.oogaPortalArrival.plan({ hole, dialer: pitGate.arrivalAnchor, radius: actor.bodyRadius, height: actor.bodyHeight,
      supportAt: (x, z, y) => playerSupportAt(x, z, y, y, actor),
      clearAt: (x, y, z, radius, height) => physicalClearAt(x, y, z, radius, height, actor) });
    if (!plan) throw new Error("No safe Ooga Portal arrival beside the Pit");
    pitArrival = { plan, time: 0, landed: false };
    pitGate.receive(); pilot.setActive(false); pilot.controls.reset(); input.reset(); hud.tooltip.hide();
    crew.relocatePlayer(plan.start, plan.heading); updatePitArrival(0);
  };
  const updatePitArrival = dt => {
    const arrival = pitArrival, plan = arrival.plan, actor = pilot.player;
    arrival.time = Math.min(plan.duration, arrival.time + Math.max(0, dt));
    BL.oogaPortalArrival.sample(plan, arrival.time, pitArrivalPoint);
    crew.relocatePlayer(pitArrivalPoint, plan.heading);
    // A stable basement-side camera keeps the rise and outward flight visible.
    camera.position.x = plan.landing.x + Math.sin(plan.heading) * 1.2 + Math.cos(plan.heading);
    camera.position.z = plan.landing.z + Math.cos(plan.heading) * 1.2 - Math.sin(plan.heading);
    camera.position.y = plan.landing.y + 2.8;
    camera.target.x = pitArrivalPoint.x; camera.target.y = pitArrivalPoint.y + actor.bodyHeight / 2; camera.target.z = pitArrivalPoint.z;
    updatePlayerCave(actor);
    if (arrival.time >= plan.duration && !arrival.landed) { arrival.landed = true; pitGate.finishReceiving(true); }
    if (arrival.landed && pitGate.state === "OFF") {
      pilot.navigate({ position: plan.landing, target: { x: plan.landing.x, y: plan.landing.y + 1, z: plan.landing.z }, yaw: plan.heading - Math.PI, pitch: 0.3, dist: 4 });
      pitArrival = null; input.reset(); pilot.controls.reset(); pilot.setActive(true); pilot.update(0);
    }
  };
  const update = (dt, elapsed) => {
    if (lawn && lawn.version !== island.path.version) layLawn();
    if (life) { life.gulls.update(elapsed); life.shore.update(elapsed); life.boats.update(elapsed); }
    now = elapsed;
    if (timechainIsland && !timechainIsland.boards && Math.hypot(camera.position.x - timechainIsland.place.x, camera.position.z - timechainIsland.place.z) < BL.timechainModels.SITE.radius + TIMECHAIN_NEAR) addTimechainBoards();
    pitGate.update();
    for (const control of pitGate.controls) {
      const angle = pitGate.on ? 0.42 : Math.PI - 0.42;
      control.lever.rotation.x += (angle - control.lever.rotation.x) * (1 - Math.exp(-8 * dt));
      control.setActive(pitGate.on);
    }
    if (pitDeparting) return; // The accepted fall stays frozen through the director fade.
    if (pitArrival) { updatePitArrival(dt); return; }
    hour = clock.read();
    daylight.sample(hour, RENDER_OPTS, clock.dayOfYear, islandLatitude, clock.continuousDay);
    RENDER_OPTS.time = elapsed;
    weather.update(dt, RENDER_OPTS);
    updateLamps(dt, elapsed, phase !== null);
    if (jumbotron) {
      jumbotron.update(elapsed, renderer);
      hud.updateBoard();
    }
    if (fireworksShells.length) updateFireworks();
    const next = daylight.phaseAt(hour);
    if (next !== phase) setPhase(next);
    if (DEBUG) syncDaylightDebug(hour);
    critters.update(dt, elapsed, RENDER_OPTS.day, RENDER_OPTS.stars, fire.k, 1);
    updateClouds(dt);
    solids.sync();
    updateSleepingSolids();
    if (clankerPlay.active) clankerPlay.readInput(dt);
    else pilot.readInput(dt);
    mirrorCave.damage.update(dt);
    syncMirrorDamage();
    mirrorCave.ripples.update(dt, elapsed);
    entropyLab.phase.update(dt, elapsed);
    prepareClankerRiders();
    prepareClankerStrike();
    clankers.update(dt);
    updateLabEquipment(dt);
    clankerMeshes.sync();
    carryClankerRiders();
    updateClankerEffects(dt);
    const fallingPlayer = pilot.player;
    if (fallingPlayer) Object.assign(pitPrevious, fallingPlayer.root.position);
    if (timechainIsland) {
      timechainIsland.site.turn((elapsed % TIMECHAIN_OUTER_PERIOD) * Math.PI * 2 / TIMECHAIN_OUTER_PERIOD);
      const s = timechainIsland.seat, decay = Math.exp(-1.15 * dt);
      s.angle = (s.angle + s.speed * (1 - decay) / 1.15) % (Math.PI * 2);
      s.speed *= decay;
      if (s.speed < 0.005) s.speed = 0;
      timechainIsland.site.swivel.rotation.y = s.angle;
      timechainIsland.show(dt);
    }
    crew.update(dt, elapsed);
    shareDrivenOoga();
    remotes.update(dt);
    // The pile's shared loop is heard from the driven Ooga, or from where the camera looks while roaming
    // free: the landing view looks at the pile from farther out than the loop carries.
    const listener = crew.player ? crew.player.root.position : camera.target;
    pileSound.update(dt, listener.x, listener.z);
    mempoolIsland.wildlife.update(dt, elapsed);
    // Sweep before any abyss equipment loss or respawn, including a whole-shaft fall in one step.
    if (!entering && !pilot.poseHeld && fallingPlayer && fallingPlayer === pilot.player
      && pitGate.traverse(pitPrevious, fallingPlayer.root.position, fallingPlayer.bodyRadius)) return;
    updateClankerDrags(dt);
    dockStairs.update(dt, pilot.player);
    updateRoomSigns(dt);
    pile.update(dt);
    const player = pilot.player;
    if (player && !pilot.poseHeld && player.root.position.y - player.baseY < ABYSS_RESPAWN_Y && abyssAt(player.root.position.x, player.root.position.z, player.root.position.y - player.baseY)) {
      loseAbyssAmmo(player);
      respawnAtPile();
    }
    else if (!player && !pilot.poseHeld && pilot.freeFalling && camera.position.y - CLOSE_VIEW.eyeHeight < ABYSS_RESPAWN_Y && abyssAt(camera.position.x, camera.position.z, camera.position.y - CLOSE_VIEW.eyeHeight)) respawnAtPile();
    updatePlayerCave(player);
    if (player && player.jet && !jetpackAllowed(player)) {
      crew.removeJetpack(player);
      pilot.showAct();
      hud.toast("No jetpacks under ground");
    }
    if (magazine && magazine.revealed) {
      const node = magazine.node;
      node.rotation.y += dt * 0.9;
      node.position.y = magazine.y + Math.sin(elapsed * 2) * 0.08;
      if (player && player.root.visible && player.state !== "sleeping") {
        const p = player.root.position, feet = p.y - player.baseY;
        const dx = p.x - node.position.x, dz = p.z - node.position.z;
        if (dx * dx + dz * dz < MAGAZINE_REACH * MAGAZINE_REACH
          && feet < node.position.y + 0.28 && feet + player.bodyHeight > node.position.y - 0.28) {
          const added = grantMagazine(player);
          if (added) {
            hud.toast(magazine ? `+${added} ammo · ${magazine.ammo} left` : "Spare magazine collected");
            if (!magazine) hud.hint("R selects the fullest spare · Space reloads near the pile", 5000);
          }
        }
      }
    }
    for (let i = 0; i < sleepers.length; i++) {
      const s = sleepers[i];
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = 1.6;
        fx.zzzAt(s.x, s.y, s.z);
      }
    }
    breakables.update(dt, elapsed);
    crates.update(dt, elapsed);
    fx.update(dt);
    stepTweens(dt);
    if (clankerPlay.active) clankerPlay.update(dt);
    // An inactive pilot would leave shoulder aim and orbit behind the modal.
    // Suspend camera updates until the destination menu returns input control.
    else if (!pitGate.isOpen) pilot.update(dt);
    updateBirdsEyeCutaway(dt);
    if (POSITION_DEBUG && elapsed >= positionDebugNext) {
      positionDebugNext = elapsed + 0.1;
      updatePositionDebug();
    }
    // clampCamera resolves the eye's entrance crossing inside pilot.update.
    // Commit portal and Matrix state after that, before rendering, so mirror and interior never disagree.
    syncMatrixInside(player);
    updateMatrixWorld(dt, elapsed);
    updateMatrixControl(dt, player);
    mirrorCave.body.update(dt);
    entropyLab.phase.body.update(dt);
    entropyLab.phase.body.time = entropyLab.phase.ripples.time;
    meterTimer -= dt;
    if (meterTimer <= 0) {
      meterTimer = 0.25;
      updateMeter();
    }
  };
  // Whether this visitor may take an Ooga: the rules live in `net.mayDrive`; working means the Ooga's
  // real activity, not a scene override (a return from DSB marks its Ooga working to wake it).
  const mayDriveOoga = (cave) => cave.contributor ? BL.net.mayDrive(cave.traits.name, contributors.stateFor(cave.contributor) === "working") : null;
  const RELEASE_WORDS = { "owner-here": "Its owner arrived and took their Ooga back", taken: "Someone else is already driving that Ooga", "not-yours": "Contributors drive only their own Ooga" };
  // The account or the room changed: an Ooga driven here that is no longer this visitor's to drive is let go.
  const onAccountChange = () => {
    claimOwnOoga();
    const driven = crew.player, released = BL.net.state.released;
    if (!driven) return;
    let refusal = BL.net.mayDrive(driven.traits.name, false);
    if (!refusal && released && released.name === driven.traits.name) refusal = RELEASE_WORDS[released.reason] || "That Ooga is not yours to drive";
    BL.net.state.released = null;
    if (!refusal) return;
    pilot.release(true);
    hud.toast(refusal);
  };
  // A signed-in contributor drives their own Ooga: once a visit, as soon as the account is known, unless
  // the visitor already drives another. Letting go keeps it let go until the next visit.
  const claimOwnOoga = () => {
    const me = BL.net.state.me;
    if (ownOogaClaimed || !me) return;
    const character = BL.net.ownCharacter();
    const cave = character && crew.cavemen.get(character.handle);
    if (!cave || pilot.player) {
      ownOogaClaimed = true;
      return;
    }
    // Another tab of this account drives it: its remote copy has sent this one away.
    if (crew.stateOf(cave) === "away") return;
    ownOogaClaimed = true;
    if (!contributors.debugState && crew.stateOf(cave) !== "working") {
      cave.override = "working";
      crew.refreshStates(true);
    }
    pilot.possess(cave);
    if (crew.player === cave) hud.toast(`Welcome back, ${BL.characters.displayOf(character.handle)}: this Ooga is yours`);
  };
  // The place the driven Ooga is in, as the room names it for voice: out on the island, HQ (every HQ
  // entrance leads to the one HQ), or one cave by its mouth. Named once per opening, never per frame.
  const zoneNames = [];
  const zoneName = (index) => {
    if (!index) return "outside";
    if (!zoneNames[index]) {
      const opening = CAMERA_OPENINGS[index - 1];
      zoneNames[index] = opening.headquarters ? "hq" : `cave-${String(opening.id).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 27)}`;
    }
    return zoneNames[index];
  };
  // The room sees the Ooga this visitor drives, by name, and where its feet are; none when free roaming.
  const shareDrivenOoga = () => {
    const driven = crew.player;
    BL.net.setBody(driven ? driven.traits.name : null);
    if (driven) BL.net.setZone(zoneName(playerCaveIndex));
    if (driven) BL.net.sendPose(driven.root.position.x, driven.root.position.y - driven.baseY, driven.root.position.z, driven.root.rotation.y);
  };
  const drawExtra = (ctx2d, project, drawBubble) => {
    crew.drawQuotes(ctx2d, project, drawBubble);
    remotes.drawNames(ctx2d, project);
    breakables.drawOverlay(ctx2d);
  };
  const cameraPlatformAt = (x, y, z) => y >= 0 && y <= ALTAR_HEIGHT && Math.hypot(x, z) <= altar.platformRadius;
  // One solid mask spans the terrain, dais and fruit contact.
  // The fruit pass supplies its own color over this opaque backing, including shared edges.
  const cameraRockAt = (x, y, z) => cameraPlatformAt(x, y, z) || bananaCover.contains(x, y, z)
    || island.solidAt(x, y, z) || !island.clearAt(x, y, z, 1e-5, 2e-5) || !entranceSegmentClear(x, y, z, x, y, z, 1e-5);
  const cameraRockMaterialAt = (x, y, z) => cameraPlatformAt(x, y, z) ? altar.slab.geometry.faces[0].color : island.rockMaterialAt(x, y, z);
  const bananaLightVisibleAt = (x, y, z, lx, ly, lz) => {
    const reach = RENDER_OPTS.shadowExtent * 3, toX = x + lx * reach, toY = y + ly * reach, toZ = z + lz * reach;
    return island.sightClearAt(x, y, z, toX, toY, toZ) && solids.segmentClear(x, y, z, toX, toY, toZ, 0, 1e-5)
      && bananaCover.segmentClear(x, y, z, toX, toY, toZ);
  };
  const cameraGlyphCoverage = (x, y, z) => {
    const caveIndex = island.rockCaveAt(x, y, z);
    if (caveIndex && caveIndex === MATRIX_WORLD.permanentCave) {
      const plane = MATRIX_WORLD.permanentPlane, aperture = MATRIX_WORLD.permanentAperture, at = (caveIndex - 1) * 4;
      const depth = -(plane[0] * x + plane[1] * y + plane[2] * z + plane[3]), bounds = MATRIX_WORLD.caveBounds, caves = MATRIX_WORLD.caves;
      const across = caves[at + 1] * (x - bounds[at]) - caves[at] * (z - bounds[at + 2]), height = y - bounds[at + 1];
      const room = depth > aperture[2] + 2.5 - aperture[3], throat = depth <= aperture[2];
      const half = throat ? aperture[0] : aperture[0] + (room ? 0.5 : 0) + aperture[3], ceiling = aperture[1] + (room && !throat ? 1 : 0);
      if (depth >= -1e-6 && depth <= bounds[at + 3] + aperture[3] && Math.abs(across) <= half + 1e-6 && height >= -1e-6 && height <= ceiling + 1e-6) return 1;
    }
    return matrixCoverage(x, z, caveIndex);
  };
  // Outline contrast is global.
  // Material within rock follows the same cave ownership and radial front as the rendered stone surfaces.
  const CAMERA_GLYPHS = { coverageAt: cameraGlyphCoverage, version: 0, time: 0, radius: -1, active: -1, permanentCave: -1 };
  const guideSegmentClear = (x, y, z, toX, toY, toZ) => island.sightClearAt(x, y, z, toX, toY, toZ);
  guideSegmentClear.boxClear = (minX, minY, minZ, maxX, maxY, maxZ) => island.sightBoxClearAt(minX, minY, minZ, maxX, maxY, maxZ);
  guideSegmentClear.boxSolid = (minX, minY, minZ, maxX, maxY, maxZ) => island.sightBoxSolidAt(minX, minY, minZ, maxX, maxY, maxZ);
  const GUIDE_RAMP_COLUMN = { floor: 0, ceiling: 0 };
  const exteriorRampGuides = (player) => {
    const eye = camera.position, p = player.root.position, feet = p.y - player.baseY;
    // The exception is for the descent, not the flat entrance corridor or an eye in another room/window.
    if (feet >= -0.1) return false;
    const outside = !island.onLand(eye.x, eye.z)
      || eye.y < -Math.ceil(island.undersideDepthAt(Math.hypot(eye.x, eye.z)) / island.unit) * island.unit;
    if (!outside) return false;
    for (let layer = 0; layer < 2; layer++) if (island.rampColumnAt(p.x, p.z, !!layer, GUIDE_RAMP_COLUMN)
      && feet >= GUIDE_RAMP_COLUMN.floor - 0.3 && feet < GUIDE_RAMP_COLUMN.ceiling) return true;
    return false;
  };
  const guideEyeAt = (player, out) => {
    // A full turn uses one stable eye anchor, independent of current head yaw.
    // A resting head keeps the same pillow clearance as first person.
    cameraHeadAt(out, player);
    if (!crew.sleeping) out.y += player.viewLift;
  };
  const GUIDE_ACTOR_FORWARD = new Float64Array(3);
  const guideActorVisibleAt = (x, y, z) => {
    const p = camera.position, dx = x - p.x, dy = y - p.y, dz = z - p.z;
    const depth = dx * GUIDE_ACTOR_FORWARD[0] + dy * GUIDE_ACTOR_FORWARD[1] + dz * GUIDE_ACTOR_FORWARD[2];
    const start = camera.near / depth, end = 1 - 0.018 / Math.hypot(dx, dy, dz);
    if (end <= start) return false;
    const ax = p.x + dx * start, ay = p.y + dy * start, az = p.z + dz * start, bx = p.x + dx * end, by = p.y + dy * end, bz = p.z + dz * end;
    return guideSegmentClear(ax, ay, az, bx, by, bz) && objectGuides.cameraClear(ax, ay, az, bx, by, bz, crew.player, crew.player.root);
  };
  // Built with the visit; deferring past first paint was tried and reverted.
  // The build blocks the main thread ~0.5 s with no paint: the curtain jumps and camera easing loses that time.
  const ensureRockGuides = () => rockGuides
    || (rockGuides = BL.rockGuides.create({ island, sealed: sealedCaves }));
  const trackMirrorObject = (node, radius, vertexCapacity) => {
    entropyLab?.phase?.body?.track(node, radius, vertexCapacity);
    return mirrorCave?.body?.track(node, radius, vertexCapacity);
  };
  const untrackMirrorObject = (node) => {
    entropyLab?.phase?.body?.untrack(node);
    return mirrorCave?.body?.untrack(node);
  };
  const refreshMirrorObject = (node) => {
    mirrorCave?.body?.refresh(node);
    entropyLab?.phase?.body?.refresh(node);
    if (crew) for (let i = 0; i < crew.list.length; i++) {
      const actor = crew.list[i];
      if (actor.root !== node) continue;
      MIRROR_ACTOR_RADII.delete(actor);
      mirrorActorRadius(actor);
      break;
    }
  };
  // Full limbs remain solid against scenery. Gorilla peers reserve their torsos
  // once per complete rig sweep; arm slices may then overlap those same peers.
  let clankerPassingEntry = null;
  const clankerPassingPeer = (entry, other) => !!entry && entry === clankerPassingEntry && other !== entry;
  const clankerPeersClear = (entry, x, y, z, toX, toY, toZ, fromHeading, toHeading, strictEnd = false) => {
    if (!clankers) return true;
    for (const other of clankers.list) {
      if (other === entry || !other.active) continue;
      const p = other.root.position, shape = BL.agent.torso;
      // A pose preview has already installed the destination trunk. Do not
      // mistake its expansion into a neighbour for escaping an old overlap.
      if (strictEnd && shape.overlaps(entry, toX, toY, toZ, toHeading,
        other, p.x, p.y, p.z, other.heading, 0.03)) return false;
      if (!shape.separates(entry, x, y, z, fromHeading, toX, toY, toZ, toHeading,
        other, p.x, p.y, p.z, other.heading, 0.03)) return false;
    }
    return true;
  };
  const clankerCylinderClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null, climbing = false, actors = true, checkTerrain = true, toRadius = radius, toHeight = height) => {
    const fromRadius = radius, fromHeight = height;
    radius = Math.max(radius, toRadius); height = Math.max(height, toHeight);
    const floor = y + 0.002, toFloor = toY + 0.002, body = height - 0.002;
    if (!climbing && !island.onLand(toX, toZ) || crossesSealedCave(x, z, toX, toZ, y)
      || checkTerrain && (!island.clearAt(toX, toFloor, toZ, radius, body)
        || !island.voxelSegmentClearAt(x, floor, z, toX, toFloor, toZ, radius, body))
      || !solids.segmentClear(x, floor, z, toX, toFloor, toZ, fromRadius, fromHeight - 0.002, ignore, toRadius, toHeight - 0.002)
      || !matrixGateSegmentClear(x, floor, z, toX, toFloor, toZ, radius, body, true)
      || !cylinderSegmentClear(x, floor, z, toX, toFloor, toZ, radius, body, 0, 0, 0, 64,
        Math.max(altar.platformRadius, island.path.debug.ringOuterRadius) + 0.4)) return false;
    for (let i = 0; i < fireHazards.length && !(entry && (entry.controlled || entry.fire.burning)); i++) {
      const fire = fireHazards[i];
      if (fire.pit.visible && !cylinderSegmentClear(x, floor, z, toX, toFloor, toZ, radius, body,
        fire.x, fire.z, fire.y, fire.y + FIRE_TOP, fire.avoidRadius - PLAYER_RADIUS)) return false;
    }
    if (!actors) return true;
    for (let i = 0; i < crew.list.length; i++) {
      const other = crew.list[i], p = other.root.position;
      if (!other.root.visible || entry && (other.clankerRide?.entry === entry || entry.drag.cave === other)) continue;
      const bounds = actorBounds(other);
      if (other.root.quaternion) {
        if (!terrain.segmentBoxClear(x, floor, z, toX - x, toFloor - floor, toZ - z, radius, body, bounds[0], bounds[1], bounds[2], bounds[3], bounds[4], bounds[5])) return false;
      } else if (!cylinderSegmentClear(x, floor, z, toX, toFloor, toZ, radius, body, p.x, p.z, bounds[1], bounds[4], BODY_RADIUS)) return false;
    }
    if (clankers) for (let i = 0; i < clankers.list.length; i++) {
      const other = clankers.list[i];
      if (other !== entry && other !== ignore && other.active && !clankerPassingPeer(entry, other)
        && !clankerBodySegmentClear(other, x, floor, z, toX, toFloor, toZ, radius, body)) return false;
    }
    return true;
  };
  const clankerRigClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null,
    fromHeading = entry ? entry.heading : 0, toHeading = fromHeading) => {
    // Prop nudges also use this callback with a gorilla to ignore. Their own
    // smaller cylinder remains a prop; only a complete companion uses its rig.
    if (!entry || ignore || radius !== entry.radius || height !== entry.height) {
      return clankerCylinderClear(x, y, z, toX, toY, toZ, radius, height, entry, ignore);
    }
    if (!clankerRidersClear(entry, x, y, z, toX, toY, toZ, fromHeading, toHeading)) return false;
    const labPose = entry.planningLab || entropyLab.phase.inside(toX, toY, toZ)
      && !entry.gorilla.motionActive && !entry.pound && !entry.beat && !entry.climb.active;
    if (labPose) return entry.gorilla.labPoseClear(entry.planningLab ? 2 : entry.motion.labDt || 1 / 60,
      toX, toY, toZ, toHeading, entry.speed, entry.planningLab ? entry.planningLabWork : entry.motion.labWork,
      entry.motion.labPhase, entry.planningLab ? entry.planningLabSide : entry.motion.labSide,
      island.solidAt, clankerClimbTransitionClear, entry, entry.planningLab || !entry.motion.lab);
    // Crossing the entrance changes the rig immediately. Reserve the outside
    // quadruped before leaving, while the current upright body is still narrow.
    if (entry.motion.lab && !entry.gorilla.motionActive && !entry.climb.active) {
      clankerExitBodyPending = true;
      if (!entry.gorilla.labPoseClear(2, toX, toY, toZ, toHeading, entry.speed, "", 0, 1,
        island.solidAt, clankerExitTransitionClear, entry, true, false)) return false;
    }
    return BL.agent.footprint.sweep(entry, x, y, z, toX, toY, toZ, radius, height,
      fromHeading, toHeading, clankerCylinderClear, ignore);
  };
  const clankerClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null,
    fromHeading = entry ? entry.heading : 0, toHeading = fromHeading) => {
    const previousEntry = clankerPassingEntry;
    clankerPassingEntry = null;
    try {
      if (entry && !ignore && clankers && radius === entry.radius && height === entry.height && !entry.climb.active) {
        clankerPassingEntry = entry;
        // Retained route planning handles moving peers separately. Terrain,
        // furniture, humans and riders still receive their complete checks.
        if (!entry.planningLabTraffic && !entry.planningRoam
          && !clankerPeersClear(entry, x, y, z, toX, toY, toZ, fromHeading, toHeading)) return false;
      }
      return clankerRigClear(x, y, z, toX, toY, toZ, radius, height, entry, ignore, fromHeading, toHeading);
    } finally {
      clankerPassingEntry = previousEntry;
    }
  };
  const clankerUnderCanopy = (entry) => {
    const p = entry.root.position, shape = BL.agent.footprint;
    const sine = Math.sin(entry.heading), cosine = Math.cos(entry.heading);
    const radius = shape.radius(entry) + (entry.lowCover ? 0.25 : 0.08);
    for (let i = 0; i < props.length; i++) {
      const prop = props[i], node = prop.node, geometry = node.geometry;
      if (prop.prop !== "tree" || !node.visible) continue;
      const q = node.position, floor = q.y + geometry.treeCanopyFloor * node.scale.y;
      if (p.y + 3.2 < floor || p.y >= q.y + BL.scene.boundsOf(geometry).max[1] * node.scale.y - 0.02) continue;
      const reach = geometry.treeRadius * Math.max(node.scale.x, node.scale.z) + radius;
      for (let part = 0; part < shape.count(entry); part++) {
        const offset = shape.offset(entry, part);
        if ((p.x + sine * offset - q.x) ** 2 + (p.z + cosine * offset - q.z) ** 2 < reach * reach) return true;
      }
    }
    return false;
  };
  const clankerClimbClear = (entry, x, y, z, nx, ny, nz, radius, height, riders = true, actors = true, peers = true) => {
    const previous = clankerPassingEntry;
    if (!peers) clankerPassingEntry = entry;
    try {
      return (!riders || clankerRidersClear(entry, x, y, z, nx, ny, nz, entry.heading, entry.heading))
        && clankerCylinderClear(x, y, z, nx, ny, nz, radius, height, entry, null, true, actors);
    } finally { clankerPassingEntry = previous; }
  };
  // At a lip the bent rig fits where a tall cylinder cannot. The controller
  // checks that exact terrain pose; scenery, other bodies and riders stay solid.
  const clankerClimbTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors = true, riders = true, toRadius = radius, toHeight = height, peers = true, part = null) => {
    const previous = clankerPassingEntry;
    if (!peers) clankerPassingEntry = entry;
    const bench = (entry.motion.lab || entry.planningLab) && part === entry.gorilla.parts.armR ? entry.gorilla.labPickupBench : null;
    try {
      return (!riders || clankerRidersClear(entry, x, y, z, nx, ny, nz, entry.heading, entry.heading))
        && clankerCylinderClear(x, y, z, nx, ny, nz, radius, height, entry, bench, true, actors, false, toRadius, toHeight);
    } finally { clankerPassingEntry = previous; }
  };
  const clankerRestTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) => {
    const c = entry.climb;
    if (c.peerCheck) {
      c.peerCheck = false;
      const p = entry.root.position;
      if (!clankerPeersClear(entry, c.peerX, c.peerY, c.peerZ, p.x, p.y, p.z,
        c.peerHeading, entry.root.rotation.y, true)) return false;
    }
    return clankerClimbTransitionClear(entry, x, y, z, nx, ny, nz,
      radius, height, actors, riders, toRadius, toHeight, false);
  };
  const clankerRestPoseClear = (entry, dt, lounge, staticPose = false,
    x = entry.root.position.x, y = entry.root.position.y, z = entry.root.position.z, heading = entry.heading, fromLounge = null, sequenceStep = 0) => {
    const p = entry.root.position, c = entry.climb;
    const sx = staticPose ? x : p.x, sy = staticPose ? y : p.y, sz = staticPose ? z : p.z;
    const fromHeading = staticPose ? heading : entry.heading;
    if (!clankerRidersClear(entry, sx, sy, sz, x, y, z, fromHeading, heading)) return false;
    c.peerX = sx; c.peerY = sy; c.peerZ = sz; c.peerHeading = fromHeading; c.peerCheck = true;
    try {
      return entry.gorilla.climbPoseClear(dt, x, y, z, heading, entry.motion,
        island.solidAt, clankerRestTransitionClear, entry, 0, staticPose, lounge, fromLounge, sequenceStep);
    } finally { c.peerCheck = false; }
  };
  clankerRestTransitionClear.beginPose = entry => { entry.climb.peerCheck = true; };
  let clankerExitBodyPending = false;
  const clankerExitTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) => {
    if (clankerExitBodyPending) {
      clankerExitBodyPending = false;
      const mode = entry.footprintMode, compact = entry.compact, previousRadius = entry.radius, previousHeight = entry.height, p = entry.root.position;
      // The rig is temporarily in its real future pose here. Reserve the same
      // walking envelope the controller will use immediately outside the lab.
      entry.footprintMode = "pound"; entry.compact = entry.gorilla.poundCompact;
      entry.radius = Math.max(BL.clankers.WALK_RADIUS, entry.gorilla.bodyRadius + 0.1);
      entry.height = Math.max(BL.clankers.WALK_HEIGHT, entry.gorilla.bodyHeight + 0.04);
      let clear = true;
      for (const other of clankers.list) {
        if (other === entry || !other.active) continue;
        const q = other.root.position;
        const shape = clankerPassingPeer(entry, other) ? BL.agent.torso : BL.agent.footprint;
        if (shape.overlaps(entry, p.x, p.y, p.z, entry.root.rotation.y,
          other, q.x, q.y, q.z, other.heading, 0.03)) { clear = false; break; }
      }
      entry.footprintMode = mode; entry.compact = compact;
      entry.radius = previousRadius; entry.height = previousHeight;
      if (!clear) return false;
    }
    return clankerClimbTransitionClear(entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight);
  };
  const clankerGroomClear = (entry, partner) => {
    const p = entry.root.position, sine = Math.sin(entry.heading), cosine = Math.cos(entry.heading), side = entry.motion.groomSide;
    const x = p.x + cosine * side * 0.7 + sine * 0.3, z = p.z - sine * side * 0.7 + cosine * 0.3;
    const nx = p.x + cosine * side * 1.55 + sine * 0.55, nz = p.z - sine * side * 1.55 + cosine * 0.55;
    return clankerCylinderClear(x, p.y + 1.1, z, nx, p.y + 1.1, nz, 0.22, 0.5, entry, partner);
  };
  const clankerFireContact = (entry, fromX, fromY, fromZ) => {
    if (entry.fire.burning || entry.fire.cooldown > 0) return false;
    const p = entry.root.position, samples = Math.min(8, Math.max(1, Math.ceil(Math.hypot(p.x - fromX, p.y - fromY, p.z - fromZ) / 0.2)));
    for (let i = 0; i < fireHazards.length; i++) {
      const hazard = fireHazards[i];
      if (!hazard.node.visible) continue;
      for (let s = 0; s <= samples; s++) {
        const k = s / samples;
        if (BL.agent.footprint.circleOverlaps(entry, lerp(fromX, p.x, k), lerp(fromY, p.y, k), lerp(fromZ, p.z, k), entry.heading,
          hazard.x, hazard.y + FIRE_BOTTOM, hazard.z, FIRE_CONTACT_RADIUS, FIRE_TOP - FIRE_BOTTOM)) return true;
      }
    }
    return false;
  };
  const canClankerSmash = (entry) => {
    const p = entry.root.position;
    // Keep the torso planted; the striking arms must be allowed to contact a
    // target. Their swept mesh supplies the hit instead of a radial damage area.
    return clankerCylinderClear(p.x, p.y, p.z, p.x, p.y, p.z, 0.8, 2.7, entry);
  };
  const clankerSupportAt = (entry, x, z, y, step, heading = entry.heading, props = true) => {
    // Upright scientists stand on their feet. An arm reaching a keyboard is
    // not a foot landing on that desk, even though it belongs to the body sweep.
    if (entry.motion.lab && !entry.drive.airborne && !entry.gorilla.motionActive) {
      const floor = island.supportAt(x, z, y, Math.min(step, STEP_MAX), ABYSS_FLOOR, 0.45);
      return props ? Math.max(floor, solids.supportAt(x, z, y, step, 0.45)) : floor;
    }
    // The landing surface must cover the same body footprint as the sweep.
    // A leading arm can reach a prop before the torso is directly above it.
    const shape = BL.agent.footprint, radius = shape.radius(entry);
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    let floor = ABYSS_FLOOR;
    for (let part = 0; part < shape.count(entry); part++) {
      const offset = shape.offset(entry, part), px = x + sine * offset, pz = z + cosine * offset;
      floor = Math.max(floor, island.supportAt(px, pz, y, Math.min(step, STEP_MAX), ABYSS_FLOOR, radius));
      if (props) floor = Math.max(floor, solids.supportAt(px, pz, y, step, radius));
    }
    return floor;
  };
  // Compare support using the same footprint so a terrain tread beneath a
  // leading limb cannot be mistaken for standing on a raised prop.
  const clankerTerrainSupportAt = (entry, x, z, y, step, heading = entry.heading) =>
    clankerSupportAt(entry, x, z, y, step, heading, false);
  // Props remain live blockers throughout a climb, but never become a cached
  // wall-route endpoint. A spawned rock beneath a dismount therefore blocks or
  // reverses that route; destroying it reopens the terrain landing immediately.
  const clankerClimbSolidAt = (x, y, z) => island.solidAt(x, y, z);
  const clankerClimbSurfaceAt = (x, z) => island.surfaceAt(x, z);
  const LAB_ITEM_INVERSE = math.mat4.create(), LAB_ITEM_LOCAL = math.mat4.create();
  const placeLabDie = (item) => {
    const n = item.node, r = item.roll;
    BL.scene.updateLocal(n);
    // The original die geometry has its base at zero. Rotate around its centre
    // so tipping onto another face never drives a corner through the table.
    const m = n.local, rx = 0.13 * (Math.abs(m[0]) + Math.abs(m[4]) + Math.abs(m[8]));
    const ry = 0.13 * (Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]));
    const rz = 0.13 * (Math.abs(m[2]) + Math.abs(m[6]) + Math.abs(m[10]));
    const table = item.table;
    if (r.cx < table.minX + rx || r.cx > table.maxX - rx) { r.cx = clamp(r.cx, table.minX + rx, table.maxX - rx); r.vx *= -0.35; }
    if (r.cz < table.minZ + rz || r.cz > table.maxZ - rz) { r.cz = clamp(r.cz, table.minZ + rz, table.maxZ - rz); r.vz *= -0.35; }
    if (r.cy < table.y + ry + 0.001) {
      r.cy = table.y + ry + 0.001;
      if (r.vy < -0.2) { r.bounces++; r.vy *= -0.32; r.vx *= 0.72; r.vz *= 0.72; r.wx *= 0.58; r.wy *= 0.58; r.wz *= 0.58; }
      else r.vy = 0;
    }
    setVec(n.position, r.cx - m[4] * 0.13, r.cy - m[5] * 0.13, r.cz - m[6] * 0.13);
  };
  const settleLabDie = (item) => {
    const n = item.node, r = item.roll;
    setVec(n.rotation, r.tx, r.ty, r.tz);
    r.cy = item.table.y + 0.131; r.vx = r.vy = r.vz = 0;
    placeLabDie(item);
    setVec(item.home, n.position.x, n.position.y, n.position.z);
    setVec(item.homeRotation, n.rotation.x, n.rotation.y, n.rotation.z);
    const m = item.parent.world, y = r.cy + 0.13;
    setVec(item.pickup, m[0] * r.cx + m[4] * y + m[8] * r.cz + m[12],
      m[1] * r.cx + m[5] * y + m[9] * r.cz + m[13], m[2] * r.cx + m[6] * y + m[10] * r.cz + m[14]);
    item.rolling = false;
  };
  const rollLabEquipment = (entry, index) => {
    const item = entropyLab.equipment[index];
    if (!item || item.kind !== "die" || item.holder !== entry || entry.gorilla.labItem !== item.node) return false;
    const n = item.node, r = item.roll;
    BL.scene.updateWorld(entry.root, entry.root.parent.world);
    math.mat4.invert(LAB_ITEM_INVERSE, item.parent.world);
    math.mat4.multiply(LAB_ITEM_LOCAL, LAB_ITEM_INVERSE, n.world);
    const m = LAB_ITEM_LOCAL;
    r.cx = m[12] + m[4] * 0.13; r.cy = m[13] + m[5] * 0.13; r.cz = m[14] + m[6] * 0.13;
    entry.gorilla.releaseLabItem(); addChild(item.parent, n);
    refreshMirrorObject(entry.root);
    setVec(n.scale, 1, 1, 1);
    setVec(n.rotation, Math.asin(clamp(-m[9], -1, 1)), Math.atan2(m[8], m[10]), Math.atan2(m[1], m[5]));
    r.time = 0; r.bounces = 0;
    r.vx = (entry.random() - 0.5) * 0.22; r.vy = 0.9 + entry.random() * 0.4;
    r.vz = -0.22 - entry.random() * 0.2;
    r.wx = 5 + entry.random() * 4; r.wy = 4 + entry.random() * 3; r.wz = 3 + entry.random() * 5;
    // Land on one of the original die's six faces; the object stays where it
    // settled, becoming the next pickup point instead of snapping back home.
    const face = Math.floor(entry.random() * 6), quarter = Math.PI / 2;
    r.tx = (face < 4 ? face : 0) * quarter; r.tz = face < 4 ? 0 : (face === 4 ? 1 : -1) * quarter;
    r.ty = Math.floor(entry.random() * 4) * quarter;
    item.rolling = true;
    return true;
  };
  const updateLabEquipment = (dt) => {
    let screens = 0;
    for (const e of clankers.list) if (e.active && e.motion.lab && (e.motion.labWork === "type" || e.motion.labWork === "touch")) screens |= 1 << e.lab.station;
    entropyLab.updateScreens(dt, screens);
    for (const item of entropyLab.equipment) {
      if (!item.rolling) continue;
      const r = item.roll, rotation = item.node.rotation;
      let remaining = Math.min(dt, 0.25);
      while (remaining > 1e-8) {
        const step = Math.min(remaining, 1 / 120); remaining -= step; r.time += step;
        r.vy -= 7 * step; r.cx += r.vx * step; r.cy += r.vy * step; r.cz += r.vz * step;
        if (r.time < 0.9) { rotation.x += r.wx * step; rotation.y += r.wy * step; rotation.z += r.wz * step; }
        else {
          const blend = 1 - Math.exp(-12 * step), drag = Math.exp(-8 * step);
          rotation.x += Math.atan2(Math.sin(r.tx - rotation.x), Math.cos(r.tx - rotation.x)) * blend;
          rotation.y += Math.atan2(Math.sin(r.ty - rotation.y), Math.cos(r.ty - rotation.y)) * blend;
          rotation.z += Math.atan2(Math.sin(r.tz - rotation.z), Math.cos(r.tz - rotation.z)) * blend;
          r.vx *= drag; r.vz *= drag;
        }
        placeLabDie(item);
      }
      if (r.time >= 1.8) settleLabDie(item);
    }
  };
  const returnLabEquipment = (entry) => {
    for (const item of entropyLab.equipment) {
      if (item.holder !== entry) continue;
      if (item.kind === "die" && item.node.parent === item.parent) {
        if (item.rolling) settleLabDie(item);
        item.holder = null;
        return true;
      }
      entry.gorilla.releaseLabItem();
      addChild(item.parent, item.node);
      refreshMirrorObject(entry.root);
      setVec(item.node.position, item.home.x, item.home.y, item.home.z);
      setVec(item.node.rotation, item.homeRotation.x, item.homeRotation.y, item.homeRotation.z);
      setVec(item.node.scale, item.homeScale.x, item.homeScale.y, item.homeScale.z);
      item.node.quaternion = null; item.node.visible = true; item.holder = null; item.rolling = false;
      return true;
    }
    return false;
  };
  const pickUpLabEquipment = (entry, index) => {
    const item = entropyLab.equipment[index], p = entry.root.position;
    if (!item || item.holder || entry.gorilla.labItem || !entry.motion.lab
      || Math.hypot(p.x - item.pickup.x, p.z - item.pickup.z) > 2.1
      || Math.abs(p.y - entropyLab.mouth.floorY) > 0.2) return false;
    entry.gorilla.holdLabItem(item.node);
    refreshMirrorObject(entry.root);
    item.holder = entry;
    return true;
  };
  const clankerCameraClear = (x, y, z, toX, toY, toZ) =>
    island.voxelSegmentClearAt(x, y, z, toX, toY, toZ, 0.1, 0.15)
    && solids.segmentClear(x, y, z, toX, toY, toZ, 0.1, 0.15);
  const constrainClankerCamera = (entry, view) => {
    const a = view.target, b = view.position;
    let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let low = 0, high = 1;
    if (clankerCameraClear(a.x, a.y, a.z, b.x, b.y, b.z)) return;
    // A lagging target can cut a corner through stone. Start the boom at the
    // actual body before shortening it, so a blocked origin cannot erase the
    // camera's look direction by collapsing the eye onto its target.
    if (!clankerCameraClear(a.x, a.y, a.z, a.x, a.y, a.z)) {
      const p = entry.root.position;
      a.x = p.x; a.y = p.y + (entry.fire.rolling ? 0.7 : 1.25); a.z = p.z;
      b.x = a.x + dx; b.y = a.y + dy; b.z = a.z + dz;
    }
    if (Math.hypot(dx, dy, dz) < 0.01) {
      dx = -Math.sin(entry.heading) * 0.1; dy = 0.04; dz = -Math.cos(entry.heading) * 0.1;
    }
    for (let i = 0; i < 9; i++) {
      const k = (low + high) * 0.5, x = a.x + dx * k, y = a.y + dy * k, z = a.z + dz * k;
      if (clankerCameraClear(a.x, a.y, a.z, x, y, z)) low = k;
      else high = k;
    }
    low = Math.max(low, Math.min(1, 0.01 / Math.hypot(dx, dy, dz)));
    b.x = a.x + dx * low; b.y = a.y + dy * low; b.z = a.z + dz * low;
  };
  const prepareClankerStrike = () => {
    const entry = clankers.player;
    if (!entry) return;
    const combat = entry.combat;
    if (!entry.pound) { combat.hit = combat.groundChecked = false; return; }
    BL.scene.updateWorld(entry.root, root.world);
    combat.left.set(entry.gorilla.parts.armL.world);
    combat.right.set(entry.gorilla.parts.armR.world);
  };
  const updateClankerEffects = (dt) => {
    for (let i = 0; i < clankers.list.length; i++) {
      const entry = clankers.list[i];
      if (!entry.active) continue;
      const f = entry.fire, parts = entry.renderParts;
      const heat = f.burning ? f.heat * (f.rolling ? Math.max(0, 1 - f.rollTime / 3) : 1) : 0;
      for (let j = 0; j < parts.length; j++) { parts[j].ember = heat; parts[j].scorch = f.soot; }
      if (f.burning || f.soot > 0.7) {
        entry.fireFX.next -= dt;
        if (entry.fireFX.next <= 0) {
          entry.fireFX.next = f.burning ? 0.08 : 0.2;
          BL.scene.updateWorld(entry.root, root.world);
          const part = parts[Math.floor(Math.random() * parts.length)], b = BL.scene.boundsOf(part.geometry), m = part.world;
          const x = lerp(b.min[0], b.max[0], Math.random()), y = lerp(b.min[1], b.max[1], Math.random()), z = b.max[2];
          fx.spawnParticle(f.burning ? CLANKER_FIRE[i % 2] : CLANKER_SMOKE,
            m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
            0, 0.8, 0, 0.65, 2, -0.2, -Infinity);
        }
      }
      if (!entry.controlled || !entry.actionControlled || entry.pound > 0.43 || entry.pound < 0.17) continue;
      const combat = entry.combat;
      BL.scene.updateWorld(entry.root, root.world);
      for (let hand = 0; hand < 2; hand++) {
        const part = hand ? entry.gorilla.parts.armR : entry.gorilla.parts.armL, previous = hand ? combat.right : combat.left;
        mirrorCave.ripples.strike(previous, part.world, part.geometry, dt);
        if (!combat.hit && input.weaponTargets.strike(CLANKER_HIT, previous, part.world, part.geometry)) {
          combat.hit = true;
          weaponImpact(entry, CLANKER_HIT, Math.sin(entry.heading), -1, Math.cos(entry.heading), entry.poundPower);
        }
      }
      if (!combat.hit && !combat.groundChecked && entry.poundHit) {
        // The planted smash lands at floor height. Continue its short forward
        // ground impact to a nearby breakable when the fist mesh stops short.
        combat.groundChecked = true;
        const p = entry.root.position, sx = Math.sin(entry.heading), sz = Math.cos(entry.heading);
        if (input.weaponTargets.ray(CLANKER_HIT, p.x + sx * 1.2, p.y + 0.36, p.z + sz * 1.2,
          sx, 0, sz, 1.9, entry.root, clankerGroundTarget)
          && clankerCylinderClear(p.x, p.y + 0.36, p.z, CLANKER_HIT.x, CLANKER_HIT.y, CLANKER_HIT.z,
            0.04, 0.08, entry, CLANKER_HIT.node)) {
          combat.hit = true;
          weaponImpact(entry, CLANKER_HIT, sx, -1, sz, entry.poundPower);
        }
      }
    }
  };
  const registerClanker = (entry) => {
    entry.renderParts = [];
    entry.combat = { left: math.mat4.create(), right: math.mat4.create(), hit: false, groundChecked: false };
    const owner = { kind: "clanker", entry, cave: entry, priority: 2, weaponType: "none" };
    const visit = (node) => {
      if (node.geometry) { entry.renderParts.push(node); addTarget(node, owner); clankerPartOwners.set(node, entry); }
      for (const child of node.children) visit(child);
    };
    visit(entry.root);
    clankerMeshes.add(entry.root);
  };
  const pushClankerProp = (entry, dx, dz, dt) => {
    const p = entry.root.position;
    for (let i = 0; i < scenery.length; i++) {
      const prop = scenery[i];
      if (!prop.active || prop.prop !== "crate" && prop.prop !== "barrel" && prop.prop !== "rock") continue;
      const q = prop.node.position, radius = prop.footprint;
      if ((q.x - p.x) * dx + (q.z - p.z) * dz <= 0) continue;
      const b = BL.scene.boundsOf(prop.node.geometry), height = b.max[1] - b.min[1];
      if (!BL.agent.footprint.circleOverlaps(entry, p.x, p.y, p.z, entry.heading,
        q.x, q.y + b.min[1], q.z, radius, height, 0.12)) continue;
      const x = q.x + dx * dt * 0.45, z = q.z + dz * dt * 0.45;
      if (Math.hypot(x - prop.clankerHomeX, z - prop.clankerHomeZ) > 0.45
        || !island.isGrassAt(x, z, q.y) || island.path.overlaps(x, z, radius)) return;
      if (!clankerClear(q.x, q.y, q.z, x, q.y, z, radius, height, entry, prop.node)) return;
      prop.x = prop.reservation.x = q.x = x;
      prop.z = prop.reservation.z = q.z = z;
      solids.sync();
      return;
    }
  };
  const poundClankerEquipment = (entry) => {
    const p = entry.root.position;
    let nearest = null, distance = Infinity;
    for (let i = 0; i < clankerEquipment.length; i++) {
      const item = clankerEquipment[i], q = item.node.position;
      if (item.site !== entry.site || item.progress >= 1) continue;
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d > 3.5 || d >= distance || !clankerClear(q.x, q.y, q.z, q.x, q.y, q.z, item.radius, item.height, null, item.node)) continue;
      nearest = item; distance = d;
    }
    if (!nearest) return;
    nearest.progress = Math.min(1, nearest.progress + 0.2);
    nearest.node.visible = true;
    nearest.node.scale.y = nearest.progress * 0.65;
    solids.sync();
  };
  const createClankerEquipment = (sites) => {
    for (let site = 0; site < sites.length; site++) for (let side = 0; side < 2; side++) {
      const place = sites[site];
      // EntropyLab supplies authored equipment and the mirror room is meant to
      // stay open for its running clanker. Generic build props in either room
      // become unexplained bright blocks under their local effects.
      if (place.mouth === entropyLab.mouth || place.mirrorRoom) continue;
      const geometry = models.buildableGeos[(site + side) % models.buildableGeos.length]();
      const bounds = BL.scene.boundsOf(geometry);
      const radius = Math.hypot(Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])), Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]))) * 0.65;
      // Side-wall pockets leave the doorway and rear shelves free. A build
      // grows only while its complete footprint is clear of the companions.
      const x = (side ? 1 : -1) * 2.25, z = -4.7;
      const node = createNode({ geometry, visible: false, matrixLiving: true, position: { x: place.mouth.x + place.cr * x + place.sr * z,
        y: place.mouth.floorY, z: place.mouth.z - place.sr * x + place.cr * z }, rotation: { x: 0, y: place.mouth.ry, z: 0 }, scale: { x: 0.65, y: 0.01, z: 0.65 } });
      addChild(root, node); solids.add(node);
      trackMirrorObject(node, 1.2);
      clankerEquipment.push({ node, site, radius, height: bounds.max[1] * 0.65, progress: 0 });
    }
  };
  const refreshObjectGuides = () => {
    // Model changes also happen during scene construction, before the cache.
    if (objectGuides) {
      objectGuides.refresh();
      sightGuides.reserve(objectGuides.result, null);
      bananaGuides.reserve(objectGuides.result, null);
    }
  };
  let uiGuideObjects = null, uiGuidesReady = false, preparingGuideActor = null;
  const collectViewObjects = () => {
    const player = crew.player, p = player ? player.root.position : camera.target;
    return objectGuides.collect(player, p.x, p.y, p.z, camera, renderer.size.width / Math.max(1, renderer.size.height), sightGuides.state.retainedOwners, sightGuides.state.retainedCount);
  };
  const characterUiOccluded = (cave) => {
    if (cave.root.cameraHidden) return true;
    if (RENDER_OPTS.birdsEyeCutaway) return cave.root.position.y - cave.baseY >= cutawayHeightAt(cave.root.position.x, cave.root.position.z);
    // Input-time tooltips may run before this frame's transforms are rendered.
    // Use rock certificates only during the overlay, after updating providers;
    // all other callers keep the exact visibility query.
    if (!uiGuidesReady) return false;
    if (!uiGuideObjects) uiGuideObjects = collectViewObjects();
    return !objectGuides.actorVisible(cave, guideSegmentClear);
  };
  const prepareCoveredView = (overlayCanvas) => {
    const actor = crew.list.find((cave) => cave.root.visible);
    if (!actor) return;
    // Exercise the first covered-view paths behind the loading curtain. The
    // real camera, bodies and controls stay untouched; only presentation
    // caches and their bounded canvases are prepared for later navigation.
    BL.scene.updateWorld(root);
    const p = actor.root.position, aspect = renderer.size.width / Math.max(1, renderer.size.height);
    const view = createCamera();
    view.fov = camera.fov; view.near = camera.near; view.far = camera.far;
    setVec(view.target, p.x, p.y + 0.8, p.z);
    setVec(view.position, p.x, p.y + 8, p.z + 50);
    try {
      preparingGuideActor = actor;
      const objects = objectGuides.collect(actor, p.x, p.y, p.z, view, aspect);
      const guides = sightGuides.update(actor, null, objects, view, aspect, 0.25, true);
      const observer = guides.observer;
      guides.structure = rockGuides.select(p.x, p.y - actor.baseY, p.z, view.position.x, view.position.y, view.position.z);
      guides.structures = rockGuides.updateSurfaces(observer[19], observer[20], observer[21], view, 0.25, actor, objectGuides.perceptionClear, objects.occlusionVersion, objects.perceptionVersion);
      cameraCover.draw(view, actor.root, false, true, cameraRockAt, cameraRockMaterialAt, guides, 0.25);
    } finally {
      preparingGuideActor = null;
      const guides = sightGuides.update(null, null, null, camera, aspect, 0, false);
      guides.structure = guides.structures = null;
      rockGuides.resetSurface();
      cameraCover.draw(camera, null, false, false, cameraRockAt, cameraRockMaterialAt, guides, 0);
      collectViewObjects();
      const context = overlayCanvas.getContext("2d");
      context.save(); context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); context.restore();
    }
  };
  const drawFirstPersonFire = (player) => {
    if (!player || !pilot.closeWanted || pilot.closeMix < 0.98) return;
    crew.fireView(player, FIRE_VIEW);
    const coverage = FIRE_VIEW.coverage, ember = FIRE_VIEW.ember, soot = FIRE_VIEW.soot;
    if (coverage <= 0 && soot <= 0) return;
    const context = overlayCanvas.getContext("2d"), width = overlayCanvas.width, height = overlayCanvas.height;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (coverage > 0) {
      // Heat closes in as the fire reaches more body parts. Full body coverage
      // is opaque, while the second layer brightens as those embers heat up.
      context.globalAlpha = coverage;
      context.fillStyle = "#8f260b";
      context.fillRect(0, 0, width, height);
      context.globalAlpha = ember;
      context.fillStyle = "#ff6d16";
      context.fillRect(0, 0, width, height);
      const count = Math.ceil(FIRE_SPECKS.length / 4 * Math.sqrt(coverage));
      context.fillStyle = "#ffe176";
      context.globalAlpha = Math.min(1, 0.3 + ember * 0.7);
      for (let i = 0; i < count; i++) {
        const at = i * 4, size = FIRE_SPECKS[at + 2] * Math.min(width, height) * (0.7 + ember * 1.3);
        const x = FIRE_SPECKS[at] * width;
        const y = ((FIRE_SPECKS[at + 1] - now * (0.05 + FIRE_SPECKS[at + 3] * 0.08)) % 1 + 1) % 1 * height;
        context.fillRect(x - size * 0.5, y - size * 0.5, size, size);
      }
    }
    if (soot > 0) {
      // The roll replaces heat with the actual accumulated char coverage;
      // that same coverage then recedes with the body's soot fade.
      context.globalAlpha = soot;
      context.fillStyle = "#090807";
      context.fillRect(0, 0, width, height);
    }
    context.restore();
  };
  // Where the overlay's frame goes, a section at a time, for the profiler under ?debug=1 (`debug.overlayProfile`).
  const OVERLAY_PROFILE = { prepare: 0, fx: 0, collect: 0, sight: 0, rock: 0, cover: 0, banana: 0 };
  // Walking recomputes the sight guides at most this often in game time; the lines are world-anchored, so a
  // frame of lag never shows, and it is the difference between 42 and 59 fps behind cave rock at 4K.
  const SIGHT_RECOMPUTE_HZ = 30;
  const overlay = (dt) => {
    sleepSightFrame++;
    if (CAMERA_GLYPHS.radius !== MATRIX_WORLD.radius || CAMERA_GLYPHS.active !== MATRIX_WORLD.active || CAMERA_GLYPHS.permanentCave !== MATRIX_WORLD.permanentCave) {
      CAMERA_GLYPHS.radius = MATRIX_WORLD.radius; CAMERA_GLYPHS.active = MATRIX_WORLD.active; CAMERA_GLYPHS.permanentCave = MATRIX_WORLD.permanentCave;
      CAMERA_GLYPHS.version++;
    }
    CAMERA_GLYPHS.time = MATRIX_WORLD.time;
    const player = crew.player;
    const combatBirdsEye = !!player && pilot.aiming && pilot.birdsEye;
    if (combatBirdsEye || RENDER_OPTS.birdsEyeCutaway) {
      // The actual scene is visible through its roof cut. Rock silhouettes and
      // near-camera caps would cover it again using the unchanged solid world.
      // Gate combat bird's-eye directly as well as by cutaway mix so no wall
      // outline can flash on its first or last camera-transition frame.
      uiGuideObjects = null; uiGuidesReady = true;
      try { fx.drawOverlay(dt, drawExtra); } finally { uiGuidesReady = false; }
      sightGuides.update(null, null, null, camera, 1, dt);
      bananaGuides.update(null, null, null, camera, 1, dt, false, true);
      sightGuides.state.structure = sightGuides.state.structures = null;
      bananaGuides.state.structure = bananaGuides.state.structures = null;
      if (rockGuides) rockGuides.resetSurface();
      cameraCover.draw(camera, null, false, false, cameraRockAt, cameraRockMaterialAt, null, dt);
      return;
    }
    const insideMirror = !!player && playerCaveIndex === matrixCave.caveIndex;
    mirrorGuides.update(insideMirror, MATRIX_WORLD.time, MATRIX_WORLD.density);
    let tick = performance.now();
    const lap = (key) => { const now = performance.now(); OVERLAY_PROFILE[key] = now - tick; tick = now; };
    const bananaActor = bananaCover.prepare(camera, player);
    lap("prepare");
    uiGuideObjects = null; uiGuidesReady = true;
    try { fx.drawOverlay(dt, drawExtra); } finally { uiGuidesReady = false; }
    lap("fx");
    let touchesRock = false, occluded = false, guides = null, exteriorRamp = false;
    if (pilot.closeMix < 1) {
      const eye = camera.position, tangent = Math.tan(camera.fov / 2), aspect = renderer.size.width / Math.max(1, renderer.size.height);
      const radius = camera.near * Math.sqrt(1 + tangent * tangent * (1 + aspect * aspect));
      // A cheap enclosing-volume check avoids sampling an entirely clear view.
      // The cover then caps only solid rock intersecting the actual near plane.
      touchesRock = island.solidAt(eye.x, eye.y, eye.z)
        || eye.y + radius >= 0 && eye.y - radius <= ALTAR_HEIGHT && Math.hypot(eye.x, eye.z) <= altar.platformRadius + radius
        || !island.clearAt(eye.x, eye.y - radius, eye.z, radius, radius * 2)
        || !entranceSegmentClear(eye.x, eye.y, eye.z, eye.x, eye.y, eye.z, radius);
    }
    if (player) {
      const p = player.root.position, aspect = renderer.size.width / Math.max(1, renderer.size.height);
      const objects = uiGuideObjects || collectViewObjects();
      exteriorRamp = !pilot.closeWanted && pilot.closeMix < 1 && exteriorRampGuides(player);
      const viewEligible = !pilot.closeWanted && pilot.closeMix < 1;
      const actorVisible = viewEligible && objectGuides.actorVisible(player, guideSegmentClear);
      const rockSection = viewEligible && touchesRock && actorVisible && !exteriorRamp;
      const objectsEnabled = viewEligible && (exteriorRamp || rockSection || !actorVisible);
      const bananaEnabled = bananaCover.state.cameraInPile;
      occluded = objectsEnabled;
      lap("collect");
      guides = sightGuides.update(player, null, objects, camera, aspect, dt, objectsEnabled, rockSection, SIGHT_RECOMPUTE_HZ);
      lap("sight");
      // Keep a separate cap pass so split objects stay legible in fruit.
      // It must not change the visibility rules in the clear part of the view.
      const fruitGuides = bananaGuides.update(bananaEnabled ? player : null, null, objects, camera, aspect, dt, bananaEnabled, true);
      if (objectsEnabled || bananaEnabled) {
        const structure = ensureRockGuides().select(p.x, p.y - player.baseY, p.z, camera.position.x, camera.position.y, camera.position.z), observer = guides.observer;
        const surfaces = rockGuides.updateSurfaces(observer[19], observer[20], observer[21], camera, dt, player, objectGuides.perceptionClear, objects.occlusionVersion, objects.perceptionVersion);
        lap("rock");
        guides.structures = objectsEnabled ? surfaces : null; guides.structure = objectsEnabled ? structure : null;
        fruitGuides.structures = bananaEnabled ? surfaces : null; fruitGuides.structure = bananaEnabled ? structure : null;
      } else { guides.structure = fruitGuides.structure = null; guides.structures = fruitGuides.structures = null; if (rockGuides) rockGuides.resetSurface(); }
    } else {
      sightGuides.update(null, null, null, camera, 1, dt);
      bananaGuides.update(null, null, null, camera, 1, dt, false, true);
      sightGuides.state.structure = null;
      sightGuides.state.structures = null;
      bananaGuides.state.structure = bananaGuides.state.structures = null;
      if (rockGuides) rockGuides.resetSurface();
    }
    if (exteriorRamp || bananaActor) {
      const p = camera.position, t = camera.target, length = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      GUIDE_ACTOR_FORWARD[0] = (t.x - p.x) / length; GUIDE_ACTOR_FORWARD[1] = (t.y - p.y) / length; GUIDE_ACTOR_FORWARD[2] = (t.z - p.z) / length;
    }
    cameraCover.state.opacity = 0.22 * (1 - pilot.closeMix);
    cameraCover.draw(camera, bananaActor ? null : player?.root, touchesRock, occluded, cameraRockAt, cameraRockMaterialAt, guides, dt, MATRIX_WORLD.active ? 1 : 0, CAMERA_GLYPHS, exteriorRamp ? guideActorVisibleAt : null);
    lap("cover");
    bananaCover.draw(camera, player, dt, guideActorVisibleAt, bananaGuides.state, CAMERA_GLYPHS);
    drawFirstPersonFire(player);
    lap("banana");
  };

  const onLootCleared = () => {
    if (!lootEnabled) return;
    crew.applyAllSwag();
    crew.renderLocker();
    hud.toast("Loot locker cleared");
  };
  const clearLoot = () => {
    game.clearLoot();
    onLootCleared();
  };
  const demoTip = (sats) => onDonation({ id: `demo-${Date.now()}`, sats, handle: game.state.handle, message: game.state.message, at: Date.now() });
  const addTestBananas = (amount) => {
    pile.deliverBananas(amount);
    hud.toast(`+${amount} test bananas`);
  };
  const resetDemo = () => {
    game.resetAll();
    location.reload();
  };
  const onKey = (e) => {
    if (pitArrival) return;
    if (clankerPlay.active) {
      if (!e.repeat && (e.key === "x" || e.key === "X")) clankerPlay.action("mode-toggle");
      return;
    }
    if ((e.key === "x" || e.key === "X") && !e.repeat && pilot.modeAction("mode-toggle")) return;
    if ((e.key === "1" || e.key === "2") && pilot.weaponMode(Number(e.key))) return;
    if (e.key === "Escape") pilot.release();
    if (e.key === "b" || e.key === "B") addTestBananas(testBananas);
    if (e.key === "l" || e.key === "L") demoTip(120000);
    if (e.key === "p" || e.key === "P") {
      world.level = Math.max(world.level, pile.slots.length);
      pile.syncPile(true);
    }
    // J mirrors the carried jetpack button without changing its fuel.
    if ((e.key === "j" || e.key === "J") && !e.repeat) toggleJetpack();
    // N spins a driven Ooga's nunchaku, C changes the colourway of one built with two.
    if ((e.key === "n" || e.key === "N") && !e.repeat && crew.twirl()) return;
    if ((e.key === "c" || e.key === "C") && !e.repeat && crew.toggleTint(crew.player)) return;
    if (e.key === "g" || e.key === "G") pilot.weaponAction("weapon-toggle");
    if (e.key === "v" || e.key === "V") pilot.weaponAction("weapon-fire");
    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= 9) {
      const contributor = contributors.roster[digit - 1];
      const cave = contributor && crew.cavemen.get(contributor.name);
      if (cave && crew.stateOf(cave) !== "working") {
        cave.override = "working";
        crew.refreshStates();
      }
    }
  };

  const enter = (ctx) => {
    ({ renderer, game, world, go, lootEnabled, testBananas } = ctx);
    pitDeparting = false; pitArrival = null;
    const travel = world.oogaPortalTravel;
    const pitReturn = ctx.from === "dsb" && travel?.from === "dsb" && travel.to === "hub" && travel.arrival === "pit" && travel.name === world.pilot;
    delete world.oogaPortalTravel; // Consume once; ordinary scene visits cannot inherit this route.
    overlayCanvas = ctx.overlay;
    magazineState = {
      get owned() { return !!crew && crew.hasMagazine(crew.player); },
      get ammo() { return crew ? crew.magazineAmmo(crew.player) : 0; },
      get count() { return crew ? crew.magazineCount(crew.player) : 0; },
      get carrier() { return crew && crew.hasMagazine(crew.player) ? crew.player.traits.name : null; }
    };
    magazine = null;
    MATRIX_WORLD.active = MATRIX_WORLD.direction = MATRIX_WORLD.radius = MATRIX_WORLD.time = MATRIX_WORLD.permanentCave = 0;
    MATRIX_WORLD.livingGlobal = 0;
    MATRIX_WORLD.density = renderer.kind === "canvas2d" ? MATRIX_DENSITY.canvas2d / MATRIX_DENSITY.high : MATRIX_DENSITY[renderer.quality] / MATRIX_DENSITY.high;
    camera = createCamera({ fov: 48, near: 0.5, far: 900 });
    root = createNode();
    positionDebug = document.getElementById("position-debug");
    positionDebug.hidden = !POSITION_DEBUG;
    positionDebugNext = 0;
    positionDebugJSON = "";
    if (POSITION_DEBUG) positionDebug.addEventListener("click", copyPositionDebug);
    solids = BL.solidProps.create();
    clock = daylight.createClock({ hour: hourParam, daylen: daylenParam, day: dayParam, time: timeParam, now: new Date() });
    phase = null;
    island = terrain.island({ seed: SEED });
    guideSegmentClear.boxGrid = island.sightGrid;
    buildCameraRamps();
    cameraCaveIndex = 0;
    cameraEntranceIndex = 0;
    cameraPreviousValid = false;
    cameraUnrestricted = cameraReentering = false;
    cameraTrailPlayer = null;
    cameraTrailCount = cameraTrailNext = 0;
    cameraTrailSleeping = false;
    cameraManualContact = false;
    cameraTerrainValid = false;
    cameraTerrainRecovering = false;
    cameraTerrainEntranceIndex = 0;
    caveEntryPlayer = null;
    playerCaveIndex = 0;
    CAMERA_OPENINGS.length = 0;
    MATRIX_WORLD.caveNear = Infinity;
    for (let i = 0; i < island.mouths.length; i++) {
      const m = island.mouths[i], sr = Math.sin(m.ry), cr = Math.cos(m.ry), offset = i * 4;
      const slot = caves.slots.find((candidate) => candidate.id === m.id);
      const blocked = slot.status === "dark";
      CAMERA_OPENINGS.push({ id: m.id, caveIndex: i + 1, mouth: m, sr, cr, minX: PORTAL_MIN_X, maxX: PORTAL_MAX_X, minY: PORTAL_MIN_Y, maxY: PORTAL_MAX_Y, planeZ: PORTAL_Z, blocked, headquarters: slot.status === "headquarters", ramp: slot.status === "headquarters" ? island.headquarters.ramps.find((entry) => entry.id === m.id) : null, stopZ: blocked ? 0.53 + hubModels.sealedCaveFace(sealedCaveVariant(slot.id)).frontZ : PORTAL_Z, rim: hubModels.caveMouthRim().openingBounds });
      MATRIX_WORLD.caves[offset] = sr;
      MATRIX_WORLD.caves[offset + 1] = cr;
      MATRIX_WORLD.caves[offset + 2] = sr * m.x + cr * m.z + PORTAL_Z;
      MATRIX_WORLD.caves[offset + 3] = Math.hypot(m.x + sr * PORTAL_Z - MATRIX_WORLD.origin[0], m.z + cr * PORTAL_Z - MATRIX_WORLD.origin[2]);
      MATRIX_WORLD.caveBounds[offset] = m.x;
      MATRIX_WORLD.caveBounds[offset + 1] = m.floorY;
      MATRIX_WORLD.caveBounds[offset + 2] = m.z;
      MATRIX_WORLD.caveBounds[offset + 3] = 7;
      MATRIX_WORLD.caveNear = Math.min(MATRIX_WORLD.caveNear, MATRIX_WORLD.caves[offset + 3] - 4);
    }
    mark("island");
    hud = hudMod.create({ roster: contributors.activeRoster, catalog: models.SWAG, tierColors: models.TIER_COLORS, renderIcon: hudMod.renderIcon, lootEnabled });
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks });
    presets = { pile: PILE_VIEW, gate: GATE_VIEW };
    pilot = pilotMod.create({ renderer, canvas: ctx.canvas, camera, hud, presets, landing: "pile", pitch: [PITCH_MIN, PITCH_MAX], dist: [DIST_MIN, DIST_MAX], follow: FOLLOW, fly: FLY, clampTarget, clampCamera, observeOrbit: position => clampCamera(position, 0), ceilingAt, birdsEyeMin: BIRDS_EYE_MIN, birdsEyeCeiling, releaseView: releaseCameraView, enterFreeView: enterFreeCameraView, coarse: COARSE, onFreeAction: freeAction, jetpackStatus: jetpackHudStatus, mayPossess: mayDriveOoga, close: { ...CLOSE_VIEW, maxStep: STEP_MAX, groundAt: playerSupportAt, visualGroundAt: visualSupportAt, sleepEyeFloorAt, cloudAt, zone: () => playerCaveIndex } });
    terrainRampRoof = BL.terrainCutaway.createRampRoof(island.cutawaySource, island.geometry, renderer.releaseGeometry);
    place(terrainRampRoof.baseGeometry, 0, 0, 0, 0);
    addChild(root, terrainRampRoof.node);
    placed.push(terrainRampRoof.node);
    addTerrainSection(island.cutawaySource, root);
    for (const mouth of island.mouths) {
      const slot = caves.slots.find(candidate => candidate.id === mouth.id);
      if (slot.status !== "open" && slot.status !== "mirror") continue;
      const cos = Math.cos(mouth.ry), sin = Math.sin(mouth.ry), room = mouth.room;
      // Cave local -z points into the mountain. Include the entrance lintel
      // and a wall thickness around the authored room, leaving adjacent hills.
      const back = -room.to - 0.45, front = 1.15, center = (back + front) / 2;
      const region = { id: mouth.id, x: mouth.x + sin * center, z: mouth.z + cos * center, cos, sin,
        halfWidth: Math.max(room.w / 2, 2.5) + 0.45, halfDepth: (front - back) / 2, y: mouth.floorY + 2.85 };
      addTerrainSection(island.cutawaySource, root, 0, region);
    }
    // The path geometry never changes after the island builds; reuse its tagged copy on every visit.
    let pathGeometry = PATH_GEOMETRY.get(island.path.geometry);
    if (!pathGeometry) PATH_GEOMETRY.set(island.path.geometry, pathGeometry = { ...island.path.geometry, faces: island.path.geometry.faces.map(face => ({ ...face, matrixPermanentFallback: true, road: true })) });
    pathNode = createNode({ geometry: pathGeometry, instanceData: island.path.instanceData, instanceCount: 0, instanceVersion: 0, depthBias: 0.05 });
    addChild(root, pathNode);
    placed.push(pathNode);
    altar = buildAltar();
    const layoutPile = (radius) => {
      altar.setRadius(radius);
      CAMERA_GLYPHS.version++;
      const changed = island.path.setRadius(altar.platformRadius);
      island.path.apply(pathNode);
      if (changed) reflowScenery();
    };
    layoutPile(pileMod.visualFootprintFor(world.level, PILE_SCALE));
    const gate = place(hubModels.gate(), island.gate.x, island.gate.z, island.gate.ry);
    solids.add(gate);
    gateRain = buildGateRain(gate);
    addTarget(gate, { kind: "gate" }, { radius: 3 });
    props.push({ kind: "prop", prop: "gate", node: gate, x: gate.position.x, z: gate.position.z, ripe: 0, active: true });
    claim(gate.position.x, gate.position.z, 3);
    TICKER_AT.y = gate.position.y + 6;
    GATE_VIEW.target.y = gate.position.y + 2.5;
    headquarters = buildHeadquarters();
    buildPitGate();
    const bedrolls = headquarters.mattresses;
    headquarters.sleepAnchors = bedrolls;
    for (const slot of caves.slots) {
      const m = island.mouths.find((mouth) => mouth.id === slot.id);
      addTarget(buildMouth(slot, m), { kind: "cave", slot, priority: 1 }, { radius: 2.6 });
      claim(m.x, m.z, 3.5);
      if (workCave(slot)) {
        workZones.push({ x: m.x, z: m.z, floor: m.floorY, sr: Math.sin(m.ry), cr: Math.cos(m.ry), active: false, half: 3.4, front: 5.8 });
      }

      if (slot.scene) {
        presets[slot.scene] = mouthView(m);
        openMouths.push({ slot, m, actionX: m.x + Math.sin(m.ry) * RALLY_KART_Z, actionZ: m.z + Math.cos(m.ry) * RALLY_KART_Z });
      }
    }
    for (const roof of launchers) presets.drop = { yaw: roof.ry, pitch: 0.36, dist: 14, target: { x: roof.x, y: roof.y + 1.2, z: roof.z } };
    const buildSpotsList = BUILD_DEGREES.map((deg) => {
      const { x, z } = spotAt(deg, BUILD_RADIUS, 1);
      claim(x, z, 0.9);
      return { x, z, ry: Math.atan2(-x, -z) };
    });
    buildRim();
    buildLaunchSite();
    mempoolIsland = buildMempoolIsland();
    timechainIsland = buildTimechainIsland();
    const firePos = buildFire();
    fire = lamps[lamps.length - 1];
    // The jumbotron stands on the rim crest just west of the gate, turned to face the meadow center.
    {
      const jx = -7, jz = -27, jScale = 2.6;
      const jry = Math.atan2(-jx, -jz);
      claim(jx, jz, 3.4);
      // legDrop is the stand's reach below the cabinet's middle; jSink is the part sunk into the rock.
      const legDrop = BL.jumbotron.DROP, jSink = 0.06;
      jumbotron = BL.jumbotron.create({
        data: BL.jumbotronData,
        position: { x: jx, y: island.surfaceAt(jx, jz) + (legDrop - jSink) * jScale, z: jz },
        ry: jry,
        scale: jScale
      });
      addChild(root, jumbotron.node);
      placed.push(jumbotron.node);
      addProp("jumbotron", jumbotron.node, jx, jz, 3.4);
      // Shells launch from just above the cabinet's top rail.
      jumbotronSpot = { x: jx, y: jumbotron.node.position.y + 0.7 * jScale, z: jz };
      // Live stats land on the board and on the roster: fresh last-seen
      // times flow through contributors -> crew.refreshStates, which wakes a
      // sleeper into a walk out of the HQ (and the 60s state interval later
      // walks idled Oogas down to bed). A rise in org activity earns fireworks.
      oogatronUnsub = oogatronLive.subscribe((event) => {
        if (event.type === "stats") {
          if (jumbotron) jumbotron.refreshData(event.stats);
          contributors.applySnapshot(event.stats);
        } else if (event.type === "contribution") launchFireworks(event.delta);
      });
    }
    meadowDressing(firePos);
    plantPalms();
    raiseIslets();
    buildLife();
    scatter();
    mempoolIsland.claimGround();
    timechainIsland.claimGround();
    buildLawn();
    reflowScenery();
    buildSpots();
    buildClouds();
    spawnMagazinePickup();
    critters = crittersMod.create({ root, renderer, flowers: scenery.filter((o) => o.prop === "flower" && o.active), fire: firePos, secondaryFire: { x: 0, y: island.headquarters.floor, z: 0 }, meadowRadius: MEADOW, heightAt: island.surfaceAt });
    mark("props");
    const shared = { root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, overlayVisible: matrixOverlayVisible, zzzVisible: sleepMarksVisible, tickerAt: TICKER_AT, buildSpots: buildSpotsList, walkIn: WALK_IN, clampDrag, viewYaw: PILE_VIEW.yaw, bedrolls, pileScale: PILE_SCALE, pileY: ALTAR_HEIGHT + 0.02, matrixLivingPile: true, onLayout: layoutPile, onShown: () => { meterTimer = 0; }, crateRadius: () => Math.max(4.4, altar.platformRadius + 0.8), groundAt: playerSupportAt, prepareCloudSupport, cloudAt, ceilingAt, wanderSpot, walkable, flyable, glideJetCeiling, useNear, abyssAt, abyssRespawnY: ABYSS_RESPAWN_Y, jetpackAllowed, reticleTarget, phase: () => phase };
    shared.reloadRadius = () => island.path.debug.ringOuterRadius;
    shared.reloadHeight = ALTAR_HEIGHT;
    shared.onAbyssRespawn = loseAbyssAmmo;
    shared.characterOccluded = characterUiOccluded;
    shared.renderOpts = RENDER_OPTS;
    fx = shared.fx = fxMod.create(shared);
    weather = weatherMod.create({ root, renderer, camera, heightAt: mempoolIsland.groundAt, fx, centre: mempoolIsland.centre });
    // The snapshot outlives the visit, so a re-entered hub opens in the weather it left.
    weather.apply(chain.snapshot);
    refreshChainSign();
    unsubscribeChain = chain.subscribe(onChain);
    unsubscribeMempool = mempool.subscribe(onMempool);
    shared.characterSupportAt = characterSupportAt;
    shared.carryCharacter = carryCharacter;
    shared.npcWalkable = npcWalkable;
    shared.prepareNpcRoutes = refreshWorkZones;
    shared.npcDetour = npcWorkDetour;
    shared.npcRouteBlocked = (cave, x, y, z) => npcClosedCaveAt(x, z, y, cave.bodyHeight) || npcWorkZoneAt(cave, x, y, z)
      || cave.state === "chilling" && Math.hypot(x, z) < island.path.debug.ringOuterRadius + 1.5;
    shared.shoulderObstacleActive = solids.isActive;
    shared.shoulderObstacle = (cave, fx, fz, reach, out) => {
      const p = cave.root.position;
      if (!solids.shoulderAt(p.x, p.y - cave.baseY + STEP_MAX, p.z, fx, fz, PLAYER_RADIUS, Math.max(0, cave.bodyHeight - STEP_MAX), reach, out, p.y - cave.baseY + 1e-7)) return false;
      if (!out.node.sightSolid) return true;
      // A level probe can hit later stair treads above the current feet.
      // Follow ordinary support in short swept steps before treating the
      // whole staircase as a tall prop that must be passed sideways.
      const steps = Math.max(1, Math.ceil(reach / 0.125));
      let x = p.x, z = p.z, feet = p.y - cave.baseY;
      for (let i = 1; i <= steps; i++) {
        const nx = p.x + fx * reach * i / steps, nz = p.z + fz * reach * i / steps;
        const floor = playerSupportAt(nx, nz, feet, feet, cave);
        if (floor < feet - STEP_MAX - 1e-7 || !walkable(x, z, nx, nz, feet, cave.bodyHeight, cave)) return true;
        x = nx; z = nz; feet = floor;
      }
      return false;
    };
    // Once a tall prop causes a shoulder pass, stay beside its lower tiers.
    // Mounting one would interrupt the return to the walking line.
    shared.shoulderPropClear = (cave, x, z) => {
      const p = cave.root.position, feet = p.y - cave.baseY + 1e-5;
      return solids.segmentClear(p.x, feet, p.z, x, feet, z, PLAYER_RADIUS, cave.bodyHeight - 1e-5);
    };
    shared.onBodyMove = moveCampBody;
    mirrorCave.damage = BL.mirrorDamage.create(mirrorCave.node, (geometry) => renderer.releaseGeometry(geometry), (x, z, y) => island.supportAt(x, z, y, 0));
    mirrorCave.damageStage = mirrorCave.damage.stage;
    mirrorCave.damageVersion = mirrorCave.damage.version;
    mirrorCave.shattered = false;
    mirrorCave.ripples = BL.mirrorRipples.create(mirrorCave.node);
    entropyLab.phase = BL.labPhase.create(entropyLab.group, entropyLab.mouth, entropyLab.opening);
    headquarters.entropyLab = entropyLab;
    entropyLab.updateEquipment = updateLabEquipment;
    shared.clipProjectileTarget = entropyLab.phase.clipTarget;
    shared.absorbProjectile = (ax, ay, az, point, dt, source, workShot) => entropyLab.phase.absorb(ax, ay, az, point, dt)
      || !!(workShot && source && shared.workSites[source.work.site]?.mirrorRoom && !mirrorCave.damage.broken
        && mirrorCave.ripples.absorb(ax, ay, az, point));
    shared.onProjectileMove = (ax, ay, az, bx, by, bz, dt, source, workShot) => {
      const crossed = mirrorCave.ripples.cross(ax, ay, az, bx, by, bz, dt);
      if (!crossed || !workShot || !source || !shared.workSites[source.work.site]?.mirrorRoom || mirrorCave.damage.broken) return;
      const plane = MATRIX_WORLD.permanentPlane;
      const from = plane[0] * ax + plane[1] * ay + plane[2] * az + plane[3];
      const to = plane[0] * bx + plane[1] * by + plane[2] * bz + plane[3];
      const t = from / (from - to);
      if (mirrorCave.damage.hit(1, lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t))) syncMirrorDamage();
    };
    shared.onWeaponImpact = weaponImpact;
    shared.onMeleeStrike = mirrorCave.ripples.strike;
    shared.aimSurface = mirrorCave.ripples.aimAt;
    shared.continueShot = mirrorCave.ripples.continueShot;
    shared.fireReachable = (x, y, z, toX, toY, toZ, ignoreNode = null, precise = false) => actionReachable(x, y, z, toX, toY, toZ, precise ? 1e-6 : 0.025)
      && solids.segmentClear(x, y, z, toX, toY, toZ, precise ? 1e-6 : 0.01, precise ? 2e-6 : 0.02, ignoreNode)
      && matrixGateSegmentClear(x, y, z, toX, toY, toZ, precise ? 1e-6 : 0.01, precise ? 2e-6 : 0.02);
    shared.workShotClear = (x, y, z, toX, toY, toZ) => actionReachable(x, y, z, toX, toY, toZ, 0.01)
      && solids.segmentClear(x, y, z, toX, toY, toZ, 0.01, 0.02)
      && matrixGateSegmentClear(x, y, z, toX, toY, toZ, 0.01, 0.02, true);
    // Cursor selection needs a surface point, not the projectile's clearance
    // margin: that small vertical gap becomes a large miss along a distant floor.
    shared.cursorReachable = (x, y, z, toX, toY, toZ) => actionReachable(x, y, z, toX, toY, toZ, 0.001)
      && solids.segmentClear(x, y, z, toX, toY, toZ, 0.001, 0.002)
      && matrixGateSegmentClear(x, y, z, toX, toY, toZ, 0.001, 0.002);
    shared.inBananas = inBananas;
    shared.npcDestinationBlocked = npcDestinationBlocked;
    shared.npcLandingAllowed = (x, y, z, height, cave) => !npcCaveRimAt(x, y, z) && !npcClosedCaveAt(x, z, y, height) && !npcPileAt(x, y, z, height) && !npcWorkZoneAt(cave, x, y, z) && npcFireClear(x, y, z, x, y, z, height);
    shared.npcRecoveryDrop = (x, y, z) => npcCaveRimAt(x, y, z);
    shared.npcHazardClear = (x, y, z, toX, toY, toZ, height, cave) => npcClosedCaveClear(x, y, z, toX, toY, toZ, height) && npcFireClear(x, y, z, toX, toY, toZ, height) && npcWorkZoneClear(cave, x, y, z, toX, toY, toZ);
    shared.onModelChange = refreshObjectGuides;
    shared.trackMirrorObject = trackMirrorObject;
    shared.untrackMirrorObject = untrackMirrorObject;
    shared.refreshMirrorObject = refreshMirrorObject;
    cameraCover = BL.cameraCover.create(ctx.overlay);
    headquarters.cameraCover = cameraCover.state;
    headquarters.glyphMaterial = CAMERA_GLYPHS;
    ensureRockGuides();
    // Reading the cue builds it, so any view or inspector needing one gets it without waiting on the timer.
    Object.defineProperty(headquarters, "rockGuides", { configurable: true, get: ensureRockGuides });
    mark("rockGuides");
    pile = shared.pile = pileMod.create(shared);
    bananaCover = BL.bananaCover.create({ overlay: ctx.overlay, pile, renderOpts: RENDER_OPTS, renderer, floor: ALTAR_HEIGHT, lightVisibleAt: bananaLightVisibleAt });
    headquarters.bananaCover = bananaCover;
    solids.sync();
    shared.npcPaths = headquarters.npcPaths = BL.npcPaths.create({ island, walkable: npcWalkable, pointAllowed: (x, z) => !npcClosedCaveAt(x, z),
      surfaceAt: (x, z, y) => island.supportAt(x, z, y, 1e-6, null, PLAYER_RADIUS) });
    const sleepNavigation = headquarters.sleepNavigation = BL.headquartersSleep.create({ island, beds: bedrolls, walkable: sleepRouteClear, surfaceRoute: shared.npcPaths.route });
    const sleepRouteFrom = { x: 0, y: 0, z: 0 };
    shared.bedRoute = (cave, bed, toBed) => sleepNavigation.route(cave.root.position.x, cave.root.position.y - cave.baseY, cave.root.position.z, bed, toBed, cave.slot?.x, cave.slot?.z);
    shared.bedRouteClear = (cave, to) => {
      const p = cave.root.position;
      sleepRouteFrom.x = p.x; sleepRouteFrom.y = p.y - cave.baseY; sleepRouteFrom.z = p.z;
      return sleepNavigation.clearSegment(sleepRouteFrom, to, false, 0.3);
    };
    // The Rally cave shares the island's repository, but work happens at its mirror cave.
    shared.workSites = caves.slots.filter(workCave).map((slot) => {
      const mouth = island.mouths.find((entry) => entry.id === slot.id), sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);

      const aimX = mouth.x + sr * 5.8, aimZ = mouth.z + cr * 5.8, approach = { x: aimX, z: aimZ };
      let nearest = Infinity;
      // Rejoin the painted trail itself, rather than an off-path mouth-axis
      // marker that makes every worker step sideways and retrace their steps.
      for (const line of island.path.centerlines) for (let n = 1; n < line.length; n++) {
        const a = line[n - 1], b = line[n], dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
        const t = length2 ? clamp(((aimX - a.x) * dx + (aimZ - a.z) * dz) / length2, 0, 1) : 0;
        const x = a.x + dx * t, z = a.z + dz * t, distance = (x - aimX) ** 2 + (z - aimZ) ** 2;
        if (distance < nearest) { nearest = distance; approach.x = x; approach.z = z; }
      }
      return {
        repo: slot.repo,
        mouth, sr, cr,
        mirrorRoom: slot.status === "mirror",
        // The namesake cave adopts fresh contributors whose repo has no cave.
        fallback: slot.id === "c1",
        route: [approach],
        approachDistance: 2.5,
        position: (cave, out, retry = false) => {
          // Reserve the first free place in the fan. Leave the central path
          // open for reload traffic and stagger each extra row behind it.
          const count = crew.cavemen.size * 4 + 16;
          for (let attempt = 0; attempt < count; attempt++) {
            const place = (attempt + (retry ? cave.work.place + 1 : 0)) % count;
            const row = Math.floor(place / 4), side = place & 1 ? 1 : -1;
            // Leave a full-arm companion lane between the inner shooters.
            const x = side * (2.2 + Math.floor(place % 4 / 2) * 1.35 + (row & 1) * 0.6);
            // A wide fan too close to the rim fires diagonally into its stone
            // jambs. Back each row away enough to see across the opening.
            const z = 4.8 + row * 1.35 + Math.abs(x) * 0.32;
            const px = mouth.x + cr * x + sr * z, pz = mouth.z - sr * x + cr * z;
            let occupied = false;
            for (let i = 0; i < crew.list.length; i++) {
              const other = crew.list[i];
              if (other === cave || other === crew.player || other.state !== "working"
                || other.work.phase !== "outbound" && other.work.phase !== "station" && other.work.phase !== "shoot"
                || shared.workSites[other.work.site]?.repo !== slot.repo) continue;
              if (Math.hypot(other.work.position.x - px, other.work.position.z - pz) < 0.9) { occupied = true; break; }
            }
            if (occupied || Math.abs(island.supportAt(px, pz, mouth.floorY, 0.05, ABYSS_FLOOR, PLAYER_RADIUS) - mouth.floorY) > 0.05
              || !island.clearAt(px, mouth.floorY + 0.03, pz, PLAYER_RADIUS, cave.traits.height)
              || !solids.segmentClear(px, mouth.floorY + 0.03, pz, px, mouth.floorY + 0.03, pz, PLAYER_RADIUS, cave.traits.height)) continue;
            let clear = true;
            // Cover either gun shoulder and both sides of the usable doorway,
            // not just a center-to-center ray that misses an obstructed muzzle.
            for (let shoulder = -1; shoulder <= 1 && clear; shoulder += 2) for (let edge = -1; edge <= 1; edge++) {
              const ax = px + cr * shoulder * 0.65 - sr, az = pz - sr * shoulder * 0.65 - cr;
              const bx = mouth.x + cr * edge * 1.65 + sr * 0.5, bz = mouth.z - sr * edge * 1.65 + cr * 0.5;
              if (!shared.workShotClear(ax, mouth.floorY + 1.25, az, bx, mouth.floorY + 1.5, bz)) { clear = false; break; }
            }
            if (!clear) continue;
            out.x = px; out.y = mouth.floorY; out.z = pz;
            cave.work.place = place;
            return true;
          }
          return false;
        }
      };
    });
    shared.workTarget = (cave, out, sample) => {
      if (!clankers || !clankers.target(cave, out, sample)) return false;
      // Until the OBL mirror is completely gone, preserve the moving body aim
      // pattern but land every round on the nearest panel that still exists.
      // This hook is also called for rounds already in flight, so a newly made
      // hole cannot pull the rest of a burst through empty space.
      if (shared.workSites[cave.work.site]?.mirrorRoom && !mirrorCave.damage.broken) {
        mirrorCave.damage.aimCenter(out, out.x, out.y, out.z);
      }
      return true;
    };
    shared.workHit = (cave) => clankers && clankers.hit(cave);
    shared.workPlanned = (cave, site) => clankers && clankers.plan(cave, site);
    mark("pile");
    shared.residentPose = timechainResidentPose;
    // Signed-in visitors elsewhere, as the Oogas they drive; the crew walks round them.
    shared.outsideActors = () => remotes.actors();
    shared.outsideActorHeight = REMOTE_BODY_HEIGHT;
    crew = shared.crew = crewMod.create(shared);
    remotes = BL.remotePlayers.create({ root, crew });
    pileSound = BL.pileAudio.create();
    for (const cave of crew.list) crew.setJetpackOwnership(cave, true, hubModels.jetpack(), hubModels.jetFlame());
    // Sani hosts the island on ordinary visits; explicit activity fixtures still exercise every state.
    const sani = crew.cavemen.get("SaniExp");
    if (sani && !contributors.debugState && preloadedCharacter !== "saniexp") sani.override = "chilling";
    mirrorCave.body = BL.mirrorBody.create(mirrorCave.node, crew.cavemen);
    for (const cave of crew.list) entropyLab.phase.body.track(cave.root, cave.traits.height * 2,
      Math.max(cave.headOpen.verts.length, cave.headClosed.verts.length));
    if (magazine) trackMirrorObject(magazine.node, 1);
    for (let caveIndex = 0; caveIndex < crew.list.length; caveIndex++) {
      const cave = crew.list[caveIndex];
      cave.root.matrixLiving = true;
      cave.solidBounds = new Float64Array(6);
      mirrorActorRadius(cave);
    }
    headquarters.solids = { props: solids, supportAt: playerSupportAt, walkable, npcWalkable, flyable, ceilingAt, inBananas };
    headquarters.firingZones = workZones;
    headquarters.firingZoneAt = npcWorkZoneAt;
    shared.addSolid = solids.add;
    shared.removeSolid = solids.remove;
    mark("cavemen");
    crates = shared.crates = cratesMod.create(shared);
    pilot.bind(shared);
    breakables = headquarters.breakables = BL.breakables.create({ root, input, renderer, fx, crew,
      collectReward: collectBreakableReward, deactivate: deactivateBreakable, relocate: relocateBreakable,
      onAmmoPickup: (added, remaining) => {
        pilot.showAct();
        hud.toast(remaining ? `+${added} ammo · ${remaining} left` : "Magazine collected");
      },
      trackMirrorObject, untrackMirrorObject });
    for (const owner of scenery) breakables.register(owner);
    for (const owner of scenery) { owner.clankerHomeX = owner.x; owner.clankerHomeZ = owner.z; }
    clankerMeshes = BL.solidProps.create();
    clankerPartOwners = new WeakMap();
    for (const cave of crew.list) cave.clankerRide = { entry: null, node: null, x: 0, y: 0, z: 0,
      carrierX: 0, carrierY: 0, carrierZ: 0, heading: 0, localX: 0, localY: 0, localZ: 0 };
    for (const cave of crew.list) cave.clankerDragged = false;
    headquarters.solids.companions = clankerMeshes;
    const loungeRoofs = [];
    for (const mouth of island.mouths) {
      if (caves.slots.find(slot => slot.id === mouth.id)?.status !== "dark") continue;
      const x = mouth.x - Math.sin(mouth.ry) * 4.8, z = mouth.z - Math.cos(mouth.ry) * 4.8;
      const y = island.surfaceAt(x, z);
      if (Number.isFinite(y)) loungeRoofs.push({ x, y, z, angle: mouth.ry });
    }
    const labSiteIndex = shared.workSites.findIndex(site => site.mouth === entropyLab.mouth);
    const debugLabShuttle = DEBUG && !contributors.solo && !contributors.debugState && labSiteIndex >= 0
      ? crew.list.find(cave => cave.state === "working" && cave.work.site === labSiteIndex) || crew.list[0] : null;
    if (debugLabShuttle) debugLabShuttle.override = "working";
    clankers = BL.clankers.create({ root, crew, sites: shared.workSites, loungeRoofs,
      labSite: labSiteIndex,
      labInside: entropyLab.phase.inside, labStations: entropyLab.stations,
      labEquipment: entropyLab.equipment, labPickup: pickUpLabEquipment, labReturn: returnLabEquipment, labRoll: rollLabEquipment,
      solidAt: island.solidAt, climbSolidAt: clankerClimbSolidAt, climbSurfaceAt: clankerClimbSurfaceAt,
      climbClear: clankerClimbClear, climbTransitionClear: clankerClimbTransitionClear, climbPeersClear: clankerPeersClear,
      climbRidersClear: clankerRidersClear, restPoseClear: clankerRestPoseClear,
      groomClear: clankerGroomClear, underCanopy: clankerUnderCanopy,
      groundAt: (x, z, y) => island.supportAt(x, z, y, 0.52), surfaceAt: island.surfaceAt,
      isGrass: island.isGrassAt, onLand: island.onLand,
      roamRadius: island.radius, meadowRadius: island.meadowRadius,
      clear: clankerClear, push: pushClankerProp, onPound: poundClankerEquipment, onGrab: grabClankerOoga, onReleaseDrag: releaseClankerDrag,
      fireContact: clankerFireContact, canSmash: canClankerSmash, supportAt: clankerSupportAt, terrainSupportAt: clankerTerrainSupportAt,
      track: (entry) => trackMirrorObject(entry.root, 3.6, 4248), untrack: (entry) => untrackMirrorObject(entry.root) });
    for (const entry of clankers.list) registerClanker(entry);
    clankerPlay = BL.clankerPlay.create({ canvas: ctx.canvas, camera, pilot, hud, clankers, input, constrainCamera: constrainClankerCamera });
    createClankerEquipment(shared.workSites);
    clankers.equipment = clankerEquipment;
    clankers.sites = shared.workSites;
    clankers.clear = clankerClear;

    hud.onAssign((entryId, name) => {
      if (game.assign(entryId, name)) {
        crew.applyAllSwag();
        crew.renderLocker();
        const cave = crew.cavemen.get(name);
        const item = game.itemOf(entryId);
        if (cave && item) {
          fx.say(cave, `Ooga! ${item.name}!`);
          hud.toast(`${item.name} → ${name}`);
        }
      }
    });
    hud.onUnassign((name) => {
      game.unassign(name);
      crew.applyAllSwag();
      crew.renderLocker();
    });
    const donationRequest = donations.createRequest(game.state);
    qr.drawTo(hud.el.qr, donationRequest.url, { quiet: 3, dark: "#000000", light: "#f3efe4" });
    mark("qr");
    hud.setDonationUrl(donationRequest.url);
    hud.setIdentity(game.state);
    hud.onIdentityChange(({ handle, message }) => {
      game.setIdentity({ handle: donations.sanitize(handle, donations.HANDLE_MAX), message: donations.sanitize(message, donations.MESSAGE_MAX) });
      hud.setIdentity(game.state);
    });

    Object.assign(hooks, {
      onHover: (hit, p) => {
        if (hit) hud.tooltip.show(tooltipFor(hit), p.x, p.y, hit.owner.cave, hit.owner.kind === "clanker");
        else hud.tooltip.hide();
      },
      onHoverMove: (hit, p) => hud.tooltip.show(tooltipFor(hit), p.x, p.y, hit.owner.cave, hit.owner.kind === "clanker"),
      onTap,
      ...pilot.hooks,
      onOrbit: (dx, dy) => {
        if (clankerPlay.active) clankerPlay.orbit(dx, dy);
        else pilot.hooks.onOrbit(dx, dy);
      },
      onZoom: (factor, gesture, px, py) => {
        if (clankerPlay.active) clankerPlay.zoom(factor);
        else pilot.hooks.onZoom(factor, gesture, px, py);
      },
      onDoubleTap: (hit, p) => {
        if (pitArrival) return;
        if (hit && (hit.owner.prop === "timechainchair" || hit.owner.cave?.traits.name === "SaniExp" && timechainIsland?.seat.active)) { spinTimechainChair(); return; }
        if (hit && hit.owner.kind === "clanker") return;
        else {
          if (clankerPlay.active) clankerPlay.release();
          pilot.hooks.onDoubleTap(hit, p);
        }
      }
    });
    entering = false;
    enteringTween = null;
    now = 0;
    hud.onPreset(name => { if (!pitArrival) navigate(name); });
    hud.setDetachedView("pile");
    hud.onAction((action, value) => {
      if (pitArrival || pitGate.isOpen) return;
      if (clankerPlay.active && clankerPlay.action(action)) return;
      if (action === "tip") demoTip(1200);
      else if (action === "tip-legendary") demoTip(120000);
      else if (action === "clear-loot") clearLoot();
      else if (action === "reset") resetDemo();
      else if (action === "act") pilot.action();
      else if (action === "mode-preset") navigate(value);
      else if (action.startsWith("mode-")) pilot.modeAction(action);
      else if (action === "jetpack-toggle") toggleJetpack();
      else if (action.startsWith("weapon-") || action === "magazine-swap") pilot.weaponAction(action);
      else if (action === "reset-view") pilot.goPreset("pile");
    });
    meterTimer = 0;
    crew.refreshStates(true);
    if (debugLabShuttle) clankers.startLabShuttle(debugLabShuttle);
    unsubscribeActivity = contributors.subscribe(() => crew.refreshStates());
    let initialCharacter = ctx.from === null && preloadedCharacter ? contributors.activeRoster.find((entry) => entry.name.toLowerCase() === preloadedCharacter) : null;
    if (ctx.from === null && (preloadedJetpackWear || preloadedEquipment) && !params.has("character") && !initialCharacter) initialCharacter = contributors.activeRoster.find((entry) => crew.stateOf(crew.cavemen.get(entry.name)) === "working") || contributors.activeRoster[0];
    const returningCharacter = ctx.from === "dsb" ? world.pilot : null;
    if (ctx.from === "dsb") world.pilot = null;
    if (initialCharacter || returningCharacter) {
      const cave = crew.cavemen.get(returningCharacter || initialCharacter.name);
      if (!contributors.debugState && crew.stateOf(cave) !== "working") {
        cave.override = "working";
        crew.refreshStates(true);
      }
      pilot.possess(cave);
      if (initialCharacter) crew.configureWeapon(cave, preloadedWeapon, preloadedAmmo);
    }
    ownOogaClaimed = false;
    claimOwnOoga();
    unsubscribeAccount = BL.net.subscribe(onAccountChange);
    const initialFirstPerson = ctx.from === null && preloadedFirstPerson;
    if (initialFirstPerson) pilot.enterClose(true);
    if (returningCharacter && !pitReturn) navigate("pile");
    else if (!crew.sleeping && (preloadedView || initialCharacter || initialFirstPerson)) navigate(preloadedView || "pile");
    if (initialCharacter && preloadedJetpack) {
      grantJetpack(pilot.player, preloadedJetpackWear);
    }
    clankers.sync();
    clankerMeshes.sync();
    stateTimer = window.setInterval(() => {
      crew.refreshStates();
      fx.trimPool();
    }, 6e4);
    for (let i = 0; i < crew.list.length; i++) crew.refreshRosterRow(crew.list[i]);
    if (lootEnabled) {
      crew.applyAllSwag();
      crew.renderLocker();
    }
    hud.setStats(game.state);
    pile.syncPile(true);
    pileGuides = headquarters.pileGuides = BL.pileGuides.create({ pile, altar,
      cameraClear: (ax, ay, az, bx, by, bz) => guideSegmentClear(ax, ay, az, bx, by, bz) && objectGuides.cameraClear(ax, ay, az, bx, by, bz, preparingGuideActor || crew.player, pile.core),
      cameraBoundsState: (minX, minY, minZ, maxX, maxY, maxZ, propsOnly) => objectGuides.cameraBoundsState(minX, minY, minZ, maxX, maxY, maxZ, preparingGuideActor || crew.player, pile.core, guideSegmentClear, propsOnly),
      occlusionVersion: () => objectGuides.result.occlusionVersion
    });
    platformGuides = headquarters.platformGuides = BL.pileGuides.create({ pile, altar, platform: true });
    mirrorGuides = mirrorCave.guides = BL.mirrorGuides.create({ mirror: mirrorCave, stand: matrixControl.button });
    // Scenery may receive outlines, but only island rock activates the hidden character view.
    // Banana interiors keep their separate covered-view pass.
    objectGuides = headquarters.objectGuides = BL.objectGuides.create({ roots: root.children, crew, actorRoots: clankers.list.map((entry) => entry.root), exclude: [...terrainRampRoof.geometries, pathNode.geometry], providers: [pileGuides, platformGuides, mirrorGuides], propsBlockActor: false, perceptionThrough: (actor) => inBananas(actor) ? pile.core : null });
    const guideOptions = { segmentClear: guideSegmentClear, objectClear: objectGuides.cameraClear, actorClear: objectGuides.perceptionClear, eyeAt: guideEyeAt, ownerBoundary: objectGuides.ownerBoundaryAt, ownerPerceived: objectGuides.perceived, ownerConcealed: objectGuides.concealed, ownerDistance: objectGuides.distance, ownerInView: objectGuides.inView, ownerClear: objectGuides.ownerClear, getProvider: objectGuides.getProvider };
    sightGuides = BL.sightGuides.create(guideOptions);
    bananaGuides = BL.sightGuides.create(guideOptions);
    sightGuides.reserve(objectGuides.result, null);
    bananaGuides.reserve(objectGuides.result, null);
    headquarters.sightGuides = sightGuides.state;
    headquarters.bananaGuides = bananaGuides.state;
    mark("guides");
    updateMeter();
    if (window.matchMedia("(max-width: 720px), (max-height: 500px)").matches) hud.el.sheet.dataset.open = "false";
    hintTimer = window.setTimeout(() => {
      if (!pilot.player && !clankerPlay.active && !matrixControl.promptAction) hud.hint(COARSE ? "Drag to look · pinch to eye level · sticks to fly · tap a cave" : "Drag to look · scroll to eye level · WASD to fly · tap a cave to enter");
    }, 1200);
    Object.assign(hubScene, {
      root, camera, input,
      debug: {
        get timechainIsland() { return timechainIsland; },
        slots: pile.slots, drops: pile.drops, core: pile.core, shell: pile.shell, delivery: pile.delivery, spillEffect: pile.spillEffect, cavemen: crew.cavemen, crates: crates.list, lab: null, hud, applyAllSwag: crew.applyAllSwag, renderLocker: crew.renderLocker, demoTip, setPileLevel: pile.setLevel, refreshStates: crew.refreshStates, trimPool: fx.trimPool,
        get shown() {
          return pile.shown;
        },
        terrainSections, caveSections, cutawayPaths: CUTAWAY_PATH_STATE, terrainRampRoof, get cutawayTravelRamp() { return cutawayTravelRamp; }, get cutawayTravelChannel() { return cutawayTravelChannel; }, get cutawayTravelStation() { return cutawayTravelStation; }, oogaPortal: pitGate, get oogaPortalArrival() { return pitArrival; }, island, mouths: island.mouths, labels, launchers, camera, weather, chain, beasts, pokeBeast, useProp, refreshChainSign, get chainSign() { return chainSign; }, get poolIsland() { return mempoolIsland; }, cameraPose: POSITION_POSE, crew, fx, controls: pilot.controls, props, altar, path: island.path.debug, headquarters, jumbotron, fireworks: launchFireworks, get fireworksPending() { return fireworksShells.length; }, get pileSound() { return pileSound; }, clankers, clankerPlay,
        scenery: {
          get candidateCount() { return scenery.length; },
          get visibleCount() { return sceneryVisible; },
          get radiusCulledCount() { return sceneryRadiusCulled; },
          get pathCulledCount() { return sceneryPathCulled; },
          get fixedCulledCount() { return sceneryFixedCulled; },
          get visibilityReflowCount() { return sceneryReflows; },
          get clearanceRadius() { return island.path.debug.ringOuterRadius + SCENERY_CLEARANCE; }
        },
        mirrorCave,
        matrixGate: {
          gates: matrixGates,
          sealed: sealedCaves,
          get unlocked() { return matrixCave.unlocked; },
          get pressed() { return matrixControl.pressed; },
          get near() { return matrixControl.near; },
          get button() { return matrixControl.button; },
          get lights() { return matrixControl.lights; },
          get lever() { return matrixControl.lever; },
          get grip() { return matrixControl.grip; },
          get x() { return matrixControl.x; },
          get z() { return matrixControl.z; },
          get visibleHeight() { return 0; },
          get hiddenHeight() { return MATRIX_GATE_HIDDEN_Y; },
          segmentClear: matrixGateSegmentClear,
          ceilingAt: matrixGateCeilingAt,
          openNear(x, y, z, reach = MATRIX_BUTTON_USE_REACH) {
            const gate = pilot.player && nearbyMatrixGate(x, y, z, reach);
            if (!gate) return false;
            useNearbyAction(gate);
            return true;
          },
          press: () => toggleMatrixControl(),
          set: (unlocked) => setMatrixUnlocked(!!unlocked, true)
        },
        cameraCave: CAMERA_CAVE_DEBUG,
        matrixCave: {
          get streamCount() { return matrixCave.streams.length; },
          get glyphCount() { return matrixCave.glyphCount; },
          get surfaceSectionCount() { return matrixCave.sections.length; },
          get surfaceStreamCount() { return matrixCave.streams.length; },
          get surfaceGlyphCount() { return matrixCave.glyphCount; },
          get activeGlyphCount() { return matrixCave.activeGlyphCount; },
          get brightTipCount() { return matrixCave.brightTipCount; },
          get capacity() { return matrixCave.capacity; },
          get glyphVersion() { return matrixCave.glyphVersion; },
          get previousGlyphVersion() { return matrixCave.previousGlyphVersion; },
          get mutationHash() { return matrixCave.mutationHash; },
          get glyphCadenceHz() { return MATRIX_GLYPH_HZ; },
          get bufferCount() { return MATRIX_TYPES; },
          get bufferBytes() { return matrixCave.bufferBytes; },
          get registryBytes() { return matrixCave.registryBytes; },
          get surfaceMetadataBytes() { return matrixCave.surfaceMetadataBytes; },
          get registryHash() { return matrixCave.registryHash; },
          get allocationCount() { return matrixCave.allocationCount; },
          get rebuildCount() { return matrixCave.rebuildCount; },
          get quality() { return matrixCave.quality; },
          get qualityDensity() { return matrixCave.densityRankLimit / 8; },
          get surfacePitch() { return MATRIX_SURFACE_PITCH; },
          get surfaceGap() { return MATRIX_SURFACE_GAP; },
          get surfaceCounts() { return matrixCave.surfaceCounts; },
          get activeSurfaceCounts() { return matrixCave.activeSurfaceCounts; },
          get terrainFaceCount() { return matrixCave.terrainFaces; },
          get propFaceCount() { return matrixCave.propFaces; },
          get geometrySource() { return "carved-terrain"; },
          get minBrightness() { return matrixCave.minBrightness; },
          get maxBrightness() { return matrixCave.maxBrightness; },
          get minTrainLength() { return matrixCave.minTrainLength; },
          get maxTrainLength() { return matrixCave.maxTrainLength; },
          get minGapLength() { return matrixCave.minGapLength; },
          get maxGapLength() { return matrixCave.maxGapLength; },
          get movingGapCount() { return matrixCave.movingGapCount; },
          get maxLocalZ() { return matrixCave.maximumLocalZ; },
          get portalClearance() { return PORTAL_Z - matrixCave.maximumLocalZ; },
          get mirrorDistance() { return matrixCave.mirrorDistance; },
          get mirrorHeight() { return MATRIX_MIRROR_HEIGHT; },
          get mirrorReveal() { return matrixCave.mirrorNode.mirrorReveal; },
          sampleMotion: (category) => {
            for (let i = 0; i < matrixCave.sections.length; i++) {
              const section = matrixCave.sections[i];
              if (section.category !== category) continue;
              const stream = matrixCave.streams[section.streamStart];
              return {
                surface: category, direction: stream.direction, speed: stream.speed,
                head: stream.head, gap: stream.gap, flowMin: stream.flowMin, flowMax: stream.flowMax, flowRange: stream.flowRange,
                trainLength: stream.trainLength, gapLength: stream.gapLength,
                flowX: section.vx * stream.direction, flowY: section.vy * stream.direction, flowZ: section.vz * stream.direction,
                leadingGlow: stream.brightness,
                secondGlow: stream.brightness * (0.48 + 0.52 * (1 - 1 / stream.trainLength)),
                trailingGlow: stream.brightness * (0.48 + 0.52 / stream.trainLength)
              };
            }
            return null;
          },
          get updates() { return matrixCave.updates; },
          get prewarmCount() { return 0; },
          get preloaded() { return false; },
          get drawEnabled() { return matrixCave.drawEnabled; },
          get drawnGlyphCount() { return matrixCave.drawnGlyphCount; },
          get batchDrawCount() {
            let count = 0;
            for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) count += matrixCave.nodes[glyph].drawInstanceCount;
            return count;
          },
          get preloadDistance() { return 0; },
          get revealedGlyphCount() { return matrixCave.revealedGlyphCount; },
          get visible() { return matrixCave.visible; },
          get inside() { return matrixCave.portal.inside; },
          get gateRain() { return gateRain; },
          get clouds() { return clouds; },
          get firstGlyphY() { return matrixCave.firstGlyphY; },
          world: {
            get active() { return !!MATRIX_WORLD.active; },
            get radius() { return MATRIX_WORLD.radius; },
            get direction() { return MATRIX_WORLD.direction; },
            get maxRadius() { return MATRIX_WORLD.maxRadius; },
            get permanentCave() { return MATRIX_WORLD.permanentCave; },
            get speed() { return MATRIX_WORLD.speed; },
            get retreatSpeed() { return MATRIX_WORLD.retreatSpeed; },
            get frontWidth() { return MATRIX_FRONT_WIDTH; },
            get density() { return MATRIX_WORLD.density; },
            get streamPitch() { return MATRIX_SURFACE_PITCH; },
            get glyphGap() { return MATRIX_SURFACE_GAP; },
            get pixelPitch() { return MATRIX_PIXEL_PITCH; },
            get pixelSize() { return MATRIX_PIXEL_SIZE; },
            get glyphCadenceHz() { return MATRIX_GLYPH_HZ; },
            get minimumStreamSpeed() { return MATRIX_STREAM_SPEED_MIN; },
            get maximumStreamSpeed() { return MATRIX_STREAM_SPEED_MIN + MATRIX_STREAM_SPEED_RANGE; },
            get minimumTrainLength() { return MATRIX_TRAIN_MIN; },
            get maximumTrainLength() { return MATRIX_TRAIN_MIN + MATRIX_TRAIN_RANGE - 1; },
            get minimumGapLength() { return MATRIX_TRAIN_GAP_MIN; },
            get maximumGapLength() { return MATRIX_TRAIN_GAP_MIN + MATRIX_TRAIN_GAP_RANGE - 1; },
            get palette() { return "#46ff70|#18dc4a"; },
            get leadingTipColor() { return "#d6ffe3"; },
            get voxelFaceShading() { return true; },
            get antialiasedGlyphEdges() { return true; },
            get caveEmissiveLighting() { return true; },
            get sharedEmissionCurve() { return true; },
            get lightingIndependentBrightness() { return true; },
            get emissionFloor() { return 0.78; },
            get emissionCeiling() { return 1.15; },
            get viewDependentPixelSides() { return true; },
            get opaqueGlyphFaces() { return true; },
            get brightClasses() { return "cavemen|trees|banana-pile|flying-bees|cave-sign-letters|fireflies|fires"; },
            get referenceCaveLayerIsolated() { return matrixCave.sections.every((section) => section.supports ? section.supports.every((support) => support.face.matrixCave === matrixCave.caveIndex) : section.face.matrixCave === matrixCave.caveIndex); },
            get coordinateSystem() { return "pile-centered-world-space"; },
            get caveRestartCount() { return 0; },
            get wallFlowDirection() { return "down"; },
            get radialBaseStreamCount() { return 32; },
            get radialMaximumStreamCount() { return 2048; },
            origin: MATRIX_WORLD.origin,
            caves: MATRIX_WORLD.caves,
            caveBounds: MATRIX_WORLD.caveBounds,
            get caveNear() { return MATRIX_WORLD.caveNear; },
            travelDistance: matrixTravelDistance,
            coverage: matrixCoverage,
            flowDistance: (x, z) => Math.hypot(x - MATRIX_WORLD.origin[0], z - MATRIX_WORLD.origin[2]),
            covered: (x, z) => !!MATRIX_WORLD.active && Math.hypot(x - MATRIX_WORLD.origin[0], z - MATRIX_WORLD.origin[2]) <= MATRIX_WORLD.radius,
            radialStreamCountAt: (radius) => 32 * 2 ** Math.max(0, Math.min(6, Math.ceil(Math.log2(Math.max(radius, 0.75) / 0.75)))),
            radialSpacingAt: (radius) => Math.PI * 2 * radius / (32 * 2 ** Math.max(0, Math.min(6, Math.ceil(Math.log2(Math.max(radius, 0.75) / 0.75))))),
            radialLinePoint: (stream, radius) => ({ x: Math.cos(-Math.PI + stream / 2048 * Math.PI * 2) * radius, z: Math.sin(-Math.PI + stream / 2048 * Math.PI * 2) * radius }),
            sampleStream: (stream = 0, time = MATRIX_WORLD.time) => matrixWorldStreamSample(stream, time, false),
            sampleWallStream: (stream = 0, time = MATRIX_WORLD.time) => matrixWorldStreamSample(stream, time, true)
          },
          portal: {
            get inside() { return matrixCave.portal.inside; },
            get lastCrossingDirection() { return matrixCave.portal.lastCrossingDirection; },
            plane: matrixCave.portal.plane,
            opening: matrixCave.portal.opening,
            rejected: matrixCave.portal.rejected
          },
          contains: inMatrixCave,
          overlayVisible: matrixOverlayVisible,
          viewApproach: viewMatrixApproach,
          viewInside: viewInsideMatrix
        },
        pilot,
        renderOpts: RENDER_OPTS,
        lamps,
        entranceLights,
        lighting: LIGHTING_DEBUG,
        fireSeats,
        get critters() {
          return critters.stats();
        },
        get daylight() {
          if (!DEBUG) syncDaylightDebug(hour);
          return DAYLIGHT_DEBUG;
        },
        setHour: (h, daylen = NaN, day = clock.dayOfYear) => {
          clock = daylight.createClock({ hour: h, daylen, day, time: timeParam });
        },
        magazine: { state: magazineState, get pickup() { return magazine; }, reveal: revealMagazine, grant: grantMagazine },
        get jetpack() {
          return {
            pickup: null,
            state: null,
            get owned() { return crew.list.length > 0 && crew.list.every(cave => cave.jetpackOwned); },
            get carrier() { return crew.player; },
            get wearer() { return crew.player?.jet ? crew.player : null; },
            grant: (cave = crew.player, wear = false) => cave ? grantJetpack(cave, wear) : false,
            toggle: toggleJetpack,
            dropHost: () => false,
            forceHostWrap: () => false
          };
        }
      }
    });
    Object.defineProperty(hubScene.debug.matrixCave, "caves", { value: matrixInteriors });
    hubScene.debug.overlayProfile = OVERLAY_PROFILE;
    if (world.mirrorBroken) {
      mirrorCave.damage.restore();
      syncMirrorDamage(true);
    }
    if (pitReturn && pilot.player) beginPitArrival();
    if (!pitArrival) pilot.update(0);
    if (ctx.from === null) restorePositionDebug();
    if (ctx.from === null && pilot.mode === "first-person") pilot.focusAim();
    if (POSITION_DEBUG) updatePositionDebug(true);
    mark("visibility-start");
    fx.warmVisibility(crew);
    mark("visibility");
    mark("covered-view-start");
    prepareCoveredView(ctx.overlay);
    mark("covered-view");
  };
  const leave = () => {
    clearCutawayHidden();
    pitArrival = null;
    pitGate.dispose();
    pitGate = null;
    uiGuideObjects = null; uiGuidesReady = false;
    if (enteringTween) enteringTween.alive = false;
    enteringTween = null;
    window.clearInterval(stateTimer);
    unsubscribeActivity();
    unsubscribeActivity = null;
    unsubscribeAccount();
    unsubscribeAccount = null;
    unsubscribeMempool();
    unsubscribeMempool = null;
    unsubscribeChain();
    unsubscribeChain = null;
    if (timechainIsland.boards) timechainIsland.boards.dispose();
    timechainIsland.beer.dispose();
    hud.closeBoard();
    if (chainSign && chainSign.node.geometry) renderer.releaseGeometry(chainSign.node.geometry);
    chainSign = null;
    weather.dispose();
    for (const entry of terrainSections) { entry.cap.dispose(); removeChild(entry.cap.node.parent, entry.cap.node); }
    for (const entry of caveSections) { entry.cap.dispose(); removeChild(entry.cap.node.parent, entry.cap.node); }
    terrainSections.length = caveSections.length = 0;
    terrainRampRoof.dispose();
    RENDER_OPTS.cutawayRegionCount = 0;
    RENDER_OPTS.cutawayRegions.length = 0;
    RENDER_OPTS.birdsEyeCutaway = false;
    RENDER_OPTS.cutawayFade = RENDER_OPTS.cutawayCloudMix = RENDER_OPTS.cutawayRockMix = 0;
    cutawayHeight = NaN;
    cutawayProgress = NaN;
    cutawayLevel = cutawayHillMix = 0;
    cutawayFeet = 0;
    cutawayX = cutawayZ = cutawayHeadY = 0;
    cutawayHill = false;
    cutawayPlayer = null;
    cutawayTravelRamp = null; cutawayTravelChannel = -1; cutawayTravelStation = 0;
    CUTAWAY_PATH_STATE.lo.fill(0); CUTAWAY_PATH_STATE.hi.fill(0); CUTAWAY_PATH_STATE.mix.fill(0); CUTAWAY_PATH_STATE.windowMix.fill(0); CUTAWAY_PATH_STATE.active = 0; CUTAWAY_PATH_STATE.version++;
    window.clearTimeout(hintTimer);
    if (positionDebug) {
      positionDebug.removeEventListener("click", copyPositionDebug);
      positionDebug.hidden = true;
      positionDebug.removeAttribute("data-pose");
      positionDebug.removeAttribute("data-copied");
    }
    clankerPlay.dispose();
    breakables.dispose();
    crates.dispose();
    pile.dispose();
    for (const entry of clankers.list) returnLabEquipment(entry);
    clankers.dispose();
    clankerMeshes.dispose();
    CLANKER_SUPPORT.node = null;
    clankerMeshes = clankerPartOwners = null;
    for (const item of clankerEquipment) {
      untrackMirrorObject(item.node); solids.remove(item.node); removeChild(root, item.node);
    }
    clankerEquipment.length = 0;
    BL.net.setBody(null);
    remotes.dispose();
    pileSound.dispose();
    remotes = pileSound = null;
    crew.dispose();
    critters.dispose();
    fx.dispose();
    cameraCover.dispose();
    bananaCover.dispose();
    solids.dispose();
    if (rockGuides) rockGuides.dispose();
    delete headquarters.rockGuides;
    sightGuides.dispose();
    bananaGuides.dispose();
    objectGuides.dispose();
    pileGuides.dispose();
    platformGuides.dispose();
    mirrorGuides.dispose();
    mirrorCave.damage.dispose();
    mirrorCave.ripples.dispose();
    entropyLab.phase.dispose();
    entropyLab = null;
    mirrorCave.body.dispose();
    pilot.dispose();
    if (oogatronUnsub) {
      oogatronUnsub();
      oogatronUnsub = null;
    }
    fireworksShells.length = 0;
    jumbotronSpot = null;
    if (jumbotron) {
      jumbotron.dispose(renderer);
      jumbotron = null;
    }
    for (const node of targets) input.remove(node);
    for (const node of placed) removeChild(root, node);
    targets.length = placed.length = claimed.length = scenery.length = sceneryClaims.length = matrixInteriors.length = matrixGates.length = sealedCaves.length = clouds.length = cloudObstacles.length = lamps.length = entranceLights.length = fireSeats.length = sleepers.length = labels.length = spots.length = openMouths.length = headquartersRimLintels.length = launchers.length = props.length = 0;
    launchCloudSpot = null;
    fireHazards.length = 0;
    workZones.length = 0;
    closedCaveZones.length = 0;
    cloudHit = null;
    RENDER_OPTS.lightCount = 0;
    RENDER_OPTS.cutawayMaxY = 1e6;
    MATRIX_WORLD.active = MATRIX_WORLD.direction = MATRIX_WORLD.radius = MATRIX_WORLD.permanentCave = 0;
    cameraCaveIndex = 0;
    cameraEntranceIndex = 0;
    cameraPreviousValid = false;
    cameraUnrestricted = cameraReentering = false;
    cameraTrailPlayer = null;
    cameraTrailCount = cameraTrailNext = 0;
    cameraTrailSleeping = false;
    cameraManualContact = false;
    cameraTerrainValid = false;
    cameraTerrainRecovering = false;
    cameraTerrainEntranceIndex = 0;
    caveEntryPlayer = null;
    playerCaveIndex = 0;
    CAMERA_OPENINGS.length = 0;
    LIGHTING_DEBUG.registeredLampCount = LIGHTING_DEBUG.activeFullLightCount = LIGHTING_DEBUG.approximatedLightCount = LIGHTING_DEBUG.selectedCount = LIGHTING_DEBUG.approximatedCount = 0;
    CAMERA_RAMP_CELLS.clear();
    for (let i = 0; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.selectedIds[i] = LIGHTING_DEBUG.approximatedIds[i] = null;
    sceneryVisible = sceneryRadiusCulled = sceneryPathCulled = sceneryFixedCulled = sceneryReflows = 0;
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    // Drop every per-visit ref but the cached island.
    terrainRampRoof = pathNode = altar = lawn = life = hud = hooks = input = pilot = fx = cameraCover = bananaCover = solids = rockGuides = objectGuides = sightGuides = bananaGuides = pileGuides = platformGuides = mirrorGuides = pile = crew = crates = critters = clock = presets = mirrorCave = matrixCave = matrixControl = gateRain = fire = headquarters = positionDebug = dockStairs = overlayCanvas = null;
    beasts.clear();
    magazine = magazineState = breakables = weather = mempoolIsland = timechainIsland = clankers = clankerPlay = null;
    hubScene.input = hubScene.debug = null;
    return { targets: count };
  };
  const liveGeometry = (set) => {
    pile.liveGeometry(set);
    breakables.liveGeometry(set);
    mirrorCave.damage.liveGeometry(set);
    clankers.liveGeometry(set);
    entropyLab.phase.liveGeometry(set);
    for (const item of clankerEquipment) set.add(item.node.geometry);
    for (const cave of crew.cavemen.values()) set.add(cave.headOpen).add(cave.headClosed);
    remotes.liveGeometry(set);
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...crates.stats(), ...crew.stats(), ...pile.stats(), ...critters.stats(), ...breakables.stats(), ...weather.stats(), ...remotes.stats() };
  };
  const hubScene = {
    id: "hub", enter, update, overlay, onDonation, onKey, onLootCleared, renderOpts: RENDER_OPTS, leave, stats, liveGeometry,
    root: null, camera: null, input: null, debug: null,
    get inMotion() {
      // Sani sits nearly always; only a spinning chair needs full rate behind another window.
      if (timechainIsland && timechainIsland.seat.speed > 0) return true;
      if (pile.inMotion || fx.inMotion || breakables.inMotion || weather.active || magazine && magazine.revealed || MATRIX_WORLD.active || mirrorGuides.state.doorway || mirrorCave.damage.active || mirrorCave.ripples.active || mirrorCave.body.active || entropyLab.phase.ripples.active || entropyLab.phase.body.contacts || entropyLab.phase.body.active) return true;
      for (const sign of headquarters.roomSigns) if (sign.velocity || sign.node.rotation.x) return true;
      for (let i = 0; i < matrixGates.length; i++) if (matrixCave && (matrixGates[i].raising || matrixCave.unlocked && matrixGates[i].node.position.y !== MATRIX_GATE_HIDDEN_Y)) return true;
      return false;
    }
  };
  BL.scenes = BL.scenes || {};
  BL.scenes.hub = hubScene;
})();
