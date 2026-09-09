/** One shared gesture drives all leaves; their fan closes at both endpoints. */
export function stackLeafProgress(progress: number, layer: number, count: number): number {
  if (count <= 1) return progress;
  const fraction = layer / (count - 1);
  return progress + (fraction - .5) * Math.sin(Math.PI * progress) * .20;
}

export function pageStackCount(source: number, target: number, double: boolean): number {
  const leaves = Math.round(Math.abs(target - source) / (double ? 2 : 1));
  return Math.max(1, Math.min(8, leaves));
}
