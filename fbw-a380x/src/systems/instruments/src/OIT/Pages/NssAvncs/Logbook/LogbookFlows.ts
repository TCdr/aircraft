// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AocPrintout } from '@shared/AocPrintout';
import { OitUiService } from '../../../OitUiService';
import { OitPageFunctions } from '../../../OitPageFunctions';
import {
  LogbookAcceptanceProblem,
  acceptanceProblems,
  acceptanceReport,
  acceptanceReportPrintText,
  closureFindings,
  effectivePostFlight,
  flightDataPrintText,
  flightInfo,
  statusPrintText,
} from '../../../System/TechLogbook';
import {
  LogbookDialog,
  LogbookSyncOperation,
  LogbookSyncResult,
  TechLogbookStore,
} from '../../../System/TechLogbookStore';

/** The URIs of the logbook application and its pages */
export const LOGBOOK_URI = {
  application: 'nss-avncs/logbook',
  status: 'nss-avncs/logbook/status',
  entry: 'nss-avncs/logbook/entry',
  history: 'nss-avncs/logbook/history',
  flightData: 'nss-avncs/logbook/flight-data',
  openItems: 'nss-avncs/logbook/open-items',
  deferredItems: 'nss-avncs/logbook/deferred-items',
  temporaryItems: 'nss-avncs/logbook/temporary-items',
  cabinOpenItems: 'nss-avncs/logbook/cabin-open-items',
  release: 'nss-avncs/logbook/release',
  acceptanceReport: 'nss-avncs/logbook/acceptance-report',
  closureReport: 'nss-avncs/logbook/closure-report',
  ecamAlerts: 'nss-avncs/logbook/entry/ecam-alerts',
  cabinItems: 'nss-avncs/logbook/entry/cabin-items',
  systemFunction: 'nss-avncs/logbook/entry/system-function',
  cockpitInterface: 'nss-avncs/logbook/entry/cockpit-interface',
  keyword: 'nss-avncs/logbook/entry/keyword',
  freeText: 'nss-avncs/logbook/entry/free-text',
} as const;

/** Design choice: the texts of the PIC ACCEPT check messages (the real wording is not known, only that one appears) */
const ACCEPTANCE_PROBLEM_TEXTS: Record<LogbookAcceptanceProblem, string> = {
  'logbook-on-ground': 'Logbook on ground: UPDATE the logbook',
  'no-valid-release': 'No valid maintenance release',
  'open-items-not-viewed': 'Open items not displayed',
  'deferred-items-not-viewed': 'Deferred items not displayed',
  'flight-info-missing': 'Flight number, airports or date not entered',
  'preflight-data-missing': 'Mandatory preflight parameters not entered',
};

/**
 * PIC ACCEPT: the checks, then the acceptance report.
 * @param store the logbook
 * @param uiService the OIT navigation
 */
export function startAcceptance(store: TechLogbookStore, uiService: OitUiService): void {
  const problems = acceptanceProblems(store.state.get(), store.avionicsInfo());
  if (problems.length > 0) {
    store.dialog.set({
      kind: 'Caution',
      lines: problems.map((p) => ACCEPTANCE_PROBLEM_TEXTS[p]),
      buttons: [{ label: 'OK' }],
    });
    return;
  }
  uiService.navigateTo(LOGBOOK_URI.acceptanceReport);
}

/**
 * SIGN of a report: the electronic signature window, then the action.
 * @param store the logbook
 * @param onSigned what the signature validates
 */
export function askSignature(store: TechLogbookStore, onSigned: () => void): void {
  store.dialog.set({
    kind: 'Information',
    lines: ['Electronic signature'],
    buttons: [{ label: 'OK', action: onSigned }, { label: 'CANCEL' }],
    identification: 'signature',
  });
}

/**
 * CLOSE FLIGHT: the closure checks one after the other (cabin entries block the closure, the others ask for a
 * confirmation), then "Close flight ?" and the closure report.
 * @param store the logbook
 * @param uiService the OIT navigation
 */
export function startFlightClosure(store: TechLogbookStore, uiService: OitUiService): void {
  const findings = closureFindings(store.state.get(), store.ecamAlerts.get(), store.blockData());
  if (findings.cabinItemsToValidate.length > 0) {
    store.dialog.set({
      kind: 'Caution',
      lines: ['Cabin entries not validated:', ...findings.cabinItemsToValidate.map((i) => i.title)],
      buttons: [{ label: 'OK', action: () => uiService.navigateTo(LOGBOOK_URI.cabinItems) }],
    });
    return;
  }

  const steps: LogbookDialog[] = [];
  if (findings.unrecordedEcamAlerts.length > 0) {
    steps.push({
      kind: 'Caution',
      lines: ['ECAM alerts not recorded:', ...findings.unrecordedEcamAlerts.map((o) => o.title)],
      buttons: [],
    });
  }
  if (findings.temporaryItems.length > 0) {
    steps.push({
      kind: 'Caution',
      lines: [
        `${findings.temporaryItems.length} temporary item(s).`,
        'All temporary items are deleted with flight closure.',
      ],
      buttons: [],
    });
  }
  if (findings.missingPostFlight.length > 0) {
    steps.push({
      kind: 'Caution',
      lines: ['Mandatory fields not completed:', findings.missingPostFlight.join(', ')],
      buttons: [],
    });
  }
  steps.push({ kind: 'Caution', lines: ['Close flight ?'], buttons: [] });

  const showStep = (index: number): void => {
    const step = steps[index];
    const next =
      index === steps.length - 1 ? () => uiService.navigateTo(LOGBOOK_URI.closureReport) : () => showStep(index + 1);
    store.dialog.set({ ...step, buttons: [{ label: 'OK', action: next }, { label: 'CANCEL' }] });
  };
  showStep(0);
}

