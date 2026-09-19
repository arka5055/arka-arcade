import { describe, expect, it } from 'vitest';
import { STAGE, buildStage, validateStage, exploreOutcomes } from '../thought-tracks/graph.js';

describe('Thought Tracks rail graph', () => {
  it('ships fourteen stages', () => {
    expect(STAGE).toHaveLength(14);
  });

  it.each(STAGE.map((s) => [s.id, s]))('stage %s validates and every color can reach its station', (_id, spec) => {
    const graph = buildStage(spec.id);
    const report = validateStage(graph);
    expect(report.errors, report.errors.join('\n')).toEqual([]);
    expect(report.ok).toBe(true);
    for (const source of graph.sources) {
      const outcomes = exploreOutcomes(graph, source.id);
      expect(outcomes.length).toBeGreaterThan(0);
      expect(outcomes.every((o) => o.kind === 'station')).toBe(true);
      for (const color of source.packet) {
        expect(outcomes.some((o) => o.color === color), `${source.id} cannot reach ${color}`).toBe(true);
      }
    }
    const stations = Object.values(graph.nodes).filter((n: any) => n.kind === 'station');
    expect(stations.length).toBe(Object.keys(graph.codes).length);
    for (const st of stations as any[]) {
      expect(Object.values(st.ports).filter(Boolean)).toHaveLength(1);
    }
    for (const sw of Object.values(graph.nodes).filter((n: any) => n.kind === 'switch') as any[]) {
      expect(sw.out0).not.toBe(sw.out1);
      expect(sw.inPort).not.toBe(sw.out0);
      expect(sw.inPort).not.toBe(sw.out1);
    }
  });
});
