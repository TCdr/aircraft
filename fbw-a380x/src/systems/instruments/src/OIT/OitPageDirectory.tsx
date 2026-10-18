//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';
import { OitFltOpsEfbOverlay } from './Pages/FltOps/OitFltOpsEfbOverlay';
import { OitFltOpsMenuPage } from './Pages/FltOps/OitFltOpsMenuPage';
import { OitFltOpsTakeoffPerf } from './Pages/FltOps/Performance/OitFltOpsTakeoffPerf';
import { OitFltOpsLandingPerf } from './Pages/FltOps/Performance/OitFltOpsLandingPerf';
import { OitFltOpsLoadsheet } from './Pages/FltOps/Performance/OitFltOpsLoadsheet';
import { OitFltOpsStatus } from './Pages/FltOps/OitFltOpsStatus';
import { OitNotFound } from './Pages/OitNotFound';
import { OitUiService } from './OitUiService';
import { OitFltOpsContainer } from './OitFltOpsContainer';
import { OitAvncsContainer } from './OitAvncsContainer';
import { OitAvncsCompanyCom } from './Pages/NssAvncs/CompanyCom/OitAvncsCompanyCom';
import { OitAvncsMenu } from './Pages/NssAvncs/OitAvncsMenu';
import { OitAvncsCompanyComFlightLog } from './Pages/NssAvncs/CompanyCom/OitAvncsCompanyComFlightLog';
import { OitAvncsCompanyComInbox } from './Pages/NssAvncs/CompanyCom/OitAvncsCompanyComInbox';
import { OitAvncsCompanyComWeatherRequest } from './Pages/NssAvncs/CompanyCom/OitAvncsCompanyComWeatherRequest';
import { OitAvncsCompanyComFreeText } from './Pages/NssAvncs/CompanyCom/OitAvncsCompanyComFreeText';
import { OitAvncsCompanyComDownlinkFolder } from './Pages/NssAvncs/CompanyCom/OitAvncsCompanyComDownlinkFolder';
import { OitAvncsCompanyComReportForm } from './Pages/NssAvncs/CompanyCom/OitAvncsCompanyComReportForm';
import { OitAvncsRefuel } from './Pages/NssAvncs/Refuel/OitAvncsRefuel';
import { OitAvncsFbwSystems } from './Pages/NssAvncs/FbwSystems/OitAvncsFbwSystems';
import { OitAvncsFbwSystemsGenericDebug } from './Pages/NssAvncs/FbwSystems/OitAvncsFbwSystemsGenericDebug';
import { OitAvncsFbwSystemsAppLdgCap } from './Pages/NssAvncs/FbwSystems/OitAvncsFbwSystemsAppLdgCap';
import { OitAvncsLogbook } from './Pages/NssAvncs/Logbook/OitAvncsLogbook';
import { OitAvncsLogbookStatus } from './Pages/NssAvncs/Logbook/OitAvncsLogbookStatus';
import { OitAvncsLogbookRelease } from './Pages/NssAvncs/Logbook/OitAvncsLogbookRelease';
import { OitAvncsLogbookEntry } from './Pages/NssAvncs/Logbook/OitAvncsLogbookEntry';
import { OitAvncsLogbookAssistant } from './Pages/NssAvncs/Logbook/OitAvncsLogbookAssistant';
import { OitAvncsLogbookCockpitInterface } from './Pages/NssAvncs/Logbook/OitAvncsLogbookCockpitInterface';
import { OitAvncsLogbookHistory } from './Pages/NssAvncs/Logbook/OitAvncsLogbookHistory';
import { OitAvncsLogbookFlightData } from './Pages/NssAvncs/Logbook/OitAvncsLogbookFlightData';
import { OitAvncsLogbookOpenItems } from './Pages/NssAvncs/Logbook/OitAvncsLogbookOpenItems';
import { OitAvncsLogbookDeferredItems } from './Pages/NssAvncs/Logbook/OitAvncsLogbookDeferredItems';
import { OitAvncsLogbookTemporaryItems } from './Pages/NssAvncs/Logbook/OitAvncsLogbookTemporaryItems';
import { OitAvncsLogbookCabinOpenItems } from './Pages/NssAvncs/Logbook/OitAvncsLogbookCabinOpenItems';
import {
  OitAvncsLogbookAcceptanceReport,
  OitAvncsLogbookClosureReport,
} from './Pages/NssAvncs/Logbook/OitAvncsLogbookReports';

