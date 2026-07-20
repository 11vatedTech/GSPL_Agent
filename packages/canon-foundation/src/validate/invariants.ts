/**
 * 7+1-Axis Discipline invariants per spec/01 + MVP_DEFINITION.md Part 7.
 *
 * The seven axes (signed, typed, lineage-tracked, graph-structured,
 * confidence-bearing, rollback-able, differentiable) are a STRUCTURAL
 * CONTRACT. Every gseed, CLI, editor, and export surface must satisfy all
 * seven. They are NOT a registry of concepts; they are dimensions of a
 * contract that all surfaces comply with.
 *
 * Test pins:
 *   - SEVEN_AXES.length === 7 and equals the order in const SEVEN_AXES.
 *   - For an unsigned primordial draft:
 *       signed              : present === false
 *       differentiable      : present === true
 *       missing             includes 'signed', 'lineage-tracked', 'confidence-bearing'
 *   - Each axis carries non-empty `evidence`.
 */

import { SEVEN_AXES } from '../constants.js';
import type { UniversalSeed } from '../types/universal-seed.js';
import type { SevenAxisId } from '../constants.js';

export const SEVEN_AXES_COUNT: number = SEVEN_AXES.length;

export type AxisEvidence = {
  path: string;
  present: boolean;
  note: string;
};

export type AxisReport = {
  axis: SevenAxisId;
  present: boolean;
  evidence: AxisEvidence[];
};

export type SevenAxisReport = {
  axes: AxisReport[];
  allPresent: boolean;
  missing: SevenAxisId[];
};

function evidenceFor(seed: UniversalSeed, axis: SevenAxisId): AxisEvidence[] {
  const missing: AxisEvidence[] = [];
  const present: AxisEvidence[] = [];

  switch (axis) {
    case 'signed':
      if (seed.$hash) {
        present.push({ path: '$.$hash', present: true, note: 'seed carries $hash' });
      } else {
        missing.push({ path: '$.$hash', present: false, note: 'no $hash field' });
      }
      break;
    case 'typed':
      if (Object.keys(seed.genes).length > 0) {
        for (const [name, g] of Object.entries(seed.genes)) {
          if (g && (g as { type?: unknown }).type) {
            present.push({
              path: `$.genes.${name}.type`,
              present: true,
              note: `gene '${name}' has type '${String((g as { type: unknown }).type)}'`,
            });
          } else {
            missing.push({ path: `$.genes.${name}.type`, present: false, note: 'gene type missing' });
          }
        }
      }
      if (!seed.$domain) missing.push({ path: '$.$domain', present: false, note: 'no $domain' });
      else present.push({ path: '$.$domain', present: true, note: 'domain declared' });
      break;
    case 'lineage-tracked': {
      // A seed is lineage-tracked iff its history can be retired to a parent
      // (derivative ⇒ parents.length > 0) OR its genesis is signed (so the
      // signed lineage establishes the recorded chain). Unsigned primordials
      // have no line of provenance and therefore fail this axis.
      const hasParents = !!(
        seed.$lineage && Array.isArray(seed.$lineage.parents) && seed.$lineage.parents.length > 0
      );
      const isSigned = !!seed.$hash;
      if (hasParents || isSigned) {
        present.push({
          path: '$.$lineage',
          present: true,
          note: `lineage operation=${seed.$lineage?.operation} parents=${seed.$lineage?.parents?.length ?? 0} signed=${isSigned}`,
        });
      } else {
        missing.push({ path: '$.$lineage', present: false, note: 'unsigned primordial: no recorded provenance' });
      }
      break;
    }
    case 'graph-structured':
      // Any seed with ≥ 2 genes is structured; otherwise the gene itself is a
      // generic value — the canonical form is still a graph (object).
      present.push({ path: '$.genes', present: true, note: 'genes is a (possibly singleton) object graph' });
      break;
    case 'confidence-bearing':
      // Genes carry optional confidence; the seed itself counts as confidence-
      // bearing iff every gene has a confidence value OR confidence is implicit
      // (set to 1.0).
      let withConf = 0;
      let total = 0;
      for (const [, g] of Object.entries(seed.genes)) {
        total += 1;
        if (g && typeof (g as { confidence?: number }).confidence === 'number') withConf += 1;
      }
      if (total > 0 && withConf === total) {
        present.push({ path: '$.genes.*.confidence', present: true, note: 'all genes carry confidence' });
      } else {
        missing.push({ path: '$.genes.*.confidence', present: false, note: 'at least one gene lacks confidence' });
      }
      break;
    case 'rollback-able':
      // Every seed is rollback-able iff its lineage has at least one parent
      // (for derivative seeds) OR is primordial (the genesis point). Primordials
      // are rollback-able to themselves.
      if (seed.$lineage?.operation === 'primordial' || (seed.$lineage?.parents?.length ?? 0) > 0) {
        present.push({ path: '$.$lineage', present: true, note: 'rollback to parents or self is defined' });
      } else {
        missing.push({ path: '$.$lineage', present: false, note: 'no rollback point' });
      }
      break;
    case 'differentiable':
      if (Object.keys(seed.genes).length > 0 && seed.$lineage) {
        present.push({ path: '$.genes', present: true, note: 'genes + lineage enable differential diff' });
      } else {
        missing.push({ path: '$.genes', present: false, note: 'no differentiable substrate' });
      }
      break;
  }
  return [...present, ...missing];
}

/**
 * Compute the per-axis report for a seed.
 */
export function checkSevenAxes(seed: UniversalSeed): SevenAxisReport {
  const axes: AxisReport[] = SEVEN_AXES.map((axis) => {
    const ev = evidenceFor(seed, axis);
    return { axis, present: ev.some((e) => e.present), evidence: ev };
  });
  const missing = axes.filter((a) => !a.present).map((a) => a.axis);
  return { axes, allPresent: missing.length === 0, missing };
}
