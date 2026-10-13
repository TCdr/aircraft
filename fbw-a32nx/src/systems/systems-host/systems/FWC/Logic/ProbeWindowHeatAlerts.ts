// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The probe and window heat cautions of the A32NX FWC (A320 FCOM PRO-ABN-A-ICE, a320_fcom.txt l.68344-69240; the
 * procedure lines, STATUS and flight phase inhibition figures read on the 2019 FCOM PDF pages 1975-1996):
 * ANTI ICE ALL PITOT, CAPT + F/O PITOT, CAPT + STBY PITOT, F/O + STBY PITOT (inhibited in phases 4, 5, 8),
 * ANTI ICE CAPT(F/O)(STBY) PROBES, CAPT(F/O)(STBY) PITOT OR L(R) STAT OR AOA, CAPT(F/O) TAT, L + R WINDSHIELD,
 * L(R) WINDSHIELD and L(R) WINDOW (inhibited in phases 3, 4, 5, 7, 8).
 *
 * The flags come from the probe and window heat computers of the systems model (a320_systems probe_window_heat.rs):
 * L:A32NX_PHC_n_FAULT (n = 1 CAPT, 2 F/O, 3 STBY), L:A32NX_PHC_n_<PITOT|L_STATIC|R_STATIC|AOA|TAT>_HEAT_FAULT,
 * L:A32NX_WHC_n_WINDSHIELD_HEAT_FAULT and L:A32NX_WHC_n_WINDOW_HEAT_FAULT (n = 1 left, 2 right).
 */

export const PITOT_PAIR_PHASE_INHIBITION = [4, 5, 8];
export const PROBE_WINDOW_HEAT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/** The flags of one probe heat computer */
export interface ProbeHeatComputerFlags {
  /** "the captain (F/O)(standby) probe heat computer is failed" */
  computerFault: boolean;
  pitot: boolean;
  leftStatic: boolean;
  rightStatic: boolean;
  aoa: boolean;
  /** The STBY probes have no TAT probe */
  tat: boolean;
}

export interface ProbeWindowHeatInputs {
  /** CAPT, F/O, STBY */
  probeHeatComputers: ProbeHeatComputerFlags[];
  /** Left, right */
  windshieldHeatFault: boolean[];
  windowHeatFault: boolean[];
  /** ADR 1, 2, 3: the ADR pb-sw is ON and the ADR is not failed */
  adrOnAndOperative: boolean[];
  /** The ADR 1, 2, 3 pb-sw is ON */
  adrPbOn: boolean[];
  /** The AIR DATA switching selector: 0 CAPT 3, 1 NORM, 2 F/O 3 (L:A32NX_AIR_DATA_SWITCHING_KNOB) */
  airDataSwitching: number;
}

export interface ProbeWindowHeatAlerts {
  allPitot: boolean;
  captFoPitot: boolean;
  captStbyPitot: boolean;
  foStbyPitot: boolean;
  /** CAPT, F/O, STBY PROBES */
  probes: boolean[];
  /** CAPT, F/O, STBY single probe alerts */
  pitot: boolean[];
  leftStatic: boolean[];
  rightStatic: boolean[];
  aoa: boolean[];
  /** CAPT, F/O TAT */
  tat: boolean[];
  bothWindshields: boolean;
  /** Left, right */
  windshield: boolean[];
  window: boolean[];
}

const CAPT = 0;
const FO = 1;
const STBY = 2;

/**
 * The pitot heating is lost with a failed pitot heater, or with a failed probe heat computer: the STATUS of the pitot
 * pairs lists the PROBES "If all CAPT (F/O)(STBY) PROBES heating is lost" (l.68448-68452).
 */
function pitotHeatingLost(computer: ProbeHeatComputerFlags): boolean {
  return computer.computerFault || computer.pitot;
}

/**
 * The probe and window heat cautions. A pitot pair or ALL PITOT replaces the single pitot cautions it covers, the
 * PROBES caution replaces the single cautions of its computer, and L + R WINDSHIELD replaces the two single windshield
 * cautions (design choice: the FWC shows the most comprehensive caution, as for the other dual failures).
 */
