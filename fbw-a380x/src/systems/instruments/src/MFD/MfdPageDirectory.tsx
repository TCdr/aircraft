import { EventBus, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

// Page imports
import { MfdFmsDataStatus } from './pages/FMS/DATA/MfdFmsDataStatus';
import { MfdFmsFplnAirways } from './pages/FMS/F-PLN/MfdFmsFplnAirways';
import { MfdFmsFplnArr } from './pages/FMS/F-PLN/MfdFmsFplnArr';
import { MfdFmsFplnDep } from './pages/FMS/F-PLN/MfdFmsFplnDep';
import { MfdFmsFplnDirectTo } from './pages/FMS/F-PLN/MfdFmsFplnDirectTo';
import { MfdFmsFpln } from './pages/FMS/F-PLN/MfdFmsFpln';
import { MfdFmsFplnHold } from './pages/FMS/F-PLN/MfdFmsFplnHold';
import { MfdFmsFplnVertRev } from './pages/FMS/F-PLN/MfdFmsFplnVertRev';
import { MfdFmsFuelLoad } from './pages/FMS/MfdFmsFuelLoad';
import { MfdFmsInit } from './pages/FMS/MfdFmsInit';
import { MfdFmsWind } from './pages/FMS/MfdFmsWind';
import { MfdNotFound } from './pages/FMS/MfdNotFound';
import { MfdFmsPerf } from './pages/FMS/MfdFmsPerf';
import { MfdFmsPositionIrs } from './pages/FMS/POSITION/MfdFmsPositionIrs';
import { MfdFmsPositionNavaids } from './pages/FMS/POSITION/MfdFmsPositionNavaids';
import { MfdFmsPositionGps } from './pages/FMS/POSITION/MfdFmsPositionGps';
import { MfdFmsPositionReport } from './pages/FMS/POSITION/MfdFmsPositionReport';
import { MfdFmsPositionTime } from './pages/FMS/POSITION/MfdFmsPositionTime';
import { MfdAtccomConnect } from './pages/ATCCOM/MfdAtccomConnect';
import { MfdAtccomMsgRecord } from './pages/ATCCOM/MfdAtccomMsgRecord';
import { MfdAtccomMsgRecordAll } from './pages/ATCCOM/MfdAtccomMsgRecordAll';
import { MfdAtccomMsgRecordMonitored } from './pages/ATCCOM/MfdAtccomMsgRecordMonitored';
import { MfdAtccomMsgRecordExpand } from './pages/ATCCOM/MfdAtccomMsgRecordExpand';
import { MfdAtccomDAtis } from './pages/ATCCOM/MfdAtccomDAtis';
import { MfdAtccomDAtisReceived } from './pages/ATCCOM/MfdAtccomDAtisReceived';

// Header imports
import { AtccomHeader } from './pages/common/AtccomHeader';
import { FcuBkupHeader } from './pages/common/FcuBkupHeader';
import { FmsHeader } from './pages/common/FmsHeader';
import { SurvHeader } from './pages/common/SurvHeader';
import { FmcServiceInterface } from './FMC/FmcServiceInterface';
import { FmsDisplayInterface } from '@fmgc/flightplanning/interface/FmsDisplayInterface';
import { MfdDisplayInterface } from './MFD';
import { MfdUiService } from './pages/common/MfdUiService';
import { MfdSurvControls } from './pages/SURV/MfdSurvControls';
import { MfdFmsFplnFixInfo } from './pages/FMS/F-PLN/MfdFmsFplnFixInfo';
import { MfdFmsPositionMonitor } from './pages/FMS/POSITION/MfdFmsPositionMonitor';
import { MfdSurvStatusSwitching } from './pages/SURV/MfdSurvStatusSwitching';
import { MfdFmsDataAirport } from './pages/FMS/DATA/MfdFmsDataAirport';
import { MfdFmsDataWaypoint } from './pages/FMS/DATA/MfdFmsDataWaypoint';
import { MfdFmsDataNavaid } from './pages/FMS/DATA/MfdFmsDataNavaid';
import { MfdFmsDataRoute } from './pages/FMS/DATA/MfdFmsDataRoute';
import { MfdFmsFplnRouteSelection } from './pages/FMS/F-PLN/MfdFmsFplnRouteSelection';
import { MfdFmsFplnCpnyFplnReq } from './pages/FMS/F-PLN/MfdFmsFplnCpnyFplnReq';
import { MfdFmsFplnClosestAirports } from './pages/FMS/F-PLN/MfdFmsFplnClosestAirports';
import { MfdFmsFplnAlternate } from './pages/FMS/F-PLN/MfdFmsFplnAlternate';
import { MfdFmsFplnEquiTimePoint } from './pages/FMS/F-PLN/MfdFmsFplnEquiTimePoint';
import { MfdFmsFplnOffset } from './pages/FMS/F-PLN/MfdFmsFplnOffset';
import { MfdFmsDataPrinter } from './pages/FMS/DATA/MfdFmsDataPrinter';
import { cpnyToRequestPage, MfdFmsCpnyToRequest } from './pages/FMS/MfdFmsCpnyToRequest';
import { MfdFmsReceivedCpnyToData } from './pages/FMS/MfdFmsReceivedCpnyToData';
import { cpnyFplnReportPage, MfdFmsFreeTextSend, transferToMailboxPage } from './pages/FMS/MfdFmsFreeTextSend';
import { MfdFmsSecRejectedAtcInfo, rejectedAtcInfoPage } from './pages/FMS/SEC/MfdFmsSecRejectedAtcInfo';
import { MfdFmsFplnLlXingTimeMkr } from './pages/FMS/F-PLN/MfdFmsFplnLlXingTimeMkr';
import { MfdFmsCpnyWindRequest } from './pages/FMS/MfdFmsCpnyWindRequest';
import { cpnyWindRequestPage } from './shared/CpnyWindButtonUtils';
import { AtcDatalinkSystem } from './ATCCOM/AtcDatalinkSystem';
import {
  activeFlightPlanFuelAndLoadUri,
  fuelAndLoadPage,
  activeFlightPlanPageUri,
  flightPlanUriPage,
  activeFlightPlanHoldUri,
  lateralRevisionHoldPage,
  dataStatusUri,
  performancePage,
  initPage,
  windPage,
  routeSelectionPage,
  cpnyFplnRequestPage,
  fixInfoUri,
  dirToUri,
  secIndexPageUri,
} from './shared/utils';
import { MfdFmsSecIndex } from './pages/FMS/SEC/MfdFmsSecIndex';

export function pageForUrl(
  url: string,
  bus: EventBus,
  mfd: FmsDisplayInterface & MfdDisplayInterface,
  fmcService: FmcServiceInterface,
  atcService: AtcDatalinkSystem,
): VNode {
  switch (url) {
    case 'fms/active/' + performancePage:
    case 'fms/sec1/' + performancePage:
    case 'fms/sec2/' + performancePage:
    case 'fms/sec3/' + performancePage:
      return (
        <MfdFmsPerf
          pageTitle="PERF"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/' + initPage:
    case 'fms/sec1/' + initPage:
    case 'fms/sec2/' + initPage:
    case 'fms/sec3/' + initPage:
      return (
        <MfdFmsInit
          pageTitle="INIT"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/' + windPage:
    case 'fms/sec1/' + windPage:
    case 'fms/sec2/' + windPage:
    case 'fms/sec3/' + windPage:
      return (
        <MfdFmsWind
          pageTitle="WIND"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case activeFlightPlanFuelAndLoadUri:
    case 'fms/sec1/' + fuelAndLoadPage:
    case 'fms/sec2/' + fuelAndLoadPage:
    case 'fms/sec3/' + fuelAndLoadPage:
      return (
        <MfdFmsFuelLoad
          pageTitle="FUEL&LOAD"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case activeFlightPlanPageUri:
    case 'fms/sec1/' + flightPlanUriPage:
    case 'fms/sec2/' + flightPlanUriPage:
    case 'fms/sec3/' + flightPlanUriPage:
      return (
        <MfdFmsFpln
          pageTitle="F-PLN"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-airways':
    case 'fms/sec1/f-pln-airways':
    case 'fms/sec2/f-pln-airways':
    case 'fms/sec3/f-pln-airways':
      return (
        <MfdFmsFplnAirways
          pageTitle="F-PLN/AIRWAYS"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-departure':
    case 'fms/sec1/f-pln-departure':
    case 'fms/sec2/f-pln-departure':
    case 'fms/sec3/f-pln-departure':
      return (
        <MfdFmsFplnDep
          pageTitle="F-PLN/DEPARTURE"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-arrival':
    case 'fms/sec1/f-pln-arrival':
    case 'fms/sec2/f-pln-arrival':
    case 'fms/sec3/f-pln-arrival':
      return (
        <MfdFmsFplnArr
          pageTitle="F-PLN/ARRIVAL"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case dirToUri:
      return (
        <MfdFmsFplnDirectTo
          pageTitle="F-PLN/DIRECT-TO"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-vert-rev':
    case 'fms/sec1/f-pln-vert-rev':
    case 'fms/sec2/f-pln-vert-rev':
    case 'fms/sec3/f-pln-vert-rev':
      return (
        <MfdFmsFplnVertRev
          pageTitle="F-PLN/VERT REV"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case activeFlightPlanHoldUri:
    case 'fms/sec1/' + lateralRevisionHoldPage:
    case 'fms/sec2/' + lateralRevisionHoldPage:
    case 'fms/sec3/' + lateralRevisionHoldPage:
      return (
        <MfdFmsFplnHold
          pageTitle="F-PLN/HOLD"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case fixInfoUri:
      return (
        <MfdFmsFplnFixInfo
          pageTitle="F-PLN/FIX INFO"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case secIndexPageUri:
      return (
        <MfdFmsSecIndex
          pageTitle="INDEX"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/position/monitor':
      return (
        <MfdFmsPositionMonitor
          pageTitle="MONITOR"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/position/irs':
      return (
        <MfdFmsPositionIrs
          pageTitle="IRS"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/position/navaids':
      return (
        <MfdFmsPositionNavaids
          pageTitle="NAVAIDS"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/position/gps':
      return (
        <MfdFmsPositionGps
          pageTitle="GPS"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/position/report':
      return (
        <MfdFmsPositionReport
          pageTitle="REPORT"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/position/time':
      return (
        <MfdFmsPositionTime
          pageTitle="TIME"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case dataStatusUri:
      return (
        <MfdFmsDataStatus
          pageTitle="STATUS"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/data/airport':
      return (
        <MfdFmsDataAirport
          pageTitle="AIRPORT"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/data/waypoint':
      return (
        <MfdFmsDataWaypoint
          pageTitle="WAYPOINT"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/data/navaid':
      return (
        <MfdFmsDataNavaid
          pageTitle="NAVAID"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/data/route':
      return (
        <MfdFmsDataRoute
          pageTitle="ROUTE"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/' + routeSelectionPage:
    case 'fms/sec1/' + routeSelectionPage:
    case 'fms/sec2/' + routeSelectionPage:
    case 'fms/sec3/' + routeSelectionPage:
      return (
        <MfdFmsFplnRouteSelection
          pageTitle="ROUTE SELECTION"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/' + cpnyWindRequestPage:
    case 'fms/sec1/' + cpnyWindRequestPage:
    case 'fms/sec2/' + cpnyWindRequestPage:
    case 'fms/sec3/' + cpnyWindRequestPage:
      return (
        <MfdFmsCpnyWindRequest
          pageTitle="COMPANY WIND DATA REQUEST"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-ll-xing-time-mkr':
    case 'fms/sec1/f-pln-ll-xing-time-mkr':
    case 'fms/sec2/f-pln-ll-xing-time-mkr':
    case 'fms/sec3/f-pln-ll-xing-time-mkr':
      return (
        <MfdFmsFplnLlXingTimeMkr
          pageTitle="F-PLN/LL XING-TIME MKR"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/' + cpnyToRequestPage:
      return (
        <MfdFmsCpnyToRequest
          pageTitle="COMPANY T.O DATA REQUEST"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/received-cpny-to-data':
      return (
        <MfdFmsReceivedCpnyToData
          pageTitle="RECEIVED COMPANY T.O DATA"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/' + cpnyFplnReportPage:
      return (
        <MfdFmsFreeTextSend
          pageTitle="COMPANY F-PLN REPORT"
          title="COMPANY F-PLN REPORT"
          sendLabel="SEND REPORT<br />TO CPNY *"
          returnUri={() => 'fms/active/f-pln'}
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/sec1/' + transferToMailboxPage:
    case 'fms/sec2/' + transferToMailboxPage:
    case 'fms/sec3/' + transferToMailboxPage:
      return (
        <MfdFmsFreeTextSend
          pageTitle="TRANSFER TO MAILBOX"
          title="TRANSFER TO MAILBOX"
          sendLabel="XFER<br />TO MAILBOX *"
          returnUri={() => `${secIndexPageUri}/${mfd.uiService.activeUri.get().category.substring(3)}`}
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/sec3/' + rejectedAtcInfoPage:
      return (
        <MfdFmsSecRejectedAtcInfo
          pageTitle="REJECTED ATC INFO"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/data/printer':
      return (
        <MfdFmsDataPrinter
          pageTitle="PRINTER"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-offset':
    case 'fms/sec1/f-pln-offset':
    case 'fms/sec2/f-pln-offset':
    case 'fms/sec3/f-pln-offset':
      return (
        <MfdFmsFplnOffset
          pageTitle="F-PLN/OFFSET"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-equi-time-point':
      return (
        <MfdFmsFplnEquiTimePoint
          pageTitle="F-PLN/EQUI-TIME POINT"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-alternate':
    case 'fms/sec1/f-pln-alternate':
    case 'fms/sec2/f-pln-alternate':
    case 'fms/sec3/f-pln-alternate':
      return (
        <MfdFmsFplnAlternate
          pageTitle="F-PLN/ALTERNATE"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/f-pln-closest-airports':
      return (
        <MfdFmsFplnClosestAirports
          pageTitle="F-PLN/CLOSEST AIRPORTS"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'fms/active/' + cpnyFplnRequestPage:
    case 'fms/sec1/' + cpnyFplnRequestPage:
    case 'fms/sec2/' + cpnyFplnRequestPage:
    case 'fms/sec3/' + cpnyFplnRequestPage:
      return (
        <MfdFmsFplnCpnyFplnReq
          pageTitle="COMPANY F-PLN REQUEST"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'surv/controls':
      return (
        <MfdSurvControls
          pageTitle="CONTROLS"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'surv/status-switching':
      return (
        <MfdSurvStatusSwitching
          pageTitle="STATUS & SWITCHING"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'atccom/connect':
      return (
        <MfdAtccomConnect
          pageTitle=""
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'atccom/msg-record':
      return (
        <MfdAtccomMsgRecord
          pageTitle="MSG RECORD"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'atccom/msg-record/all-msg':
      return (
        <MfdAtccomMsgRecordAll
          pageTitle="MSG RECORD/ALL MSG"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'atccom/msg-record/monitored-msg':
      return (
        <MfdAtccomMsgRecordMonitored
          pageTitle="MSG RECORD/MONITORED MSG"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'atccom/msg-record/all-msg-expand':
      return (
        <MfdAtccomMsgRecordExpand
          pageTitle="MSG RECORD/ALL MSG/EXPAND"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
    case 'atccom/d-atis/list':
      return <MfdAtccomDAtis pageTitle="D-ATIS/LIST" bus={bus} mfd={mfd} atcService={atcService} />;
    case 'atccom/d-atis/received':
      return <MfdAtccomDAtisReceived pageTitle="D-ATIS/RECEIVED" bus={bus} mfd={mfd} atcService={atcService} />;

    default:
      return (
        <MfdNotFound
          pageTitle="NOT FOUND"
          bus={bus}
          mfd={mfd}
          fmcService={fmcService}
          flightPlanInterface={fmcService.master.flightPlanInterface}
        />
      );
  }
}

export function headerForSystem(
  sys: string,
  mfd: FmsDisplayInterface & MfdDisplayInterface,
  atcCallsign: Subscribable<string | null>,
  activeFmsSource: Subscribable<'FMS 1' | 'FMS 2' | 'FMS 1-C' | 'FMS 2-C'>,
  uiService: MfdUiService,
): VNode {
  switch (sys) {
    case 'fms':
      return <FmsHeader callsign={atcCallsign} activeFmsSource={activeFmsSource} uiService={uiService} mfd={mfd} />;
    case 'atccom':
      return <AtccomHeader callsign={atcCallsign} activeFmsSource={activeFmsSource} uiService={uiService} mfd={mfd} />;
    case 'surv':
      return <SurvHeader callsign={atcCallsign} activeFmsSource={activeFmsSource} uiService={uiService} mfd={mfd} />;
    case 'fcubkup':
      return <FcuBkupHeader callsign={atcCallsign} activeFmsSource={activeFmsSource} uiService={uiService} mfd={mfd} />;
    default:
      return <FmsHeader callsign={atcCallsign} activeFmsSource={activeFmsSource} uiService={uiService} mfd={mfd} />;
  }
}
