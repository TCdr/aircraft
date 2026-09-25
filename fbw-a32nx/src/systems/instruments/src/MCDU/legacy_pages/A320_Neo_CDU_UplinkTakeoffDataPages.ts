// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CompanyTakeoffDataUplink, MagVar, RunwayUtils } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { NXSystemMessages } from '../messages/NXSystemMessages';
import { UplinkTakeoffDataRequestContent } from '../legacy/UplinkTakeoffData';
import { CDUPerformancePage } from './A320_Neo_CDU_PerformancePage';

/** A320 FCOM DSC-22_20-50-10-28: the CONTAM list of the UPLINK TO DATA REQ page */
export const UPLINK_CONTAMINATIONS = ['DRY', 'WET', '1/4 WATER', '1/2 WATER', '1/4 SLUSH', '1/2 SLUSH', 'COMP SNOW'];

const FEET_PER_METRE = 3.28084;

/** A320 FCOM P 93: the uplinked data cannot be inserted with a TOW 3 t above or 1 t below the FMS one */
const TOW_MARGIN_ABOVE = 3_000;
const TOW_MARGIN_BELOW = 1_000;

/** The request of one runway of the UPLINK TO DATA REQ page */
interface RunwayRequest {
  runway: string | null;
  /** metres */
  shift: number | null;
  /** metres */
  toLimit: number | null;
  flaps: number | null;
  /** degrees, positive UP */
  ths: number | null;
  flex: number | null;
  contamination: number;
}

/** The request of the two pages; QNH and wind are common (FCOM P 91) */
interface RequestForm {
  runways: [RunwayRequest, RunwayRequest];
  qnh: number | null;
  windDirection: number | null;
  windSpeed: number | null;
}

const emptyRunway = (): RunwayRequest => ({
  runway: null,
  shift: null,
  toLimit: null,
  flaps: null,
  ths: null,
  flex: null,
  contamination: 0,
});

const green = (s: string) => `{green}${s}{end}`;
const cyan = (s: string) => `{cyan}${s}{end}`;
const amber = (s: string) => `{amber}${s}{end}`;

function formatThs(ths: number): string {
  return `${ths < 0 ? 'DN' : 'UP'}${Math.abs(ths).toFixed(1)}`;
}

function formatTemperature(t: number): string {
  return `${t >= 0 ? '+' : '-'}${Math.abs(Math.round(t)).toFixed(0)}°`;
}

/**
 * The takeoff data uplink pages of the MCDU (A320 FCOM DSC-22_20-50-10-28 UPLINK TO DATA REQ, UPLINK MAX TO DATA and
 * UPLINK FLX TO DATA pages, DSC-22_45 TAKEOFF DATA FUNCTION), reached from the PERF TAKE OFF page in the PREFLIGHT and
 * DONE phases.
 */
export class CDUUplinkTakeoffDataPages {
  private static form: RequestForm | null = null;

  /** The pages refresh every 50 MCDU updates, like the PERF pages */
  private static timer = 0;

  private static refreshEvery50Updates(mcdu: LegacyFmsPageInterface, pageId: number, refresh: () => void): void {
    CDUUplinkTakeoffDataPages.timer = 0;
    mcdu.pageUpdate = () => {
      CDUUplinkTakeoffDataPages.timer++;
      if (CDUUplinkTakeoffDataPages.timer >= 50 && mcdu.page.Current === pageId) {
        refresh();
      }
    };
  }