// Page imports
// eslint-disable-next-line jsdoc/require-jsdoc
export function fltOpsPageForUrl(
  url: string,
  bus: EventBus,
  uiService: OitUiService,
  container: OitFltOpsContainer,
): VNode {
  switch (url) {
    case 'flt-ops':
      return <OitFltOpsMenuPage bus={bus} uiService={uiService} container={container} />;
    case 'flt-ops/sts':
      return <OitFltOpsStatus bus={bus} uiService={uiService} container={container} />;
    case 'flt-ops/to-perf':
      return <OitFltOpsTakeoffPerf bus={bus} uiService={uiService} container={container} />;
    case 'flt-ops/loadsheet':
      return <OitFltOpsLoadsheet bus={bus} uiService={uiService} container={container} />;
    case 'flt-ops/ldg-perf':
      return <OitFltOpsLandingPerf bus={bus} uiService={uiService} container={container} />;
    case 'flt-ops/charts':
      return <OitFltOpsEfbOverlay bus={bus} uiService={uiService} container={container} />;
    case 'flt-ops/flt-folder':
      return <OitFltOpsEfbOverlay bus={bus} uiService={uiService} container={container} />;

    default:
      return <OitNotFound uiService={uiService} />;
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
export function avncsPageForUrl(
  url: string,
  bus: EventBus,
  uiService: OitUiService,
  container: OitAvncsContainer,
): VNode {
  switch (url) {
    case 'nss-avncs':
      return <OitAvncsMenu bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/company-com':
      return <OitAvncsCompanyCom bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/a380x-systems':
      return <OitAvncsFbwSystems bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/refuel':
      return <OitAvncsRefuel bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook':
      return <OitAvncsLogbook bus={bus} uiService={uiService} container={container} />;

    default:
      return <OitNotFound uiService={uiService} />;
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
export function avncsCompanyComPageForUrl(
  url: string,
  bus: EventBus,
  uiService: OitUiService,
  container: OitAvncsContainer,
): VNode {
  switch (url) {
    case 'nss-avncs/company-com/inbox':
      return <OitAvncsCompanyComInbox bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/company-com/outbox':
      return <OitAvncsCompanyComDownlinkFolder bus={bus} uiService={uiService} container={container} folder="outbox" />;
    case 'nss-avncs/company-com/sent':
      return <OitAvncsCompanyComDownlinkFolder bus={bus} uiService={uiService} container={container} folder="sent" />;
    case 'nss-avncs/company-com/pre-flight/flight-log':
      return <OitAvncsCompanyComFlightLog bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/company-com/in-flight/flight-log':
      return <OitAvncsCompanyComFlightLog bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/company-com/post-flight/flight-log':
      return <OitAvncsCompanyComFlightLog bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/company-com/pre-flight/weather':
    case 'nss-avncs/company-com/in-flight/weather':
      return <OitAvncsCompanyComWeatherRequest bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/company-com/pre-flight/free-text':
    case 'nss-avncs/company-com/in-flight/free-text':
    case 'nss-avncs/company-com/post-flight/free-text':
      return <OitAvncsCompanyComFreeText bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/company-com/pre-flight/init-data':
    case 'nss-avncs/company-com/pre-flight/fuel-figures':
    case 'nss-avncs/company-com/pre-flight/refuelling':
    case 'nss-avncs/company-com/pre-flight/loadsheet-acceptance':
    case 'nss-avncs/company-com/pre-flight/departure-delay':
    case 'nss-avncs/company-com/pre-flight/take-off-delay':
    case 'nss-avncs/company-com/pre-flight/delay-code':
    case 'nss-avncs/company-com/pre-flight/asr-notification':
    case 'nss-avncs/company-com/in-flight/ramp-service':
    case 'nss-avncs/company-com/in-flight/diversion':
    case 'nss-avncs/company-com/in-flight/eta':
    case 'nss-avncs/company-com/post-flight/asr-notification':
    case 'nss-avncs/company-com/post-flight/flight-summary':
    case 'nss-avncs/company-com/post-flight/gate-delay':
      return <OitAvncsCompanyComReportForm bus={bus} uiService={uiService} container={container} url={url} />;

    default:
      return <OitNotFound uiService={uiService} />;
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
export function avncsFbwSystemsPageForUrl(
  url: string,
  bus: EventBus,
  uiService: OitUiService,
  container: OitAvncsContainer,
): VNode {
  switch (url) {
    case 'nss-avncs/a380x-systems':
      return <OitAvncsFbwSystems bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/a380x-systems/debug-data':
      return (
        <OitAvncsFbwSystemsGenericDebug
          bus={bus}
          uiService={uiService}
          container={container}
          title={'Flight Warning System Debug'}
          controlEventName="a380x_ois_fws_debug_data_enabled"
          dataEventName="a380x_ois_fws_debug_data"
        />
      );
    case 'nss-avncs/a380x-systems/app-ldg-cap':
      return (
        <OitAvncsFbwSystemsAppLdgCap
          bus={bus}
          uiService={uiService}
          container={container}
          title={'Approach & Landing Capability'}
        />
      );

    default:
      return <OitNotFound uiService={uiService} />;
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
export function avncsLogbookPageForUrl(
  url: string,
  bus: EventBus,
  uiService: OitUiService,
  container: OitAvncsContainer,
): VNode {
  switch (url) {
    case 'nss-avncs/logbook/status':
      return <OitAvncsLogbookStatus bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/release':
      return <OitAvncsLogbookRelease bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/entry':
      return <OitAvncsLogbookEntry bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/entry/ecam-alerts':
      return <OitAvncsLogbookAssistant bus={bus} uiService={uiService} container={container} kind="ecam-alerts" />;
    case 'nss-avncs/logbook/entry/cabin-items':
      return <OitAvncsLogbookAssistant bus={bus} uiService={uiService} container={container} kind="cabin-items" />;
    case 'nss-avncs/logbook/entry/system-function':
      return <OitAvncsLogbookAssistant bus={bus} uiService={uiService} container={container} kind="system-function" />;
    case 'nss-avncs/logbook/entry/keyword':
      return <OitAvncsLogbookAssistant bus={bus} uiService={uiService} container={container} kind="keyword" />;
    case 'nss-avncs/logbook/entry/free-text':
      return <OitAvncsLogbookAssistant bus={bus} uiService={uiService} container={container} kind="free-text" />;
    case 'nss-avncs/logbook/entry/cockpit-interface':
      return <OitAvncsLogbookCockpitInterface bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/history':
      return <OitAvncsLogbookHistory bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/flight-data':
      return <OitAvncsLogbookFlightData bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/open-items':
      return <OitAvncsLogbookOpenItems bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/deferred-items':
      return <OitAvncsLogbookDeferredItems bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/temporary-items':
      return <OitAvncsLogbookTemporaryItems bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/cabin-open-items':
      return <OitAvncsLogbookCabinOpenItems bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/acceptance-report':
      return <OitAvncsLogbookAcceptanceReport bus={bus} uiService={uiService} container={container} />;
    case 'nss-avncs/logbook/closure-report':
      return <OitAvncsLogbookClosureReport bus={bus} uiService={uiService} container={container} />;

    default:
      return <OitNotFound uiService={uiService} />;
  }
}
