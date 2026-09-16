export interface RadarLabelPosition {
  x: number;
  y: number;
}

/**
 * Keeps a canvas text label fully visible within the playable radar rectangle.
 * `width` includes its background padding; `y` is the top edge of the label.
 */
export function clampRadarLabel(
  desiredX: number,
  desiredY: number,
  labelWidth: number,
  boardWidth: number,
  boardHeight: number,
  labelHeight = 17,
  inset = 5,
): RadarLabelPosition {
  const minX = labelWidth / 2 + inset;
  const maxX = Math.max(minX, boardWidth - labelWidth / 2 - inset);
  const minY = inset;
  const maxY = Math.max(minY, boardHeight - labelHeight - inset);
  return {
    x: Math.max(minX, Math.min(maxX, desiredX)),
    y: Math.max(minY, Math.min(maxY, desiredY)),
  };
}