  /** The request form, with its defaults (FCOM P 90-91) */
  private static getForm(mcdu: LegacyFmsPageInterface): RequestForm {
    const plan = mcdu.getFlightPlan(FlightPlanIndex.Active);
    if (CDUUplinkTakeoffDataPages.form === null) {
      const lat = SimVar.GetSimVarValue('PLANE LATITUDE', 'degree latitude');
      const long = SimVar.GetSimVarValue('PLANE LONGITUDE', 'degree longitude');
      const magVar = MagVar.get(lat, long) ?? 0;
      CDUUplinkTakeoffDataPages.form = {
        runways: [emptyRunway(), emptyRunway()],
        // BARO: the FCU selection; WIND: the wind at the origin
        qnh: Math.round(SimVar.GetSimVarValue('KOHLSMAN SETTING MB:1', 'millibars')),
        windDirection: Math.round((SimVar.GetSimVarValue('AMBIENT WIND DIRECTION', 'degrees') - magVar + 360) % 360),
        windSpeed: Math.round(SimVar.GetSimVarValue('AMBIENT WIND VELOCITY', 'knots')),
      };
    }
    const form = CDUUplinkTakeoffDataPages.form;
    const first = form.runways[0];
    // Page 1: the F-PLN departure runway with the PERF TAKE OFF values, as long as the pilot did not modify them
    if (first.runway === null && plan.originRunway) {
      first.runway = RunwayUtils.runwayString(plan.originRunway.ident);
      CDUUplinkTakeoffDataPages.setPerfDefaults(mcdu, first);
    }
    return form;
  }

  private static setPerfDefaults(mcdu: LegacyFmsPageInterface, rwy: RunwayRequest): void {
    const pd = mcdu.getFlightPlan(FlightPlanIndex.Active).performanceData;
    rwy.shift = pd.takeoffShift.get();
    rwy.flaps = pd.takeoffFlaps.get();
    rwy.ths = pd.trimmableHorizontalStabilizer.get();
    const flex = pd.flexTakeoffTemperature.get();
    rwy.flex = flex !== null ? Math.round(flex) : null;
  }

  /** The request content, also the answer to the takeoff data import requests of the flypad */
  public static requestContent(mcdu: LegacyFmsPageInterface): UplinkTakeoffDataRequestContent {
    const plan = mcdu.getFlightPlan(FlightPlanIndex.Active);
    const form = CDUUplinkTakeoffDataPages.getForm(mcdu);
    const tow = mcdu.computeTakeoffWeight(FlightPlanIndex.Active).takeoffWeight;
    return {
      departure: plan.originAirport?.ident ?? null,
      tow: tow !== null && tow !== undefined ? tow * 1000 : null,
      cg: plan.performanceData.zeroFuelWeight.get() !== null ? Math.round(mcdu.getCG() * 10) / 10 : null,
      oat: Math.round(SimVar.GetSimVarValue('AMBIENT TEMPERATURE', 'celsius')),
      runways: form.runways
        .filter((r) => r.runway !== null)
        .map((r) => ({
          runway: r.runway,
          windDirection: form.windDirection,
          windSpeed: form.windSpeed,
          qnh: form.qnh,
          runwayCondition: r.contamination,
          thrust: r.flex !== null ? ('FLEX' as const) : null,
          flaps: r.flaps,
          shift: r.shift,
          toLimit: r.toLimit,
        })),
    };
  }

  /** UPLINK TO DATA REQ page, for runway 1 or 2 */
  public static ShowRequestPage(mcdu: LegacyFmsPageInterface, index: 0 | 1 = 0): void {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.UplinkToDataReq;
    const form = CDUUplinkTakeoffDataPages.getForm(mcdu);
    const rwy = form.runways[index];
    const defined = rwy.runway !== null;
    const refresh = () => CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu, index);
    const data = mcdu.uplinkTakeoffData;

    // TOW/TOCG and TEMP follow the FMS, the prompt the request state
    CDUUplinkTakeoffDataPages.refreshEvery50Updates(mcdu, mcdu.page.UplinkToDataReq, refresh);
    mcdu.pageRedrawCallback = refresh;

