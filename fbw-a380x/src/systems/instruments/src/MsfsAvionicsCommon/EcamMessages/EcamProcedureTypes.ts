// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Kept apart from index.ts: the ATA procedure tables evaluate ChecklistLineStyle when they are loaded, so importing it
// from index.ts (which imports the tables) is a circular import that leaves it undefined.

export enum ChecklistLineStyle {
  Standard = 'Standard',
  Cyan = 'Cyan',
  Green = 'Green',
  GreenTable = 'GreenTable',
  Amber = 'Amber',
  White = 'White',
  Red = 'Red',
  Headline = 'Headline',
  SubHeadline = 'SubHeadline',
  CenteredSubHeadline = 'CenteredSubHeadline',
  SeparationLine = 'SeparationLine',
  Empty = 'Empty',
  ChecklistItem = 'ChecklistItem',
  CompletedChecklist = 'CompletedChecklist',
  CompletedDeferredProcedure = 'CompletedDeferredProcedure',
  DeferredProcedure = 'DeferredProcedure',
  OmissionDots = 'OmissionDots',
  LandAsap = 'LandAsap',
  LandAnsa = 'LandAnsa',
  ChecklistCondition = 'ChecklistCondition',
  ChecklistItemInactive = 'ChecklistItemInactive',
}

export interface AbstractChecklistItem {
  /** The name of the item, displayed at the beginning of the line. Does not accept special formatting tokens. No leading dot. For conditions, don't include the leading "IF" */
  name: string;
  /** Sensed or not sensed item. Sensed items are automatically checked. Non-sensed items will have a checkbox drawn in front of them on the EWD */
  sensed: boolean;
  /** On which level of indentation to print the item. 0 equals the first level. Optional, not set means first level. Important for items subordinated to conditions. */
  level?: number;
  /** Manually define style. standard (cyan when not completed, white/green when completed), or always cyan/green/amber. Standard, if not set. */
  style?: ChecklistLineStyle;
}

export interface ChecklistAction extends AbstractChecklistItem {
  /** Label at the end of the line if action is not completed. */
  labelNotCompleted: string;
  /** Label after "name" if action is completed. Optional, only fill if different from "labelNotCompleted". */
  labelCompleted?: string;
  /** Whether to show a colon (:) between item name and labelCompleted. Default is true. */
  colonIfCompleted?: boolean;
}

export interface TimedChecklistAction extends ChecklistAction {
  /** The time in seconds to be appended to the name of the item. E.g. AFTER 30 S */
  time: number;

  sensed: true;
}

export interface ChecklistCondition extends AbstractChecklistItem {
  /** If this line is a condition. Can be sensed or not sensed (i.e. manually activated). */
  condition: true;
}

export interface TimedChecklistCondition extends ChecklistCondition {
  /** The time in seconds to be appended to the name of the item. E.g. AFTER 30 S */
  time: number;

  /** Wheter to append the time to the name of the item after it elapses*/
  appendTimeIfElapsed: boolean;

  sensed: true;
}

export interface ChecklistSpecialItem extends AbstractChecklistItem {}

export function isChecklistAction(c: AbstractChecklistItem): c is ChecklistAction {
  return (c as ChecklistAction)?.labelNotCompleted !== undefined;
}

export function isTimedCheckListAction(c: AbstractChecklistItem): c is TimedChecklistAction {
  return isChecklistAction(c) && (c as TimedChecklistAction)?.time !== undefined;
}

export function isChecklistHeadline(c: AbstractChecklistItem) {
  return c.style ? [(ChecklistLineStyle.SubHeadline, ChecklistLineStyle.CenteredSubHeadline)].includes(c.style) : false;
}

export function isChecklistCondition(c: AbstractChecklistItem): c is ChecklistCondition {
  return (c as ChecklistCondition)?.condition !== undefined;
}

export function isNonTimedChecklistCondition(c: ChecklistCondition): boolean {
  return !isChecklistTimedCondition(c);
}

export function isChecklistTimedCondition(c: AbstractChecklistItem): c is TimedChecklistCondition {
  return isChecklistCondition(c) && (c as TimedChecklistCondition)?.time !== undefined;
}

export function isTimedItem(c: AbstractChecklistItem): boolean {
  return isTimedCheckListAction(c) || isChecklistTimedCondition(c);
}

export function isAbnormalSensedProcedure(
  c: AbnormalProcedure | DeferredProcedure | NormalProcedure,
): c is AbnormalProcedure {
  return (c as AbnormalProcedure)?.recommendation !== undefined;
}

export interface AbnormalProcedure {
  /** Title of the fault, e.g. "_HYD_ G SYS PRESS LO". \n produces second line. Accepts special formatting tokens  */
  title: string;
  /** sensed or not sensed abnormal procedure */
  sensed: boolean;
  /** An array of possible checklist items. */
  items: (
    | ChecklistAction
    | ChecklistCondition
    | ChecklistSpecialItem
    | TimedChecklistAction
    | TimedChecklistCondition
  )[];
  /** LAND ASAP or LAND ANSA displayed below title? Optional, don't fill if no recommendation */
  recommendation?: 'LAND ASAP' | 'LAND ANSA';
}

export interface NormalProcedure {
  /** Title of the checklist, e.g. "BEFORE START".  */
  title: string;
  /** An array of possible checklist items.. */
  items: (
    | ChecklistAction
    | ChecklistCondition
    | ChecklistSpecialItem
    | TimedChecklistAction
    | TimedChecklistCondition
  )[];
  /** Checklist is only activated by request, deactivated per default */
  onlyActivatedByRequest?: boolean;
}

export enum DeferredProcedureType {
  ALL_PHASES,
  AT_TOP_OF_DESCENT,
  FOR_APPROACH,
  FOR_LANDING,
}
export const DEFERRED_PROCEDURE_TYPE_TO_STRING = ['ALL PHASES', 'AT TOP OF DESCENT', 'FOR APPROACH', 'FOR LANDING'];
export interface DeferredProcedure {
  /** Which abnormal procedures triggers this deferred procedure */
  fromAbnormalProcs: string[];
  /** (optional, only used from batch 7) Title of the procedure, Accepts special formatting tokens  */
  title?: string;
  /** An array of possible checklist items. */
  items: (
    | ChecklistAction
    | ChecklistCondition
    | ChecklistSpecialItem
    | TimedChecklistAction
    | TimedChecklistCondition
  )[];
  type: DeferredProcedureType;
}

export const FMS_PRED_UNRELIABLE_CHECKLIST_ITEM: ChecklistSpecialItem = {
  name: 'FMS PRED UNRELIABLE', // TODO Replace with FMS PRED UNRELIABLE WITHOUT ACCURATE FMS FUEL PENALTY INSERTION once multiple lines supported
  sensed: false,
  style: ChecklistLineStyle.ChecklistCondition,
};
