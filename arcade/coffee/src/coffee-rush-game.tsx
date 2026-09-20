import { useEffect, useRef, useState } from "react";
import {
  CALIBRATED_CUP_TIMING,
  GAME_SPEC,
  INGREDIENTS,
  fillSecondsForItems,
  isQuotaMet,
  makeTicket,
  matchingOpenTicket,
  nextStageId,
  openTicketNeed,
  serveScore,
  shiftHeadline,
  stageById,
  starsForShift,
  timeBonus,
  type IngredientId,
  type Ticket,
} from "./gameRules";

type Stage = "empty" | "loading" | "brewing" | "ready" | "overflow" | "error";
type Station = {
  stage: Stage;
  items: IngredientId[];
  ticket: Ticket | null;
  fill: number;
  readyElapsed: number;
  pop: string | null;
};

type Fulfill = {
  id: number;
  guest: string;
  drink: string;
  shot: string;
  number: string;
  ingredient: IngredientId;
  points: number;
  perfect: boolean;
};

const SOUND_STORAGE_KEY = "coffee-rush-sound-v1";
const BEST_STORAGE_KEY = "coffee-rush-best-v1";
const STAGE_STORAGE_KEY = "coffee-rush-stage-v1";

const emptyStation = (): Station => ({
  stage: "empty",
  items: [],
  ticket: null,
  fill: 0,
  readyElapsed: 0,
  pop: null,
});

const GUESTS = ["Mara", "Theo", "Jo", "Nia", "Eli", "Sam", "Rae", "Paz", "Noa", "Avi", "Lea", "Ben"] as const;
const DRINK_NAME: Record<IngredientId, string> = {
  spice: "Cinnamon",
  foam: "Foam",
  cocoa: "Cocoa",
  sugar: "Sugar",
  bean: "Espresso",
};

function chitFor(ticket: Ticket) {
  return {
    guest: GUESTS[Math.abs(ticket.id * 7 + 3) % GUESTS.length],
    drink: DRINK_NAME[ticket.ingredient],
    shot: ticket.amount === 2 ? "double" : "single",
    number: String(108 + (Math.abs(ticket.id) % 890)).padStart(3, "0"),
  };
}

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function createAudioTone(context: AudioContext, frequency: number, duration: number, type: OscillatorType = "sine") {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.02);
}

function IngredientIcon({ ingredient, small = false }: { ingredient: IngredientId; small?: boolean }) {
  return (
    <img
      className={`ing-icon ing-icon--${ingredient} ${small ? "ing-icon--sm" : ""}`}
      src={`/coffee/art/icon-${ingredient}.jpg`}
      alt=""
      draggable={false}
    />
  );
}

function OrderIcons({ ingredient, amount }: { ingredient: IngredientId; amount: 1 | 2 }) {
  return (
    <span className={`order-icons ${amount === 2 ? "is-double" : ""}`} aria-hidden="true">
      <IngredientIcon ingredient={ingredient} />
      {amount === 2 ? <IngredientIcon ingredient={ingredient} /> : null}
    </span>
  );
}