    // [1L] TOW/TOCG (green, INIT B / FUEL PRED), [2L] TEMP (SAT)/QNH
    const request = CDUUplinkTakeoffDataPages.requestContent(mcdu);
    const towCell = defined
      ? green(
          `${request.tow !== null ? (request.tow / 1000).toFixed(1) : '---.-'}/${request.cg !== null ? request.cg.toFixed(1) : '--.-'}`,
        )
      : '---.-/--.-';
    const tempQnhCell = defined
      ? `${green(formatTemperature(request.oat ?? 0))}/${cyan(form.qnh !== null ? form.qnh.toFixed(0) : '[  ]')}`
      : '---°/----';
    const windCell = defined
      ? cyan(
          form.windDirection !== null && form.windSpeed !== null
            ? `${form.windDirection.toFixed(0).padStart(3, '0')}°/${form.windSpeed.toFixed(0).padStart(3, '0')}`
            : '[ ]°/[ ]',
        )
      : '---°/---';
    const contamCell = defined ? cyan(UPLINK_CONTAMINATIONS[rwy.contamination]) : '---------';
    const shiftRwyCell = cyan(
      `{small}[M]{end}${rwy.shift !== null ? rwy.shift.toFixed(0) : '[  ]'}/${rwy.runway ?? '[  ]'}`,
    );
    const toLimitCell = defined
      ? cyan(`{small}FT{end}${rwy.toLimit !== null ? (rwy.toLimit * FEET_PER_METRE).toFixed(0) : '[    ]'}`)
      : '------';
    const flapsThsCell = defined
      ? cyan(`${rwy.flaps ?? '[ ]'}/${rwy.ths !== null ? formatThs(rwy.ths) : '[   ]'}`)
      : '--/-----';
    const flexCell = defined ? cyan(`${rwy.flex !== null ? rwy.flex.toFixed(0) : '[ ]'}°`) : '---°';
    const canRequest = defined && !data.requestPending.get();

