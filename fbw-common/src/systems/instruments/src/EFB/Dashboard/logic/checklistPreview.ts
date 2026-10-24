// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface ChecklistPreviewItem {
  item: string;
  result: string;
}

interface ChecklistLines {
  items: readonly { item: string; result: string; action?: string; type?: string }[];
}

/**
 * The first lines of a checklist with their expected result, as the crew reads them. Separators and sub-list titles
 * are skipped: they have no result to read back. An item with an empty result shows its action instead.
 */
export const checklistPreview = (checklist: ChecklistLines | undefined, maxItems: number): ChecklistPreviewItem[] => {
  if (!checklist || maxItems <= 0) {
    return [];
  }
  return checklist.items
    .filter((line) => line.type !== 'LINE' && line.type !== 'SUBLISTHEADER')
    .slice(0, maxItems)
    .map((line) => ({ item: line.item, result: line.result || line.action || '' }));
};

/** How many checklists of the flight are marked complete, out of all of them */
export const checklistProgress = (
  checklists: readonly { markedCompleted: boolean }[],
): { done: number; total: number } => ({
  done: checklists.filter((checklist) => checklist.markedCompleted).length,
  total: checklists.length,
});
