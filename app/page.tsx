"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ViewMode = "factory" | "frontline" | "command";
type ResourceKey = "iron" | "steel" | "copper" | "circuits" | "cores";
type MachineKey = "ironDrills" | "furnaces" | "copperDrills" | "circuitFabs" | "coreFabs";
type UnitKey = "marine" | "tank" | "fighter";
type TechKey = "landing" | "bulk" | "logistics" | "autoCommand" | "salvage" | "strike" | "telemetry" | "bossAutonomy" | "deepScan";
type MachineLevels = Record<MachineKey, number>;
type Army = Record<UnitKey, number>;
type DeploymentCooldowns = Record<UnitKey, number>;
type TechState = Record<TechKey, number>;

type GameState = {
  version: 2; savedAt: number;
  iron: number; steel: number; copper: number; circuits: number; cores: number; data: number;
  machines: MachineLevels; army: Army; autoTrain: boolean; deployCooldowns: DeploymentCooldowns;
  region: number; nest: number; nestsCleared: number; nestHp: number; nestMaxHp: number;
  baseHp: number; retreats: number; bossEngaged: boolean; ascensions: number; tech: TechState;
  lifetimeCrafted: number; lifetimeKills: number; lifetimeNests: number;
};
type OfflineReport = { seconds: number; steel: number; circuits: number; cores: number; nests: number; status: string };
type TechDefinition = { key: TechKey; branch: "industry" | "military" | "expedition"; name: string; detail: string; cost: number };
type AlienKey = "crawler" | "spitter" | "brute";
type BattleUnit = {
  id: number; side: "human" | "alien"; kind: UnitKey | AlienKey;
  x: number; depth: number; hp: number; maxHp: number; attack: number; range: number; speed: number; cooldown: number;
  targetId?: number; squadSize?: number; formationSlot?: number; moving: boolean; attackFx: number; hitFx: number;
};
type AttackEffect = {
  id: number; side: "human" | "alien"; kind: UnitKey | AlienKey;
  fromX: number; fromY: number; toX: number; toY: number; life: number;
};
type AudioPreferences = { musicEnabled: boolean; musicVolume: number; sfxEnabled: boolean; sfxVolume: number };
type SfxName = "mineIron" | "mineCopper" | UnitKey | AlienKey | "alienImpact" | "alarm" | "baseDamage" | "baseCritical" | "defeat";

const SAVE_KEY = "assembly-ascendant-save-v2";
const LEGACY_SAVE_KEY = "assembly-ascendant-save";
const BASE_MAX_HP = 1000;
const NESTS_PER_REGION = 6;
const OFFLINE_CAP_SECONDS = 24 * 60 * 60;
const AUDIO_PREFS_KEY = "assembly-ascendant-audio";
const DEFAULT_AUDIO_PREFS: AudioPreferences = { musicEnabled: true, musicVolume: 0.4, sfxEnabled: true, sfxVolume: 0.45 };
const SFX: Record<SfxName, { paths: string[]; volume: number; rate: [number, number]; gap: number }> = {
  mineIron: { paths: ["/audio/sfx/mine-iron-metal.wav"], volume: 0.48, rate: [0.92, 1], gap: 80 },
  mineCopper: { paths: ["/audio/sfx/mine-copper-metal.wav"], volume: 0.38, rate: [1.02, 1.12], gap: 80 },
  marine: { paths: ["/audio/sfx/marine-01.ogg", "/audio/sfx/marine-02.ogg", "/audio/sfx/marine-03.ogg"], volume: 0.24, rate: [0.96, 1.08], gap: 170 },
  tank: { paths: ["/audio/sfx/tank-01.ogg", "/audio/sfx/tank-02.ogg"], volume: 0.34, rate: [0.9, 1.02], gap: 520 },
  fighter: { paths: ["/audio/sfx/fighter-01.ogg", "/audio/sfx/fighter-02.ogg"], volume: 0.26, rate: [1.02, 1.12], gap: 420 },
  crawler: { paths: ["/audio/sfx/crawler-01.ogg", "/audio/sfx/crawler-02.ogg", "/audio/sfx/crawler-03.ogg"], volume: 0.62, rate: [0.94, 1.12], gap: 520 },
  spitter: { paths: ["/audio/sfx/spitter-01.ogg", "/audio/sfx/spitter-02.ogg", "/audio/sfx/spitter-03.ogg"], volume: 0.68, rate: [0.92, 1.08], gap: 680 },
  brute: { paths: ["/audio/sfx/brute-attack.ogg"], volume: 0.76, rate: [0.84, 0.96], gap: 900 },
  alienImpact: { paths: ["/audio/sfx/base-impact.ogg"], volume: 0.42, rate: [0.72, 0.88], gap: 260 },
  alarm: { paths: ["/audio/sfx/wave-alarm.wav"], volume: 0.21, rate: [1, 1], gap: 3000 },
  baseDamage: { paths: ["/audio/sfx/base-impact.ogg"], volume: 0.3, rate: [0.9, 1.04], gap: 500 },
  baseCritical: { paths: ["/audio/sfx/base-critical.ogg"], volume: 0.38, rate: [0.86, 0.96], gap: 3000 },
  defeat: { paths: ["/audio/sfx/defeat.wav"], volume: 0.34, rate: [1, 1], gap: 5000 },
};
const blankMachines: MachineLevels = { ironDrills: 0, furnaces: 0, copperDrills: 0, circuitFabs: 0, coreFabs: 0 };
const blankArmy: Army = { marine: 0, tank: 0, fighter: 0 };
const blankDeployCooldowns: DeploymentCooldowns = { marine: 0, tank: 0, fighter: 0 };
const blankTech: TechState = { landing: 0, bulk: 0, logistics: 0, autoCommand: 0, salvage: 0, strike: 0, telemetry: 0, bossAutonomy: 0, deepScan: 0 };

const initialState = (): GameState => ({
  version: 2, savedAt: Date.now(), iron: 0, steel: 0, copper: 0, circuits: 0, cores: 0, data: 0,
  machines: { ...blankMachines }, army: { ...blankArmy }, autoTrain: false, deployCooldowns: { ...blankDeployCooldowns },
  region: 1, nest: 1, nestsCleared: 0, nestHp: 420, nestMaxHp: 420, baseHp: BASE_MAX_HP,
  retreats: 0, bossEngaged: true, ascensions: 0, tech: { ...blankTech },
  lifetimeCrafted: 0, lifetimeKills: 0, lifetimeNests: 0,
});

const ASSET = { iron: "/assets/iron-deposit.webp", steel: "/assets/iron-plate.webp", copper: "/assets/copper-deposit.webp", circuits: "/assets/circuit.webp", cores: "/assets/core.webp", data: "/assets/research-lab.webp" } as const;

const techDefinitions: TechDefinition[] = [
  { key: "landing", branch: "industry", name: "Automated Landing", detail: "Begin each redeployment with an iron drill and furnace.", cost: 2 },
  { key: "bulk", branch: "industry", name: "Batch Construction", detail: "Unlock x10 and MAX machine upgrades.", cost: 3 },
  { key: "logistics", branch: "industry", name: "Logistics Director", detail: "All production lines operate 35% faster.", cost: 7 },
  { key: "autoCommand", branch: "military", name: "Autonomous Command", detail: "Auto-deployment is available immediately after landing.", cost: 2 },
  { key: "salvage", branch: "military", name: "Battlefield Salvage", detail: "Retreats preserve 85% of every deployed unit.", cost: 4 },
  { key: "strike", branch: "military", name: "Focused Strike", detail: "Army damage against nests and bosses increases by 40%.", cost: 7 },
  { key: "telemetry", branch: "expedition", name: "Remote Telemetry", detail: "Reports identify the exact reason a front has stalled.", cost: 2 },
  { key: "bossAutonomy", branch: "expedition", name: "Boss Autonomy", detail: "Command may engage region bosses while you are away.", cost: 5 },
  { key: "deepScan", branch: "expedition", name: "Deep-Space Scan", detail: "Nest rewards and archived data increase by 30%.", cost: 7 },
];