function CupFace({ station, onUndo }: { station: Station; onUndo?: () => void }) {
  const fill = Math.min(1, Math.max(0, station.fill));
  const shown = fill <= 0 ? 0 : Math.max(0.18, fill);
  const canUndo = station.stage === "loading" && station.items.length > 0 && Boolean(onUndo);
  return (
    <div className={`brew-cup brew-cup--${station.stage}`}>
      <span className="brew-cup__handle" />
      <div className="brew-cup__body">
        <div className="brew-cup__bowl">
          <i className="brew-cup__line" />
          <div className="brew-cup__liquid" style={{ transform: `scaleY(${shown})` }}>
            <i className="brew-cup__crema" />
          </div>
          {station.items.length > 0 && (
            <span className={`brew-cup__stamps ${canUndo ? "is-live" : ""}`}>
              {station.items.map((item, index) => {
                const last = canUndo && index === station.items.length - 1;
                const inner = (
                  <span className={`brew-cup__stamp brew-cup__stamp--${item}`}>
                    <IngredientIcon ingredient={item} />
                  </span>
                );
                return last ? (
                  <button
                    type="button"
                    className="brew-cup__undo"
                    key={`${item}-${index}`}
                    aria-label="Undo last ingredient"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUndo?.();
                    }}
                  >
                    {inner}
                  </button>
                ) : (
                  <span key={`${item}-${index}`}>{inner}</span>
                );
              })}
            </span>
          )}
        </div>
      </div>
      <span className="brew-cup__saucer" />
      {station.stage === "brewing" && <span className="brew-cup__stream" />}
      {station.items.length >= 2 && station.stage !== "empty" && (
        <b className="brew-cup__double">×2</b>
      )}
      <div className="brew-cup__steam">
        <i />
        <i />
      </div>
      {station.stage === "ready" && (
        <strong className="brew-cup__points">{serveScore(station.readyElapsed).points}</strong>
      )}
      {(station.stage === "error" || station.stage === "overflow") && <b className="brew-cup__x">✕</b>}
    </div>
  );
}