export function probeWindowHeatAlerts(inputs: ProbeWindowHeatInputs): ProbeWindowHeatAlerts {
  const computers = inputs.probeHeatComputers;
  const pitotLost = computers.map(pitotHeatingLost);
  const allPitot = pitotLost[CAPT] && pitotLost[FO] && pitotLost[STBY];
  const captFoPitot = pitotLost[CAPT] && pitotLost[FO] && !pitotLost[STBY];
  const captStbyPitot = pitotLost[CAPT] && pitotLost[STBY] && !pitotLost[FO];
  const foStbyPitot = pitotLost[FO] && pitotLost[STBY] && !pitotLost[CAPT];
  const lostPitots = pitotLost.filter((lost) => lost).length;
  const single = (flag: (computer: ProbeHeatComputerFlags) => boolean) =>
    computers.map((computer) => !computer.computerFault && flag(computer));
  const bothWindshields = inputs.windshieldHeatFault[0] && inputs.windshieldHeatFault[1];
  return {
    allPitot,
    captFoPitot,
    captStbyPitot,
    foStbyPitot,
    probes: computers.map((computer) => computer.computerFault),
    pitot: single((computer) => computer.pitot && lostPitots === 1),
    leftStatic: single((computer) => computer.leftStatic),
    rightStatic: single((computer) => computer.rightStatic),
    aoa: single((computer) => computer.aoa),
    tat: single((computer) => computer.tat).slice(0, 2),
    bothWindshields,
    windshield: inputs.windshieldHeatFault.map((fault) => fault && !bothWindshields),
    window: [...inputs.windowHeatFault],
  };
}

/**
 * The number of failed static, AOA and TAT heaters of the probes of an ADR (ADR 1 CAPT, ADR 2 F/O, ADR 3 STBY): "Depending
 * on the status of the static, AOA, and TAT heating, the ECAM requires that either ADR 1, 2 or 3 be switched OFF"
 * (l.68380-68381). A failed computer heats none of them.
 */
function otherHeatingLost(computer: ProbeHeatComputerFlags): number {
  if (computer.computerFault) {
    return 3;
  }
  return [computer.leftStatic, computer.rightStatic, computer.aoa, computer.tat].filter((lost) => lost).length;
}

/**
 * The ADR (1 to 3) the ECAM asks to switch OFF among the candidates: the one whose other probes lost the most heating.
 * Design choice for a tie: the highest ADR number, to keep ADR 1, which "is supplied in EMER ELEC config"
 * (A320 FCOM DOUBLE AOA HEAT FAILURE, 2019 PDF page 1975).
 */
export function adrToSwitchOff(inputs: ProbeWindowHeatInputs, candidates: number[]): number {
  let chosen = candidates[0];
  for (const adr of candidates) {
    const lost = otherHeatingLost(inputs.probeHeatComputers[adr - 1]);
    const chosenLost = otherHeatingLost(inputs.probeHeatComputers[chosen - 1]);
    if (lost > chosenLost || (lost === chosenLost && adr > chosen)) {
      chosen = adr;
    }
  }
  return chosen;
}

/** The E/WD lines of the pitot alerts, as indices in their codesToReturn (see PITOT_PAIR_CODES) */
export const PITOT_LINE = {
  title: 0,
  adr1Off: 1,
  adr2Off: 2,
  adr3Off: 3,
  ifIcingExpected: 4,
  icingAdr1Off: 5,
  icingAdr2Off: 6,
  icingAdr3Off: 7,
  unreliableSpeedProcedure: 8,
};

/**
 * The lines of a pitot pair (CAPT + F/O, CAPT + STBY, F/O + STBY PITOT, l.68498-68945, PDF pages 1979-1989):
 * "If ADR 3 (2)(1) operative and ON: ADR x P/B OFF", "If ADR 3 (2)(1) failed or OFF: ... IF ICING EXPECTED: ADR x P/B OFF,
 * UNREL SPD PROC APPLY". An action line goes once it is done.
 * @param inputs the alert inputs
 * @param pairAdrs the two ADRs of the lost pitots
 * @param thirdAdr the ADR of the pitot still heated
 */
