// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FltOpsOpenApplications } from '../FltOps/FltOpsApplications';

/** The NSS AVNCS Menu page, where no application is open */
export const NSS_AVNCS_MENU_URI = 'nss-avncs';

/** The name of each NSS AVNCS application on the task bar, by the page of its URI (nss-avncs/<page>) */
const NSS_AVNCS_APPLICATION_NAMES: Readonly<Record<string, string>> = {
  logbook: 'LOGBOOK',
  'company-com': 'COMPANY COM',
  refuel: 'REFUEL',
  'a380x-systems': 'A380X SYSTEMS',
};

/** The applications that start automatically after the log-on, in the order of the task bar */
export const NSS_AVNCS_STARTUP_APPLICATIONS: readonly string[] = ['nss-avncs/company-com', 'nss-avncs/logbook'];

/** Design choice: one key per NSS AVNCS application, so that the task bar never needs to scroll */
export const NSS_AVNCS_TASK_BAR_KEYS = Object.keys(NSS_AVNCS_APPLICATION_NAMES).length;

/**
 * @param uri an OIT page URI
 * @returns the application the page belongs to (nss-avncs/<page>), or null for the menu page and the FLT OPS side
 */
export function nssAvncsApplicationOf(uri: string): string | null {
  const parts = uri.split('/');
  if (parts[0] !== NSS_AVNCS_MENU_URI || !parts[1]) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

/**
 * @param application an NSS AVNCS application (nss-avncs/<page>)
 * @returns its name on the task bar
 */
export function nssAvncsApplicationName(application: string): string {
  const page = application.substring(NSS_AVNCS_MENU_URI.length + 1);
  return NSS_AVNCS_APPLICATION_NAMES[page] ?? page.toUpperCase().replace(/-/g, ' ');
}

/**
 * The open applications of the NSS AVNCS side, in the order they were opened, as the task bar at the bottom shows them
 * with the active one highlighted: displaying a page of an application opens it, CLOSE closes the active one, and the
 * applications close at the log-off.
 * @returns the open applications
 */
export function createNssAvncsOpenApplications(): FltOpsOpenApplications {
  return new FltOpsOpenApplications(NSS_AVNCS_TASK_BAR_KEYS, nssAvncsApplicationOf);
}

/** The applications that navigate between their own pages themselves, so the container keeps their page drawn */
const SELF_NAVIGATING_APPLICATIONS = ['nss-avncs/company-com', 'nss-avncs/a380x-systems', 'nss-avncs/logbook'];

/**
 * @param uri the page being displayed
 * @param renderedUri the page the container has drawn
 * @returns whether the page belongs to an application whose page is already drawn, which then changes its own pages
 */
export function isPageOfRenderedApplication(uri: string, renderedUri: string | undefined): boolean {
  return (
    renderedUri !== undefined &&
    SELF_NAVIGATING_APPLICATIONS.some(
      (application) => uri.startsWith(`${application}/`) && renderedUri.startsWith(application),
    )
  );
}
