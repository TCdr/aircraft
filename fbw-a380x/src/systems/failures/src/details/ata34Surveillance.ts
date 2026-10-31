// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';

/** SURV SYS n FAULT, SURV TERR SYS, SURV TAWS and SURV SYS DEGRADED: inhibited in flight phases 3 to 7 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_AND_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch down until the landing roll is below 80 kt';

/** SURV GPWS n FAULT: inhibited in flight phases 3 to 7, 10 and 11 */
const NOT_SHOWN_PHASES_3_TO_7_10_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch down until the engines are shut down ' +
  'after landing';

/** SURV XPDR n FAULT: inhibited in flight phases 3 to 7 and 9 to 11 */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the engines are shut ' +
  'down after landing';

/** SURV WXR n FAULT and SURV TURB n FAULT: inhibited in flight phases 3 to 6 and 10 */
const NOT_SHOWN_PHASES_3_TO_6_AND_10 = 'a new alert is not shown from take-off power to 400 ft, nor at touch down';

/** SURV PRED W/S n FAULT: inhibited in flight phases 3 to 6, 10 and 11 */
const NOT_SHOWN_PHASES_3_TO_6_10_11 =
  'a new alert is not shown from take-off power to 400 ft, nor from touch down until the engines are shut down ' +
  'after landing';

/** SURV REACTIVE W/S DET FAULT: inhibited in every flight phase but 2, 8 and 9 */
const NOT_SHOWN_PHASES_1_3_TO_7_AND_10_TO_12 =
  'a new alert is shown only on the ground after the first engine start until take-off power, and in climb above ' +
  '1,500 ft, cruise, descent and approach until touch down';

const SURV_SYSTEM_DESCRIPTION =
  'The aircraft has two surveillance systems, SURV SYS 1 and SURV SYS 2, each run by an environment surveillance ' +
  'unit. Each can do all the surveillance functions in two groups: the weather radar with the terrain and ground ' +
  'proximity warning (WXR and TAWS), and the traffic collision avoidance with the transponder (XPDR and TCAS). The ' +
  'crew selects the system of each group on the SURV page of the MFD, and the selected system manages the alerts and ' +
  'displays.';

const sysBusbar = (system: number): string => (system === 1 ? 'AC ESS' : 'AC 4');

const sysFaultAlertId = (system: number): string => String(341800028 + system);
const SYS_1_2_FAULT_ALERT_ID = '341800031';

const otherSystem = (system: number): number => 3 - system;

const MFD_SURV_PAGE = 'MFD';

// ---------------------------------------------------------------------------------------------------------------------
// TERR SYS
// ---------------------------------------------------------------------------------------------------------------------

const TERR_DESCRIPTION =
  'The terrain awareness and display function of the TAWS draws the terrain on the ND and the vertical display and ' +
  'warns of terrain ahead. There is one in each surveillance system, and the system selected for WXR and TAWS ' +
  'provides it. The TERR SYS button of the MFD SURV page switches it on and off.';

const terrAlertId = (system: number): string => String(341800019 + system);
const tawsAlertId = (system: number): string => String(341800022 + system);
const TERR_1_2_ALERT_ID = '341800022';