const unlocked = (s: GameState, target: "copper" | "circuits" | "tank" | "cores" | "fighter" | "autoTrain" | "prestige") => {
  const progress = s.nestsCleared + s.ascensions * NESTS_PER_REGION;
  if (target === "copper") return progress >= 1;
  if (target === "circuits") return progress >= 2;
  if (target === "tank") return progress >= 3;
  if (target === "cores") return progress >= 4;
  if (target === "fighter") return progress >= 6;
  if (target === "autoTrain") return progress >= 1 || s.tech.autoCommand > 0;
  return s.nestsCleared >= NESTS_PER_REGION;
};

const machineDefinitions: Array<{ key: MachineKey; name: string; detail: string; icon: string; currency: ResourceKey; baseCost: number; curve: number; unlock: (s: GameState) => boolean }> = [
  { key: "ironDrills", name: "Iron Drill", detail: "+0.8 iron/s", icon: ASSET.iron, currency: "iron", baseCost: 12, curve: 1.17, unlock: () => true },
  { key: "furnaces", name: "Steel Furnace", detail: "iron → +0.58 steel/s", icon: ASSET.steel, currency: "iron", baseCost: 22, curve: 1.18, unlock: () => true },
  { key: "copperDrills", name: "Copper Drill", detail: "+0.65 copper/s", icon: ASSET.copper, currency: "steel", baseCost: 20, curve: 1.18, unlock: (s) => unlocked(s, "copper") },
  { key: "circuitFabs", name: "Circuit Printer", detail: "copper → +0.36 circuit/s", icon: ASSET.circuits, currency: "steel", baseCost: 28, curve: 1.2, unlock: (s) => unlocked(s, "circuits") },
  { key: "coreFabs", name: "Core Fabricator", detail: "steel + circuit → +0.08 core/s", icon: ASSET.cores, currency: "circuits", baseCost: 18, curve: 1.22, unlock: (s) => unlocked(s, "cores") },
];
const unitDefinitions: Array<{ key: UnitKey; name: string; role: string; image: string; cooldown: number; costs: Partial<Record<ResourceKey, number>>; unlock: (s: GameState) => boolean }> = [
  { key: "marine", name: "Marine", role: "Rapid line infantry", image: "/units/marine.png", cooldown: 4, costs: { steel: 8 }, unlock: () => true },
  { key: "tank", name: "Siege Tank", role: "Armored nest breaker", image: "/units/tank.png", cooldown: 8, costs: { steel: 18, circuits: 5 }, unlock: (s) => unlocked(s, "tank") },
  { key: "fighter", name: "Strike Fighter", role: "High-speed boss damage", image: "/units/fighter.png", cooldown: 12, costs: { circuits: 10, cores: 2 }, unlock: (s) => unlocked(s, "fighter") },
];

const fmt = (value: number) => {
  const v = Math.max(0, value);
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(Math.floor(v * 10) / 10);
};
const nextUnlock = (s: GameState) => {
  const p = s.nestsCleared + s.ascensions * NESTS_PER_REGION;
  if (p < 1) return { name: "COPPER EXTRACTION", at: "Destroy Nest 1" };
  if (p < 2) return { name: "CIRCUIT PRINTING", at: "Destroy Nest 2" };
  if (p < 3) return { name: "SIEGE TANK", at: "Destroy Nest 3" };
  if (p < 4) return { name: "CORE FABRICATION", at: "Destroy Nest 4" };
  if (p < 6) return { name: "STRIKE FIGHTER", at: "Defeat the Region Boss" };
  return { name: "ORBITAL REDEPLOYMENT", at: "Archive this expedition" };
};
const isBoss = (s: GameState) => s.nest === NESTS_PER_REGION;
const nestStats = (cleared: number, nest: number) => ({ maxHp: Math.round(420 * Math.pow(1.42, cleared) * (nest === NESTS_PER_REGION ? 2.5 : 1)), boss: nest === NESTS_PER_REGION });
const ratesFor = (s: GameState) => {
  const boost = 1 + s.tech.logistics * 0.35;
  return { iron: s.machines.ironDrills * 0.8 * boost, steel: s.machines.furnaces * 0.58 * boost, copper: s.machines.copperDrills * 0.65 * boost, circuits: s.machines.circuitFabs * 0.36 * boost, cores: s.machines.coreFabs * 0.08 * boost };
};
const armyStats = (s: GameState) => {
  const damage = (s.army.marine * 2.2 + s.army.tank * 8.5 + s.army.fighter * 15) * (1 + s.tech.strike * 0.4);
  const armor = s.army.marine * 2.5 + s.army.tank * 13 + s.army.fighter * 7;
  const threat = 10 + s.nestsCleared * 5.2 + (isBoss(s) ? 24 + s.region * 7 : 0);
  return { damage, armor, threat, total: s.army.marine + s.army.tank + s.army.fighter };
};
const cloneState = (s: GameState): GameState => ({ ...s, machines: { ...s.machines }, army: { ...s.army }, deployCooldowns: { ...s.deployCooldowns }, tech: { ...s.tech } });
const canAfford = (s: GameState, costs: Partial<Record<ResourceKey, number>>) => Object.entries(costs).every(([key, amount]) => s[key as ResourceKey] >= (amount ?? 0));
const spendCosts = (s: GameState, costs: Partial<Record<ResourceKey, number>>) => { for (const [key, amount] of Object.entries(costs)) s[key as ResourceKey] -= amount ?? 0; };
const trainOne = (s: GameState, key: UnitKey) => {
  const unit = unitDefinitions.find((candidate) => candidate.key === key);
  if (!unit || !unit.unlock(s) || s.deployCooldowns[key] > 0 || !canAfford(s, unit.costs)) return false;
  spendCosts(s, unit.costs); s.army[key] += 1; s.deployCooldowns[key] = unit.cooldown; return true;
};

