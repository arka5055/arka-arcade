export type ConflictSeverity = 'caution' | 'critical';

export interface TrafficVector {
  id: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  safetyRadius: number;
}

export interface TrafficConflict {
  firstId: string;
  secondId: string;
  severity: ConflictSeverity;
  distance: number;
  projectedDistance: number;
  safetyDistance: number;
}

/**
 * Evaluates a pair once per animation frame. The warning occurs before an overlap
 * so the controller has time to redraw either player-owned route.
 */
export function classifyTrafficConflict(
  first: TrafficVector,
  second: TrafficVector,
  lookAheadSeconds = 2,
): TrafficConflict | null {
  const distance = Math.hypot(first.x - second.x, first.y - second.y);
  const projectedDistance = Math.hypot(
    first.x + Math.cos(first.heading) * first.speed * lookAheadSeconds
      - (second.x + Math.cos(second.heading) * second.speed * lookAheadSeconds),
    first.y + Math.sin(first.heading) * first.speed * lookAheadSeconds
      - (second.y + Math.sin(second.heading) * second.speed * lookAheadSeconds),
  );
  const safetyDistance = first.safetyRadius + second.safetyRadius;

  if (distance < safetyDistance + 38) {
    return { firstId: first.id, secondId: second.id, severity: 'critical', distance, projectedDistance, safetyDistance };
  }
  if (distance < safetyDistance + 88 || projectedDistance < safetyDistance + 52) {
    return { firstId: first.id, secondId: second.id, severity: 'caution', distance, projectedDistance, safetyDistance };
  }
  return null;
}

export function getConflictColor(severity: ConflictSeverity): string {
  return severity === 'critical' ? '#FF3D71' : '#FFB300';
}