const TerrFamily: FailureDetailFamily = {
  ids: [A380Failure.Terr1, A380Failure.Terr2],
  detail: (system): FailureDetail => {
    const other = otherSystem(system);
    return {
      whatItIs: TERR_DESCRIPTION,
      impact: [
        `The terrain function of SURV SYS ${system} is lost. It matters while SYS ${system} provides the TAWS: the selected WXR and TAWS system, or the system the TAWS moved to.`,
        'The terrain no longer shows on the ND or the vertical display, and the TERR SYS button of the MFD SURV page can no longer be used.',
        'The GPWS stays on its own, but its TOO LOW TERRAIN envelope on approach widens because the terrain function can no longer be relied on.',
      ],
      alertIds: [terrAlertId(system), TERR_1_2_ALERT_ID, tawsAlertId(system)],
      effects: [
        {
          where: 'E/WD',
          text:
            `SURV TERR SYS ${system} FAULT, ${CAUTION}, as soon as TERR SYS ${system} is lost, its busbar is powered ` +
            `and the GPWS of the same system still works; ${NOT_SHOWN_PHASES_3_TO_7_AND_10}. Its line is WXR & TAWS ` +
            `SYS ${other} while the terrain function of SYS ${other} works; otherwise the lines are [MFD SURV] ` +
            'STATUS & SWTG PAGE CHECK and WXR & TAWS AS RQRD.',
        },
        {
          where: 'E/WD',
          text:
            `SURV TERR SYS 1+2 FAULT, ${CAUTION}, replaces the two single alerts when TERR SYS ${other} is lost too; ` +
            'its line is [MFD SURV] TERR SYS OFF. SURV TAWS ' +
            `${system} FAULT, ${CAUTION}, replaces SURV TERR SYS ${system} FAULT and SURV GPWS ${system} FAULT when ` +
            `the GPWS of SYS ${system} is lost as well; its lines are WXR & TAWS SYS ${other} (while SYS ${system} ` +
            'is selected and SYS ' +
            `${other} works) and, only while the TAWS of SYS ${other} is lost, [MFD SURV] STATUS & SWTG PAGE CHECK. All ` +
            'three use the same flight phase wording as the single alert.',
        },
        {
          where: 'SD STATUS',
          text: `INOP SYS TERR SYS ${system} (approach and landing) and ADS-B RPTG ${system} (all phases), while the terrain function stays lost.`,
        },
        {
          where: 'ND',
          text: `With TERR ON ND selected and SYS ${system} providing the TAWS, the terrain stops being drawn. The vertical display stops drawing the terrain profile as well, and shows TERR INOP while SYS ${system} is the selected WXR & TAWS system.`,
        },
        {
          where: 'MFD',
          text:
            `On the SURV page the TERR SYS ${system} item turns amber on STATUS & SWITCHING, and with SYS ${system} ` +
            'providing the TAWS the TERR SYS button of CONTROLS is greyed out; the TAWS title turns amber only when ' +
            'the GPWS is lost too.',
        },
        {
          where: 'Aural',
          text: 'On approach with the TAWS terrain function lost, the TOO LOW TERRAIN callout (above 200 kt with the gear up and the flaps not in landing configuration, above 180 kt with the gear down) has a ceiling that rises from 500 ft or 245 ft up to 1,000 ft at 250 kt.',
        },
      ],
      notSimulated: [
        'The terrain ahead warnings of the real terrain function are not part of this simulated TAWS, so only the display, the status and the approach envelope change.',
      ],
      logbook: { required: true, reason: `SURV TERR SYS ${system} FAULT caution` },
      clearing: `${MAINTENANCE_ONLY} The TERR SYS button of the MFD SURV page cannot restore it.`,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// GPWS
// ---------------------------------------------------------------------------------------------------------------------

const GPWS_DESCRIPTION =
  'The ground proximity warning system watches the flight path against the ground with the radio altimeters and ' +
  'gives sink rate, terrain, do not sink, too low and glide slope alerts. There is one in each surveillance system, ' +
  'and the system selected for WXR and TAWS provides it.';

const gpwsAlertId = (system: number): string => String(341800025 + system);
const GPWS_1_2_ALERT_ID = '341800028';

const GpwsFamily: FailureDetailFamily = {
  ids: [A380Failure.Gpws1, A380Failure.Gpws2],
  detail: (system): FailureDetail => {
    const other = otherSystem(system);
    return {
      whatItIs: GPWS_DESCRIPTION,
      impact: [
        `The GPWS of SURV SYS ${system} is lost. It matters while SYS ${system} provides the TAWS: the selected WXR and TAWS system, or the system the TAWS moved to.`,
        'In that case no GPWS mode alerts: sink rate, terrain, do not sink, too low gear, flaps and terrain, and glide slope. An alert already sounding stops.',
        'The terrain function is separate and keeps working.',
      ],
      alertIds: [gpwsAlertId(system), GPWS_1_2_ALERT_ID, tawsAlertId(system)],
      effects: [
        {
          where: 'E/WD',
          text:
            `SURV GPWS ${system} FAULT, ${CAUTION}, as soon as the GPWS is lost, its busbar is powered and the terrain ` +
            `function of the same system still works; ${NOT_SHOWN_PHASES_3_TO_7_10_11}. Its line is WXR & TAWS SYS ${other}, shown ` +
            `while SYS ${system} is selected and the weather display, GPWS and TERR SYS of SYS ${other} all work; ` +
            'otherwise [MFD SURV] STATUS & SWTG PAGE CHECK and WXR & TAWS AS RQRD.',
        },
        {
          where: 'E/WD',
          text:
            `SURV GPWS 1+2 FAULT, ${CAUTION}, replaces the two single alerts when the GPWS of SYS ${other} is lost too; ` +
            `its line is [MFD SURV] GPWS OFF. SURV TAWS ${system} FAULT, ${CAUTION}, replaces SURV GPWS ${system} ` +
            `FAULT and SURV TERR SYS ${system} FAULT when TERR SYS ${system} is lost as well; its lines are ` +
            `WXR & TAWS SYS ${other}, shown while SYS ${system} is selected and the TAWS of SYS ${other} works, and ` +
            '[MFD SURV] STATUS & SWTG PAGE CHECK, shown only while that TAWS is lost. Both use the same flight phase wording ' +
            'as the single alert, apart from SURV TAWS FAULT, which is not shown from take-off power to 1,500 ft, ' +
            'nor from touch down until the landing roll is below 80 kt.',
        },
        {
          where: 'SD STATUS',
          text: `INOP SYS GPWS ${system} (approach and landing), while the GPWS stays lost.`,
        },
        {
          where: MFD_SURV_PAGE,
          text:
            `On the SURV page the GPWS ${system} item turns amber on STATUS & SWITCHING, and with SYS ${system} ` +
            'providing the TAWS the GPWS, G/S MODE and FLAP MODE buttons of CONTROLS are greyed out.',
        },
        {
          where: 'Aural',
          text: `With SYS ${system} providing the TAWS the GPWS mode alerts no longer sound.`,
        },
      ],
      logbook: { required: true, reason: `SURV GPWS ${system} FAULT caution and no GPWS alerts` },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Transponder
// ---------------------------------------------------------------------------------------------------------------------

const XPDR_DESCRIPTION =
  'The transponder answers the interrogations of air traffic control and of other aircraft with the squawk code and ' +
  'the altitude, and gives the TCAS the traffic it needs. There is one in each surveillance system, and the system ' +
  'selected for XPDR and TCAS is the one that works for the aircraft.';

const xpdrAlertId = (system: number): string => String(341800060 + system);
const XPDR_1_2_ALERT_ID = '341800063';

const XpdrFamily: FailureDetailFamily = {
  ids: [A380Failure.Transponder1, A380Failure.Transponder2],
  detail: (system): FailureDetail => {
    const other = otherSystem(system);
    return {
      whatItIs: XPDR_DESCRIPTION,
      impact: [
        `The transponder of SURV SYS ${system} is lost, and the TCAS of the same system with it.`,
        `With XPDR & TCAS on SYS ${system} the simulated transponder is switched off: no replies, no squawk, and no traffic or resolution advisories.`,
        `With XPDR & TCAS on SYS ${other} the aircraft still squawks and the TCAS works; only the alert, the status and the MFD page show the loss.`,
      ],
      alertIds: [xpdrAlertId(system), XPDR_1_2_ALERT_ID],
      effects: [
        {
          where: 'E/WD',
          text:
            `SURV XPDR ${system} FAULT, ${CAUTION}, as soon as the transponder is lost and its busbar is powered; ` +
            `${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}. It replaces SURV TCAS ${system} FAULT. Its line is XPDR & TCAS SYS ${other}, shown ` +
            `while SYS ${system} is in use and the transponder of SYS ${other} works, and it stays shown and ticked ` +
            'once the crew has switched.',
        },
        {
          where: 'E/WD',
          text: `SURV XPDR 1+2 FAULT, ${CAUTION}, replaces the single alert when the transponder of SYS ${other} is lost too; no lines; same flight phase wording. Its STATUS lists XPDR 1+2 and TCAS 1+2.`,
        },
        {
          where: 'SD STATUS',
          text:
            `INOP SYS XPDR ${system} and TCAS ${system} (all phases), and AP/FD TCAS MODE while XPDR & TCAS is on ` +
            `SYS ${system}.`,
        },
        {
          where: 'PFD',
          text: `With XPDR & TCAS on SYS ${system} the amber TCAS legend shows beside the altitude tape.`,
        },
        {
          where: 'ND',
          text: `With XPDR & TCAS on SYS ${system} an amber TCAS message shows instead of the TCAS state messages.`,
        },
        {
          where: 'E/WD',
          text:
            `With XPDR & TCAS on SYS ${system} the TCAS STBY memo shows after 3 s, and in flight the ALT RPTG OFF memo ` +
            'as well, because the transponder is off; the memos are not shown on the ground with the engines off or after ' +
            'engine shutdown.',
        },
        {
          where: MFD_SURV_PAGE,
          text:
            `The XPDR ${system} and TCAS ${system} items turn amber on STATUS & SWITCHING. With XPDR & TCAS on SYS ` +
            `${system}, the XPDR title of CONTROLS turns amber, ALT RPTG and the TCAS buttons are greyed out and the ` +
            'TCAS title is amber.',
        },
      ],
      logbook: { required: true, reason: `SURV XPDR ${system} FAULT caution and no transponder replies` },
      clearing: `${MAINTENANCE_ONLY} Selecting XPDR & TCAS on SYS ${other} restores the replies and the TCAS.`,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// SURV SYS (the whole surveillance system)
// ---------------------------------------------------------------------------------------------------------------------

const SurvSystemFamily: FailureDetailFamily = {
  ids: [A380Failure.SurvSystem1, A380Failure.SurvSystem2],
  detail: (system): FailureDetail => {
    const other = otherSystem(system);
    return {
      whatItIs: SURV_SYSTEM_DESCRIPTION,
      impact: [
        `SURV SYS ${system} is lost as a whole: its weather radar with turbulence and predictive windshear, its terrain function, its GPWS, its transponder and its TCAS.`,
        `Whatever the crew had selected on SYS ${system} is gone: weather, terrain, GPWS alerts, squawk and TCAS.`,
        `SURV SYS ${other} is not affected: selecting it for WXR & TAWS and XPDR & TCAS brings everything back.`,
      ],
      alertIds: [sysFaultAlertId(system), SYS_1_2_FAULT_ALERT_ID],
      effects: [
        {
          where: 'E/WD',
          text:
            `SURV SYS ${system} FAULT, ${CAUTION}, as soon as the system is lost and its busbar (${sysBusbar(system)}) ` +
            `is powered; ${NOT_SHOWN_PHASES_3_TO_7_AND_10}. Its lines are WXR & TAWS SYS ${other}, shown while the weather ` +
            `radar and the TAWS of SYS ${other} work, and XPDR & TCAS SYS ${other}, shown while its transponder ` +
            'works. It hides the XPDR, TCAS, GPWS, TERR SYS and TAWS alerts of the same system.',
        },
        {
          where: 'E/WD',
          text: `SURV SYS 1+2 FAULT, ${CAUTION}, replaces the single alert when SURV SYS ${other} is lost too; no lines; same flight phase wording.`,
        },
        {
          where: 'SD STATUS',
          text:
            `INOP SYS WXR ${system}, XPDR ${system}, TCAS ${system} and ADS-B RPTG ${system} (all phases), TAWS ` +
            `${system} and TAWS SYS ${system} (approach and landing), and AP/FD TCAS MODE while WXR & TAWS or ` +
            `XPDR & TCAS is on SYS ${system}.`,
        },
        {
          where: 'ND',
          text:
            `With SYS ${system} providing WXR and TAWS the weather and the terrain stop being drawn, and the vertical ` +
            'display shows TERR INOP, and WXR INOP when the WX pushbutton is selected. With XPDR & ' +
            `TCAS on SYS ${system} there are no traffic advisories and an amber TCAS message shows.`,
        },
        {
          where: 'PFD',
          text: `With XPDR & TCAS on SYS ${system} the amber TCAS legend shows beside the altitude tape.`,
        },
        {
          where: 'E/WD',
          text:
            `With XPDR & TCAS on SYS ${system} the TCAS STBY memo shows after 3 s, and in flight the ALT RPTG OFF memo ` +
            'as well, because the transponder is off; the memos are not shown on the ground with the engines off or after ' +
            'engine shutdown.',
        },
        {
          where: MFD_SURV_PAGE,
          text: `Every item of SYS ${system} (WX DISPLAY, TURB, PRED W/S, TERR SYS, GPWS, XPDR, TCAS) turns amber on STATUS & SWITCHING.`,
        },
      ],
      logbook: {
        required: true,
        reason: `SURV SYS ${system} FAULT caution and loss of all its surveillance functions`,
      },
      clearing: `${MAINTENANCE_ONLY} Pushing the AESU reset button back in does not restore a failure.`,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// WXR functions
// ---------------------------------------------------------------------------------------------------------------------

const WXR_DESCRIPTION =
  'The weather radar of each surveillance system has three functions: the weather display, the turbulence detection ' +
  'and the predictive windshear detection. The system selected for WXR and TAWS provides the picture on the ND and the ' +
  'vertical display.';

const wxrAlertId = (system: number): string => String(341800032 + system);
const WXR_1_2_ALERT_ID = '341800035';
const turbAlertId = (system: number): string => (system === 1 ? '341800036' : '341800038');
const TURB_1_2_ALERT_ID = '341800039';
const predWsAlertId = (system: number): string => String(341800039 + system);
const PRED_WS_1_2_ALERT_ID = '341800042';

const WxrDisplayFamily: FailureDetailFamily = {
  ids: [A380Failure.WxrDisplay1, A380Failure.WxrDisplay2],
  detail: (system): FailureDetail => {
    const other = otherSystem(system);
    return {
      whatItIs: WXR_DESCRIPTION,
      impact: [
        `The weather display function of SURV SYS ${system} is lost; its turbulence and predictive windshear functions are not.`,
        `It matters while SYS ${system} is the selected WXR & TAWS system: the weather no longer shows on the ND or the vertical display, and the WXR controls of the MFD are greyed out.`,
      ],
      alertIds: [wxrAlertId(system), WXR_1_2_ALERT_ID],
      effects: [
        {
          where: 'E/WD',
          text:
            `SURV WXR ${system} FAULT, ${CAUTION}, as soon as the weather display is lost and the system is powered ` +
            `and not lost as a whole; ${NOT_SHOWN_PHASES_3_TO_6_AND_10}. Its line is WXR & TAWS SYS ${other}, shown while the ` +
            `weather display of SYS ${other} works.`,
        },
        {
          where: 'E/WD',
          text:
            `SURV WXR 1+2 FAULT, ${CAUTION}, replaces the single alert when the weather display of SYS ${other} is lost ` +
            'too; its lines are [MFD SURV] STATUS & SWTG PAGE CHECK and WXR & TAWS AS RQRD, shown while a turbulence or ' +
            'predictive windshear function still works; same flight phase wording.',
        },
        { where: 'SD STATUS', text: `INOP SYS WXR ${system} (all phases), WXR 1+2 for the dual alert.` },
        {
          where: 'ND',
          text: `With WX selected and SYS ${system} providing WXR, the weather picture is not drawn, and the vertical display shows WXR INOP.`,
        },
        {
          where: MFD_SURV_PAGE,
          text:
            `The WX DISPLAY ${system} item turns amber on STATUS & SWITCHING. With SYS ${system} selected, the WXR ` +
            'title of CONTROLS turns amber and the WXR, PRED W/S, TURB, GAIN, MODE and WX ON VD buttons, among others, are greyed out.',
        },
      ],
      logbook: { required: true, reason: `SURV WXR ${system} FAULT caution and no weather picture` },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const WxrTurbulenceFamily: FailureDetailFamily = {
  ids: [A380Failure.WxrTurbulence1, A380Failure.WxrTurbulence2],
  detail: (system): FailureDetail => {
    const other = otherSystem(system);
    return {
      whatItIs: `${WXR_DESCRIPTION} The turbulence detection adds the turbulence areas to the weather picture.`,
      impact: [
        `The turbulence detection of SURV SYS ${system} is lost; the weather display and the predictive windshear are not.`,
        'Only the alert, the status and the MFD page show the loss: the turbulence areas still show on the ND.',
      ],
      alertIds: [turbAlertId(system), TURB_1_2_ALERT_ID],
      effects: [
        {
          where: 'E/WD',
          text:
            `SURV TURB ${system} FAULT, ${CAUTION}, as soon as the turbulence detection is lost and the system is ` +
            `powered and not lost as a whole; ${NOT_SHOWN_PHASES_3_TO_6_AND_10}. Its first line is WXR & TAWS SYS ${other}, ` +
            `shown while SYS ${other} has all its radar functions; if the predictive windshear of SYS ${other} is lost ` +
            'the lines are [MFD SURV] STATUS & SWTG PAGE CHECK and WXR & TAWS AS RQRD.',
        },
        {
          where: 'E/WD',
          text: `SURV TURB 1+2 FAULT, ${CAUTION}, replaces the single alert when the turbulence detection of SYS ${other} is lost too; lines [MFD SURV] STATUS & SWTG PAGE CHECK and WXR & TAWS AS RQRD; same flight phase wording.`,
        },
        { where: 'SD STATUS', text: `INOP SYS TURB ${system} (all phases), TURB 1+2 for the dual alert.` },
        {
          where: MFD_SURV_PAGE,
          text: `The TURB ${system} item turns amber on STATUS & SWITCHING.`,
        },
      ],
      logbook: { required: true, reason: `SURV TURB ${system} FAULT caution` },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const WxrPredictiveWindshearFamily: FailureDetailFamily = {
  ids: [A380Failure.WxrPredictiveWindshear1, A380Failure.WxrPredictiveWindshear2],
  detail: (system): FailureDetail => {
    const other = otherSystem(system);
    return {
      whatItIs: `${WXR_DESCRIPTION} The predictive windshear function looks for wind shear 0.5 to 5 nm ahead and warns before the encounter.`,
      impact: [
        `The predictive windshear function of SURV SYS ${system} is lost; the weather display and the turbulence detection are not.`,
        'The simulation has no predictive windshear detection, so only the alert, the status and the MFD page show the loss.',
      ],
      alertIds: [predWsAlertId(system), PRED_WS_1_2_ALERT_ID],
      effects: [
        {
          where: 'E/WD',
          text:
            `SURV PRED W/S ${system} FAULT, ${CAUTION}, as soon as the function is lost and the system is powered ` +
            `and not lost as a whole; ${NOT_SHOWN_PHASES_3_TO_6_10_11}. Its first line is WXR & TAWS SYS ${other}, shown while ` +
            `SYS ${other} has all its radar functions; if the turbulence detection of SYS ${other} is lost the lines ` +
            'are [MFD SURV] STATUS & SWTG PAGE CHECK and WXR & TAWS AS RQRD.',
        },
        {
          where: 'E/WD',
          text: `SURV PRED W/S 1+2 FAULT, ${CAUTION}, replaces the single alert when the function of SYS ${other} is lost too; lines [MFD SURV] STATUS & SWTG PAGE CHECK and WXR & TAWS AS RQRD; same flight phase wording.`,
        },
        {
          where: 'SD STATUS',
          text: `INOP SYS PRED W/S ${system} (approach and landing), PRED W/S 1+2 for the dual alert.`,
        },
        {
          where: MFD_SURV_PAGE,
          text: `The PRED W/S ${system} item turns amber on STATUS & SWITCHING.`,
        },
      ],
      notSimulated: [
        'The predictive windshear alerts on the PFD and the ND are not simulated, so no real warning is lost.',
      ],
      logbook: { required: true, reason: `SURV PRED W/S ${system} FAULT caution` },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Link between the two SURV systems, reactive windshear
// ---------------------------------------------------------------------------------------------------------------------

const SurvSystemLinkDetail: FailureDetail = {
  whatItIs:
    `${SURV_SYSTEM_DESCRIPTION} The two systems are linked so that the crew can switch the WXR and TAWS group and ` +
    'the XPDR and TCAS group between them.',
  impact: [
    'The link between SURV SYS 1 and SURV SYS 2 is lost. Each system keeps working.',
    'The crew is told to use the SURV control panel for switching and to keep both groups on the same system.',
    'The simulation does not restrict the switching: the MFD SURV page keeps working as before.',
  ],
  alertIds: ['341800032'],
  effects: [
    {
      where: 'E/WD',
      text:
        `SURV SYS DEGRADED, ${CAUTION}, as soon as the link is lost while both systems are powered and not lost; ` +
        `${NOT_SHOWN_PHASES_3_TO_7_AND_10}. Its lines are USE SURV SYS CTL PNL FOR SWITCHING and WXR / TAWS & XPDR / ` +
        'TCAS ON SAME SYS, which is ticked once both groups are on the same system.',
    },
    { where: 'SD STATUS', text: 'INOP SYS SURV SYS DEGRADED (all phases), only while the alert is shown.' },
  ],
  notSimulated: [
    'The real loss of independent switching between the two systems is not simulated; the crew can still use the MFD SURV page.',
  ],
  logbook: { required: true, reason: 'SURV SYS DEGRADED caution' },
  clearing: MAINTENANCE_ONLY,
};

const ReactiveWindshearDetectionDetail: FailureDetail = {
  whatItIs:
    'The flight control computers (PRIMs) detect windshear from the air data, the inertial data and the radio ' +
    'altimeter during take-off and landing. They raise a red WINDSHEAR message on both PFDs, flashing for 9 s then ' +
    'steady, with the WINDSHEAR synthetic voice.',
  impact: [
    'The reactive windshear detection is lost: a windshear encounter no longer gives the red PFD message or the voice.',
    'Nothing else is lost; the crew gets only an advisory.',
  ],
  alertIds: ['341800043'],
  effects: [
    {
      where: 'E/WD',
      text:
        `SURV REACTIVE W/S DET FAULT, ${ADVISORY}, as soon as the detection is lost; ${NOT_SHOWN_PHASES_1_3_TO_7_AND_10_TO_12}. No ` +
        'lines. It is not shown with NAV ADR 1+2+3 FAULT, ALL AIR DATA DISAGREE, AOA DISAGREE or RA SYS A+B+C FAULT, ' +
        'whose status already lists the lost function.',
    },
    { where: 'SD STATUS', text: 'INOP SYS REACTIVE W/S DET (approach and landing), only while the alert is shown.' },
    {
      where: 'PFD',
      text: 'The red WINDSHEAR message of the reactive detection no longer appears, whatever the wind.',
    },
    { where: 'Aural', text: 'The WINDSHEAR voice no longer sounds.' },
  ],
  logbook: { required: true, reason: 'SURV REACTIVE W/S DET FAULT advisory and no reactive windshear warning' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata34SurveillanceEntries: Record<number, FailureDetail> = {
  [A380Failure.SurvSystemLink]: SurvSystemLinkDetail,
  [A380Failure.ReactiveWindshearDetection]: ReactiveWindshearDetectionDetail,
};

export const Ata34SurveillanceFamilies: FailureDetailFamily[] = [
  TerrFamily,
  GpwsFamily,
  XpdrFamily,
  SurvSystemFamily,
  WxrDisplayFamily,
  WxrTurbulenceFamily,
  WxrPredictiveWindshearFamily,
];
