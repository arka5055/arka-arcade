export function mergeHub(a?: object, b?: object): Record<string, unknown>;
export function newPlayerId(): string;
export function loadProgress(playerId: string): Record<string, unknown>;
export function saveProgress(playerId: string, incoming: object): Record<string, unknown>;
export function playerFromCookie(header?: string): string;
export function playerCookie(id: string): string;