export function pitotPairLines(inputs: ProbeWindowHeatInputs, pairAdrs: number[], thirdAdr: number): number[] {
  const adr = adrToSwitchOff(inputs, pairAdrs);
  const adrStillOn = inputs.adrPbOn[adr - 1];
  const lines = [PITOT_LINE.title];
  if (inputs.adrOnAndOperative[thirdAdr - 1]) {
    if (adrStillOn) {
      lines.push(PITOT_LINE.adr1Off + adr - 1);
    }
  } else {
    lines.push(PITOT_LINE.ifIcingExpected);
    if (adrStillOn) {
      lines.push(PITOT_LINE.icingAdr1Off + adr - 1);
    }
    lines.push(PITOT_LINE.unreliableSpeedProcedure);
  }
  return lines;
}

/**
 * The lines of ANTI ICE ALL PITOT (PDF page 1976): "ADR 1(2)(3) P/B OFF", then "IF ICING EXPECTED: ADR 2(3) P/B OFF,
 * UNREL SPD PROC APPLY".
 */
export function allPitotLines(inputs: ProbeWindowHeatInputs): number[] {
  const first = adrToSwitchOff(inputs, [1, 2, 3]);
  const second = adrToSwitchOff(
    inputs,
    [2, 3].filter((adr) => adr !== first),
  );
  const lines = [PITOT_LINE.title];
  if (inputs.adrPbOn[first - 1]) {
    lines.push(PITOT_LINE.adr1Off + first - 1);
  }
  lines.push(PITOT_LINE.ifIcingExpected);
  if (inputs.adrPbOn[second - 1]) {
    lines.push(PITOT_LINE.icingAdr1Off + second - 1);
  }
  lines.push(PITOT_LINE.unreliableSpeedProcedure);
  return lines;
}

/** The STATUS codes of the probe and window heat cautions (see StatusMessages) */
export const PROBE_WINDOW_HEAT_STATUS = {
  ifIcingExpected: '300500001',
  adrOff: ['300400002', '300400003', '300400004'],
  unreliableSpeedProcedure: '300400005',
  pitot: ['300300010', '300300011', '300300012'],
  probes: ['300300013', '300300014', '300300015'],
  leftStatic: ['300300016', '300300018', '300300020'],
  rightStatic: ['300300017', '300300019', '300300021'],
  aoa: ['300300022', '300300023', '300300024'],
  tat: ['300300025', '300300026'],
  bothWindshields: '300300027',
  windshield: ['300300028', '300300029'],
  window: ['300300030', '300300031'],
};

/**
 * The STATUS of the pitot alerts: INOP SYS the lost pitots and the PROBES of a failed computer; for ALL PITOT, or a pair
 * whose third ADR is failed or OFF, "IF ICING EXPECTED: ADR x P/B OFF, UNREL SPD PROC APPLY" (PDF pages 1977-1989).
 * @param inputs the alert inputs
 * @param lostAdrs the ADRs of the lost pitots (1 to 3)
 */
export function pitotStatus(inputs: ProbeWindowHeatInputs, lostAdrs: number[]): { info: string[]; inopSys: string[] } {
  const codes = PROBE_WINDOW_HEAT_STATUS;
  const inopSys = lostAdrs.map((adr) => codes.pitot[adr - 1]);
  lostAdrs.forEach((adr) => {
    if (inputs.probeHeatComputers[adr - 1].computerFault) {
      inopSys.push(codes.probes[adr - 1]);
    }
  });
  const thirdAdr = [1, 2, 3].find((adr) => !lostAdrs.includes(adr));
  const icing = thirdAdr === undefined || !inputs.adrOnAndOperative[thirdAdr - 1];
  const info: string[] = [];
  if (icing) {
    const adr =
      thirdAdr === undefined
        ? adrToSwitchOff(
            inputs,
            [2, 3].filter((candidate) => candidate !== adrToSwitchOff(inputs, [1, 2, 3])),
          )
        : adrToSwitchOff(inputs, lostAdrs);
    info.push(codes.ifIcingExpected, codes.adrOff[adr - 1], codes.unreliableSpeedProcedure);
  }
  return { info, inopSys };
}