const productionStep = (s: GameState, seconds: number) => {
  for (const key of ["marine", "tank", "fighter"] as UnitKey[]) s.deployCooldowns[key] = Math.max(0, s.deployCooldowns[key] - seconds);
  const rates = ratesFor(s);
  s.iron += rates.iron * seconds;
  const steelMade = Math.min(s.iron, rates.steel * seconds); s.iron -= steelMade; s.steel += steelMade;
  if (unlocked(s, "copper")) s.copper += rates.copper * seconds;
  if (unlocked(s, "circuits")) { const made = Math.min(s.copper, rates.circuits * seconds); s.copper -= made; s.circuits += made; }
  if (unlocked(s, "cores")) { const made = Math.min(rates.cores * seconds, s.steel / 2, s.circuits / 2); s.steel -= made * 2; s.circuits -= made * 2; s.cores += made; }
  s.lifetimeCrafted += steelMade;
};
const autoTrainStep = (s: GameState, attempts: number) => {
  if (!s.autoTrain || !unlocked(s, "autoTrain")) return;
  const weights: Record<UnitKey, number> = unlocked(s, "fighter")
    ? { marine: 2, tank: 1, fighter: 1 }
    : unlocked(s, "tank")
      ? { marine: 2, tank: 1, fighter: 0 }
      : { marine: 1, tank: 0, fighter: 0 };
  for (let i = 0; i < Math.min(60, attempts); i++) {
    const candidate = unitDefinitions
      .filter((unit) => weights[unit.key] > 0 && unit.unlock(s) && s.deployCooldowns[unit.key] <= 0 && canAfford(s, unit.costs))
      .sort((a, b) => (s.army[a.key] / weights[a.key]) - (s.army[b.key] / weights[b.key]))[0];
    if (!candidate || !trainOne(s, candidate.key)) break;
  }
};
const clearNest = (s: GameState) => {
  const boss = isBoss(s);
  s.data += Math.ceil((boss ? 5 : 1) * (1 + s.tech.deepScan * 0.3));
  s.lifetimeNests += 1; s.lifetimeKills += Math.round(12 + s.nestsCleared * 3.5); s.nestsCleared += 1;
  s.steel += 16 + s.region * 5; if (unlocked(s, "circuits")) s.circuits += 4 + s.region;
  if (boss) { s.region += 1; s.nest = 1; } else s.nest += 1;
  const next = nestStats(s.nestsCleared, s.nest); s.nestMaxHp = next.maxHp; s.nestHp = next.maxHp; s.bossEngaged = !next.boss || s.tech.bossAutonomy > 0;
};
const combatStep = (s: GameState, seconds: number) => {
  const stats = armyStats(s);
  if (!stats.total || (isBoss(s) && !s.bossEngaged)) return;
  const required = stats.total * 0.006 * seconds; const supply = Math.min(s.steel, required); s.steel -= supply;
  s.nestHp -= stats.damage * (supply + 0.001 >= required ? 1 : 0.38) * seconds;
  if (stats.armor < stats.threat) s.baseHp -= (stats.threat - stats.armor) * 0.07 * seconds;
  else s.baseHp = Math.min(BASE_MAX_HP, s.baseHp + 0.35 * seconds);
  if (s.baseHp <= 0) {
    const keep = s.tech.salvage ? 0.85 : 0.65;
    s.army.marine = Math.floor(s.army.marine * keep); s.army.tank = Math.floor(s.army.tank * keep); s.army.fighter = Math.floor(s.army.fighter * keep);
    s.baseHp = 520; s.nestHp = s.nestMaxHp; s.retreats += 1;
  } else if (s.nestHp <= 0) clearNest(s);
};
const simulate = (source: GameState, seconds: number, offline = false) => {
  const s = cloneState(source); const step = offline ? 5 : Math.min(1, seconds); let remaining = seconds;
  while (remaining > 0.001) { const dt = Math.min(step, remaining); productionStep(s, dt); autoTrainStep(s, Math.max(1, Math.floor(dt / 5))); if (offline) combatStep(s, dt); remaining -= dt; }
  s.savedAt = Date.now(); return s;
};
const migrateState = (value: unknown): GameState => {
  const base = initialState(); if (!value || typeof value !== "object") return base;
  const parsed = value as Partial<GameState> & Record<string, unknown>;
  if (parsed.version === 2) return { ...base, ...parsed, machines: { ...blankMachines, ...(parsed.machines || {}) }, army: { ...blankArmy, ...(parsed.army || {}) }, deployCooldowns: { ...blankDeployCooldowns, ...(parsed.deployCooldowns || {}) }, tech: { ...blankTech, ...(parsed.tech || {}) } };
  return { ...base, iron: Number(parsed.ore || 0), steel: Number(parsed.plates || 0), copper: Number(parsed.copperOre || 0), circuits: Number(parsed.circuits || 0), cores: Number(parsed.cores || 0), machines: { ironDrills: Number(parsed.drills || 0), furnaces: Number(parsed.furnaces || 0), copperDrills: Number(parsed.copperDrills || 0), circuitFabs: Number(parsed.circuitAssemblers || 0), coreFabs: Number(parsed.coreAssemblers || 0) } };
};

const humanBattleStats: Record<UnitKey, { hp: number; attack: number; range: number; speed: number }> = {
  marine: { hp: 78, attack: 13, range: 10, speed: 6.4 },
  tank: { hp: 220, attack: 34, range: 16, speed: 2.8 },
  fighter: { hp: 92, attack: 30, range: 18, speed: 8.5 },
};
const siegeLineFor = (kind: UnitKey, formationSlot = 0, depth = 0.5) => {
  const base = kind === "fighter" ? 76 : kind === "tank" ? 79 : 82;
  return base - formationSlot * 4.5 - depth;
};

const makeHumanBattleUnit = (kind: UnitKey, id: number, ordinal: number, squadSize = 1): BattleUnit => {
  const stats = humanBattleStats[kind];
  const hp = stats.hp * Math.sqrt(squadSize);
  return { id, side: "human", kind, x: 9 + (ordinal % 3) * 1.2, depth: 0.15 + ((ordinal * 37) % 70) / 100, hp, maxHp: hp, attack: stats.attack * squadSize, range: stats.range, speed: stats.speed, cooldown: 0, squadSize, formationSlot: ordinal % 3, moving: true, attackFx: 0, hitFx: 0 };
};

