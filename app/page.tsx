"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type OreMode = "iron" | "copper";
type ViewMode = "factory" | "defense";
type MachineKey = "drills" | "furnaces" | "assemblers" | "labs" | "copperDrills" | "copperFurnaces" | "circuitAssemblers" | "coreAssemblers";
type MachineDamage = Record<MachineKey, number>;
type HumanUnit = "marine" | "tank" | "fighter";
type AlienUnit = "crawler" | "spitter" | "brute";
type AudioPreferences = {
  musicEnabled: boolean; musicVolume: number;
  sfxEnabled: boolean; sfxVolume: number;
};
type SfxName = "ui" | "mineIron" | "mineCopper" | "purchase" | "reject" | "research" |
  "marine" | "tank" | "fighter" | "crawler" | "spitter" | "brute" | "bruteRoar" |
  "alarm" | "baseDamage" | "baseCritical" | "victory" | "defeat";
type BattleUnit = {
  id: number; side: "human" | "alien"; kind: HumanUnit | AlienUnit;
  x: number; depth: number; hp: number; maxHp: number; attack: number; range: number; speed: number; cooldown: number;
  targetId?: number; moving: boolean; attackFx: number; hitFx: number;
};
type AttackEffect = {
  id: number; side: "human" | "alien"; kind: HumanUnit | AlienUnit;
  fromX: number; fromY: number; toX: number; toY: number; life: number;
};
type GameState = {
  ore: number; plates: number; gears: number; science: number;
  drills: number; furnaces: number; assemblers: number; labs: number;
  clickLevel: number; efficiency: number;
  copperOre: number; copperPlates: number; circuits: number; cores: number;
  copperDrills: number; copperFurnaces: number; circuitAssemblers: number; coreAssemblers: number;
  miningTech: number; smeltingTech: number; assemblyTech: number; won: boolean;
  baseHp: number; nestHp: number; wave: number; completedWaves: number; kills: number; defenseWon: boolean; defenseLost: boolean;
  damaged: MachineDamage;
};

const blankDamage: MachineDamage = { drills: 0, furnaces: 0, assemblers: 0, labs: 0, copperDrills: 0, copperFurnaces: 0, circuitAssemblers: 0, coreAssemblers: 0 };

const initial: GameState = {
  ore: 0, plates: 0, gears: 0, science: 0,
  drills: 0, furnaces: 0, assemblers: 0, labs: 0,
  clickLevel: 1, efficiency: 1,
  copperOre: 0, copperPlates: 0, circuits: 0, cores: 0,
  copperDrills: 0, copperFurnaces: 0, circuitAssemblers: 0, coreAssemblers: 0,
  miningTech: 0, smeltingTech: 0, assemblyTech: 0, won: false,
  baseHp: 1000, nestHp: 1000, wave: 0, completedWaves: 0, kills: 0, defenseWon: false, defenseLost: false,
  damaged: blankDamage,
};