/** Reads the inputs from the systems model (and the ADR pb-sw) */
export function readProbeWindowHeatInputs(): ProbeWindowHeatInputs {
  const flag = (name: string) => SimVar.GetSimVarValue(name, 'bool') > 0;
  return {
    probeHeatComputers: [1, 2, 3].map((phc) => ({
      computerFault: flag(`L:A32NX_PHC_${phc}_FAULT`),
      pitot: flag(`L:A32NX_PHC_${phc}_PITOT_HEAT_FAULT`),
      leftStatic: flag(`L:A32NX_PHC_${phc}_L_STATIC_HEAT_FAULT`),
      rightStatic: flag(`L:A32NX_PHC_${phc}_R_STATIC_HEAT_FAULT`),
      aoa: flag(`L:A32NX_PHC_${phc}_AOA_HEAT_FAULT`),
      tat: phc !== 3 && flag(`L:A32NX_PHC_${phc}_TAT_HEAT_FAULT`),
    })),
    windshieldHeatFault: [1, 2].map((whc) => flag(`L:A32NX_WHC_${whc}_WINDSHIELD_HEAT_FAULT`)),
    windowHeatFault: [1, 2].map((whc) => flag(`L:A32NX_WHC_${whc}_WINDOW_HEAT_FAULT`)),
    adrOnAndOperative: [1, 2, 3].map(
      (adr) => flag(`L:A32NX_OVHD_ADIRS_ADR_${adr}_PB_IS_ON`) && !flag(`L:A32NX_OVHD_ADIRS_ADR_${adr}_PB_HAS_FAULT`),
    ),
    adrPbOn: [1, 2, 3].map((adr) => flag(`L:A32NX_OVHD_ADIRS_ADR_${adr}_PB_IS_ON`)),
    airDataSwitching: SimVar.GetSimVarValue('L:A32NX_AIR_DATA_SWITCHING_KNOB', 'enum'),
  };
}

/** One probe or window heat alert of the FWC: its E/WD codes, trigger, lines and STATUS */
export interface ProbeWindowHeatAlertDefinition {
  /** The key of the alert in the FWC, and the first 7 digits of its codes */
  key: string;
  /** The E/WD codes: the title, then the lines */
  codes: string[];
  phaseInhibition: number[];
  isActive: (alerts: ProbeWindowHeatAlerts) => boolean;
  /** The indices in codes of the lines to show */
  lines: (inputs: ProbeWindowHeatInputs) => number[];
  status: (inputs: ProbeWindowHeatInputs) => { info: string[]; inopSys: string[] };
}

const codesOf = (key: string, count: number) =>
  Array.from({ length: count }, (_, line) => `${key}${(line + 1).toString().padStart(2, '0')}`);

/** AIR DATA SWTG CAPT 3 (F/O 3) of the CAPT (F/O) probe alerts, until it is done (PDF pages 1984-1991) */
function airDataSwitchingLines(inputs: ProbeWindowHeatInputs, side: number): number[] {
  const done = side === CAPT ? inputs.airDataSwitching === 0 : inputs.airDataSwitching === 2;
  return side === STBY || done ? [0] : [0, 1];
}

function pitotPairDefinition(
  key: string,
  pairAdrs: number[],
  thirdAdr: number,
  isActive: (alerts: ProbeWindowHeatAlerts) => boolean,
) {
  return {
    key,
    codes: codesOf(key, 9),
    phaseInhibition: PITOT_PAIR_PHASE_INHIBITION,
    isActive,
    lines: (inputs: ProbeWindowHeatInputs) => pitotPairLines(inputs, pairAdrs, thirdAdr),
    status: (inputs: ProbeWindowHeatInputs) => pitotStatus(inputs, pairAdrs),
  };
}

function singleProbeDefinitions(
  firstKey: number,
  isActive: (alerts: ProbeWindowHeatAlerts, side: number) => boolean,
  inopSys: string[],
  sides: number[],
): ProbeWindowHeatAlertDefinition[] {
  return sides.map((side) => ({
    key: (firstKey + side).toString(),
    codes: codesOf((firstKey + side).toString(), 2),
    phaseInhibition: PROBE_WINDOW_HEAT_PHASE_INHIBITION,
    isActive: (alerts: ProbeWindowHeatAlerts) => isActive(alerts, side),
    lines: (inputs: ProbeWindowHeatInputs) => airDataSwitchingLines(inputs, side),
    status: () => ({ info: [], inopSys: [inopSys[side]] }),
  }));
}