export default function Home() {
  const [g, setG] = useState<GameState>(initialState);
  const [loaded, setLoaded] = useState(false); const [started, setStarted] = useState(false);
  const [view, setView] = useState<ViewMode>("factory"); const [report, setReport] = useState<OfflineReport | null>(null);
  const [toast, setToast] = useState("Planetfall systems standing by.");
  const [audioPrefs, setAudioPrefs] = useState<AudioPreferences>(DEFAULT_AUDIO_PREFS);
  const [audioPrefsLoaded, setAudioPrefsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [battleUnits, setBattleUnits] = useState<BattleUnit[]>([]);
  const [attackEffects, setAttackEffects] = useState<AttackEffect[]>([]);
  const [waveCountdown, setWaveCountdown] = useState(8);
  const [wave, setWave] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null); const gRef = useRef(g);
  const battleUnitsRef = useRef<BattleUnit[]>([]);
  const waveActiveRef = useRef(false);
  const waveRef = useRef(0);
  const unitId = useRef(1);
  const effectId = useRef(1);
  const formationsInitializedRef = useRef(false);
  const armySignature = `squads:${g.army.marine}:${g.army.tank}:${g.army.fighter}`;
  const audioPrefsRef = useRef(audioPrefs);
  const sfxLastRef = useRef<Partial<Record<SfxName, number>>>({});

  const playSfx = useCallback((name: SfxName) => {
    const prefs = audioPrefsRef.current;
    if (!prefs.sfxEnabled) return;
    const config = SFX[name]; const now = performance.now();
    if (now - (sfxLastRef.current[name] || 0) < config.gap) return;
    sfxLastRef.current[name] = now;
    const sound = new Audio(config.paths[Math.floor(Math.random() * config.paths.length)]);
    sound.volume = Math.min(1, config.volume * prefs.sfxVolume);
    sound.playbackRate = config.rate[0] + Math.random() * (config.rate[1] - config.rate[0]);
    void sound.play().catch(() => {});
  }, []);

  const spawnEnemyWave = useCallback(() => {
    const state = gRef.current;
    if (isBoss(state) && !state.bossEngaged) return;
    const nextWave = waveRef.current + 1;
    const scale = 1 + state.nestsCleared * 0.16 + (nextWave - 1) * 0.1;
    const count = Math.min(10, 2 + Math.floor(nextWave * 0.8) + Math.floor(state.region / 2));
    const enemies: BattleUnit[] = Array.from({ length: count }).map((_, i) => {
      const brute = nextWave >= 3 && i === count - 1 && nextWave % 2 === 1;
      const spitter = !brute && nextWave >= 2 && i % 4 === 3;
      const kind: AlienKey = brute ? "brute" : spitter ? "spitter" : "crawler";
      const hp = (brute ? 280 : spitter ? 62 : 90) * scale;
      return { id: unitId.current++, side: "alien", kind, x: 90 - (i % 5) * 1.2, depth: 0.12 + ((i * 29) % 75) / 100, hp, maxHp: hp, attack: (brute ? 30 : spitter ? 15 : 18) * scale, range: spitter ? 10 : brute ? 3.4 : 2.7, speed: brute ? 2.25 : spitter ? 3.1 : 4.4, cooldown: i * 0.08, moving: true, attackFx: 0, hitFx: 0 };
    });
    waveActiveRef.current = true;
    const next = [...battleUnitsRef.current.filter((unit) => unit.side === "human"), ...enemies];
    battleUnitsRef.current = next; waveRef.current = nextWave; setBattleUnits(next); setWave(nextWave);
    playSfx("alarm");
    if (enemies.some((enemy) => enemy.kind === "brute")) playSfx("brute");
  }, [playSfx]);

  useEffect(() => { gRef.current = g; }, [g]);
  useEffect(() => { battleUnitsRef.current = battleUnits; }, [battleUnits]);
  useEffect(() => { waveRef.current = wave; }, [wave]);
  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      let saved: string | null = null; try { saved = localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY); } catch {}
      try { const savedAudio = localStorage.getItem(AUDIO_PREFS_KEY); if (savedAudio) setAudioPrefs({ ...DEFAULT_AUDIO_PREFS, ...JSON.parse(savedAudio) }); } catch {}
      if (saved) try {
        const restored = migrateState(JSON.parse(saved)); const away = Math.min(OFFLINE_CAP_SECONDS, Math.max(0, (Date.now() - restored.savedAt) / 1000));
        const advanced = away >= 10 ? simulate(restored, away, true) : restored;
        if (away >= 10) { const stats = armyStats(advanced); setReport({ seconds: away, steel: advanced.steel - restored.steel, circuits: advanced.circuits - restored.circuits, cores: advanced.cores - restored.cores, nests: advanced.nestsCleared - restored.nestsCleared, status: stats.total === 0 ? "Expedition waiting for deployed units." : advanced.nestHp < advanced.nestMaxHp ? "Frontline is advancing." : "Frontline is waiting for stronger supply." }); }
        setG(advanced);
      } catch {}
      setAudioPrefsLoaded(true);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(hydrate);
  }, []);
  useEffect(() => { if (!loaded || !started) return; const timer = window.setInterval(() => setG((current) => simulate(current, 1)), 1000); return () => window.clearInterval(timer); }, [loaded, started]);
  useEffect(() => { if (!loaded) return; const timer = window.setInterval(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...gRef.current, savedAt: Date.now() })); } catch {} }, 1500); return () => window.clearInterval(timer); }, [loaded]);
  useEffect(() => {
    audioPrefsRef.current = audioPrefs;
    if (audioPrefsLoaded) try { localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(audioPrefs)); } catch {}
    const audio = audioRef.current; if (!audio) return;
    audio.volume = audioPrefs.musicVolume;
    if (!audioPrefs.musicEnabled) audio.pause(); else if (started) void audio.play().catch(() => {});
  }, [audioPrefs, audioPrefsLoaded, started]);

  // Online combat keeps the original visible unit flow. Aggregate combat is only used while offline.
  useEffect(() => {
    if (!started) return;
    setBattleUnits((current) => {
      const next = [...current];
      for (const kind of ["marine", "tank", "fighter"] as UnitKey[]) {
        const existing = next.filter((unit) => unit.side === "human" && unit.kind === kind);
        const represented = existing.reduce((total, unit) => total + (unit.squadSize || 1), 0);
        if (!formationsInitializedRef.current && represented === 0 && g.army[kind] > 0) {
          const visible = g.army[kind] > 3 ? 1 : g.army[kind];
          const squadSize = g.army[kind] > 3 ? g.army[kind] : 1;
          for (let i = 0; i < visible; i++) next.push(makeHumanBattleUnit(kind, unitId.current++, i, squadSize));
        } else if (represented < g.army[kind]) {
          for (let i = represented; i < g.army[kind]; i++) next.push(makeHumanBattleUnit(kind, unitId.current++, i, 1));
        }
      }
      formationsInitializedRef.current = true;
      battleUnitsRef.current = next;
      return next;
    });
  }, [armySignature, started]);

  useEffect(() => {
    if (!started) return;
    const timer = window.setInterval(() => {
      const state = gRef.current;
      if (isBoss(state) && !state.bossEngaged) return;
      if (!battleUnitsRef.current.some((unit) => unit.side === "human")) return;
      if (waveActiveRef.current || battleUnitsRef.current.some((unit) => unit.side === "alien")) return;
      setWaveCountdown((countdown) => {
        if (countdown > 1) return countdown - 1;
        spawnEnemyWave();
        return 18;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [spawnEnemyWave, started]);

  useEffect(() => {
    if (!started) return;
    const timer = window.setInterval(() => {
      if (!battleUnitsRef.current.length) return;
      const state = gRef.current;
      const dt = 0.1;
      const units = battleUnitsRef.current.map((unit) => ({ ...unit, cooldown: Math.max(0, unit.cooldown - dt), attackFx: Math.max(0, unit.attackFx - 1), hitFx: Math.max(0, unit.hitFx - 1), moving: false }));
      const effects: AttackEffect[] = [];
      const attackSounds = new Set<SfxName>();
      const breached = new Set<number>();
      const mergedAway = new Set<number>();
      const deadHumans: Partial<Record<UnitKey, number>> = {};
      let nestDamage = 0;
      let baseDamage = 0;

      for (const kind of ["marine", "tank", "fighter"] as UnitKey[]) {
        const formation = units.filter((unit) => unit.side === "human" && unit.kind === kind && unit.hp > 0).sort((a, b) => b.x - a.x);
        const represented = formation.reduce((total, unit) => total + (unit.squadSize || 1), 0);
        if (represented < 4) continue;
        for (let index = 1; index < formation.length; index++) {
          const reinforcement = formation[index];
          const front = formation.slice(0, index).sort((a, b) => Math.hypot(a.x - reinforcement.x, (a.depth - reinforcement.depth) * 38) - Math.hypot(b.x - reinforcement.x, (b.depth - reinforcement.depth) * 38))[0];
          if (!front || Math.hypot(front.x - reinforcement.x, (front.depth - reinforcement.depth) * 38) > 3.8) continue;
          const newSize = (front.squadSize || 1) + (reinforcement.squadSize || 1);
          const healthRatio = ((front.hp / front.maxHp) * (front.squadSize || 1) + (reinforcement.hp / reinforcement.maxHp) * (reinforcement.squadSize || 1)) / newSize;
          front.squadSize = newSize; front.maxHp = humanBattleStats[kind].hp * Math.sqrt(newSize); front.hp = front.maxHp * healthRatio; front.attack = humanBattleStats[kind].attack * newSize;
          reinforcement.hp = 0; mergedAway.add(reinforcement.id); break;
        }
      }

      const visualY = (kind: UnitKey | AlienKey, depth: number) => kind === "fighter" ? 58 - depth * 11 : 78 - depth * 11;
      const fireAt = (unit: BattleUnit, x: number, y: number) => {
        unit.attackFx = 3;
        attackSounds.add(unit.kind);
        if (unit.side === "alien") attackSounds.add("alienImpact");
        effects.push({ id: effectId.current++, side: unit.side, kind: unit.kind, fromX: unit.x + (unit.side === "human" ? 2.6 : -2.6), fromY: visualY(unit.kind, unit.depth), toX: x, toY: y, life: unit.kind === "spitter" || unit.kind === "fighter" ? 4 : 3 });
      };

      for (const unit of units) {
        if (unit.hp <= 0) continue;
        const aliensAlive = units.some((candidate) => candidate.side === "alien" && candidate.hp > 0);
        const siegeLine = unit.side === "human" ? siegeLineFor(unit.kind as UnitKey, unit.formationSlot || 0, unit.depth) : 93;
        if (unit.side === "human") {
          const sameKind = units.filter((candidate) => candidate.side === "human" && candidate.kind === unit.kind && candidate.hp > 0);
          const represented = sameKind.reduce((total, candidate) => total + (candidate.squadSize || 1), 0);
          const frontMate = sameKind.filter((candidate) => candidate.id !== unit.id && candidate.x > unit.x + 0.2).sort((a, b) => Math.hypot(a.x - unit.x, (a.depth - unit.depth) * 38) - Math.hypot(b.x - unit.x, (b.depth - unit.depth) * 38))[0];
          if (represented >= 4 && frontMate) {
            const distance = Math.hypot(frontMate.x - unit.x, (frontMate.depth - unit.depth) * 38);
            if (distance > 3.5) {
              unit.moving = true; const step = Math.min(unit.speed * 1.45 * dt, distance - 3.35);
              unit.x += (frontMate.x - unit.x) / distance * step; unit.depth += ((frontMate.depth - unit.depth) * 38) / distance * step / 38;
              continue;
            }
          }
        }
        if (unit.side === "human" && unit.x >= siegeLine && !aliensAlive) {
          unit.targetId = undefined;
          unit.x = siegeLine;
          if (unit.cooldown <= 0) { nestDamage += unit.attack; fireAt(unit, 91, 66); unit.cooldown = unit.kind === "marine" ? 0.55 : 0.9; }
          if (waveRef.current < (isBoss(state) ? 1 : 2)) nestDamage = 0;
          continue;
        }
        if (unit.side === "alien" && unit.x <= 7) {
          baseDamage += unit.attack * 2.5; unit.hp = 0; breached.add(unit.id); continue;
        }
        let target = unit.targetId === undefined ? undefined : units.find((candidate) => candidate.id === unit.targetId && candidate.hp > 0);
        let distance = Infinity;
        if (target) distance = Math.hypot(target.x - unit.x, (target.depth - unit.depth) * 38);
        if (!target) for (const candidate of units) {
          if (candidate.side === unit.side || candidate.hp <= 0) continue;
          const d = Math.hypot(candidate.x - unit.x, (candidate.depth - unit.depth) * 38);
          if (d < distance) { distance = d; target = candidate; }
        }
        unit.targetId = target?.id;
        if (target && distance <= unit.range) {
          if (unit.cooldown <= 0) {
            target.hp -= unit.attack; target.hitFx = 3; fireAt(unit, target.x, visualY(target.kind, target.depth));
            if (unit.kind === "tank" || unit.kind === "fighter") for (const nearby of units) {
              if (nearby.side === unit.side || nearby.id === target.id || nearby.hp <= 0) continue;
              if (Math.hypot(nearby.x - target.x, (nearby.depth - target.depth) * 38) < 3.5) { nearby.hp -= unit.attack * (unit.kind === "tank" ? 0.38 : 0.28); nearby.hitFx = 2; }
            }
            unit.cooldown = unit.kind === "marine" ? 0.55 : unit.kind === "spitter" ? 1.15 : 0.9;
          }
        } else {
          unit.moving = true;
          if (target && distance < Infinity) {
            const dx = target.x - unit.x, dy = (target.depth - unit.depth) * 38;
            const step = Math.min(unit.speed * dt, Math.max(0, distance - unit.range * 0.82));
            unit.x += dx / distance * step; unit.depth += dy / distance * step / 38;
          } else unit.x += (unit.side === "human" ? 1 : -1) * unit.speed * dt;
          unit.x = Math.max(6, Math.min(unit.side === "human" ? siegeLine : 93, unit.x)); unit.depth = Math.max(0.08, Math.min(0.92, unit.depth));
        }
      }

      for (const unit of units) if (unit.side === "human" && unit.hp <= 0 && !mergedAway.has(unit.id)) deadHumans[unit.kind as UnitKey] = (deadHumans[unit.kind as UnitKey] || 0) + (unit.squadSize || 1);
      let survivors = units.filter((unit) => unit.hp > 0);
      const aliensRemain = survivors.some((unit) => unit.side === "alien");
      if (!aliensRemain && waveActiveRef.current) { waveActiveRef.current = false; setWaveCountdown(18); }
      attackSounds.forEach((sound) => playSfx(sound));
      if (baseDamage > 0) playSfx("baseDamage");
      setAttackEffects((current) => [...current.map((effect) => ({ ...effect, life: effect.life - 1 })).filter((effect) => effect.life > 1), ...effects]);

      if (baseDamage || nestDamage || Object.keys(deadHumans).length) {
        setG((current) => {
          const next = cloneState(current);
          const previousBaseHp = next.baseHp;
          next.baseHp = Math.max(0, next.baseHp - baseDamage);
          next.nestHp = Math.max(0, next.nestHp - nestDamage);
          if ([750, 500, 250].some((threshold) => previousBaseHp > threshold && next.baseHp <= threshold)) playSfx("baseCritical");
          for (const kind of ["marine", "tank", "fighter"] as UnitKey[]) next.army[kind] = Math.max(0, next.army[kind] - (deadHumans[kind] || 0));
          if (next.baseHp <= 0) {
            playSfx("defeat");
            formationsInitializedRef.current = false;
            const keep = next.tech.salvage ? 0.85 : 0.65;
            for (const kind of ["marine", "tank", "fighter"] as UnitKey[]) next.army[kind] = Math.floor(next.army[kind] * keep);
            next.baseHp = 520; next.nestHp = next.nestMaxHp; next.retreats += 1;
            survivors = []; waveRef.current = 0; setWave(0); setWaveCountdown(8); waveActiveRef.current = false;
          } else if (next.nestHp <= 0) {
            clearNest(next);
            survivors = survivors.filter((unit) => unit.side === "human").map((unit) => ({ ...unit, x: 9 + Math.random() * 3, targetId: undefined, moving: true }));
            waveRef.current = 0; setWave(0); setWaveCountdown(8); waveActiveRef.current = false;
          }
          return next;
        });
      }
      battleUnitsRef.current = survivors; setBattleUnits(survivors);
    }, 100);
    return () => window.clearInterval(timer);
  }, [playSfx, started]);

  const rates = useMemo(() => ratesFor(g), [g]); const army = useMemo(() => armyStats(g), [g]); const unlock = nextUnlock(g); const boss = isBoss(g);
  const prestigeReward = Math.max(1, Math.floor(g.nestsCleared * 1.2 + Math.sqrt(g.cores))) * (1 + g.tech.deepScan * 0.3); const canPrestige = unlocked(g, "prestige");
  const mine = (key: "iron" | "copper") => { if (key === "copper" && !unlocked(gRef.current, "copper")) return; setG((s) => ({ ...s, [key]: s[key] + (1 + s.ascensions * 0.25) })); playSfx(key === "iron" ? "mineIron" : "mineCopper"); setToast(`Manual extraction +${fmt(1 + g.ascensions * 0.25)} ${key}.`); };
  const machineCost = (key: MachineKey, count = 1) => { const def = machineDefinitions.find((item) => item.key === key)!; let total = 0; for (let i = 0; i < count; i++) total += Math.ceil(def.baseCost * Math.pow(def.curve, g.machines[key] + i)); return { resource: def.currency, total }; };
  const buyMachine = (key: MachineKey, requested = 1) => {
    const def = machineDefinitions.find((item) => item.key === key)!; if (!def.unlock(gRef.current)) return;
    setG((current) => { const s = cloneState(current); const limit = requested === Infinity ? 250 : requested; let bought = 0; for (let i = 0; i < limit; i++) { const price = Math.ceil(def.baseCost * Math.pow(def.curve, s.machines[key])); if (s[def.currency] < price) break; s[def.currency] -= price; s.machines[key] += 1; bought++; } if (bought) setToast(`${def.name} upgraded +${bought}.`); return s; });
  };
  const train = (key: UnitKey) => setG((current) => { const s = cloneState(current); if (trainOne(s, key)) { playSfx(key); setToast(`${unitDefinitions.find((unit) => unit.key === key)?.name} deployed.`); } return s; });
  const engageBoss = () => { setG((s) => ({ ...s, bossEngaged: true })); setToast("Region boss assault authorized."); };
  const repair = () => { if (g.steel < 12 || g.circuits < 2 || g.baseHp >= BASE_MAX_HP) return; setG((s) => ({ ...s, steel: s.steel - 12, circuits: s.circuits - 2, baseHp: Math.min(BASE_MAX_HP, s.baseHp + 220) })); };
  const buyTech = (definition: TechDefinition) => setG((current) => current.ascensions < 1 || current.tech[definition.key] || current.data < definition.cost ? current : { ...current, data: current.data - definition.cost, tech: { ...current.tech, [definition.key]: 1 } });
  const prestige = () => {
    if (!canPrestige || !window.confirm(`Archive this expedition for ${fmt(prestigeReward)} permanent data and redeploy the factory?`)) return;
    setG((current) => { const next = initialState(); next.data = current.data + prestigeReward; next.tech = { ...current.tech }; next.ascensions = current.ascensions + 1; next.lifetimeCrafted = current.lifetimeCrafted; next.lifetimeKills = current.lifetimeKills; next.lifetimeNests = current.lifetimeNests; if (current.tech.landing) { next.machines.ironDrills = 1; next.machines.furnaces = 1; next.iron = 20; } next.autoTrain = current.tech.autoCommand > 0; return next; });
    formationsInitializedRef.current = false; battleUnitsRef.current = []; waveActiveRef.current = false; waveRef.current = 0; setBattleUnits([]); setAttackEffects([]); setWave(0); setWaveCountdown(8);
    setView("command"); setToast("Orbital redeployment complete. Permanent protocols retained.");
  };
  const reset = () => { if (!window.confirm("Erase all v0.2 progress, permanent technology, and expedition history?")) return; setG(initialState()); setReport(null); formationsInitializedRef.current = false; battleUnitsRef.current = []; waveActiveRef.current = false; waveRef.current = 0; setBattleUnits([]); setAttackEffects([]); setWave(0); setWaveCountdown(8); try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); } catch {} };
  const updateAudioPref = <K extends keyof AudioPreferences>(key: K, value: AudioPreferences[K]) => setAudioPrefs((current) => ({ ...current, [key]: value }));
  const begin = () => { setStarted(true); if (audioRef.current && audioPrefs.musicEnabled) void audioRef.current.play().catch(() => {}); };
  if (!loaded) return <main className="v02-loading"><img src="/assets/logo-mark.png" alt=""/><span>RESTORING EXPEDITION DATA</span></main>;

  return <main className={`game-shell v02-shell ${!started ? "intro-active" : ""}`}>
    <audio ref={audioRef} src={started ? "/audio/theme-02-epic-mysterious-v2.wav" : "/audio/gsf-discovery.mp3"} preload="metadata" loop/>
    {!started && <section className="opening-cinematic ready" aria-label="Assembly Ascendant v0.2 opening">
      <div className="opening-camera" aria-hidden="true"><img src="/assets/opening-orbit.png" alt=""/><div className="opening-atmosphere"/><div className="opening-scanlines"/><span className="descent-trace trace-one"/><span className="descent-trace trace-two"/></div><div className="opening-vignette"/>
      <div className="opening-hud opening-hud-top"><span>ORBITAL INSERTION // A2-02</span><span>LINK 99.2%</span></div><div className="opening-hud opening-hud-bottom"><span>AUTONOMOUS FRONTIER PROTOCOL</span><span>FACTORY MEMORY ONLINE</span></div>
      <div className="opening-title-card"><img className="opening-logo" src="/assets/logo-mark.png" alt="Assembly Ascendant emblem"/><small>EXPEDITIONARY IDLE PROTOCOL // v0.2</small><h1>ASSEMBLY<br/><em>ASCENDANT</em></h1><p>BUILD THE FACTORY. ADVANCE THE FRONT.</p><div className="opening-actions"><button className="opening-primary" onClick={begin}><span>{g.lifetimeNests ? "CONTINUE EXPEDITION" : "BEGIN PLANETFALL"}</span><small>REGION {g.region} · NEST {g.nest} · {g.lifetimeNests} CLEARED</small></button><div><button onClick={() => setSettingsOpen(true)}>AUDIO SETTINGS</button>{g.lifetimeNests > 0 && <button onClick={reset}>NEW PROFILE</button>}</div></div></div>
    </section>}
    {settingsOpen && <div className="settings-backdrop" onPointerDown={() => setSettingsOpen(false)}><section className="audio-settings" role="dialog" aria-modal="true" aria-labelledby="audio-settings-title" onPointerDown={(event) => event.stopPropagation()}>
      <div className="settings-titlebar"><div><small>EXPEDITION AUDIO CONTROL</small><strong id="audio-settings-title">AUDIO SETTINGS</strong></div><button className="settings-close" onClick={() => setSettingsOpen(false)} aria-label="Close audio settings">×</button></div>
      <div className="audio-control"><div className="audio-control-heading"><span><b>BACKGROUND MUSIC</b><small>FACTORY AND CAMPAIGN SCORE</small></span><button className={`audio-switch ${audioPrefs.musicEnabled ? "on" : ""}`} onClick={() => updateAudioPref("musicEnabled", !audioPrefs.musicEnabled)}>{audioPrefs.musicEnabled ? "ON" : "OFF"}</button></div><label><span>VOLUME</span><input type="range" min="0" max="1" step="0.05" value={audioPrefs.musicVolume} disabled={!audioPrefs.musicEnabled} onChange={(event) => updateAudioPref("musicVolume", Number(event.target.value))}/><output>{Math.round(audioPrefs.musicVolume * 100)}%</output></label></div>
      <div className="audio-control"><div className="audio-control-heading"><span><b>SOUND EFFECTS</b><small>WEAPONS, ALERTS, DEPLOYMENT</small></span><button className={`audio-switch ${audioPrefs.sfxEnabled ? "on" : ""}`} onClick={() => updateAudioPref("sfxEnabled", !audioPrefs.sfxEnabled)}>{audioPrefs.sfxEnabled ? "ON" : "OFF"}</button></div><label><span>VOLUME</span><input type="range" min="0" max="1" step="0.05" value={audioPrefs.sfxVolume} disabled={!audioPrefs.sfxEnabled} onChange={(event) => updateAudioPref("sfxVolume", Number(event.target.value))}/><output>{Math.round(audioPrefs.sfxVolume * 100)}%</output></label></div>
      <p className="audio-note">Music and sound effects are saved separately on this device. Browser audio begins after your first interaction.</p>
    </section></div>}
    {report && started && <div className="v02-report-backdrop"><section className="v02-report" role="dialog" aria-modal="true" aria-labelledby="offline-report-title"><small>REMOTE TELEMETRY // RETURN REPORT</small><h2 id="offline-report-title">YOUR FACTORY KEPT WORKING</h2><p>Away for {formatDuration(report.seconds)}. Production and expedition results have been restored.</p><div className="v02-report-grid"><span><b>+{fmt(report.steel)}</b>STEEL</span><span><b>+{fmt(report.circuits)}</b>CIRCUITS</span><span><b>+{fmt(report.cores)}</b>CORES</span><span><b>{report.nests}</b>NESTS CLEARED</span></div><div className="v02-report-status">{report.status}</div><button onClick={() => setReport(null)}>COLLECT &amp; CONTINUE</button></section></div>}
    <header className="topbar v02-topbar"><div className="brand"><span className="brand-logo"><img src="/assets/logo-mark.png" alt=""/></span><div><strong>ASSEMBLY ASCENDANT</strong><small>AUTONOMOUS FRONTIER // v0.2</small></div></div><div className="objective"><span>{boss ? "REGION BOSS" : "ACTIVE EXPEDITION"}</span><strong>REGION {g.region} · {boss ? "HIVE CORE" : `NEST ${g.nest}/${NESTS_PER_REGION}`}</strong></div><div className="top-actions"><button className="settings-button" onClick={() => setSettingsOpen(true)}>⚙ SETTINGS</button><button className="reset" onClick={reset}>RESET</button></div></header>
    <nav className="mode-tabs v02-tabs" aria-label="Game sections"><button className={view === "factory" ? "active" : ""} onClick={() => setView("factory")}><span>01</span> FACTORY <small>PRODUCTION</small></button><button className={view === "frontline" ? "active" : ""} onClick={() => setView("frontline")}><span>02</span> FRONTLINE <small>{frontStatus(g)}</small></button><button className={view === "command" ? "active" : ""} onClick={() => setView("command")}><span>03</span> COMMAND <small>{g.ascensions ? `${g.ascensions} REDEPLOY` : "LOCKED TREE"}</small></button><div className="base-mini"><span>BASE</span><div><i style={{ width: `${g.baseHp / BASE_MAX_HP * 100}%` }}/></div><b>{fmt(g.baseHp)} HP</b></div></nav>
    <section className="v02-resource-strip" aria-label="Factory resources"><ResourceCard icon={ASSET.iron} name="IRON" value={g.iron} rate={rates.iron - rates.steel}/><ResourceCard icon={ASSET.steel} name="STEEL" value={g.steel} rate={rates.steel}/>{unlocked(g, "copper") && <ResourceCard icon={ASSET.copper} name="COPPER" value={g.copper} rate={rates.copper - rates.circuits}/>} {unlocked(g, "circuits") && <ResourceCard icon={ASSET.circuits} name="CIRCUITS" value={g.circuits} rate={rates.circuits}/>} {unlocked(g, "cores") && <ResourceCard icon={ASSET.cores} name="CORES" value={g.cores} rate={rates.cores}/>}<ResourceCard icon={ASSET.data} name="EXPEDITION DATA" value={g.data} rate={0} permanent/></section>
    {view === "factory" && <FactoryView g={g} rates={rates} toast={toast} unlock={unlock} machineCost={machineCost} buyMachine={buyMachine} mine={mine}/>}
    {view === "frontline" && <FrontlineView g={g} army={army} units={battleUnits} attackEffects={attackEffects} wave={wave} countdown={waveCountdown} train={train} engageBoss={engageBoss} repair={repair} setAutoTrain={(value) => setG((s) => ({ ...s, autoTrain: value }))}/>}
    {view === "command" && <CommandView g={g} prestigeReward={prestigeReward} canPrestige={canPrestige} prestige={prestige} buyTech={buyTech}/>}
    <footer className="v02-footer"><span>LOCAL SAVE // 24H OFFLINE MEMORY</span><span>{toast}</span><span>PROTOCOL A2.02</span></footer>
  </main>;
}

function FactoryView({ g, rates, toast, unlock, machineCost, buyMachine, mine }: { g: GameState; rates: ReturnType<typeof ratesFor>; toast: string; unlock: { name: string; at: string }; machineCost: (key: MachineKey, count?: number) => { resource: ResourceKey; total: number }; buyMachine: (key: MachineKey, requested?: number) => void; mine: (key: "iron" | "copper") => void }) {
  return <section className="v02-main-view v02-factory"><div className="v02-section-heading"><div><small>INDUSTRIAL NETWORK</small><h2>FACTORY CONTROL</h2></div><div className="v02-next-unlock"><span>NEXT UNLOCK</span><b>{unlock.name}</b><small>{unlock.at}</small></div></div><div className="v02-factory-layout">
    <aside className="v02-extraction"><div className="panel-heading"><span>MANUAL OVERRIDE</span><small>OPTIONAL BOOST</small></div><button className="v02-deposit iron" onClick={() => mine("iron")}><img src={ASSET.iron} alt=""/><span><b>EXTRACT IRON</b><small>Clicking is optional once drills are online.</small></span></button>{unlocked(g, "copper") && <button className="v02-deposit copper" onClick={() => mine("copper")}><img src={ASSET.copper} alt=""/><span><b>EXTRACT COPPER</b><small>Feed the circuit printing line.</small></span></button>}<div className="v02-toast">{toast}</div><Bottleneck g={g} rates={rates}/></aside>
    <div className="v02-lines">{machineDefinitions.map((machine) => { const open = machine.unlock(g); const price = machineCost(machine.key, 1); const canBuy = open && g[price.resource] >= price.total; return <article key={machine.key} className={`v02-line ${open ? "" : "locked"}`}><div className="v02-line-icon"><img src={machine.icon} alt=""/></div><div className="v02-line-copy"><small>{open ? "AUTOMATED PRODUCTION" : "FUTURE PROTOCOL"}</small><h3>{machine.name}</h3><p>{open ? machine.detail : unlockText(machine.key)}</p><div className="v02-level"><span>LEVEL {g.machines[machine.key]}</span><i style={{ width: `${Math.min(100, (g.machines[machine.key] % 10) * 10)}%` }}/></div></div>{open && <div className="v02-line-actions"><button disabled={!canBuy} onClick={() => buyMachine(machine.key)}>+1 <small>{fmt(price.total)} {price.resource}</small></button>{g.tech.bulk > 0 && <><button onClick={() => buyMachine(machine.key, 10)}>+10</button><button onClick={() => buyMachine(machine.key, Infinity)}>MAX</button></>}</div>}{!open && <strong className="v02-lock">LOCKED</strong>}</article>; })}</div>
  </div></section>;
}

function FrontlineView({ g, army, units, attackEffects, wave, countdown, train, engageBoss, repair, setAutoTrain }: { g: GameState; army: ReturnType<typeof armyStats>; units: BattleUnit[]; attackEffects: AttackEffect[]; wave: number; countdown: number; train: (key: UnitKey) => void; engageBoss: () => void; repair: () => void; setAutoTrain: (value: boolean) => void }) {
  const boss = isBoss(g); const waitingBoss = boss && !g.bossEngaged; const shielded = waitingBoss || wave < (boss ? 1 : 2); const progress = Math.max(0, 100 - g.nestHp / g.nestMaxHp * 100);
  return <section className="v02-main-view v02-frontline"><div className="v02-sector-map"><div><small>PLANETARY CAMPAIGN</small><h2>REGION {g.region}</h2></div><div className="v02-sector-nodes">{Array.from({ length: NESTS_PER_REGION }).map((_, index) => { const node = index + 1; const cleared = node < g.nest; const active = node === g.nest; return <span key={node} className={`${cleared ? "cleared" : ""} ${active ? "active" : ""} ${node === NESTS_PER_REGION ? "boss" : ""}`}><i>{cleared ? "✓" : node === NESTS_PER_REGION ? "◆" : node}</i><small>{node === NESTS_PER_REGION ? "HIVE" : `N${node}`}</small></span>; })}</div><div className="v02-front-state"><small>FRONT STATUS</small><b>{frontStatus(g)}</b></div></div>
    <div className="v02-war-stats"><Stat label="BASE INTEGRITY" value={`${fmt(g.baseHp)} / ${BASE_MAX_HP}`} detail={`${g.retreats} SAFE RETREATS`} progress={g.baseHp / BASE_MAX_HP * 100}/><Stat label="ARMY POWER" value={fmt(army.damage)} detail={`${army.total} UNITS DEPLOYED`} progress={Math.min(100, army.damage / Math.max(1, army.threat) * 100)}/><Stat label={boss ? "HIVE CORE" : "ALIEN NEST"} value={`${fmt(g.nestHp)} / ${fmt(g.nestMaxHp)}`} detail={`${fmt(progress)}% ASSAULT PROGRESS`} progress={g.nestHp / g.nestMaxHp * 100} danger/></div>
    <div className="battlefield v02-battlefield">
      <div className="battle-sky"><i/><i/><i/><i/><i/></div>
      <div className="base-structure"><img src="/assets/base-structure.webp" alt=""/><b>FACTORY</b></div>
      <div className={`nest-structure ${shielded ? "shielded" : ""}`}><img src="/assets/alien-nest.webp" alt=""/><b>{waitingBoss ? "AWAITING ORDER" : shielded ? `SHIELDED · WAVE ${boss ? 1 : 2}` : boss ? "HIVE CORE" : "NEST"}</b></div>
      <div className="battle-ground"/>
      <div className="frontline-marker"><span>{waitingBoss ? "COMMAND AUTHORIZATION REQUIRED" : units.some((unit) => unit.side === "alien") ? `WAVE ${wave} · ${units.filter((unit) => unit.side === "alien").length} HOSTILES` : army.total ? `NEXT WAVE IN ${countdown}s` : "DEPLOY UNITS TO ADVANCE"}</span></div>
      <svg className="combat-fx" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {attackEffects.map((effect) => <g key={effect.id} className={`attack-effect ${effect.side} ${effect.kind}`}><line x1={effect.fromX} y1={effect.fromY} x2={effect.toX} y2={effect.toY}/><circle className="impact-ring" cx={effect.toX} cy={effect.toY} r="1.1"/><circle className="impact-core" cx={effect.toX} cy={effect.toY} r=".38"/></g>)}
      </svg>
      {units.map((unit) => <div key={unit.id} className={`battle-unit ${unit.side} ${unit.kind} ${unit.moving ? "moving" : ""} ${unit.attackFx ? "attacking" : ""} ${unit.hitFx ? "hit" : ""}`} style={{ left: `${unit.x}%`, bottom: `${62 + unit.depth * 48}px`, zIndex: 10 + Math.round(unit.depth * 12), transform: `scale(${0.78 + unit.depth * 0.34})` }}>
        <div className="unit-hp"><i style={{ width: `${Math.max(0, unit.hp / unit.maxHp * 100)}%` }}/></div><span className="unit-shadow"/><img src={`/units/${unit.kind}.png`} alt=""/><span className="weapon-flash"/><small>{unit.kind.toUpperCase()}</small>{unit.side === "human" && (unit.squadSize || 1) > 1 && <b className="unit-squad-count">×{unit.squadSize}</b>}
      </div>)}
      {waitingBoss && <button className="v02-engage" onClick={engageBoss}>ENGAGE REGION BOSS<small>Manual authorization required for the first campaign.</small></button>}
    </div>
    <div className="v02-armory"><div className="v02-armory-head"><div><small>EXPEDITIONARY ARMORY</small><h2>DEPLOYMENT</h2></div>{unlocked(g, "autoTrain") && <label className="v02-auto"><span><b>AUTO DEPLOY</b><small>{unlocked(g, "fighter") ? "Doctrine 2 Marine · 1 Tank · 1 Fighter" : unlocked(g, "tank") ? "Doctrine 2 Marine · 1 Tank" : "Marine reinforcement doctrine"}</small></span><input type="checkbox" checked={g.autoTrain} onChange={(event) => setAutoTrain(event.target.checked)}/></label>}</div><div className="v02-unit-grid">{unitDefinitions.map((unit) => { const open = unit.unlock(g); const affordable = canAfford(g, unit.costs); const cooldown = g.deployCooldowns[unit.key]; return <button key={unit.key} className={`v02-unit-card ${!open ? "locked" : ""} ${cooldown > 0 ? "cooling" : ""}`} disabled={!open || !affordable || cooldown > 0} onClick={() => train(unit.key)}><img src={unit.image} alt=""/><span><small>{open ? unit.role : unlockText(unit.key)}</small><b>{unit.name}</b><em>{open && cooldown > 0 ? `DEPLOYING · ${Math.ceil(cooldown)}s` : costLabel(unit.costs)}</em></span><strong>{open ? `×${g.army[unit.key]}` : "LOCKED"}</strong></button>; })}</div><div className="v02-maintenance"><span><b>FIELD REPAIR</b><small>Restore 220 base integrity. A destroyed base retreats safely instead of ending the game.</small></span><button disabled={g.steel < 12 || g.circuits < 2 || g.baseHp >= BASE_MAX_HP} onClick={repair}>REPAIR · 12 STEEL + 2 CIRCUIT</button></div></div>
  </section>;
}

function CommandView({ g, prestigeReward, canPrestige, prestige, buyTech }: { g: GameState; prestigeReward: number; canPrestige: boolean; prestige: () => void; buyTech: (definition: TechDefinition) => void }) {
  return <section className="v02-main-view v02-command"><div className="v02-command-hero"><div><small>ORBITAL COMMAND</small><h2>REDEPLOYMENT &amp; PERMANENT RESEARCH</h2><p>Archive a successful expedition, rebuild from orbit, and keep every protocol you have learned.</p></div><div className="v02-career"><span><b>{g.ascensions}</b>REDEPLOYMENTS</span><span><b>{g.lifetimeNests}</b>NESTS</span><span><b>{fmt(g.lifetimeCrafted)}</b>CRAFTED</span></div></div>
    <div className="v02-prestige-card"><div><small>ACTIVE EXPEDITION ARCHIVE</small><h3>{canPrestige ? "ORBITAL WINDOW READY" : "REACH THE REGION BOSS"}</h3><p>{canPrestige ? "Current machines, resources, army and territory reset. Data, technology, records and automation rules remain." : "Destroy all six targets in Region 1 to unlock your first voluntary redeployment."}</p></div><div className="v02-prestige-reward"><span>ARCHIVE REWARD</span><b>+{fmt(prestigeReward)} DATA</b><small>CURRENT BALANCE {fmt(g.data)}</small><button disabled={!canPrestige} onClick={prestige}>BEGIN ORBITAL REDEPLOYMENT</button></div></div>
    {g.ascensions < 1 ? <div className="v02-tree-locked"><img src={ASSET.data} alt=""/><div><small>PERMANENT TECHNOLOGY</small><h3>COMPLETE YOUR FIRST REDEPLOYMENT</h3><p>The technology matrix appears after you prove the factory can defeat a region hive.</p></div></div> : <div className="v02-tech-tree">{(["industry", "military", "expedition"] as const).map((branch) => <section className={`v02-tech-branch ${branch}`} key={branch}><div className="v02-branch-title"><small>PERMANENT BRANCH</small><h3>{branch.toUpperCase()}</h3></div>{techDefinitions.filter((tech) => tech.branch === branch).map((tech) => { const owned = g.tech[tech.key] > 0; return <button key={tech.key} className={owned ? "owned" : ""} disabled={owned || g.data < tech.cost} onClick={() => buyTech(tech)}><span><b>{tech.name}</b><small>{tech.detail}</small></span><strong>{owned ? "ONLINE" : `${tech.cost} DATA`}</strong></button>; })}</section>)}</div>}
    <div className="v02-offline-policy"><div><small>AUTONOMOUS MEMORY</small><h3>24-HOUR OFFLINE PROTOCOL</h3></div><p>The factory produces, reinforces and advances while you are away. If the army cannot overcome a threat, it waits or retreats safely. No offline game over.</p></div>
  </section>;
}

function ResourceCard({ icon, name, value, rate, permanent = false }: { icon: string; name: string; value: number; rate: number; permanent?: boolean }) { return <div className={`v02-resource ${permanent ? "permanent" : ""}`}><img src={icon} alt=""/><span><small>{name}</small><b>{fmt(value)}</b></span><em>{permanent ? "PERMANENT" : `${rate >= 0 ? "+" : ""}${fmt(rate)}/s`}</em></div>; }
function Bottleneck({ g, rates }: { g: GameState; rates: ReturnType<typeof ratesFor> }) {
  let title = "LINE BALANCED", detail = "Production network is ready for expansion.";
  if (!g.machines.ironDrills) { title = "NO AUTOMATION"; detail = "Build an Iron Drill to continue producing while away."; }
  else if (!g.machines.furnaces) { title = "STEEL BOTTLENECK"; detail = "Build a furnace to convert iron into military steel."; }
  else if (rates.steel > rates.iron + 0.01) { title = "IRON STARVED"; detail = "Furnaces can consume more iron than drills currently supply."; }
  else if (unlocked(g, "circuits") && !g.machines.circuitFabs) { title = "CIRCUITS REQUIRED"; detail = "A Circuit Printer unlocks tanks and advanced command."; }
  else if (unlocked(g, "cores") && !g.machines.coreFabs) { title = "CORE LINE OFFLINE"; detail = "Build a Core Fabricator for high-tier units and orbit."; }
  return <div className="v02-bottleneck"><small>BOTTLENECK ADVISOR</small><b>{title}</b><p>{detail}</p></div>;
}
function Stat({ label, value, detail, progress, danger = false }: { label: string; value: string; detail: string; progress: number; danger?: boolean }) { return <div className={`v02-stat ${danger ? "danger" : ""}`}><small>{label}</small><b>{value}</b><span>{detail}</span><div><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}/></div></div>; }
function frontStatus(s: GameState) { const stats = armyStats(s); if (isBoss(s) && !s.bossEngaged) return "AWAITING ORDER"; if (!stats.total) return "AWAITING UNITS"; if (stats.damage < stats.threat * 0.45) return "STALLED"; if (stats.armor < stats.threat) return "UNDER PRESSURE"; return "ADVANCING"; }
function unlockText(key: MachineKey | UnitKey) { if (key === "copperDrills") return "Destroy Nest 1"; if (key === "circuitFabs") return "Destroy Nest 2"; if (key === "tank") return "Destroy Nest 3"; if (key === "coreFabs") return "Destroy Nest 4"; if (key === "fighter") return "Defeat the Region Boss"; return "Advance the expedition"; }
function costLabel(costs: Partial<Record<ResourceKey, number>>) { return Object.entries(costs).map(([key, value]) => `${value} ${key.toUpperCase()}`).join(" + "); }
function formatDuration(seconds: number) { const hours = Math.floor(seconds / 3600), minutes = Math.max(1, Math.floor((seconds % 3600) / 60)); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
