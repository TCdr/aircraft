// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AlertProcedure, EcamColour, ProcedureLine, ProcedureLineState, parseEcamText } from '@flybywiresim/fbw-sdk';
import {
  AbstractChecklistItem,
  ChecklistAction,
  EcamAbnormalProcedures,
  FMS_PRED_UNRELIABLE_CHECKLIST_ITEM,
  WD_LINE_CHARACTERS,
  isChecklistAction,
  isChecklistCondition,
} from '../../MsfsAvionicsCommon/EcamMessages';
import type { ChecklistState } from '../../MsfsAvionicsCommon/providers/FwsPublisher';

/**
 * The procedure tables spread FMS_PRED_UNRELIABLE_CHECKLIST_ITEM, which the bundle defines after the tables: the spread
 * reads undefined and leaves an item without a name. That item is the FMS PRED UNRELIABLE line.
 */
function restoreSpreadItem(item: AbstractChecklistItem): AbstractChecklistItem {
  return item.name === undefined ? { ...FMS_PRED_UNRELIABLE_CHECKLIST_ITEM, ...item } : item;
}

export function procedureExists(procedureId: string): boolean {
  return EcamAbnormalProcedures[Number(procedureId)] !== undefined;
}

function actionText(item: ChecklistAction, checked: boolean): string {
  const level = item.level ?? 0;
  const colon = item.colonIfCompleted === false ? ' ' : ' : ';

  if (checked && (item.labelCompleted || item.labelNotCompleted)) {
    return `${item.name}${colon}${item.labelCompleted || item.labelNotCompleted}`;
  }
  if (!checked && item.labelNotCompleted) {
    // same dot count as the EWD line, which counts its leading dash and the indent twice
    const used = item.labelNotCompleted.length + 1 + item.name.length + 2 * level + 2;
    const dots = '.'.repeat(Math.max(0, WD_LINE_CHARACTERS - 1 - used));
    return `${item.name} ${dots}${item.labelNotCompleted}`;
  }
  return item.name;
}

function conditionText(item: AbstractChecklistItem, checked: boolean): string {
  const closing = item.name.endsWith(':') ? '' : ' :';
  if (item.name.substring(0, 4) === 'WHEN') {
    return `.${item.name}${closing}`;
  }
  const subject = item.name.substring(0, 2) === 'IF' ? item.name.substring(2) : item.name;
  return `.${checked ? 'AS' : 'IF'} ${subject}${closing}`;
}

/** EWD-style text of one item: action "NAME ....... LABEL" (labelCompleted when checked), condition ".IF NAME :" */
export function itemText(item: AbstractChecklistItem, checked: boolean): string {
  if (isChecklistCondition(item)) {
    return conditionText(item, checked);
  }
  if (isChecklistAction(item)) {
    return actionText(item, checked);
  }
  return item.name;
}

function itemColour(item: AbstractChecklistItem, checked: boolean): EcamColour {
  if (checked) {
    return 'green';
  }
  return isChecklistAction(item) ? 'cyan' : 'white';
}

function buildLine(item: AbstractChecklistItem, checked: boolean, state: ProcedureLineState): ProcedureLine {
  return {
    segments: parseEcamText(itemText(item, checked), itemColour(item, checked)),
    level: item.level ?? 0,
    state,
  };
}

export function alertProcedures(
  procedureIds: readonly string[],
  presented: readonly ChecklistState[],
): AlertProcedure[] {
  const procedures: AlertProcedure[] = [];

  for (const procedureId of procedureIds) {
    const procedure = EcamAbnormalProcedures[Number(procedureId)];
    if (!procedure) {
      continue;
    }
    const items = procedure.items.map(restoreSpreadItem);

    // the title can span two EWD lines, the flyPad shows it on one
    const title = parseEcamText(procedure.title.replace(/\s*\n\s*/g, ' '));
    const presentedIndex = presented.findIndex((state) => state.id === procedureId);

    if (presentedIndex < 0) {
      procedures.push({
        alertId: procedureId,
        title,
        lines: items.map((item) => buildLine(item, false, 'reference')),
      });
      continue;
    }

    const state = presented[presentedIndex];
    const lines: ProcedureLine[] = [];
    items.forEach((item, index) => {
      if (state.itemsToShow[index]) {
        const checked = !!state.itemsChecked[index];
        const inactive = !state.itemsActive[index] || !state.procedureActivated;
        lines.push(buildLine(item, checked, checked ? 'done' : inactive ? 'inactive' : 'pending'));
      }
    });
    procedures.push({ alertId: procedureId, title, lines, ewdOrder: presentedIndex });
  }

  return procedures;
}
