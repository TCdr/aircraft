// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The mark of a checklist in the list of checklists */
export type ChecklistMarkKind = 'done' | 'next' | 'open';

/**
 * The index of the next checklist to do: the first checklist of the flight phase that is not marked complete, -1 when
 * there is none.
 * @param checklists the checklists, in list order
 * @param relevantIndices the indices of the checklists of the current flight phase
 */
export function firstRelevantUnmarkedChecklist(
  checklists: readonly { markedCompleted: boolean }[],
  relevantIndices: readonly number[],
): number {
  return checklists.findIndex((cl, index) => relevantIndices.includes(index) && !cl.markedCompleted);
}

/**
 * The mark of a checklist in the list: done when marked complete with "Mark checklist as complete" (whatever the flight
 * phase), the next one of the flight phase when autofill is on, otherwise open.
 * @param markedCompleted whether the checklist is marked complete
 * @param autoFill whether the checklist autofill is on
 * @param index the index of the checklist
 * @param nextIndex the index of the next checklist to do (see firstRelevantUnmarkedChecklist)
 */
export function checklistMarkKind(
  markedCompleted: boolean,
  autoFill: boolean,
  index: number,
  nextIndex: number,
): ChecklistMarkKind {
  if (markedCompleted) {
    return 'done';
  }
  if (autoFill && nextIndex === index) {
    return 'next';
  }
  return 'open';
}
