export type IngredientId = "spice" | "foam" | "cocoa" | "sugar" | "bean";
export type Ticket = { id: number; ingredient: IngredientId; amount: 1 | 2 };

/** Coffee Rush 2.0.2 player contract — source of truth for the live shift. */
export const GAME_SPEC = {
  version: "2.0.2",
  shiftSeconds: 120,
  quota: 18,
  stationCount: 5,
  ticketSlots: 3,
  minTouchPx: 48,
  perfectPoints: 1000,
  latePointsMin: 700,
  latePointsMax: 950,
  overflowPoints: 0,
  timeBonusPerSecond: 20,
  fill: {
    single: 4.0,
    double: 8.0,
  },
  perfectServeSeconds: 0.45,
  greenGraceSeconds: 2.0,
  tickMs: 100,
} as const;

export const INGREDIENTS: ReadonlyArray<{ id: IngredientId; label: string; short: string }> = [
  { id: "spice", label: "CINNAMON", short: "SPICE" },
  { id: "foam", label: "MILK FOAM", short: "FOAM" },
  { id: "cocoa", label: "COCOA", short: "COCOA" },
  { id: "sugar", label: "SUGAR", short: "SUGAR" },
  { id: "bean", label: "ESPRESSO", short: "BEAN" },
];

export const CALIBRATED_CUP_TIMING = {
  tickMs: GAME_SPEC.tickMs,
  singleFillSeconds: GAME_SPEC.fill.single,
  doubleFillSeconds: GAME_SPEC.fill.double,
  greenGraceSeconds: GAME_SPEC.greenGraceSeconds,
  perfectServeSeconds: GAME_SPEC.perfectServeSeconds,
} as const;

export function fillSecondsForAmount(amount: 1 | 2) {
  return amount === 2 ? GAME_SPEC.fill.double : GAME_SPEC.fill.single;
}

export function fillSecondsForItems(items: IngredientId[]) {
  return fillSecondsForAmount(items.length >= 2 ? 2 : 1);
}

export function fillIncrementForUnits(units: number) {
  const seconds = units >= 2 ? GAME_SPEC.fill.double : GAME_SPEC.fill.single;
  return GAME_SPEC.tickMs / (seconds * 1000);
}

export function isInteractiveTargetSafe(height: number) {
  return height >= GAME_SPEC.minTouchPx;
}

export function elapsedWholeSeconds(now: number, lastSecondAt: number) {
  return Math.max(0, Math.floor((now - lastSecondAt) / 1000));
}

export function reducedShiftSeconds(current: number, elapsed: number) {
  return Math.max(0, current - elapsed);
}

export function recipeUnits(items: IngredientId[]) {
  if (items.length === 0) return 0;
  if (!items.every((item) => item === items[0])) return 0;
  return items.length;
}

export function matchesRecipe(current: IngredientId[], expected: IngredientId[]) {
  return recipeUnits(current) === expected.length && current.length === expected.length && current.every((item) => item === expected[0]);
}

export function matchingOpenTicket(items: IngredientId[], tickets: Ticket[]) {
  const units = recipeUnits(items);
  if (units !== 1 && units !== 2) return null;
  const ingredient = items[0];
  return tickets.find((ticket) => ticket.ingredient === ingredient && ticket.amount === units) ?? null;
}

export function ticketAmountForElapsed(id: number, elapsed: number): 1 | 2 {
  if (elapsed < 20) return 1;
  if (elapsed < 40) return id % 4 === 0 ? 2 : 1;
  if (elapsed < 80) return id % 3 === 0 ? 2 : 1;
  return id % 2 === 0 ? 2 : 1;
}

export function makeTicket(id: number, elapsed: number): Ticket {
  const ingredient = INGREDIENTS[(id * 3 + 4) % INGREDIENTS.length].id;
  return { id, ingredient, amount: ticketAmountForElapsed(id, elapsed) };
}

export function openTicketNeed(served: number, inProgress: number, quota: number = GAME_SPEC.quota) {
  return Math.max(0, Math.min(GAME_SPEC.ticketSlots, quota - served - inProgress));
}

export function isQuotaMet(served: number, quota: number = GAME_SPEC.quota) {
  return served >= quota;
}

export function isPerfectServe(readyElapsed: number) {
  return readyElapsed <= GAME_SPEC.perfectServeSeconds;
}

export function isOverflowed(readyElapsed: number) {
  return readyElapsed >= GAME_SPEC.greenGraceSeconds;
}

export function serveScore(readyElapsed: number) {
  if (isOverflowed(readyElapsed)) {
    return { points: GAME_SPEC.overflowPoints, perfect: false, overflow: true };
  }
  if (isPerfectServe(readyElapsed)) {
    return { points: GAME_SPEC.perfectPoints, perfect: true, overflow: false };
  }
  const lateSpan = GAME_SPEC.greenGraceSeconds - GAME_SPEC.perfectServeSeconds;
  const t = Math.min(1, Math.max(0, (readyElapsed - GAME_SPEC.perfectServeSeconds) / lateSpan));
  const points = Math.round(GAME_SPEC.latePointsMax - t * (GAME_SPEC.latePointsMax - GAME_SPEC.latePointsMin));
  return { points, perfect: false, overflow: false };
}

export function timeBonus(remainingSeconds: number, served: number, quota: number = GAME_SPEC.quota) {
  if (!isQuotaMet(served, quota)) return 0;
  return Math.max(0, Math.ceil(remainingSeconds)) * GAME_SPEC.timeBonusPerSecond;
}

export const STAGES = [
  { id: 1, name: "Opening", quota: 12 },
  { id: 2, name: "Rush Hour", quota: 18 },
  { id: 3, name: "Double Time", quota: 24 },
] as const;

export function stageById(id: number) {
  return STAGES.find((stage) => stage.id === id) ?? STAGES[1];
}

export function nextStageId(id: number) {
  return Math.min(STAGES[STAGES.length - 1].id, id + 1);
}

export function starsForShift(served: number, quota: number = GAME_SPEC.quota) {
  if (served >= quota) return 3;
  if (served >= Math.ceil((quota * 2) / 3)) return 2;
  if (served > 0) return 1;
  return 0;
}

export function shiftHeadline(served: number, quota: number = GAME_SPEC.quota, bonus = 0) {
  if (served >= quota && bonus > 0) return "STAGE CLEARED — TIME BONUS";
  if (served >= quota) return "STAGE CLEARED";
  const short = quota - served;
  return `SHIFT OVER — ${short} SHORT`;
}