const fmt = (v: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(Math.floor(Math.max(0, v) * 10) / 10);
const cost = (base: number, count: number, curve = 1.18) => Math.ceil(base * Math.pow(curve, count));
const RESEARCH_PER_CORE = 4;
const BASE_MAX_HP = 1000;
const NEST_MAX_HP = 1000;
const NEST_SHIELD_WAVES = 3;
const FIRST_WAVE_DELAY = 45;
const WAVE_INTERMISSION = 25;
const AUDIO_PREFS_KEY = "assembly-ascendant-audio";
const DEFAULT_AUDIO_PREFS: AudioPreferences = { musicEnabled: true, musicVolume: 0.38, sfxEnabled: true, sfxVolume: 0.55 };
const RECORDED_SFX: Partial<Record<SfxName, { paths: string[]; volume: number; rate: [number, number] }>> = {
  mineIron: { paths: ["/audio/sfx/mine-iron-metal.wav"], volume: 0.48, rate: [0.92, 1] },
  mineCopper: { paths: ["/audio/sfx/mine-copper-metal.wav"], volume: 0.38, rate: [1.02, 1.12] },
  marine: { paths: ["/audio/sfx/marine-01.ogg", "/audio/sfx/marine-02.ogg", "/audio/sfx/marine-03.ogg"], volume: 0.24, rate: [0.96, 1.08] },
  tank: { paths: ["/audio/sfx/tank-01.ogg", "/audio/sfx/tank-02.ogg"], volume: 0.34, rate: [0.9, 1.02] },
  fighter: { paths: ["/audio/sfx/fighter-01.ogg", "/audio/sfx/fighter-02.ogg"], volume: 0.26, rate: [1.02, 1.12] },
  crawler: { paths: ["/audio/sfx/crawler-01.ogg", "/audio/sfx/crawler-02.ogg", "/audio/sfx/crawler-03.ogg"], volume: 0.18, rate: [0.94, 1.12] },
  spitter: { paths: ["/audio/sfx/spitter-01.ogg", "/audio/sfx/spitter-02.ogg", "/audio/sfx/spitter-03.ogg"], volume: 0.22, rate: [0.92, 1.08] },
  brute: { paths: ["/audio/sfx/brute-attack.ogg"], volume: 0.26, rate: [0.84, 0.96] },
  bruteRoar: { paths: ["/audio/sfx/brute-roar.wav"], volume: 0.3, rate: [0.86, 0.94] },
  alarm: { paths: ["/audio/sfx/wave-alarm.wav"], volume: 0.21, rate: [1, 1] },
  baseDamage: { paths: ["/audio/sfx/base-impact.ogg"], volume: 0.3, rate: [0.9, 1.04] },
  baseCritical: { paths: ["/audio/sfx/base-critical.ogg"], volume: 0.38, rate: [0.86, 0.96] },
  defeat: { paths: ["/audio/sfx/defeat.wav"], volume: 0.34, rate: [1, 1] },
};
const ASSET = {
  ironOre: "/assets/iron-ore.webp",
  ironPlate: "/assets/iron-plate.webp",
  copperOre: "/assets/copper-ore.webp",
  copperPlate: "/assets/copper-plate.webp",
  gear: "/assets/gear.webp",
  circuit: "/assets/circuit.webp",
  core: "/assets/core.webp",
  research: "/assets/research-lab.webp",
} as const;
const activeMachines = (s: GameState, key: MachineKey, count: number) => Math.max(0, count - (s.damaged?.[key] || 0));

export default function Home() {
  const [g, setG] = useState<GameState>(initial);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<ViewMode>("factory");
  const [mineMode, setMineMode] = useState<OreMode>("iron");
  const [pulse, setPulse] = useState(0);
  const [toast, setToast] = useState("Select a deposit and begin extraction.");
  const [battleUnits, setBattleUnits] = useState<BattleUnit[]>([]);
  const [attackEffects, setAttackEffects] = useState<AttackEffect[]>([]);
  const [waveCountdown, setWaveCountdown] = useState(FIRST_WAVE_DELAY);
  const [audioPrefs, setAudioPrefs] = useState<AudioPreferences>(DEFAULT_AUDIO_PREFS);
  const [audioPrefsLoaded, setAudioPrefsLoaded] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const last = useRef(Date.now());
  const battleUnitsRef = useRef<BattleUnit[]>([]);
  const gRef = useRef(g);
  const unitId = useRef(1);
  const effectId = useRef(1);
  const musicRef = useRef<HTMLAudioElement>(null);
  const audioPrefsRef = useRef(audioPrefs);
  const sfxContextRef = useRef<AudioContext | null>(null);
  const sfxBuffersRef = useRef(new Map<string, Promise<AudioBuffer>>());
  const combatSfxLastRef = useRef<Record<string, number>>({});
  const endSfxPlayedRef = useRef<"victory" | "defeat" | null>(null);
  const waveActiveRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("assembly-ascendant-save");
      if (saved) {
        const parsed = JSON.parse(saved);
        setG({ ...initial, ...parsed, damaged: { ...blankDamage, ...(parsed.damaged || {}) } });
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => { gRef.current = g; }, [g]);
  useEffect(() => { battleUnitsRef.current = battleUnits; }, [battleUnits]);

  useEffect(() => {
    const loadAudioPreferences = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(AUDIO_PREFS_KEY);
        if (saved) setAudioPrefs({ ...DEFAULT_AUDIO_PREFS, ...JSON.parse(saved) });
      } catch {}
      setAudioPrefsLoaded(true);
    }, 0);
    return () => window.clearTimeout(loadAudioPreferences);
  }, []);

  useEffect(() => {
    audioPrefsRef.current = audioPrefs;
    if (audioPrefsLoaded) {
      try { localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(audioPrefs)); } catch {}
    }
    const music = musicRef.current;
    if (!music) return;
    music.volume = audioPrefs.musicVolume;
    if (!audioPrefs.musicEnabled) music.pause();
    else if (audioUnlocked) void music.play().catch(() => {});
  }, [audioPrefs, audioPrefsLoaded, audioUnlocked]);

  useEffect(() => {
    const unlockAudio = () => {
      setAudioUnlocked(true);
      const music = musicRef.current;
      if (music && audioPrefsRef.current.musicEnabled) {
        music.volume = audioPrefsRef.current.musicVolume;
        void music.play().catch(() => {});
      }
    };
    document.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => document.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      const music = musicRef.current;
      if (!music) return;
      if (document.hidden) music.pause();
      else if (audioUnlocked && audioPrefsRef.current.musicEnabled) void music.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [audioUnlocked]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSettingsOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

  useEffect(() => () => { void sfxContextRef.current?.close(); }, []);

  const playSfx = (name: SfxName) => {
    if (!audioPrefsRef.current.sfxEnabled) return;
    const context = sfxContextRef.current ?? new AudioContext();
    sfxContextRef.current = context;
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const volume = audioPrefsRef.current.sfxVolume;
    const recorded = RECORDED_SFX[name];
    if (recorded) {
      const playRecording = (path: string, level: number, rate: [number, number], delay = 0) => {
        let pendingBuffer = sfxBuffersRef.current.get(path);
        if (!pendingBuffer) {
          pendingBuffer = fetch(path).then((response) => {
            if (!response.ok) throw new Error(`Unable to load sound effect: ${path}`);
            return response.arrayBuffer();
          }).then((data) => context.decodeAudioData(data));
          sfxBuffersRef.current.set(path, pendingBuffer);
        }
        void pendingBuffer.then((buffer) => {
          if (!audioPrefsRef.current.sfxEnabled || context.state === "closed") return;
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = buffer;
          source.playbackRate.value = rate[0] + Math.random() * (rate[1] - rate[0]);
          gain.gain.value = level * audioPrefsRef.current.sfxVolume;
          source.connect(gain).connect(context.destination);
          source.start(context.currentTime + delay);
        }).catch(() => {});
      };
      const path = recorded.paths[Math.floor(Math.random() * recorded.paths.length)];
      playRecording(path, recorded.volume, recorded.rate);
      if (name === "tank") {
        playRecording("/audio/sfx/base-critical.ogg", 0.3, [0.78, 0.88], 0.035);
      }
      return;
    }
    const tone = (frequency: number, delay: number, duration: number, level: number, type: OscillatorType = "sine", endFrequency?: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * volume), start + Math.min(0.012, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    };
    const noiseHit = (delay: number, duration: number, level: number, cutoff: number) => {
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const start = now + delay;
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      gain.gain.setValueAtTime(level * volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter).connect(gain).connect(context.destination);
      source.start(start);
    };

    if (name === "ui") tone(720, 0, 0.055, 0.025, "sine", 430);
    if (name === "purchase") {
      noiseHit(0, 0.055, 0.035, 1800);
      tone(196, 0, 0.10, 0.05, "triangle", 155);
      tone(392, 0.065, 0.13, 0.045, "sine");
      tone(587.3, 0.13, 0.18, 0.04, "sine");
    }
    if (name === "reject") {
      tone(155, 0, 0.16, 0.065, "sawtooth", 92);
      tone(116.5, 0.075, 0.18, 0.05, "square", 73);
    }
    if (name === "research") {
      [440, 554.4, 659.3, 880].forEach((frequency, index) => tone(frequency, index * 0.07, 0.28, 0.045 - index * 0.004, index === 3 ? "sine" : "triangle"));
      tone(1760, 0.25, 0.42, 0.022, "sine", 1320);
    }
    if (name === "victory") {
      [293.7, 370, 440, 587.3, 740].forEach((frequency, index) => tone(frequency, index * 0.105, 0.62, 0.055 - index * 0.004, index < 2 ? "triangle" : "sine"));
      tone(146.8, 0, 1.15, 0.055, "triangle", 220);
    }
  };

  const playInterfaceSound = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    if (!button || button.disabled || button.matches(".asteroid,.shop-row,.upgrade-card,.tech-card")) return;
    playSfx("ui");
  };

  const updateAudioPref = <K extends keyof AudioPreferences>(key: K, value: AudioPreferences[K]) => {
    setAudioPrefs((current) => ({ ...current, [key]: value }));
  };

  const mult = useMemo(() => ({
    mining: (g.efficiency || 1) * (1 + g.miningTech * 0.25),
    smelting: (g.efficiency || 1) * (1 + g.smeltingTech * 0.25),
    assembly: (g.efficiency || 1) * (1 + g.assemblyTech * 0.25),
  }), [g.efficiency, g.miningTech, g.smeltingTech, g.assemblyTech]);

  const rates = useMemo(() => ({
    ironOre: activeMachines(g, "drills", g.drills) * 0.8 * mult.mining,
    copperOre: activeMachines(g, "copperDrills", g.copperDrills) * 0.65 * mult.mining,
    ironPlate: activeMachines(g, "furnaces", g.furnaces) * 0.6 * mult.smelting,
    copperPlate: activeMachines(g, "copperFurnaces", g.copperFurnaces) * 0.5 * mult.smelting,
    gear: activeMachines(g, "assemblers", g.assemblers) * 0.28 * mult.assembly,
    circuit: activeMachines(g, "circuitAssemblers", g.circuitAssemblers) * 0.32 * mult.assembly,
    core: activeMachines(g, "coreAssemblers", g.coreAssemblers) * 0.12 * mult.assembly,
    science: activeMachines(g, "labs", g.labs) * 0.1 * mult.assembly,
  }), [g, mult]);

  const flows = useMemo(() => {
    const ironSmelt = Math.min(g.ore + rates.ironOre, rates.ironPlate);
    const copperSmelt = Math.min(g.copperOre + rates.copperOre, rates.copperPlate);
    let ironPlatePool = g.plates + ironSmelt;
    const gear = Math.min(ironPlatePool / 2, rates.gear);
    ironPlatePool -= gear * 2;
    const circuit = Math.min(ironPlatePool, g.copperPlates + copperSmelt, rates.circuit);
    const core = Math.min((g.gears + gear) / 2, (g.circuits + circuit) / 2, rates.core);
    const coreForResearch = Math.min(g.cores + core, rates.science / RESEARCH_PER_CORE);
    const science = coreForResearch * RESEARCH_PER_CORE;
    return {
      ironOre: { produced: rates.ironOre, consumed: ironSmelt },
      ironPlate: { produced: ironSmelt, consumed: gear * 2 + circuit },
      copperOre: { produced: rates.copperOre, consumed: copperSmelt },
      copperPlate: { produced: copperSmelt, consumed: circuit },
      gear: { produced: gear, consumed: core * 2 },
      circuit: { produced: circuit, consumed: core * 2 },
      core: { produced: core, consumed: coreForResearch },
      science: { produced: science, consumed: 0 },
    };
  }, [g, rates]);

  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const dt = Math.min(1, (now - last.current) / 1000);
      last.current = now;
      setG((s) => {
        if (s.defenseLost || s.defenseWon) return s;
        const miningM = (s.efficiency || 1) * (1 + s.miningTech * 0.25);
        const smeltM = (s.efficiency || 1) * (1 + s.smeltingTech * 0.25);
        const assemblyM = (s.efficiency || 1) * (1 + s.assemblyTech * 0.25);

        const ironOreIn = s.ore + activeMachines(s, "drills", s.drills) * 0.8 * miningM * dt;
        const copperOreIn = s.copperOre + activeMachines(s, "copperDrills", s.copperDrills) * 0.65 * miningM * dt;
        const ironSmelt = Math.min(ironOreIn, activeMachines(s, "furnaces", s.furnaces) * 0.6 * smeltM * dt);
        const copperSmelt = Math.min(copperOreIn, activeMachines(s, "copperFurnaces", s.copperFurnaces) * 0.5 * smeltM * dt);
        let ironPlatePool = s.plates + ironSmelt;
        let copperPlatePool = s.copperPlates + copperSmelt;

        const gearMade = Math.min(ironPlatePool / 2, activeMachines(s, "assemblers", s.assemblers) * 0.28 * assemblyM * dt);
        ironPlatePool -= gearMade * 2;
        const circuitMade = Math.min(ironPlatePool, copperPlatePool, activeMachines(s, "circuitAssemblers", s.circuitAssemblers) * 0.32 * assemblyM * dt);
        ironPlatePool -= circuitMade;
        copperPlatePool -= circuitMade;

        let gearPool = s.gears + gearMade;
        let circuitPool = s.circuits + circuitMade;
        const coreMade = Math.min(gearPool / 2, circuitPool / 2, activeMachines(s, "coreAssemblers", s.coreAssemblers) * 0.12 * assemblyM * dt);
        gearPool -= coreMade * 2;
        circuitPool -= coreMade * 2;
        const corePool = s.cores + coreMade;
        const researchCapacity = activeMachines(s, "labs", s.labs) * 0.1 * assemblyM * dt;
        const coreUsedForResearch = Math.min(corePool, researchCapacity / RESEARCH_PER_CORE);
        const researchMade = coreUsedForResearch * RESEARCH_PER_CORE;

        return {
          ...s,
          ore: ironOreIn - ironSmelt,
          copperOre: copperOreIn - copperSmelt,
          plates: ironPlatePool,
          copperPlates: copperPlatePool,
          gears: gearPool,
          circuits: circuitPool,
          cores: corePool - coreUsedForResearch,
          science: s.science + researchMade,
        };
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(() => localStorage.setItem("assembly-ascendant-save", JSON.stringify(g)), 1200);
    return () => window.clearInterval(id);
  }, [g, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(() => {
      const state = gRef.current;
      if (state.defenseWon || state.defenseLost) return;
      if (state.wave === 0 && state.assemblers === 0) return;
      if (waveActiveRef.current || battleUnitsRef.current.some((unit) => unit.side === "alien")) return;
      setWaveCountdown((n) => {
        if (n === 11) playSfx("alarm");
        if (n > 1) return n - 1;
        spawnWave();
        return WAVE_INTERMISSION;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(() => {
      const state = gRef.current;
      if (state.defenseWon || state.defenseLost || battleUnitsRef.current.length === 0) return;

      const dt = 0.1;
      const units = battleUnitsRef.current.map((u) => ({
        ...u,
        cooldown: Math.max(0, u.cooldown - dt),
        attackFx: Math.max(0, u.attackFx - 1),
        hitFx: Math.max(0, u.hitFx - 1),
        moving: false,
      }));
      const breached = new Set<number>();
      const attackSounds = new Set<HumanUnit | AlienUnit>();
      const newEffects: AttackEffect[] = [];
      let baseDamage = 0;
      let nestDamage = 0;

      const visualY = (kind: HumanUnit | AlienUnit, depth: number) => kind === "fighter" ? 58 - depth * 11 : 78 - depth * 11;
      const fireAt = (unit: BattleUnit, toX: number, toY: number) => {
        unit.attackFx = 3;
        newEffects.push({
          id: effectId.current++, side: unit.side, kind: unit.kind,
          fromX: unit.x + (unit.side === "human" ? 2.6 : -2.6), fromY: visualY(unit.kind, unit.depth),
          toX, toY, life: unit.kind === "spitter" || unit.kind === "fighter" ? 4 : 3,
        });
      };

      for (const unit of units) {
        if (unit.hp <= 0) continue;
        if (unit.side === "human" && unit.x >= 92) {
          unit.targetId = undefined;
          if (unit.cooldown <= 0) {
            if (gRef.current.wave >= NEST_SHIELD_WAVES) nestDamage += unit.attack;
            attackSounds.add(unit.kind);
            fireAt(unit, 96, 66);
            unit.cooldown = 0.9;
          }
          continue;
        }
        if (unit.side === "alien" && unit.x <= 7) {
          baseDamage += unit.attack * 2.5;
          unit.hp = 0;
          breached.add(unit.id);
          continue;
        }

        let target: BattleUnit | undefined = unit.targetId === undefined ? undefined : units.find((candidate) => candidate.id === unit.targetId && candidate.hp > 0);
        let distance = Infinity;
        if (target) distance = Math.hypot(target.x - unit.x, (target.depth - unit.depth) * 38);
        if (!target) {
          for (const candidate of units) {
            if (candidate.side === unit.side || candidate.hp <= 0) continue;
            const d = Math.hypot(candidate.x - unit.x, (candidate.depth - unit.depth) * 38);
            if (d < distance) { distance = d; target = candidate; }
          }
        }
        unit.targetId = target?.id;
        if (target && distance <= unit.range) {
          if (unit.cooldown <= 0) {
            target.hp -= unit.attack;
            target.hitFx = 3;
            attackSounds.add(unit.kind);
            fireAt(unit, target.x, visualY(target.kind, target.depth));
            if (unit.kind === "tank" || unit.kind === "fighter") {
              const splash = unit.kind === "tank" ? 0.38 : 0.28;
              for (const nearby of units) {
                if (nearby.side === unit.side || nearby.id === target.id || nearby.hp <= 0) continue;
                if (Math.hypot(nearby.x - target.x, (nearby.depth - target.depth) * 38) < 3.5) {
                  nearby.hp -= unit.attack * splash;
                  nearby.hitFx = 2;
                }
              }
            }
            unit.cooldown = unit.kind === "marine" ? 0.55 : unit.kind === "spitter" ? 1.15 : 0.9;
          }
        } else {
          unit.moving = true;
          if (target && distance < Infinity) {
            const dx = target.x - unit.x;
            const dy = (target.depth - unit.depth) * 38;
            const step = Math.min(unit.speed * dt, Math.max(0, distance - unit.range * 0.82));
            unit.x += dx / distance * step;
            unit.depth += dy / distance * step / 38;
          } else {
            unit.x += (unit.side === "human" ? 1 : -1) * unit.speed * dt;
          }
          unit.x = Math.max(6, Math.min(93, unit.x));
          unit.depth = Math.max(0.08, Math.min(0.92, unit.depth));
        }
      }

      // Keep nearby allies from occupying the exact same visual lane.
      for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
        const a = units[i]; const b = units[j];
        if (a.side !== b.side || Math.abs(a.x - b.x) > 3 || Math.abs(a.depth - b.depth) > 0.075) continue;
        const nudge = a.depth <= b.depth ? -0.012 : 0.012;
        a.depth = Math.max(0.08, Math.min(0.92, a.depth + nudge));
        b.depth = Math.max(0.08, Math.min(0.92, b.depth - nudge));
      }

      setAttackEffects((current) => [...current.map((effect) => ({ ...effect, life: effect.life - 1 })).filter((effect) => effect.life > 1), ...newEffects]);

      const soundNow = performance.now();
      const soundGap: Record<HumanUnit | AlienUnit, number> = { marine: 170, tank: 520, fighter: 420, crawler: 420, spitter: 620, brute: 800 };
      for (const kind of attackSounds) {
        if (soundNow - (combatSfxLastRef.current[kind] || 0) < soundGap[kind]) continue;
        combatSfxLastRef.current[kind] = soundNow;
        playSfx(kind);
      }

      const killed = units.filter((u) => u.side === "alien" && u.hp <= 0 && !breached.has(u.id)).length;
      const survivors = units.filter((u) => u.hp > 0);
      const aliensRemaining = survivors.some((unit) => unit.side === "alien");
      const baseWillFall = state.baseHp - baseDamage <= 0;
      battleUnitsRef.current = survivors;
      setBattleUnits(survivors);

      if (!aliensRemaining && waveActiveRef.current && !baseWillFall) {
        waveActiveRef.current = false;
        setWaveCountdown(WAVE_INTERMISSION);
        setG((s) => ({ ...s, completedWaves: Math.max(s.completedWaves, s.wave) }));
      }

      if (baseDamage > 0 || nestDamage > 0 || killed > 0) {
        if (baseDamage > 0) {
          playSfx("baseDamage");
          const nextBaseHp = Math.max(0, state.baseHp - baseDamage);
          if ([750, 500, 250].some((threshold) => state.baseHp > threshold && nextBaseHp <= threshold)) playSfx("baseCritical");
          if (nextBaseHp <= 0 && endSfxPlayedRef.current !== "defeat") {
            endSfxPlayedRef.current = "defeat";
            playSfx("defeat");
          }
        }
        if (nestDamage > 0 && state.nestHp - nestDamage <= 0 && endSfxPlayedRef.current !== "victory") {
          endSfxPlayedRef.current = "victory";
          playSfx("victory");
        }
        setG((s) => {
          const previousHp = s.baseHp;
          const nextHp = Math.max(0, previousHp - baseDamage);
          const nextNest = Math.max(0, s.nestHp - nestDamage);
          const damaged = { ...s.damaged };
          for (const threshold of [750, 500, 250]) {
            if (previousHp > threshold && nextHp <= threshold) {
              const candidates = (Object.keys(damaged) as MachineKey[]).filter((key) => (s[key] as number) - damaged[key] > 0);
              if (candidates.length) {
                const victim = candidates[Math.floor(Math.random() * candidates.length)];
                damaged[victim] += 1;
              }
            }
          }
          return {
            ...s, damaged, baseHp: nextHp, nestHp: nextNest, kills: s.kills + killed,
            defenseLost: nextHp <= 0, defenseWon: nextNest <= 0,
          };
        });
        if (state.baseHp - baseDamage <= 0 || state.nestHp - nestDamage <= 0) {
          battleUnitsRef.current = [];
          setBattleUnits([]);
        }
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [loaded]);

  const costs = {
    drill: cost(15, g.drills), furnace: cost(25, g.furnaces), assembler: cost(18, g.assemblers),
    copperDrill: cost(6, g.copperDrills), copperFurnace: cost(18, g.copperFurnaces),
    circuitAssembler: cost(12, g.circuitAssemblers), lab: cost(8, g.labs), coreAssembler: cost(18, g.coreAssemblers),
    pick: Math.ceil(30 * Math.pow(1.6, g.clickLevel - 1)),
    miningTech: cost(12, g.miningTech, 1.7), smeltingTech: cost(14, g.smeltingTech, 1.7), assemblyTech: cost(18, g.assemblyTech, 1.7),
  };

  const mine = () => {
    if (g.defenseLost || g.defenseWon) { playSfx("reject"); return; }
    const amount = g.clickLevel * mult.mining;
    setG((s) => mineMode === "iron" ? { ...s, ore: s.ore + amount } : { ...s, copperOre: s.copperOre + amount });
    setPulse((n) => n + 1);
    setToast(`+${fmt(amount)} ${mineMode} ore`);
    playSfx(mineMode === "iron" ? "mineIron" : "mineCopper");
  };

  const spend = (resource: keyof GameState, amount: number, update: (s: GameState) => GameState, successSound: SfxName = "purchase") => {
    const current = gRef.current;
    if (current.defenseLost || current.defenseWon || typeof current[resource] !== "number" || (current[resource] as number) < amount) {
      playSfx("reject");
      return false;
    }
    setG((s) => update({ ...s, [resource]: (s[resource] as number) - amount }));
    playSfx(successSound);
    return true;
  };

  const research = (kind: "miningTech" | "smeltingTech" | "assemblyTech") => {
    const c = costs[kind];
    if (g[kind] >= 5) { playSfx("reject"); return; }
    spend("science", c, (s) => ({ ...s, [kind]: s[kind] + 1 }), "research");
  };

  const spawnWave = () => {
    const state = gRef.current;
    if (state.defenseWon || state.defenseLost) return;
    const wave = state.wave + 1;
    const scale = 1 + (wave - 1) * 0.14;
    const count = wave <= 3 ? wave + 2 : Math.min(14, 5 + Math.floor((wave - 3) * 1.1));
    const enemies: BattleUnit[] = Array.from({ length: count }).map((_, i) => {
      const isBrute = wave >= 3 && i === count - 1 && wave % 2 === 1;
      const isSpitter = !isBrute && wave >= 2 && i % 4 === 3;
      const kind: AlienUnit = isBrute ? "brute" : isSpitter ? "spitter" : "crawler";
      const hp = (isBrute ? 280 : isSpitter ? 62 : 90) * scale;
      return {
        id: unitId.current++, side: "alien", kind,
        x: 90 - (i % 5) * 1.2, depth: 0.12 + ((i * 29) % 75) / 100, hp, maxHp: hp,
        attack: (isBrute ? 30 : isSpitter ? 15 : 18) * scale, range: isSpitter ? 10 : isBrute ? 3.4 : 2.7,
            speed: isBrute ? 2.25 : isSpitter ? 3.1 : 4.4, cooldown: i * 0.08,
            moving: true, attackFx: 0, hitFx: 0,
      };
    });
    waveActiveRef.current = true;
    const next = [...battleUnitsRef.current.filter((unit) => unit.side === "human"), ...enemies];
    battleUnitsRef.current = next;
    setBattleUnits(next);
    setG((s) => ({ ...s, wave: s.wave + 1 }));
    if (enemies.some((enemy) => enemy.kind === "brute")) playSfx("bruteRoar");
  };

  const deployRobot = (kind: HumanUnit) => {
    const s = gRef.current;
    if (s.defenseWon || s.defenseLost) return;
    const costMap = {
      marine: { plates: 8, gears: 4, circuits: 0, cores: 0 },
      tank: { plates: 18, gears: 0, circuits: 6, cores: 1 },
      fighter: { plates: 0, gears: 8, circuits: 8, cores: 2 },
    }[kind];
    if (s.plates < costMap.plates || s.gears < costMap.gears || s.circuits < costMap.circuits || s.cores < costMap.cores) return;
    const stats = {
      marine: { hp: 78, attack: 13, range: 10, speed: 6.4 },
      tank: { hp: 220, attack: 34, range: 16, speed: 2.8 },
      fighter: { hp: 92, attack: 30, range: 18, speed: 8.5 },
    }[kind];
    setG((prev) => ({ ...prev, plates: prev.plates - costMap.plates, gears: prev.gears - costMap.gears, circuits: prev.circuits - costMap.circuits, cores: prev.cores - costMap.cores }));
    const robot: BattleUnit = { id: unitId.current++, side: "human", kind, x: 9, depth: 0.18 + ((unitId.current * 37) % 68) / 100, hp: stats.hp, maxHp: stats.hp, attack: stats.attack, range: stats.range, speed: stats.speed, cooldown: 0, moving: true, attackFx: 0, hitFx: 0 };
    const next = [...battleUnitsRef.current, robot];
    battleUnitsRef.current = next;
    setBattleUnits(next);
  };

  const repairMachine = (key: MachineKey) => {
    setG((s) => {
      if ((s.damaged?.[key] || 0) <= 0 || s.plates < 6 || s.circuits < 2) return s;
      return { ...s, plates: s.plates - 6, circuits: s.circuits - 2, damaged: { ...s.damaged, [key]: s.damaged[key] - 1 } };
    });
  };

  const repairBase = () => {
    if (g.defenseLost || g.defenseWon || g.plates < 12 || g.circuits < 5 || g.baseHp >= BASE_MAX_HP) return;
    setG((s) => ({ ...s, plates: s.plates - 12, circuits: s.circuits - 5, baseHp: Math.min(BASE_MAX_HP, s.baseHp + 150) }));
  };

  const bottleneck = useMemo(() => {
    const candidates = [
      { name: "IRON ORE", supply: rates.ironOre, demand: rates.ironPlate },
      { name: "COPPER ORE", supply: rates.copperOre, demand: rates.copperPlate },
      { name: "IRON PLATE", supply: rates.ironPlate, demand: rates.gear * 2 + rates.circuit },
      { name: "COPPER PLATE", supply: rates.copperPlate, demand: rates.circuit },
      { name: "GEAR", supply: rates.gear, demand: rates.core * 2 },
      { name: "CIRCUIT", supply: rates.circuit, demand: rates.core * 2 },
      { name: "CORE", supply: rates.core, demand: rates.science / RESEARCH_PER_CORE },
    ].filter((x) => x.demand > 0.01 && x.supply + 0.01 < x.demand)
      .sort((a, b) => (a.supply / a.demand) - (b.supply / b.demand));
    return candidates[0] ?? null;
  }, [rates]);

  const missionReady = g.gears >= 100 && g.circuits >= 100 && g.cores >= 25;
  const missionProgress = Math.min(100, ((Math.min(g.gears, 100) + Math.min(g.circuits, 100) + Math.min(g.cores, 25) * 4) / 300) * 100);
  const activeAlienCount = battleUnits.filter((unit) => unit.side === "alien").length;
  const defenseStatus = g.wave === 0 && g.assemblers === 0
    ? "STANDBY — BUILD A GEAR PRESS"
    : activeAlienCount > 0
      ? `WAVE ${g.wave} ENGAGED · ${activeAlienCount} HOSTILES`
      : `WAVE ${g.wave + 1} IN ${waveCountdown}s`;
  const activate = () => missionReady && setG((s) => ({ ...s, won: true }));

  const reset = () => {
    if (!window.confirm("Reset the factory and erase this local save?")) return;
    setG(initial); localStorage.removeItem("assembly-ascendant-save"); setToast("New landing. Deposits detected.");
    battleUnitsRef.current = []; setBattleUnits([]); setAttackEffects([]); setWaveCountdown(FIRST_WAVE_DELAY); setView("factory");
    combatSfxLastRef.current = {}; endSfxPlayedRef.current = null; waveActiveRef.current = false;
  };

  const newExpedition = () => {
    setG(initial); localStorage.removeItem("assembly-ascendant-save"); setToast("New landing. Deposits detected.");
    battleUnitsRef.current = []; setBattleUnits([]); setAttackEffects([]); setWaveCountdown(FIRST_WAVE_DELAY); setView("factory"); last.current = Date.now();
    combatSfxLastRef.current = {}; endSfxPlayedRef.current = null; waveActiveRef.current = false;
  };

  return (
    <main className={`game-shell ${g.won ? "victory" : ""}`} onPointerDownCapture={(event) => playInterfaceSound(event.target)}>
      <audio ref={musicRef} src="/audio/theme-02-epic-mysterious-v2.wav" preload="metadata" loop />
      {settingsOpen && <div className="settings-backdrop" onPointerDown={() => setSettingsOpen(false)}>
        <section className="audio-settings" role="dialog" aria-modal="true" aria-labelledby="audio-settings-title" onPointerDown={(event) => event.stopPropagation()}>
          <div className="settings-titlebar">
            <div><small>SYSTEM / AUDIO</small><strong id="audio-settings-title">AUDIO SETTINGS</strong></div>
            <button className="settings-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
          </div>
          <div className="audio-control">
            <div className="audio-control-heading"><span><b>MUSIC</b><small>EPIC MYSTERIOUS THEME</small></span><button className={`audio-switch ${audioPrefs.musicEnabled ? "on" : ""}`} aria-pressed={audioPrefs.musicEnabled} onClick={() => updateAudioPref("musicEnabled", !audioPrefs.musicEnabled)}>{audioPrefs.musicEnabled ? "ON" : "OFF"}</button></div>
            <label><span>VOLUME</span><input type="range" min="0" max="1" step="0.01" value={audioPrefs.musicVolume} disabled={!audioPrefs.musicEnabled} onChange={(event) => updateAudioPref("musicVolume", Number(event.target.value))}/><output>{Math.round(audioPrefs.musicVolume * 100)}%</output></label>
          </div>
          <div className="audio-control">
            <div className="audio-control-heading"><span><b>SOUND EFFECTS</b><small>INTERFACE / COMBAT / FACTORY</small></span><button className={`audio-switch ${audioPrefs.sfxEnabled ? "on" : ""}`} aria-pressed={audioPrefs.sfxEnabled} onClick={() => updateAudioPref("sfxEnabled", !audioPrefs.sfxEnabled)}>{audioPrefs.sfxEnabled ? "ON" : "OFF"}</button></div>
            <label><span>VOLUME</span><input type="range" min="0" max="1" step="0.01" value={audioPrefs.sfxVolume} disabled={!audioPrefs.sfxEnabled} onChange={(event) => updateAudioPref("sfxVolume", Number(event.target.value))}/><output>{Math.round(audioPrefs.sfxVolume * 100)}%</output></label>
          </div>
          <p className="audio-note">Audio begins after your first interaction. Settings are saved on this device.</p>
        </section>
      </div>}
      {(g.defenseLost || g.defenseWon) && <div className={`expedition-end ${g.defenseWon ? "won" : "lost"}`}>
        <div className="end-scan"/><small>EXPEDITION A2-{String(g.wave).padStart(2, "0")} // FINAL REPORT</small>
        <strong>{g.defenseWon ? "PLANET SECURED" : "FACTORY LOST"}</strong>
        <p>{g.defenseWon ? "The alien hive has collapsed. Your automated war machine owns this world." : "The base core was breached. Production, combat and research are permanently offline."}</p>
        <div className="end-stats"><span><b>{g.completedWaves}</b>WAVES SURVIVED</span><span><b>{g.kills}</b>KILLS</span><span><b>{fmt(g.nestHp)}</b>NEST HP</span></div>
        <button onClick={newExpedition}>NEW EXPEDITION</button>
      </div>}
      {g.won && <div className="victory-banner"><span>ORBITAL CORE ONLINE</span><strong>PLANETARY FACTORY STATUS: AUTONOMOUS</strong><button onClick={() => setG((s) => ({ ...s, won: false }))}>RETURN TO FACTORY</button></div>}
      <header className="topbar">
        <div className="brand"><span className="brand-mark">A<span>2</span></span><div><strong>ASSEMBLY ASCENDANT</strong><small>EXPEDITIONARY WAR PROTOCOL // v0.1</small></div></div>
        <div className="objective"><span>DEFENSE NETWORK</span><strong>{g.defenseWon ? "PLANET SECURED" : g.defenseLost ? "GAME OVER — FACTORY LOST" : defenseStatus}</strong></div>
        <div className="top-actions">
          <button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="Open audio settings">⚙ SETTINGS</button>
          <button className="reset" onClick={reset}>↻ RESET</button>
        </div>
      </header>

      <nav className="mode-tabs" aria-label="Game sections">
        <button className={view === "factory" ? "active" : ""} onClick={() => setView("factory")}><span>01</span> FACTORY <small>{missionReady ? "CORE READY" : "PRODUCTION"}</small></button>
        <button className={`${view === "defense" ? "active" : ""} ${g.defenseLost ? "danger" : ""}`} onClick={() => setView("defense")}><span>02</span> DEFENSE <small>{g.defenseWon ? "SECURED" : g.defenseLost ? "BREACHED" : g.wave === 0 && g.assemblers === 0 ? "STANDBY" : activeAlienCount > 0 ? `W${g.wave} · ${activeAlienCount} HOSTILES` : `W${g.wave + 1} · ${waveCountdown}s`}</small></button>
        <div className="base-mini"><span>BASE</span><div><i style={{ width: `${Math.max(0, g.baseHp / BASE_MAX_HP * 100)}%` }}/></div><b>{fmt(g.baseHp)} HP</b></div>
      </nav>

      <section className="resource-strip" aria-label="Factory resources">
        <Resource icon={ASSET.ironOre} name="IRON ORE" value={g.ore} flow={flows.ironOre} color="orange" />
        <Resource icon={ASSET.ironPlate} name="IRON PLATE" value={g.plates} flow={flows.ironPlate} color="steel" />
        <Resource icon={ASSET.copperOre} name="COPPER ORE" value={g.copperOre} flow={flows.copperOre} color="copper" />
        <Resource icon={ASSET.copperPlate} name="COPPER PLATE" value={g.copperPlates} flow={flows.copperPlate} color="copper" />
        <Resource icon={ASSET.gear} name="GEAR" value={g.gears} flow={flows.gear} color="gold" />
        <Resource icon={ASSET.circuit} name="CIRCUIT" value={g.circuits} flow={flows.circuit} color="green" />
        <Resource icon={ASSET.core} name="CORE" value={g.cores} flow={flows.core} color="cyan" />
        <Resource icon={ASSET.research} name="RESEARCH" value={g.science} flow={flows.science} color="violet" />
      </section>

      {view === "factory" ? <>
      <div className="workspace v2">
        <section className="mine-panel">
          <div className="panel-heading"><span>DEPOSIT CONTROL</span><small>MANUAL</small></div>
          <div className="deposit-switch">
            <button className={mineMode === "iron" ? "active" : ""} onClick={() => setMineMode("iron")}>◆ IRON</button>
            <button className={mineMode === "copper" ? "active copper" : ""} onClick={() => setMineMode("copper")}>◇ COPPER</button>
          </div>
          <div className={`mine-stage compact ${mineMode}`}>
            <div className="grid-lines" />
            <button className="asteroid" onClick={mine} aria-label={`Mine ${mineMode} ore`}>
              <span className="rock r1"/><span className="rock r2"/><span className="rock r3"/><span className="rock r4"/>
              <span key={pulse} className="spark">+{fmt(g.clickLevel * mult.mining)}</span>
            </button>
            <div className="mine-readout"><span>{mineMode.toUpperCase()} EXTRACTION</span><strong>{fmt(g.clickLevel * mult.mining)} ORE / CLICK</strong><small>{toast}</small></div>
          </div>
          <button className={`upgrade-card ${g.plates < costs.pick ? "unavailable" : ""}`} aria-disabled={g.plates < costs.pick} onClick={() => spend("plates", costs.pick, (s) => ({ ...s, clickLevel: s.clickLevel + 1 }))}>
            <span className="machine-icon">⛏</span><span><b>Reinforced Extractor</b><small>Manual extraction +1 base yield</small></span><Price icon="▰" value={costs.pick}/>
          </button>

          <div className="bottleneck-card">
            <div className="signal-row"><span className={bottleneck ? "warn-light" : "ok-light"}/><b>BOTTLENECK MONITOR</b></div>
            {bottleneck ? <><strong>{bottleneck.name} STARVED</strong><p>Capacity {fmt(bottleneck.supply)}/s · Demand {fmt(bottleneck.demand)}/s</p><small>Add upstream capacity to restore full throughput.</small></> : <><strong className="nominal">LINE BALANCED</strong><p>No capacity bottleneck detected.</p><small>Downstream machines will report here as the factory grows.</small></>}
          </div>
        </section>

        <section className="factory-panel">
          <div className="panel-heading"><span>PRODUCTION NETWORK</span><small>LIVE / AUTO</small></div>
          <div className="factory-visual">
            <div className="pipeline-label">RAW PROCESSING // AUTO-LINES</div>
            <FactoryLane
              label="IRON LINE" color="iron"
              first={<MachineBank icon="⛏" name="DRILL" count={g.drills} damaged={g.damaged.drills} />}
              firstBelt={<FlowBelt icon={ASSET.ironOre} rate={flows.ironOre.consumed} color="iron" />}
              second={<MachineBank icon="♨" name="FURNACE" count={g.furnaces} damaged={g.damaged.furnaces} />}
              outputBelt={<FlowBelt icon={ASSET.ironPlate} rate={flows.ironPlate.produced} color="steel" />}
            />
            <FactoryLane
              label="COPPER LINE" color="copper"
              first={<MachineBank icon="⛏" name="DRILL" count={g.copperDrills} damaged={g.damaged.copperDrills} color="copper" />}
              firstBelt={<FlowBelt icon={ASSET.copperOre} rate={flows.copperOre.consumed} color="copper" />}
              second={<MachineBank icon="♨" name="FURNACE" count={g.copperFurnaces} damaged={g.damaged.copperFurnaces} color="copper" />}
              outputBelt={<FlowBelt icon={ASSET.copperPlate} rate={flows.copperPlate.produced} color="copper" />}
            />

            <div className="pipeline-label assembly-label">COMPONENT ASSEMBLY</div>
            <div className="component-lines">
              <ComponentLine name="GEAR PRESS" recipe="2 IRON PLATE → GEAR" icon={ASSET.gear} count={g.assemblers} damaged={g.damaged.assemblers} rate={flows.gear.produced} outputIcon={ASSET.gear} color="gold" />
              <ComponentLine name="CIRCUIT PRINTER" recipe="IRON + COPPER → CIRCUIT" icon={ASSET.circuit} count={g.circuitAssemblers} damaged={g.damaged.circuitAssemblers} rate={flows.circuit.produced} outputIcon={ASSET.circuit} color="green" />
            </div>

            <div className="pipeline-label assembly-label">ADVANCED AUTOMATION</div>
            <div className="advanced-line">
              <MachineBank icon={ASSET.core} name="CORE FAB" count={g.coreAssemblers} damaged={g.damaged.coreAssemblers} color="cyan" large />
              <FlowBelt icon={ASSET.core} rate={flows.core.consumed} color="cyan" long />
              <div className="telemetry-bank">
                <MachineBank icon={ASSET.research} name="LAB" count={g.labs} damaged={g.damaged.labs} color="violet" compact />
                <div className="telemetry-readout"><span>RESEARCH TELEMETRY · CORE −{fmt(flows.core.consumed)}/s</span><strong>+{fmt(flows.science.produced)}/s</strong></div>
              </div>
            </div>
          </div>
        </section>

        <aside className="shop-panel">
          <div className="panel-heading"><span>FACTORY MARKET</span><small>BUILD</small></div>
          <div className="shop-group">EXTRACTION</div>
          <ShopRow name="Iron Drill" detail="+0.8 iron ore/s" icon={ASSET.ironOre} count={g.drills} priceIcon={ASSET.ironOre} price={costs.drill} canBuy={g.ore >= costs.drill} onBuy={() => spend("ore", costs.drill, (s) => ({ ...s, drills: s.drills + 1 }))}/>
          <ShopRow name="Copper Drill" detail="+0.65 copper ore/s" icon={ASSET.copperOre} count={g.copperDrills} priceIcon={ASSET.gear} price={costs.copperDrill} canBuy={g.gears >= costs.copperDrill} onBuy={() => spend("gears", costs.copperDrill, (s) => ({ ...s, copperDrills: s.copperDrills + 1 }))}/>
          <div className="shop-group">PROCESSING</div>
          <ShopRow name="Iron Furnace" detail="+0.6 iron plate/s" icon={ASSET.ironPlate} count={g.furnaces} priceIcon={ASSET.ironOre} price={costs.furnace} canBuy={g.ore >= costs.furnace} onBuy={() => spend("ore", costs.furnace, (s) => ({ ...s, furnaces: s.furnaces + 1 }))}/>
          <ShopRow name="Copper Furnace" detail="+0.5 copper plate/s" icon={ASSET.copperPlate} count={g.copperFurnaces} priceIcon={ASSET.ironPlate} price={costs.copperFurnace} canBuy={g.plates >= costs.copperFurnace} onBuy={() => spend("plates", costs.copperFurnace, (s) => ({ ...s, copperFurnaces: s.copperFurnaces + 1 }))}/>
          <div className="shop-group">ASSEMBLY</div>
          <ShopRow name="Gear Press" detail="2 iron plate → gear" icon={ASSET.gear} count={g.assemblers} priceIcon={ASSET.ironPlate} price={costs.assembler} canBuy={g.plates >= costs.assembler} onBuy={() => spend("plates", costs.assembler, (s) => ({ ...s, assemblers: s.assemblers + 1 }))}/>
          <ShopRow name="Circuit Printer" detail="iron + copper → circuit · +0.32/s" icon={ASSET.circuit} count={g.circuitAssemblers} priceIcon={ASSET.gear} price={costs.circuitAssembler} canBuy={g.gears >= costs.circuitAssembler} onBuy={() => spend("gears", costs.circuitAssembler, (s) => ({ ...s, circuitAssemblers: s.circuitAssemblers + 1 }))}/>
          <ShopRow name="Research Lab" detail="1 core → 4 research · cap +0.1/s" icon={ASSET.research} count={g.labs} priceIcon={ASSET.circuit} price={costs.lab} canBuy={g.circuits >= costs.lab} onBuy={() => spend("circuits", costs.lab, (s) => ({ ...s, labs: s.labs + 1 }))}/>
          <ShopRow name="Core Fabricator" detail="2 gear + 2 circuit → core · +0.12/s" icon={ASSET.core} count={g.coreAssemblers} priceIcon={ASSET.circuit} price={costs.coreAssembler} canBuy={g.circuits >= costs.coreAssembler} onBuy={() => spend("circuits", costs.coreAssembler, (s) => ({ ...s, coreAssemblers: s.coreAssemblers + 1 }))}/>
        </aside>
      </div>

      <section className="lower-deck">
        <div className="research-zone">
          <div className="panel-heading"><span>RESEARCH MATRIX</span><small>CHOOSE YOUR SPECIALIZATION</small></div>
          <div className="research-grid">
            <TechCard icon={ASSET.ironOre} name="Mining Optimizer" level={g.miningTech} detail="Mining +25% / level" cost={costs.miningTech} science={g.science} onClick={() => research("miningTech")}/>
            <TechCard icon={ASSET.ironPlate} name="Thermal Tuning" level={g.smeltingTech} detail="Smelting +25% / level" cost={costs.smeltingTech} science={g.science} onClick={() => research("smeltingTech")}/>
            <TechCard icon={ASSET.gear} name="Assembly Logic" level={g.assemblyTech} detail="Assembly +25% / level" cost={costs.assemblyTech} science={g.science} onClick={() => research("assemblyTech")}/>
          </div>
        </div>
        <div className="mission-zone">
          <div className="panel-heading"><span>ORBITAL CORE PROJECT</span><small>{fmt(missionProgress)}% COMPLETE</small></div>
          <div className="mission-reqs">
            <Requirement icon={ASSET.gear} name="GEARS" have={g.gears} need={100}/>
            <Requirement icon={ASSET.circuit} name="CIRCUITS" have={g.circuits} need={100}/>
            <Requirement icon={ASSET.core} name="CORES" have={g.cores} need={25}/>
          </div>
          <div className="mission-progress"><i style={{ width: `${missionProgress}%` }}/></div>
          <button className="activate" disabled={!missionReady} onClick={activate}>{missionReady ? "ACTIVATE ORBITAL CORE" : "AWAITING COMPONENTS"}</button>
        </div>
      </section>
      </> : <DefenseView g={g} units={battleUnits} attackEffects={attackEffects} countdown={waveCountdown} deployRobot={deployRobot} repairBase={repairBase} repairMachine={repairMachine} />}
      <footer><span>LOCAL SAVE // LEGACY COMPATIBLE</span><span>{view === "factory" ? "Factory feeds the war. Keep an eye on the next wave." : "Build the army. Break the hive. Do not lose the core."}</span><span>PROTOCOL A2.01</span></footer>
    </main>
  );
}

function DefenseView({ g, units, attackEffects, countdown, deployRobot, repairBase, repairMachine }: {
  g: GameState; units: BattleUnit[]; attackEffects: AttackEffect[]; countdown: number;
  deployRobot: (kind: HumanUnit) => void;
  repairBase: () => void; repairMachine: (key: MachineKey) => void;
}) {
  const damagedTotal = Object.values(g.damaged || blankDamage).reduce((a, b) => a + b, 0);
  const machineNames: Record<MachineKey, string> = {
    drills: "Iron Drill", furnaces: "Iron Furnace", assemblers: "Gear Press", labs: "Research Lab",
    copperDrills: "Copper Drill", copperFurnaces: "Copper Furnace", circuitAssemblers: "Circuit Printer", coreAssemblers: "Core Fabricator",
  };
  const robotCount = units.filter((u) => u.side === "human").length;
  const alienCount = units.filter((u) => u.side === "alien").length;
  const locked = g.defenseLost || g.defenseWon;
  const canMarine = !locked && g.plates >= 8 && g.gears >= 4;
  const canTank = !locked && g.plates >= 18 && g.circuits >= 6 && g.cores >= 1;
  const canFighter = !locked && g.gears >= 8 && g.circuits >= 8 && g.cores >= 2;

  return <section className={`defense-view ${g.defenseLost ? "lost" : ""} ${g.defenseWon ? "secured" : ""}`}>
    <div className="defense-status-row">
      <div className="war-stat base"><small>FACTORY BASE</small><strong>{fmt(g.baseHp)} / {BASE_MAX_HP}</strong><div><i style={{ width: `${g.baseHp / BASE_MAX_HP * 100}%` }}/></div></div>
      <div className="war-stat wave"><small>{alienCount > 0 ? "ACTIVE ASSAULT" : "NEXT ASSAULT"}</small><strong>{g.defenseWon ? "SECURED" : g.defenseLost ? "OFFLINE" : g.wave === 0 && g.assemblers === 0 ? "DEFENSE STANDBY" : alienCount > 0 ? `WAVE ${g.wave} · ENGAGED` : `WAVE ${g.wave + 1} · ${countdown}s`}</strong><span>{g.wave === 0 && g.assemblers === 0 ? "BUILD A GEAR PRESS TO ARM THE PERIMETER" : alienCount > 0 ? `${alienCount} HOSTILES ON FIELD` : `${g.completedWaves} WAVES SURVIVED · REARM AND REPAIR`}</span></div>
      <div className="war-stat kills"><small>COMBAT RECORD</small><strong>{g.kills} KILLS</strong><span>{robotCount} ROBOTS ACTIVE</span></div>
      <div className="war-stat nest"><small>ALIEN NEST</small><strong>{g.wave < NEST_SHIELD_WAVES ? `SHIELDED · WAVE ${NEST_SHIELD_WAVES}` : `${fmt(g.nestHp)} / ${NEST_MAX_HP}`}</strong><div><i style={{ width: `${g.nestHp / NEST_MAX_HP * 100}%` }}/></div></div>
    </div>

    <div className="battlefield" aria-label="Automated defense battlefield">
      <div className="battle-sky"><i/><i/><i/><i/><i/></div>
      <div className="base-structure"><span>A2</span><b>BASE</b></div>
      <div className={`nest-structure ${g.wave < NEST_SHIELD_WAVES ? "shielded" : ""}`}><span>☣</span><b>{g.wave < NEST_SHIELD_WAVES ? "SHIELDED" : "NEST"}</b></div>
      <div className="battle-ground"/>
      <div className="frontline-marker"><span>FRONT LINE</span></div>
      <svg className="combat-fx" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {attackEffects.map((effect) => <g key={effect.id} className={`attack-effect ${effect.side} ${effect.kind}`}>
          <line x1={effect.fromX} y1={effect.fromY} x2={effect.toX} y2={effect.toY}/>
          <circle className="impact-ring" cx={effect.toX} cy={effect.toY} r="1.1"/>
          <circle className="impact-core" cx={effect.toX} cy={effect.toY} r="0.38"/>
        </g>)}
      </svg>
      {units.map((unit) => <div key={unit.id} className={`battle-unit ${unit.side} ${unit.kind} ${unit.moving ? "moving" : ""} ${unit.attackFx > 0 ? "attacking" : ""} ${unit.hitFx > 0 ? "hit" : ""}`} style={{ left: `${unit.x}%`, bottom: `${62 + unit.depth * 48}px`, zIndex: 10 + Math.round(unit.depth * 12), transform: `scale(${0.78 + unit.depth * 0.34})` }} title={`${unit.kind} ${Math.ceil(unit.hp)}/${Math.ceil(unit.maxHp)} HP`}>
        <div className="unit-hp"><i style={{ width: `${Math.max(0, unit.hp / unit.maxHp * 100)}%` }}/></div>
        <span className="unit-shadow"/>
        <img src={`/units/${unit.kind}.png`} alt="" draggable={false}/>
        <span className="weapon-flash"/>
        <small>{unit.kind.toUpperCase()}</small>
      </div>)}
    </div>

    <div className="defense-console">
      <div className="robot-bay">
        <div className="panel-heading"><span>EXPEDITIONARY ARMORY</span><small>BUILD & DEPLOY</small></div>
        <div className="robot-cards">
          <RobotCard kind="MARINE" image="/units/marine.png" role="RAPID RIFLE" stats="78 HP · 13 DMG · RANGE 10" costs="8 PLATE + 4 GEAR" disabled={!canMarine} onClick={() => deployRobot("marine")}/>
          <RobotCard kind="SIEGE TANK" image="/units/tank.png" role="ARMORED SPLASH" stats="220 HP · 34 DMG · RANGE 16" costs="18 PLATE + 6 CIRCUIT + 1 CORE" disabled={!canTank} onClick={() => deployRobot("tank")}/>
          <RobotCard kind="STRIKE FIGHTER" image="/units/fighter.png" role="FAST AIR SUPPORT" stats="92 HP · 30 DMG · RANGE 18" costs="8 GEAR + 8 CIRCUIT + 2 CORE" disabled={!canFighter} onClick={() => deployRobot("fighter")}/>
        </div>
        <p className="war-note">Units advance and engage automatically. Tanks and fighters deal splash damage. Base destruction ends the expedition.</p>
      </div>

      <div className="repair-bay">
        <div className="panel-heading"><span>BASE MAINTENANCE</span><small>{damagedTotal ? `${damagedTotal} OFFLINE` : "NOMINAL"}</small></div>
        <button className="base-repair" disabled={locked || g.plates < 12 || g.circuits < 5 || g.baseHp >= BASE_MAX_HP} onClick={repairBase}>
          <span><b>PATCH HULL +150 HP</b><small>12 plate + 5 circuit</small></span><strong>{fmt(g.baseHp)} HP</strong>
        </button>
        <div className="damage-list">
          {(Object.keys(machineNames) as MachineKey[]).filter((key) => (g.damaged?.[key] || 0) > 0).map((key) => <button key={key} disabled={g.plates < 6 || g.circuits < 2} onClick={() => repairMachine(key)}>
            <span><b>{machineNames[key]}</b><small>{g.damaged[key]} DAMAGED · −{g.damaged[key]} ACTIVE</small></span><em>REPAIR 6 ▰ + 2 ▣</em>
          </button>)}
          {!damagedTotal && <div className="no-damage"><span>✓</span><p>ALL FACTORY EQUIPMENT ONLINE<small>Breaches at 75%, 50% and 25% base HP can disable machines.</small></p></div>}
        </div>
      </div>
    </div>
  </section>;
}

function RobotCard({ kind, image, role, stats, costs, disabled, onClick }: { kind: string; image: string; role: string; stats: string; costs: string; disabled: boolean; onClick: () => void }) {
  return <button className="robot-card" disabled={disabled} onClick={onClick}><span className="robot-icon"><img src={image} alt="" draggable={false}/></span><div><small>{role}</small><b>{kind}</b><em>{stats}</em></div><strong>DEPLOY</strong><i>{costs}</i></button>;
}

function GameIcon({ icon }: { icon: string }) {
  return icon.startsWith("/") ? <img className="game-icon" src={icon} alt="" draggable={false}/> : <>{icon}</>;
}

function Resource({ icon, name, value, flow, color }: { icon: string; name: string; value: number; flow: { produced: number; consumed: number }; color: string }) {
  return <div className={`resource ${color}`}><span className="res-icon"><GameIcon icon={icon}/></span><div><small>{name}</small><strong>{fmt(value)}</strong></div><em><span className="flow-in">+{fmt(flow.produced)}</span><span className="flow-out">−{fmt(flow.consumed)}</span><i>/s</i></em></div>;
}
function Price({ icon, value }: { icon: string; value: number }) { return <span className="price"><i><GameIcon icon={icon}/></i>{fmt(value)}</span>; }
function ShopRow(p: { name: string; detail: string; icon: string; count: number; priceIcon: string; price: number; canBuy: boolean; onBuy: () => void }) {
  return <button className={`shop-row ${!p.canBuy ? "unavailable" : ""}`} aria-disabled={!p.canBuy} onClick={p.onBuy}><span className="shop-icon"><GameIcon icon={p.icon}/></span><span className="shop-copy"><b>{p.name}</b><small>{p.detail}</small></span><span className="owned">×{p.count}</span><Price icon={p.priceIcon} value={p.price}/></button>;
}
function MachineBank({ icon, name, count, damaged = 0, color = "iron", large = false, compact = false }: { icon: string; name: string; count: number; damaged?: number; color?: string; large?: boolean; compact?: boolean }) {
  const active = Math.max(0, count - damaged);
  const visible = Math.min(active, compact ? 6 : 10);
  return <div className={`machine-bank ${color} ${large ? "large" : ""} ${compact ? "compact" : ""} ${active ? "online" : "idle"} ${damaged ? "has-damage" : ""}`}>
    <div className="bank-label"><span>{name}</span><b>×{active}{damaged > 0 && <em> −{damaged} DMG</em>}</b></div>
    <div className="machine-fleet" aria-label={`${active} active ${name}, ${damaged} damaged`}>
      {count === 0 ? <span className="machine-unit ghost"><GameIcon icon={icon}/></span> : Array.from({ length: visible }).map((_, i) => <span className="machine-unit" key={i} style={{ animationDelay: `${i * -0.13}s` }}><GameIcon icon={icon}/></span>)}
      {damaged > 0 && <span className="machine-unit damaged"><GameIcon icon={icon}/></span>}
      {active > visible && <span className="fleet-overflow">+{active - visible}</span>}
    </div>
  </div>;
}

function FlowBelt({ icon, rate, color = "iron", long = false }: { icon: string; rate: number; color?: string; long?: boolean }) {
  const moving = rate > 0.001;
  const speed = Math.max(0.55, Math.min(3.4, 2.2 / Math.max(rate, 0.05)));
  return <div className={`flow-belt ${color} ${moving ? "moving" : "stopped"} ${long ? "long" : ""}`}>
    <div className="belt-rail"><i/><i/></div>
    <div className="belt-items">
      {Array.from({ length: long ? 7 : 5 }).map((_, i) => <span key={i} style={{ animationDuration: `${speed}s`, animationDelay: `${-(speed / (long ? 7 : 5)) * i}s` }}><GameIcon icon={icon}/></span>)}
    </div>
    <small>{moving ? `${fmt(rate)}/s` : "NO FLOW"}</small>
  </div>;
}

function FactoryLane({ label, color, first, firstBelt, second, outputBelt }: { label: string; color: string; first: ReactNode; firstBelt: ReactNode; second: ReactNode; outputBelt: ReactNode }) {
  return <div className={`factory-lane ${color}`}><div className="lane-tag">{label}</div><div className="lane-body">{first}{firstBelt}{second}{outputBelt}</div></div>;
}

function ComponentLine({ name, recipe, icon, count, damaged = 0, rate, outputIcon, color }: { name: string; recipe: string; icon: string; count: number; damaged?: number; rate: number; outputIcon: string; color: string }) {
  return <div className={`component-line ${color}`}><div className="component-copy"><b>{name}</b><small>{recipe}</small></div><MachineBank icon={icon} name="UNITS" count={count} damaged={damaged} color={color} compact/><FlowBelt icon={outputIcon} rate={rate} color={color}/></div>;
}
function TechCard({ icon, name, level, detail, cost: c, science, onClick }: { icon: string; name: string; level: number; detail: string; cost: number; science: number; onClick: () => void }) {
  const maxed = level >= 5;
  const unavailable = maxed || science < c;
  return <button className={`tech-card ${unavailable ? "unavailable" : ""}`} aria-disabled={unavailable} onClick={onClick}><span><GameIcon icon={icon}/></span><div><b>{name}</b><small>{detail}</small><div className="tech-pips">{Array.from({ length: 5 }).map((_, i) => <i className={i < level ? "on" : ""} key={i}/>)}</div></div><Price icon={ASSET.research} value={maxed ? 0 : c}/></button>;
}
function Requirement({ icon, name, have, need }: { icon: string; name: string; have: number; need: number }) {
  const done = have >= need;
  return <div className={`requirement ${done ? "done" : ""}`}><span><GameIcon icon={icon}/></span><div><small>{name}</small><strong>{fmt(Math.min(have, need))} / {need}</strong></div></div>;
}