function IconPause() {
  return (
    <svg className="brew-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}
function IconVolume() {
  return (
    <svg className="brew-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4V9zm11.5 3a3.5 3.5 0 0 0-1.5-2.9v5.8a3.5 3.5 0 0 0 1.5-2.9zm2 0a5.5 5.5 0 0 0-2.4-4.5v9A5.5 5.5 0 0 0 17.5 12z" />
    </svg>
  );
}
function IconMute() {
  return (
    <svg className="brew-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4V9zm15.1 1.1-1.4-1.4-1.7 1.7-1.7-1.7-1.4 1.4 1.7 1.7-1.7 1.7 1.4 1.4 1.7-1.7 1.7 1.7 1.4-1.4-1.7-1.7 1.7-1.7z" />
    </svg>
  );
}

export function CoffeeRushApp() {
  return (
    <div className="cafe-shell">
      <div className="phone-stage">
        <CoffeeRushGame />
      </div>
    </div>
  );
}

function CoffeeRushGame() {
  const [stations, setStations] = useState<Station[]>(() => Array.from({ length: GAME_SPEC.stationCount }, emptyStation));
  const [tickets, setTickets] = useState<Ticket[]>(() => [makeTicket(0, 0), makeTicket(1, 0), makeTicket(2, 0)]);
  const [selected, setSelected] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number>(GAME_SPEC.shiftSeconds);
  const [served, setServed] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [stageId, setStageId] = useState(2);
  const [coach, setCoach] = useState("TAP A CUP, THEN ITS INGREDIENT, THEN THE BLUE BUTTON.");
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(false);
  const [fulfill, setFulfill] = useState<Fulfill | null>(null);
  const [scorePulse, setScorePulse] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const orderIdRef = useRef(3);
  const secondsRef = useRef<number>(GAME_SPEC.shiftSeconds);
  const servedRef = useRef(0);
  const quotaRef = useRef<number>(GAME_SPEC.quota);
  const stageIdRef = useRef(2);
  const stationsRef = useRef(stations);
  const ticketsRef = useRef(tickets);
  const completeRef = useRef(false);
  const fulfillIdRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(soundOn);

  ticketsRef.current = tickets;
  stationsRef.current = stations;
  servedRef.current = served;
  soundOnRef.current = soundOn;

  const unlockAudio = () => {
    try {
      const AudioContextClass =
        window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = audioRef.current ?? new AudioContextClass({ latencyHint: "interactive" });
      audioRef.current = context;
      if (context.state === "suspended") void context.resume();
    } catch {
      /* optional */
    }
  };

  const cue = (kind: "tap" | "add" | "brew" | "ready" | "perfect" | "spill" | "served") => {
    if (!soundOnRef.current) return;
    try {
      unlockAudio();
      const context = audioRef.current;
      if (!context) return;
      if (kind === "perfect") {
        [523, 659, 784, 1047].forEach((frequency, index) => {
          window.setTimeout(() => createAudioTone(context, frequency, 0.14, "triangle"), index * 70);
        });
        return;
      }
      if (kind === "served") {
        [659, 831, 988].forEach((frequency, index) => {
          window.setTimeout(() => createAudioTone(context, frequency, 0.12, "sine"), index * 80);
        });
        return;
      }
      const tones = {
        tap: [392, 0.05, "square"],
        add: [523, 0.07, "triangle"],
        brew: [180, 0.11, "sawtooth"],
        ready: [740, 0.12, "sine"],
        spill: [112, 0.14, "sawtooth"],
      } as const;
      const [frequency, duration, type] = tones[kind];
      createAudioTone(context, frequency, duration, type);
    } catch {
      /* never block */
    }
  };

  const finishShift = (nextServed: number, remaining: number) => {
    if (completeRef.current) return;
    completeRef.current = true;
    const extra = timeBonus(remaining, nextServed, quotaRef.current);
    if (extra > 0) {
      setScore((current) => current + extra);
      setBonus(extra);
    }
    if (isQuotaMet(nextServed, quotaRef.current) && stageIdRef.current < 3) {
      const unlocked = nextStageId(stageIdRef.current);
      stageIdRef.current = unlocked;
      setStageId(unlocked);
      window.localStorage.setItem(STAGE_STORAGE_KEY, String(unlocked));
    }
    setComplete(true);
    setCoach(isQuotaMet(nextServed, quotaRef.current) ? "QUOTA HIT — SHIFT CLOSED." : "TIME. THE COUNTER IS CLOSED.");
  };

  const inProgressCount = (list: Station[]) =>
    list.filter((station) => station.ticket && (station.stage === "brewing" || station.stage === "ready" || station.stage === "overflow")).length;

  const refillBoard = (open: Ticket[], nextStations: Station[], nextServed: number) => {
    const need = openTicketNeed(nextServed, inProgressCount(nextStations), quotaRef.current);
    const next = [...open];
    const elapsed = GAME_SPEC.shiftSeconds - secondsRef.current;
    while (next.length < need) next.push(makeTicket(orderIdRef.current++, elapsed));
    ticketsRef.current = next.slice(0, need);
    setTickets(ticketsRef.current);
  };

  const startShift = () => {
    const stage = stageById(stageIdRef.current);
    quotaRef.current = stage.quota;
    const opening = [makeTicket(0, 0), makeTicket(1, 0), makeTicket(2, 0)];
    const nextStations = Array.from({ length: GAME_SPEC.stationCount }, emptyStation);
    orderIdRef.current = 3;
    setStations(nextStations);
    stationsRef.current = nextStations;
    setTickets(opening);
    ticketsRef.current = opening;
    secondsRef.current = GAME_SPEC.shiftSeconds;
    setSeconds(GAME_SPEC.shiftSeconds);
    setServed(0);
    servedRef.current = 0;
    setScore(0);
    setBonus(0);
    setFulfill(null);
    setComplete(false);
    completeRef.current = false;
    setPaused(false);
    lastFrameRef.current = performance.now();
    setSelected(0);
    setCoach(`STAGE ${stage.id} ${stage.name.toUpperCase()} — SERVE ${stage.quota} DRINKS IN 2:00.`);
  };

  useEffect(() => {
    const storedBest = Number(window.localStorage.getItem(BEST_STORAGE_KEY) || 0);
    if (Number.isFinite(storedBest) && storedBest > 0) setBest(storedBest);
    const storedStage = Number(window.localStorage.getItem(STAGE_STORAGE_KEY) || 2);
    const stage = stageById(Number.isFinite(storedStage) ? storedStage : 2);
    stageIdRef.current = stage.id;
    quotaRef.current = stage.quota;
    setStageId(stage.id);
    if (window.localStorage.getItem(SOUND_STORAGE_KEY) === "off") setSoundOn(false);
    startShift();
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      void audioRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    const autoPause = () => {
      if (!complete) setPaused(true);
    };
    const onHide = () => {
      if (document.hidden) autoPause();
      if (!document.hidden && audioRef.current?.state === "suspended") void audioRef.current.resume();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", autoPause);
    window.addEventListener("pagehide", autoPause);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", autoPause);
      window.removeEventListener("pagehide", autoPause);
    };
  }, [complete]);

  useEffect(() => {
    if (complete && score > best) {
      setBest(score);
      window.localStorage.setItem(BEST_STORAGE_KEY, String(score));
    }
  }, [complete, score, best]);

  useEffect(() => {
    if (paused || complete) return;
    lastFrameRef.current = performance.now();
    const tick = (time: number) => {
      const previous = lastFrameRef.current ?? time;
      const delta = Math.min(0.05, Math.max(0, (time - previous) / 1000));
      lastFrameRef.current = time;
      let readyIndex = -1;
      let spillIndex = -1;

      const nextSeconds = Math.max(0, secondsRef.current - delta);
      secondsRef.current = nextSeconds;
      setSeconds(nextSeconds);
      if (nextSeconds === 0) finishShift(servedRef.current, 0);

      setStations((current) =>
        current.map((station, index) => {
          if (station.stage === "brewing") {
            const nextFill = Math.min(1, station.fill + delta / fillSecondsForItems(station.items));
            if (nextFill >= 1) {
              readyIndex = index;
              return { ...station, stage: "ready", fill: 1, readyElapsed: 0 };
            }
            return { ...station, fill: nextFill };
          }
          if (station.stage === "ready") {
            const nextReady = station.readyElapsed + delta;
            if (nextReady >= CALIBRATED_CUP_TIMING.greenGraceSeconds) {
              spillIndex = index;
              return { ...station, stage: "overflow", readyElapsed: nextReady };
            }
            return { ...station, readyElapsed: nextReady };
          }
          return station;
        }),
      );
      if (readyIndex >= 0) {
        cue("ready");
        setCoach(`CUP ${readyIndex + 1} IS GREEN — SERVE NOW.`);
      }
      if (spillIndex >= 0) {
        cue("spill");
        setCoach(`CUP ${spillIndex + 1} OVERFLOWED — TAP IT TO TRASH.`);
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [complete, paused]);

  const replaceTicket = (consumedId: number, nextStations: Station[]) => {
    refillBoard(
      ticketsRef.current.filter((ticket) => ticket.id !== consumedId),
      nextStations,
      servedRef.current,
    );
  };

  const nextEmptyIndex = (list: Station[]) => {
    const i = list.findIndex((station) => station.stage === "empty");
    return i >= 0 ? i : null;
  };

  const selectCup = (index: number) => {
    unlockAudio();
    if (paused || complete) return;
    const station = stationsRef.current[index];
    if (station.stage === "overflow" || station.stage === "error") {
      trashStation(index);
      return;
    }
    if (station.stage === "ready") {
      serveStation(index);
      return;
    }
    if (station.stage === "brewing") {
      setCoach("THAT CUP IS POURING — PICK ANOTHER.");
      return;
    }
    setSelected(index);
    cue("tap");
    setCoach(
      station.stage === "loading"
        ? `CUP ${index + 1} — TAP THE ICON TO UNDO, DUMP TO TOSS, BLUE TO POUR.`
        : `CUP ${index + 1} — TAP A JAR.`,
    );
  };

  const addIngredient = (ingredient: IngredientId) => {
    unlockAudio();
    if (paused || complete) return;
    const list = stationsRef.current;
    let target = selected;
    if (target === null || (list[target].stage !== "empty" && list[target].stage !== "loading")) {
      target = nextEmptyIndex(list);
      if (target !== null) setSelected(target);
    }
    if (target === null) {
      setCoach("ALL CUPS ARE BUSY — SERVE A GREEN ONE.");
      return;
    }
    const station = list[target];
    if (station.stage !== "empty" && station.stage !== "loading") {
      setCoach("THAT CUP IS BUSY — TAP AN EMPTY ONE.");
      return;
    }
    if (station.items.length >= 2) {
      setCoach("TWO IN — TAP THE ICON TO UNDO, DUMP TO TOSS, BLUE TO POUR.");
      return;
    }
    const nextItems = [...station.items, ingredient];
    const at = target;
    const nextStations = list.map((entry, index) => (index === at ? { ...entry, stage: "loading" as const, items: nextItems } : entry));
    stationsRef.current = nextStations;
    setStations(nextStations);
    cue("add");
    const match = matchingOpenTicket(nextItems, ticketsRef.current);
    if (match) setCoach(`CUP ${at + 1} MATCHED — TAP ITS BLUE BUTTON.`);
    else if (nextItems.length === 1) setCoach(`CUP ${at + 1} — ONE MORE FOR A DOUBLE, OR TAP BLUE.`);
    else setCoach(`CUP ${at + 1} — TAP BLUE. WRONG MIX GETS AN X.`);
  };

  const brewStation = (index: number) => {
    unlockAudio();
    if (paused || complete) return;
    const list = stationsRef.current;
    const station = list[index];
    if (station.stage !== "loading" || station.items.length === 0) {
      selectCup(index);
      return;
    }
    const match = matchingOpenTicket(station.items, ticketsRef.current);
    const nextStations = list.map((entry, i) =>
      i === index ? { ...entry, stage: "brewing" as const, ticket: match, fill: 0.18, readyElapsed: 0 } : entry,
    );
    stationsRef.current = nextStations;
    setStations(nextStations);
    if (match) replaceTicket(match.id, nextStations);
    const next = nextEmptyIndex(nextStations);
    setSelected(next);
    cue("brew");
    setCoach(
      next !== null
        ? `CUP ${index + 1} POURING — CUP ${next + 1} IS READY.`
        : `CUP ${index + 1} POURING — ALL OTHER CUPS ARE BUSY.`,
    );
  };

  const serveStation = (index: number) => {
    const station = stations[index];
    if (station.stage !== "ready") return;
    if (!station.ticket) {
      setStations((current) => current.map((entry, i) => (i === index ? { ...entry, stage: "error" } : entry)));
      cue("spill");
      setCoach("NO TICKET FOR THAT DRINK — TAP THE X.");
      return;
    }
    const result = serveScore(station.readyElapsed);
    const earned = result.points;
    const nextServed = servedRef.current + 1;
    servedRef.current = nextServed;
    setScore((current) => current + earned);
    setServed(nextServed);
    setScorePulse(true);
    window.setTimeout(() => setScorePulse(false), 700);
    const chit = chitFor(station.ticket);
    const stamp: Fulfill = {
      id: ++fulfillIdRef.current,
      guest: chit.guest,
      drink: chit.drink,
      shot: chit.shot,
      number: chit.number,
      ingredient: station.ticket.ingredient,
      points: earned,
      perfect: result.perfect,
    };
    setFulfill(stamp);
    window.setTimeout(() => {
      setFulfill((current) => (current?.id === stamp.id ? null : current));
    }, 1100);
    const nextStations = stations.map((entry, i) =>
      i === index ? { ...emptyStation(), pop: result.perfect ? `PERFECT +${earned}` : `+${earned}` } : entry,
    );
    stationsRef.current = nextStations;
    setStations(nextStations);
    refillBoard(ticketsRef.current, nextStations, nextServed);
    cue(result.perfect ? "perfect" : "served");
    window.setTimeout(() => {
      setStations((current) => current.map((entry, i) => (i === index ? { ...entry, pop: null } : entry)));
    }, 900);
    if (isQuotaMet(nextServed, quotaRef.current)) {
      finishShift(nextServed, secondsRef.current);
      return;
    }
    setCoach(result.perfect ? `${chit.guest.toUpperCase()} — PERFECT. 1000.` : `${chit.guest.toUpperCase()} — ORDER FULFILLED.`);
  };

  const undoLast = (index: number) => {
    if (paused || complete) return;
    const station = stationsRef.current[index];
    if (station.stage !== "loading" || station.items.length === 0) return;
    const items = station.items.slice(0, -1);
    const nextStations = stationsRef.current.map((entry, i) =>
      i === index ? (items.length === 0 ? emptyStation() : { ...entry, items }) : entry,
    );
    stationsRef.current = nextStations;
    setStations(nextStations);
    setSelected(index);
    cue("tap");
    setCoach(
      items.length === 0
        ? `CUP ${index + 1} EMPTY — TAP A JAR, OR DUMP IF YOU CHANGE YOUR MIND.`
        : `CUP ${index + 1} — ONE SHOT LEFT. TAP THE ICON TO UNDO AGAIN.`,
    );
  };

  const trashStation = (index: number) => {
    const station = stations[index];
    if (station.stage === "empty") return;
    const restore = station.ticket;
    const nextStations = stations.map((entry, i) => (i === index ? emptyStation() : entry));
    stationsRef.current = nextStations;
    setStations(nextStations);
    const open = restore && !ticketsRef.current.some((ticket) => ticket.id === restore.id) ? [restore, ...ticketsRef.current] : ticketsRef.current;
    refillBoard(open, nextStations, servedRef.current);
    if (selected === index) setSelected(null);
    cue("tap");
    setCoach("CUP CLEARED.");
  };

  const ringClass = (station: Station, index: number) => {
    if (station.stage === "loading" && station.items.length > 0) return "is-blue is-armed";
    if (station.stage === "brewing") return "is-spin";
    if (station.stage === "ready") {
      return station.readyElapsed <= CALIBRATED_CUP_TIMING.perfectServeSeconds ? "is-green is-sweet" : "is-green";
    }
    if (station.stage === "overflow" || station.stage === "error") return "is-red";
    if (selected === index) return "is-blue is-picked";
    return "is-blue";
  };

  const ringLabel = (station: Station) => {
    if (station.stage === "loading" && station.items.length > 0) return "Brew";
    if (station.stage === "brewing") return "Pouring";
    if (station.stage === "ready") return "Serve";
    if (station.stage === "overflow" || station.stage === "error") return "Trash";
    return "Select";
  };

  const pressRing = (index: number) => {
    const station = stations[index];
    if (station.stage === "loading") brewStation(index);
    else if (station.stage === "ready") serveStation(index);
    else if (station.stage === "overflow" || station.stage === "error") trashStation(index);
    else selectCup(index);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
    if (next) unlockAudio();
  };
  const stage = stageById(stageId);
  const quota = stage.quota;
  const stars = starsForShift(served, quota);
  const headline = shiftHeadline(served, quota, bonus);
  const short = Math.max(0, quota - served);

  return (
    <main className="brew-game brew-game--shift" aria-label="Coffee Rush café shift">
      <header className="brew-hud">
        <button className="brew-hud__icon" aria-label="Pause shift" onClick={() => setPaused(true)}>
          <IconPause />
        </button>
        <section className="brew-hud__stat">
          <span>TIME</span>
          <b>{formatTime(seconds)}</b>
        </section>
        <section className="brew-hud__stat">
          <span>ORDERS</span>
          <b>
            {served}/{quota}
          </b>
        </section>
        <section className={`brew-hud__stat brew-hud__stat--score ${scorePulse ? "is-hit" : ""}`}>
          <span>SCORE</span>
          <b>{String(score).padStart(5, "0")}</b>
        </section>
        <button className="brew-hud__icon" aria-label={soundOn ? "Mute sound" : "Turn sound on"} onClick={toggleSound}>
          {soundOn ? <IconVolume /> : <IconMute />}
        </button>
      </header>

      <section className="ticket-rail" aria-label="Open orders">
        <div className="ticket-rail__head">
          <span>ON THE RAIL</span>
          <b>
            STAGE {stage.id} · {stage.name.toUpperCase()}
          </b>
        </div>
        <div className="ticket-rail__cards">
          {tickets.map((ticket) => {
            const chit = chitFor(ticket);
            return (
              <article
                className={`ticket ticket--${ticket.ingredient}`}
                key={ticket.id}
                aria-label={`${chit.guest}, ${chit.shot} ${chit.drink}`}
              >
                <span className="ticket__perf" />
                <header className="ticket__head">
                  <span>DUPE</span>
                  <span>#{chit.number}</span>
                </header>
                <div className="ticket__body">
                  <OrderIcons ingredient={ticket.ingredient} amount={ticket.amount} />
                  <span className="ticket__meta">
                    <b>{chit.guest}</b>
                    <strong>
                      {chit.drink}
                      {ticket.amount === 2 ? " ×2" : ""}
                    </strong>
                    <em className={ticket.amount === 2 ? "is-double" : ""}>{ticket.amount === 2 ? "DOUBLE" : "single"}</em>
                  </span>
                </div>
              </article>
            );
          })}
          {tickets.length === 0 && !fulfill && <div className="ticket-rail__empty">All open tickets are pouring.</div>}
          {fulfill && (
            <article className={`ticket ticket--done ${fulfill.perfect ? "is-perfect" : ""}`} key={fulfill.id}>
              <span className="ticket__perf" />
              <header className="ticket__head">
                <span>DUPE</span>
                <span>#{fulfill.number}</span>
              </header>
              <div className="ticket__body">
                <OrderIcons ingredient={fulfill.ingredient} amount={fulfill.shot === "double" ? 2 : 1} />
                <span className="ticket__meta">
                  <b>{fulfill.guest}</b>
                  <strong>
                    {fulfill.drink}
                    {fulfill.shot === "double" ? " ×2" : ""}
                  </strong>
                  <em className={fulfill.shot === "double" ? "is-double" : ""}>{fulfill.shot === "double" ? "DOUBLE" : "single"}</em>
                </span>
              </div>
              <b className="ticket__stamp">{fulfill.perfect ? "PERFECT" : "FULFILLED"}</b>
            </article>
          )}
        </div>
      </section>

      <section className="brew-machine" aria-label="Espresso machine">
        <div className="jar-shelf" aria-label="Ingredient jars">
          {INGREDIENTS.map((ingredient) => (
            <button
              key={ingredient.id}
              className={`jar jar--${ingredient.id}`}
              onClick={() => addIngredient(ingredient.id)}
              aria-label={`Add ${ingredient.label}`}
            >
              <span className="jar__glass">
                <img src={`/coffee/art/icon-${ingredient.id}.jpg`} alt="" draggable={false} />
              </span>
              <b>{ingredient.short}</b>
            </button>
          ))}
        </div>
        <div className="brew-machine__face">
          {stations.map((station, index) => (
            <div
              className={`brew-col brew-col--${station.stage} ${selected === index ? "is-selected" : ""}`}
              key={index}
              onClick={() => selectCup(index)}
            >
              <button
                className={`brew-ring ${ringClass(station, index)}`}
                aria-label={`${ringLabel(station)} cup ${index + 1}`}
                disabled={station.stage === "brewing"}
                onClick={(event) => {
                  event.stopPropagation();
                  pressRing(index);
                }}
              >
                <i />
              </button>
              <div className="brew-spout">
                <b />
                <span />
              </div>
              <div className="brew-pad" role="button" aria-label={`${station.stage} cup ${index + 1}`}>
                <CupFace station={station} onUndo={() => undoLast(index)} />
                {selected === index && station.stage === "loading" && station.items.length > 0 && (
                  <button
                    type="button"
                    className="brew-dump"
                    aria-label={`Dump cup ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      trashStation(index);
                    }}
                  >
                    DUMP
                  </button>
                )}
                {station.pop && (
                  <>
                    <span className="brew-burst" aria-hidden="true" />
                    <b className="brew-check">✓</b>
                    <em className="brew-pop">{station.pop}</em>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="brew-coach" aria-live="polite">
        <span>{selected !== null ? `CUP ${selected + 1}` : "SCAN"}</span>
        <b>{coach}</b>
      </section>

      <footer className="brew-foot">
        <a className="arcade-home arcade-home--inline" href="/">
          ALL GAMES
        </a>
        <span>ARKA · BUILD {GAME_SPEC.version}</span>
        <span>
          STAGE {stage.id} · {quota} DRINKS{best > 0 ? ` · BEST ${best}` : ""}
        </span>
      </footer>

      {paused && !complete && (
        <div className="brew-modal">
          <div className="brew-modal__card">
            <small>SHIFT PAUSED</small>
            <h1>Take a breath</h1>
            <p>Every cup and the clock are frozen.</p>
            <button
              onClick={() => {
                lastFrameRef.current = performance.now();
                setPaused(false);
              }}
            >
              RESUME
            </button>
            <button className="brew-modal__ghost" onClick={toggleSound}>
              {soundOn ? "SOUND ON" : "SOUND OFF"}
            </button>
            <button className="brew-modal__ghost" onClick={() => startShift()}>
              RESTART SHIFT
            </button>
            <button className="brew-modal__ghost" onClick={() => window.location.assign("/")}>
              ALL GAMES
            </button>
            <button
              className="brew-modal__ghost"
              onClick={() => {
                window.location.assign("/?install=1&platform=ios");
              }}
            >
              ADD TO HOME SCREEN
            </button>
          </div>
        </div>
      )}
      {complete && (
        <div className="brew-modal">
          <div className="brew-modal__card">
            <small>
              STAGE {stage.id} · {stage.name.toUpperCase()}
            </small>
            <div className="brew-stars" aria-label={`${stars} of 3 stars`}>
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= stars ? "is-on" : ""}>
                  ★
                </i>
              ))}
            </div>
            <h1>{String(score).padStart(5, "0")}</h1>
            <p>
              {headline}
              <br />
              You served {served} of {quota} drinks
              {bonus > 0 ? ` · +${bonus} leftover-time bonus` : ""}.
            </p>
            <ul className="brew-goals">
              <li className={served >= quota ? "is-hit" : "is-miss"}>
                <b>{served >= quota ? "✓" : "✗"}</b>
                Serve {quota} drinks — {served}/{quota}
              </li>
              <li className={seconds <= 0 || served >= quota ? "is-hit" : "is-miss"}>
                <b>{seconds <= 0 || served >= quota ? "✓" : "✗"}</b>
                2:00 shift clock
              </li>
              <li className={bonus > 0 ? "is-hit" : "is-miss"}>
                <b>{bonus > 0 ? "✓" : "○"}</b>
                Time bonus — finish all {quota} with seconds left (20 pts/sec)
              </li>
            </ul>
            <p className="brew-modal__hint">
              {served >= quota
                ? stageId >= 3
                  ? "Double Time is the top stage. Beat the clock for leftover bonus."
                  : `Next stage unlocked: ${stageById(nextStageId(stage.id)).name} · ${stageById(nextStageId(stage.id)).quota} drinks.`
                : `Need ${short} more to clear ${stage.name}.`}
            </p>
            <button onClick={() => startShift()}>OPEN AGAIN</button>
            <button className="brew-modal__ghost" onClick={() => window.location.assign("/")}>
              ALL GAMES
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