function crewAwarenessDefinitions(
  firstKey: number,
  isActive: (alerts: ProbeWindowHeatAlerts, index: number) => boolean,
  inopSys: string[],
): ProbeWindowHeatAlertDefinition[] {
  return inopSys.map((code, index) => ({
    key: (firstKey + index).toString(),
    codes: codesOf((firstKey + index).toString(), 1),
    phaseInhibition: PROBE_WINDOW_HEAT_PHASE_INHIBITION,
    isActive: (alerts: ProbeWindowHeatAlerts) => isActive(alerts, index),
    lines: () => [0],
    status: () => ({ info: [], inopSys: [code] }),
  }));
}

const STATUS = PROBE_WINDOW_HEAT_STATUS;

/** The probe and window heat alerts, in their E/WD priority order (texts in EwdMessages 300120101-300127501) */
export const PROBE_WINDOW_HEAT_ALERTS: ProbeWindowHeatAlertDefinition[] = [
  {
    key: '3001201',
    codes: codesOf('3001201', 9),
    phaseInhibition: PITOT_PAIR_PHASE_INHIBITION,
    isActive: (alerts) => alerts.allPitot,
    lines: allPitotLines,
    status: (inputs) => pitotStatus(inputs, [1, 2, 3]),
  },
  pitotPairDefinition('3001202', [1, 2], 3, (alerts) => alerts.captFoPitot),
  pitotPairDefinition('3001203', [1, 3], 2, (alerts) => alerts.captStbyPitot),
  pitotPairDefinition('3001204', [2, 3], 1, (alerts) => alerts.foStbyPitot),
  // CAPT (F/O)(STBY) PROBES: AIR DATA SWTG CAPT 3 (F/O 3), STATUS INOP SYS CAPT (F/O)(STBY) PROBES (PDF pages 1984-1996)
  ...singleProbeDefinitions(3001211, (alerts, side) => alerts.probes[side], STATUS.probes, [CAPT, FO, STBY]),
  // CAPT (F/O)(STBY) PITOT OR L(R) STAT OR AOA, one alert per probe (PDF pages 1983-1995)
  ...singleProbeDefinitions(3001221, (alerts, side) => alerts.pitot[side], STATUS.pitot, [CAPT, FO, STBY]),
  ...singleProbeDefinitions(3001231, (alerts, side) => alerts.leftStatic[side], STATUS.leftStatic, [CAPT, FO, STBY]),
  ...singleProbeDefinitions(3001241, (alerts, side) => alerts.rightStatic[side], STATUS.rightStatic, [CAPT, FO, STBY]),
  ...singleProbeDefinitions(3001251, (alerts, side) => alerts.aoa[side], STATUS.aoa, [CAPT, FO, STBY]),
  // CAPT (F/O) TAT, L + R WINDSHIELD, L(R) WINDSHIELD, L(R) WINDOW: crew awareness (PDF pages 1978, 1991-1994)
  ...crewAwarenessDefinitions(3001261, (alerts, side) => alerts.tat[side], STATUS.tat),
  ...crewAwarenessDefinitions(3001271, (alerts) => alerts.bothWindshields, [STATUS.bothWindshields]),
  ...crewAwarenessDefinitions(3001272, (alerts, side) => alerts.windshield[side], STATUS.windshield),
  ...crewAwarenessDefinitions(3001274, (alerts, side) => alerts.window[side], STATUS.window),
];

/** No probe or window heat fault: the inputs of a healthy aircraft */
export const NO_PROBE_WINDOW_HEAT_FAULT: ProbeWindowHeatInputs = {
  probeHeatComputers: [0, 1, 2].map(() => ({
    computerFault: false,
    pitot: false,
    leftStatic: false,
    rightStatic: false,
    aoa: false,
    tat: false,
  })),
  windshieldHeatFault: [false, false],
  windowHeatFault: [false, false],
  adrOnAndOperative: [true, true, true],
  adrPbOn: [true, true, true],
  airDataSwitching: 1,
};