/**
 * The message shown while a synchronisation runs (no button: it cannot be aborted).
 * @param operation the synchronisation
 * @returns the message
 */
export function syncDialog(operation: LogbookSyncOperation): LogbookDialog {
  switch (operation) {
    case 'update':
      return { kind: 'Information', lines: ['Aircraft status is being updated.', 'Please wait...'], buttons: [] };
    case 'give-back':
      return { kind: 'Information', lines: ['Logbook is being given back to ground.', 'Please wait...'], buttons: [] };
    case 'acceptance':
      return { kind: 'Information', lines: ['Synchronization with ground.', 'Please wait...'], buttons: [] };
    case 'closure':
      return {
        kind: 'Information',
        lines: ['Aircraft status is being sent to ground.', 'Please wait...', '', 'Sending in progress'],
        buttons: [],
      };
  }
}

/**
 * The message at the end of a synchronisation, null when the STATUS page shows the result by itself.
 * @param result the end of the synchronisation
 * @returns the message
 */
export function syncResultDialog(result: LogbookSyncResult): LogbookDialog | null {
  const ok = [{ label: 'OK' }];
  switch (result) {
    case 'update-done':
    case 'give-back-done':
    case 'closure-sent':
      return null;
    case 'update-failed':
    case 'give-back-failed':
      return { kind: 'Caution', lines: ['Synchronization with ground failed.'], buttons: ok };
    case 'acceptance-acknowledged':
      return { kind: 'Information', lines: ['Acknowledgment from ground: acceptance report received'], buttons: ok };
    case 'acceptance-not-acknowledged':
      return {
        kind: 'Caution',
        lines: ['No acknowledgment from ground.', 'Print the logbook for maintenance before push-back.'],
        buttons: ok,
      };
    case 'closure-not-sent':
      return { kind: 'Caution', lines: ['Aircraft status not sent to ground.'], buttons: ok };
  }
}

/**
 * The logbook pages that can be printed: the STATUS page, the acceptance report and the PRE/POST-FLIGHT panels.
 * @param uri the URI shown
 * @returns whether PRINT is available
 */
export function isPrintableLogbookPage(uri: string): boolean {
  return (
    uri === LOGBOOK_URI.application ||
    uri === LOGBOOK_URI.status ||
    uri === LOGBOOK_URI.acceptanceReport ||
    uri === LOGBOOK_URI.flightData
  );
}

/**
 * The functions of the NSS AVNCS menu bar on a logbook page: PRINT on the pages that can be printed. UPDATE is the
 * menu bar's own (the page shows again with fresh avionics parameters).
 * @param uri the URI shown
 * @param print prints the page shown
 * @returns the functions of the page
 */
export function logbookPageFunctions(uri: string, print: () => void): OitPageFunctions {
  return isPrintableLogbookPage(uri) ? { print: { run: print } } : {};
}

/**
 * @param rows the rows of a table with tick boxes
 * @returns whether the tick-all box of the header shows ticked: every row ticked, and at least one row
 */
export function allRowsTicked(rows: readonly { readonly ticked?: boolean }[]): boolean {
  return rows.length > 0 && rows.every((row) => row.ticked === true);
}

/**
 * The printout of the page shown, under the title of the page.
 * @param store the logbook
 * @param uri the URI shown
 * @returns the printout, null when the page cannot be printed
 */
export function logbookPrintout(store: TechLogbookStore, uri: string): AocPrintout | null {
  const state = store.state.get();
  const avionics = store.avionicsInfo();
  if (uri === LOGBOOK_URI.application || uri === LOGBOOK_URI.status) {
    return { title: 'LOGBOOK STATUS', text: statusPrintText(state, avionics, store.registration()) };
  }
  if (uri === LOGBOOK_URI.acceptanceReport) {
    return {
      title: 'ACCEPTANCE REPORT',
      text: acceptanceReportPrintText(acceptanceReport(state, avionics, store.registration())),
    };
  }
  if (uri === LOGBOOK_URI.flightData) {
    const index = store.shownFlightIndex.get();
    const flight = state.pastFlights.find((f) => f.index === index) ?? state.flight;
    const block = flight.blockData ?? store.blockData();
    return {
      title: 'FLIGHT DATA',
      text: flightDataPrintText(flight, flightInfo(flight, avionics), effectivePostFlight(state, flight, block)),
    };
  }
  return null;
}