    mcdu.onRightInput[0] = (value, scratchpadCallback) => {
      // SHIFT/RWY: RWY, SHIFT/RWY, SHIFT/ or /RWY; CLR removes the second runway
      if (value === Keypad.clrValue && index === 1) {
        form.runways[1] = emptyRunway();
        refresh();
        return;
      }
      const [shiftText, runwayText] = value.includes('/') ? value.split('/') : ['', value];
      const shiftMatch = shiftText === '' || /^\d{1,4}$/.test(shiftText);
      const runwayMatch = runwayText === '' ? null : runwayText.match(/^(\d{1,2})([LRC]?)$/);
      if (!shiftMatch || (runwayText !== '' && !runwayMatch) || (shiftText === '' && runwayText === '')) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return;
      }
      if (runwayMatch) {
        if (rwy.runway === null) {
          CDUUplinkTakeoffDataPages.setPerfDefaults(mcdu, rwy);
        }
        rwy.runway = `${runwayMatch[1].padStart(2, '0')}${runwayMatch[2]}`;
      }
      if (shiftText !== '') {
        rwy.shift = parseInt(shiftText);
      }
      refresh();
    };
    if (defined) {
      mcdu.onLeftInput[1] = (value, scratchpadCallback) => {
        // BARO: QNH in hPa or inHg (FCOM: can be modified by the pilot)
        const match = value.match(/^\/?(\d{2,4}(\.\d{1,2})?)$/);
        const qnh = match ? parseFloat(match[1]) : NaN;
        const hpa = qnh < 40 ? qnh * 33.8639 : qnh;
        if (!Number.isFinite(hpa) || hpa < 745 || hpa > 1100) {
          mcdu.setScratchpadMessage(match ? NXSystemMessages.entryOutOfRange : NXSystemMessages.formatError);
          scratchpadCallback();
          return;
        }
        form.qnh = Math.round(hpa);
        refresh();
      };
      mcdu.onLeftInput[2] = (value, scratchpadCallback) => {
        const match = value.match(/^(\d{1,3})\/(\d{1,3})$/);
        if (!match || parseInt(match[1]) > 360) {
          mcdu.setScratchpadMessage(NXSystemMessages.formatError);
          scratchpadCallback();
          return;
        }
        form.windDirection = parseInt(match[1]) % 360;
        form.windSpeed = parseInt(match[2]);
        refresh();
      };
      mcdu.onRightInput[1] = (value, scratchpadCallback) => {
        // TO LIMIT: a runway length in feet, or CLR
        if (value === Keypad.clrValue) {
          rwy.toLimit = null;
        } else if (/^\d{3,5}$/.test(value)) {
          rwy.toLimit = parseInt(value) / FEET_PER_METRE;
        } else {
          mcdu.setScratchpadMessage(NXSystemMessages.formatError);
          scratchpadCallback();
          return;
        }
        refresh();
      };
      mcdu.onRightInput[2] = (value, scratchpadCallback) => {
        const match = value.match(/^([123])?(\/((UP|DN)(\d{1,2}(\.\d)?)|(\d{1,2}(\.\d)?)(UP|DN)))?$/);
        if (!match || (match[1] === undefined && match[2] === undefined)) {
          mcdu.setScratchpadMessage(NXSystemMessages.formatError);
          scratchpadCallback();
          return;
        }
        if (match[1] !== undefined) {
          rwy.flaps = parseInt(match[1]);
        }
        if (match[2] !== undefined) {
          const direction = match[4] ?? match[9];
          const amount = parseFloat(match[5] ?? match[7]);
          rwy.ths = direction === 'DN' ? -amount : amount;
        }
        refresh();
      };
      mcdu.onRightInput[3] = (value, scratchpadCallback) => {
        if (value === Keypad.clrValue) {
          rwy.flex = null;
        } else if (/^F?[+-]?\d{1,2}$/.test(value)) {
          rwy.flex = parseInt(value.replace('F', ''));
        } else {
          mcdu.setScratchpadMessage(NXSystemMessages.formatError);
          scratchpadCallback();
          return;
        }
        refresh();
      };
      // [4L] CONTAM: the scroll keys change the runway contamination (FCOM P 90)
      mcdu.onUp = () => {
        rwy.contamination = (rwy.contamination + 1) % UPLINK_CONTAMINATIONS.length;
        refresh();
      };
      mcdu.onDown = () => {
        rwy.contamination = (rwy.contamination + UPLINK_CONTAMINATIONS.length - 1) % UPLINK_CONTAMINATIONS.length;
        refresh();
      };
      mcdu.setArrows(true, true, true, true);
    } else {
      mcdu.setArrows(false, false, true, true);
    }

    mcdu.onPrevPage = () => CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu, index === 0 ? 1 : 0);
    mcdu.onNextPage = mcdu.onPrevPage;

    mcdu.leftInputDelay[5] = () => mcdu.getDelaySwitchPage();
    mcdu.onLeftInput[5] = () => CDUUplinkTakeoffDataPages.ShowUplinkPage(mcdu, 0, false);
    if (canRequest) {
      mcdu.onRightInput[5] = () => {
        data.sendRequest(CDUUplinkTakeoffDataPages.requestContent(mcdu));
        refresh();
      };
    }

    mcdu.setTemplate([
      ['UPLINK TO DATA REQ', `${index + 1}`, '2'],
      ['\xa0TOW\xa0/TOCG', 'SHIFT/\xa0RWY\xa0'],
      [towCell, shiftRwyCell],
      ['\xa0TEMP/QNH', 'TO\xa0LIMIT\xa0'],
      [tempQnhCell, toLimitCell],
      ['\xa0MAG\xa0WIND', 'FLAPS/THS\xa0'],
      [windCell, flapsThsCell],
      [defined ? '\xa0CONTAM↑↓' : '\xa0CONTAM', 'FLEX\xa0TO\xa0TEMP\xa0'],
      [contamCell, flexCell],
      [''],
      [''],
      ['\xa0RECEIVED', 'TO\xa0DATA\xa0'],
      ['<TO\xa0DATA', canRequest ? amber('REQUEST*') : amber('REQUEST\xa0')],
    ]);
  }

  /**
   * UPLINK MAX TO DATA / UPLINK FLX TO DATA page of a received runway (FCOM P 92-93), with INSERT UPLINK when the runway
   * is the active runway.
   */
  public static ShowUplinkPage(mcdu: LegacyFmsPageInterface, runwayIndex: number, flex: boolean, opened = true): void {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.UplinkToData;
    const data = mcdu.uplinkTakeoffData;
    const runways = data.runways();
    const index = runways.length > 0 ? Math.min(runwayIndex, runways.length - 1) : 0;
    const uplink = runways.length > 0 ? data.find(runways[index], flex) : undefined;
    const refresh = () => CDUUplinkTakeoffDataPages.ShowUplinkPage(mcdu, index, flex, false);

    CDUUplinkTakeoffDataPages.refreshEvery50Updates(mcdu, mcdu.page.UplinkToData, refresh);
    mcdu.pageRedrawCallback = refresh;

    const plan = mcdu.getFlightPlan(FlightPlanIndex.Active);
    const activeRunway = plan.originRunway ? RunwayUtils.runwayString(plan.originRunway.ident) : null;
    const runwayMatches =
      uplink !== undefined && plan.originAirport?.ident === uplink.departure && activeRunway === uplink.runway;
    const fmsTow = mcdu.computeTakeoffWeight(FlightPlanIndex.Active).takeoffWeight;
    const towAgrees =
      uplink !== undefined &&
      fmsTow !== null &&
      fmsTow !== undefined &&
      uplink.tow <= fmsTow * 1000 + TOW_MARGIN_ABOVE &&
      uplink.tow >= fmsTow * 1000 - TOW_MARGIN_BELOW;
    const insertable =
      runwayMatches &&
      towAgrees &&
      (mcdu.flightPhaseManager.phase === FmgcFlightPhase.Preflight ||
        mcdu.flightPhaseManager.phase === FmgcFlightPhase.Done);

    const value = (text: string | null, dashes: string) => (text !== null && uplink ? green(text) : dashes);
    const towText = uplink
      ? `${(uplink.tow / 1000).toFixed(1)}/${uplink.cg !== null ? uplink.cg.toFixed(1) : '--.-'}`
      : null;
    const towCell = uplink && runwayMatches && !towAgrees ? amber(towText) : value(towText, '---.-/--.-');
    const tempText = uplink
      ? `${formatTemperature(flex ? uplink.flexTemperature ?? 0 : uplink.oat)}/${uplink.qnh.toFixed(0)}`
      : null;
    const speed = (v: number | null | undefined) => value(v !== null && v !== undefined ? v.toFixed(0) : null, '---');

    if (runways.length > 1) {
      mcdu.onPrevPage = () =>
        CDUUplinkTakeoffDataPages.ShowUplinkPage(mcdu, (index + runways.length - 1) % runways.length, flex);
      mcdu.onNextPage = () => CDUUplinkTakeoffDataPages.ShowUplinkPage(mcdu, (index + 1) % runways.length, flex);
      mcdu.setArrows(false, false, true, true);
    }
    mcdu.rightInputDelay[3] = () => mcdu.getDelaySwitchPage();
    mcdu.onRightInput[3] = () => CDUUplinkTakeoffDataPages.ShowUplinkPage(mcdu, index, !flex);
    mcdu.leftInputDelay[5] = () => mcdu.getDelaySwitchPage();
    mcdu.onLeftInput[5] = () => CDUUplinkTakeoffDataPages.ShowRequestPage(mcdu, 0);
    if (insertable) {
      mcdu.onRightInput[5] = async () => {
        if (await CDUUplinkTakeoffDataPages.insert(mcdu, uplink)) {
          CDUPerformancePage.ShowPage(mcdu, FlightPlanIndex.Active);
        } else {
          refresh();
        }
      };
    }
    if (opened && data.requestPending.get() && !uplink) {
      mcdu.setScratchpadMessage(NXSystemMessages.requestIsPending);
    }

    mcdu.setTemplate([
      [
        `UPLINK ${flex ? 'FLX' : 'MAX'} TO DATA`,
        runways.length > 0 ? `${index + 1}` : '',
        runways.length > 0 ? `${runways.length}` : '',
      ],
      ['\xa0TOW\xa0/TOCG', 'SHIFT/\xa0RWY\xa0'],
      [
        towCell,
        uplink ? green(`${uplink.shift !== null ? uplink.shift.toFixed(0) : '[  ]'}/${uplink.runway}`) : '-----/----',
      ],
      [flex ? '\xa0FLX/QNH' : '\xa0TEMP/QNH', 'TO\xa0LIMIT\xa0', 'V1\xa0\xa0\xa0\xa0'],
      [
        value(tempText, '---°/----'),
        uplink && uplink.toLimit !== null
          ? green(`{small}FT{end}${(uplink.toLimit * FEET_PER_METRE).toFixed(0)}`)
          : '------',
        speed(uplink?.v1),
      ],
      ['\xa0MAG\xa0WIND', 'FLAPS/THS\xa0', 'VR\xa0\xa0\xa0\xa0'],
      [
        value(
          uplink
            ? `${uplink.windDirection.toFixed(0).padStart(3, '0')}°/${uplink.windSpeed.toFixed(0).padStart(3, '0')}`
            : null,
          '---°/---',
        ),
        value(uplink ? `${uplink.flaps}/${uplink.ths !== null ? formatThs(uplink.ths) : '-----'}` : null, '--/-----'),
        speed(uplink?.vr),
      ],
      ['\xa0CONTAM', '', 'V2\xa0\xa0\xa0\xa0'],
      [
        value(uplink ? UPLINK_CONTAMINATIONS[uplink.runwayCondition] ?? '---' : null, '---------'),
        flex ? 'MAX TO>' : 'FLEX TO>',
        speed(uplink?.v2),
      ],
      ['THR\xa0RED/ACC', 'ENG\xa0OUT\xa0ACC'],
      [
        value(
          uplink
            ? `${uplink.thrustReductionAltitude?.toFixed(0) ?? '-----'}/${uplink.accelerationAltitude?.toFixed(0) ?? '-----'}`
            : null,
          '-----/-----',
        ),
        value(uplink?.engineOutAccelerationAltitude?.toFixed(0) ?? null, '-----'),
      ],
      ['\xa0UPLINK', runwayMatches ? 'INSERT\xa0' : ''],
      ['<TO\xa0DATA', runwayMatches ? (insertable ? 'UPLINK*' : 'UPLINK\xa0') : ''],
    ]);
  }

  /**
   * INSERT UPLINK (FCOM P 93): V1, VR, V2, THR RED/ACC, ENG OUT ACC, FLAPS/THS, SHIFT and FLEX into the PERF TAKE OFF
   * page, with the entry checks of the page.
   */
  private static async insert(mcdu: LegacyFmsPageInterface, uplink: CompanyTakeoffDataUplink): Promise<boolean> {
    const plan = FlightPlanIndex.Active;
    const ok =
      mcdu.trySetV1Speed(uplink.v1.toFixed(0), plan) &&
      mcdu.trySetVRSpeed(uplink.vr.toFixed(0), plan) &&
      mcdu.trySetV2Speed(uplink.v2.toFixed(0), plan) &&
      mcdu.trySetFlapsTHS(`${uplink.flaps}${uplink.ths !== null ? `/${formatThs(uplink.ths)}` : ''}`, plan) &&
      mcdu.setPerfTOFlexTemp(
        uplink.thrust === 'FLEX' && uplink.flexTemperature !== null
          ? Math.round(uplink.flexTemperature).toFixed(0)
          : Keypad.clrValue,
        plan,
      );
    if (!ok) {
      return false;
    }
    if (uplink.thrustReductionAltitude !== null && uplink.accelerationAltitude !== null) {
      await mcdu.trySetThrustReductionAccelerationAltitude(
        `${Math.round(uplink.thrustReductionAltitude)}/${Math.round(uplink.accelerationAltitude)}`,
        plan,
      );
    }
    if (uplink.engineOutAccelerationAltitude !== null) {
      await mcdu.trySetEngineOutAcceleration(Math.round(uplink.engineOutAccelerationAltitude).toFixed(0), plan);
    }
    mcdu.flightPlanService.setPerformanceData('takeoffShift', uplink.shift, plan);
    mcdu.uplinkTakeoffData.remove(uplink);
    return true;
  }
}
