export type PageMotion = {
  progress: number; target: number | null; direction: number; finished: boolean;
  velocity: number; dragProgress: number; grabY: number; speed?: number; sheetCount?: number;
};

/** Analytic critically damped spring: stable across refresh rates and interrupted drags. */
export function advancePageMotion(state: PageMotion, delta: number): void {
  const dt = Math.min(delta, 0.04);
  if (state.target === null) {
    state.progress += (state.dragProgress - state.progress) * (1 - Math.exp(-32 * dt));
    return;
  }
  const omega = state.speed ?? 14, offset = state.progress - state.target;
  const impulse = state.velocity + omega * offset, decay = Math.exp(-omega * dt);
  state.progress = state.target + (offset + impulse * dt) * decay;
  state.velocity = (state.velocity - omega * impulse * dt) * decay;
  if (Math.abs(state.target - state.progress) < 0.0015 && Math.abs(state.velocity) < 0.025) {
    state.progress = state.target; state.velocity = 0; state.finished = true;
  }
}
