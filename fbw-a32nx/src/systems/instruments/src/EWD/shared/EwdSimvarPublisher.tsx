import { EventBus, SimVarDefinition, SimVarValueType, SimVarPublisher } from '@microsoft/msfs-sdk';

export type EwdSimvars = {
  acEssBus: boolean;
  ewdPotentiometer: number;
  autoThrustCommand1: number;
  autoThrustCommand2: number;
  autoThrustLimit: number;
  autoThrustLimitToga: number;
  thrustLimitType: number;
  autoThrustMode: number;
  autoThrustStatus: number;
  autoThrustTLA1: number;
  autoThrustTLA2: number;
  /** thrust lever angles in degrees */
  engine1Tla: number;
  engine2Tla: number;
  autoThrustWarningToga: boolean;
  packs1Supplying: boolean;
  packs2Supplying: boolean;
  engine1AntiIce: boolean;
  engine1EGT: number;
  engine1Fadec: boolean;
  engine1FF: number;
  engine1Master: number;
  engine1N1: number;
  engine1N2: number;
  engine1ReverserTransit: boolean;
  engine1ReverserDeployed: boolean;
  engine1State: number;
  /** The phase of the start sequence (fadec_a32nx StartSequence_A32NX.hpp StartPhase) */
  engine1StartPhase: number;
  engine2AntiIce: boolean;
  engine2EGT: number;
  engine2Fadec: boolean;
  engine2FF: number;
  engine2Master: number;
  engine2N1: number;
  engine2N2: number;
  engine2ReverserTransit: boolean;
  engine2ReverserDeployed: boolean;
  engine2State: number;
  engine2StartPhase: number;
  wingAntiIce: boolean;
  apuBleedPressure: number;
  left1LandingGear: boolean;
  right1LandingGear: boolean;
  throttle1Position: number;
  throttle2Position: number;
  fwcFlightPhase: number;
  idleN1: number;
  /** The idle N1 the FADEC holds at idle thrust (modulated or approach idle), at or above the minimum idle idleN1 */
  idleSettingN1: number;
  /** The FADEC core sensors are failed: N1 and N2 of degraded accuracy (EngineIndicationAccuracy.ts) */
  engine1SensorFault: boolean;
  /** The DMC finds the displayed value differs from the FADEC data (EngineIndicationAccuracy.ts) */
  engine1N1Discrepancy: boolean;
  engine1N2Discrepancy: boolean;
  engine1EgtDiscrepancy: boolean;
  engine1FFDiscrepancy: boolean;
  engine2SensorFault: boolean;
  engine2N1Discrepancy: boolean;
  engine2N2Discrepancy: boolean;
  engine2EgtDiscrepancy: boolean;
  engine2FFDiscrepancy: boolean;
  /** L:A32NX_EIS_DMC_SWITCHING_KNOB: 0 CAPT 3, 1 NORM, 2 F/O 3 */
  dmcSwitchingKnob: number;
  flexTemp: number;
  takeoffDerate: number;
  deratedClimbPercent: number;
  gaSoftActive: number;
  satRaw: number;
  totalFuel: number;
  /** Fuel quantity indications (FOB half box): the outer tank transfer valves of a wing failed closed */
  leftOuterXfrClosed: boolean;
  rightOuterXfrClosed: boolean;
  /** Fuel quantity indications (FOB half box): a centre tank transfer valve failed closed (latched) */
  leftCtrXfrFailedClosed: boolean;
  rightCtrXfrFailedClosed: boolean;
  /** The hydraulic system section pressure switches, for the slat / flap indications */
  greenHydPressurised: boolean;
  blueHydPressurised: boolean;
  yellowHydPressurised: boolean;
  ewdLowerLeft1: number;
  ewdLowerLeft2: number;
  ewdLowerLeft3: number;
  ewdLowerLeft4: number;
  ewdLowerLeft5: number;
  ewdLowerLeft6: number;
  ewdLowerLeft7: number;
  ewdLowerLeftOverflow: boolean;
  ewdStsReminder: boolean;
  ewdLowerRight1: number;
  ewdLowerRight2: number;
  ewdLowerRight3: number;
  ewdLowerRight4: number;
  ewdLowerRight5: number;
  ewdLowerRight6: number;
  ewdLowerRight7: number;
};

export enum EwdVars {
  acEssBus = 'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED',
  ewdPotentiometer = 'LIGHT POTENTIOMETER:92',
  autoThrustCommand1 = 'L:A32NX_AUTOTHRUST_N1_COMMANDED:1',
  autoThrustCommand2 = 'L:A32NX_AUTOTHRUST_N1_COMMANDED:2',
  autoThrustLimit = 'L:A32NX_AUTOTHRUST_THRUST_LIMIT',
  autoThrustLimitToga = 'L:A32NX_AUTOTHRUST_THRUST_LIMIT_TOGA',
  thrustLimitType = 'L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE',
  autoThrustMode = 'L:A32NX_AUTOTHRUST_MODE',
  autoThrustStatus = 'L:A32NX_AUTOTHRUST_STATUS',
  autoThrustTLA1 = 'L:A32NX_AUTOTHRUST_TLA_N1:1',
  autoThrustTLA2 = 'L:A32NX_AUTOTHRUST_TLA_N1:2',
  engine1Tla = 'L:A32NX_AUTOTHRUST_TLA:1',
  engine2Tla = 'L:A32NX_AUTOTHRUST_TLA:2',
  autoThrustWarningToga = 'L:A32NX_AUTOTHRUST_THRUST_LEVER_WARNING_TOGA',
  packs1Supplying = 'L:A32NX_COND_PACK_FLOW_VALVE_1_IS_OPEN',
  packs2Supplying = 'L:A32NX_COND_PACK_FLOW_VALVE_2_IS_OPEN',
  engine1AntiIce = 'L:XMLVAR_Momentary_PUSH_OVHD_ANTIICE_ENG1_Pressed',
  engine1EGT = 'L:A32NX_ENGINE_EGT:1',
  engine1Fadec = 'L:A32NX_FADEC_POWERED_ENG1',
  engine1FF = 'L:A32NX_ENGINE_FF:1',
  engine1N1 = 'L:A32NX_ENGINE_N1:1',
  engine1N2 = 'L:A32NX_ENGINE_N2:1',
  engine1ReverserTransit = 'L:A32NX_REVERSER_1_DEPLOYING',
  engine1ReverserDeployed = 'L:A32NX_REVERSER_1_DEPLOYED',
  engine1State = 'L:A32NX_ENGINE_STATE:1',
  engine1StartPhase = 'L:A32NX_ENGINE_1_START_PHASE',
  engine2AntiIce = 'L:XMLVAR_Momentary_PUSH_OVHD_ANTIICE_ENG2_Pressed',
  engine2EGT = 'L:A32NX_ENGINE_EGT:2',
  engine2Fadec = 'L:A32NX_FADEC_POWERED_ENG2',
  engine2FF = 'L:A32NX_ENGINE_FF:2',
  engine2N1 = 'L:A32NX_ENGINE_N1:2',
  engine2N2 = 'L:A32NX_ENGINE_N2:2',
  engine2ReverserTransit = 'L:A32NX_REVERSER_2_DEPLOYING',
  engine2ReverserDeployed = 'L:A32NX_REVERSER_2_DEPLOYED',
  engine2State = 'L:A32NX_ENGINE_STATE:2',
  engine2StartPhase = 'L:A32NX_ENGINE_2_START_PHASE',
  wingAntiIce = 'L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED',
  apuBleedPressure = 'L:APU_BLEED_PRESSURE',
  left1LandingGear = 'L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED',
  right1LandingGear = 'L:A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED',
  throttle1Position = 'L:XMLVAR_Throttle1Position',
  throttle2Position = 'L:XMLVAR_Throttle2Position',
  fwcFlightPhase = 'L:A32NX_FWC_FLIGHT_PHASE',
  idleN1 = 'L:A32NX_ENGINE_IDLE_N1',
  idleSettingN1 = 'L:A32NX_AUTOTHRUST_THRUST_LIMIT_IDLE',
  engine1SensorFault = 'L:A32NX_ENGINE_1_SENSOR_FAULT',
  engine1N1Discrepancy = 'L:A32NX_ENGINE_1_N1_DISCREPANCY',
  engine1N2Discrepancy = 'L:A32NX_ENGINE_1_N2_DISCREPANCY',
  engine1EgtDiscrepancy = 'L:A32NX_ENGINE_1_EGT_DISCREPANCY',
  engine1FFDiscrepancy = 'L:A32NX_ENGINE_1_FF_DISCREPANCY',
  engine2SensorFault = 'L:A32NX_ENGINE_2_SENSOR_FAULT',
  engine2N1Discrepancy = 'L:A32NX_ENGINE_2_N1_DISCREPANCY',
  engine2N2Discrepancy = 'L:A32NX_ENGINE_2_N2_DISCREPANCY',
  engine2EgtDiscrepancy = 'L:A32NX_ENGINE_2_EGT_DISCREPANCY',
  engine2FFDiscrepancy = 'L:A32NX_ENGINE_2_FF_DISCREPANCY',
  dmcSwitchingKnob = 'L:A32NX_EIS_DMC_SWITCHING_KNOB',
  flexTemp = 'L:A32NX_AIRLINER_TO_FLEX_TEMP',
  takeoffDerate = 'L:A32NX_AIRLINER_TO_DERATE',
  deratedClimbPercent = 'L:A32NX_FADEC_DERATED_CLIMB_PERCENT',
  gaSoftActive = 'L:A32NX_FADEC_GA_SOFT_ACTIVE',
  satRaw = 'L:A32NX_ADIRS_ADR_1_STATIC_AIR_TEMPERATURE',
  totalFuel = 'L:A32NX_TOTAL_FUEL_QUANTITY',
  leftOuterXfrClosed = 'L:A32NX_FUEL_L_OUTER_XFR_CLOSED',
  rightOuterXfrClosed = 'L:A32NX_FUEL_R_OUTER_XFR_CLOSED',
  leftCtrXfrFailedClosed = 'L:A32NX_FUEL_CTR_TK_L_XFR_VALVE_FAILED_CLOSED',
  rightCtrXfrFailedClosed = 'L:A32NX_FUEL_CTR_TK_R_XFR_VALVE_FAILED_CLOSED',
  greenHydPressurised = 'L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE_SWITCH',
  blueHydPressurised = 'L:A32NX_HYD_BLUE_SYSTEM_1_SECTION_PRESSURE_SWITCH',
  yellowHydPressurised = 'L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH',
  ewdLowerLeft1 = 'L:A32NX_Ewd_LOWER_LEFT_LINE_1',
  ewdLowerLeft2 = 'L:A32NX_Ewd_LOWER_LEFT_LINE_2',
  ewdLowerLeft3 = 'L:A32NX_Ewd_LOWER_LEFT_LINE_3',
  ewdLowerLeft4 = 'L:A32NX_Ewd_LOWER_LEFT_LINE_4',
  ewdLowerLeft5 = 'L:A32NX_Ewd_LOWER_LEFT_LINE_5',
  ewdLowerLeft6 = 'L:A32NX_Ewd_LOWER_LEFT_LINE_6',
  ewdLowerLeft7 = 'L:A32NX_Ewd_LOWER_LEFT_LINE_7',
  ewdLowerLeftOverflow = 'L:A32NX_Ewd_LOWER_LEFT_OVERFLOW',
  ewdStsReminder = 'L:A32NX_EWD_STS_REMINDER',
  ewdLowerRight1 = 'L:A32NX_Ewd_LOWER_RIGHT_LINE_1',
  ewdLowerRight2 = 'L:A32NX_Ewd_LOWER_RIGHT_LINE_2',
  ewdLowerRight3 = 'L:A32NX_Ewd_LOWER_RIGHT_LINE_3',
  ewdLowerRight4 = 'L:A32NX_Ewd_LOWER_RIGHT_LINE_4',
  ewdLowerRight5 = 'L:A32NX_Ewd_LOWER_RIGHT_LINE_5',
  ewdLowerRight6 = 'L:A32NX_Ewd_LOWER_RIGHT_LINE_6',
  ewdLowerRight7 = 'L:A32NX_Ewd_LOWER_RIGHT_LINE_7',
}

export class EwdSimvarPublisher extends SimVarPublisher<EwdSimvars> {
  private static simvars = new Map<keyof EwdSimvars, SimVarDefinition>([
    ['acEssBus', { name: EwdVars.acEssBus, type: SimVarValueType.Bool }],
    ['ewdPotentiometer', { name: EwdVars.ewdPotentiometer, type: SimVarValueType.Number }],
    ['autoThrustCommand1', { name: EwdVars.autoThrustCommand1, type: SimVarValueType.Number }],
    ['autoThrustCommand2', { name: EwdVars.autoThrustCommand2, type: SimVarValueType.Number }],
    ['autoThrustLimit', { name: EwdVars.autoThrustLimit, type: SimVarValueType.Number }],
    ['autoThrustLimitToga', { name: EwdVars.autoThrustLimitToga, type: SimVarValueType.Number }],
    ['thrustLimitType', { name: EwdVars.thrustLimitType, type: SimVarValueType.Enum }],
    ['autoThrustMode', { name: EwdVars.autoThrustMode, type: SimVarValueType.Enum }],
    ['autoThrustStatus', { name: EwdVars.autoThrustStatus, type: SimVarValueType.Enum }],
    ['autoThrustTLA1', { name: EwdVars.autoThrustTLA1, type: SimVarValueType.Number }],
    ['autoThrustTLA2', { name: EwdVars.autoThrustTLA2, type: SimVarValueType.Number }],
    ['engine1Tla', { name: EwdVars.engine1Tla, type: SimVarValueType.Number }],
    ['engine2Tla', { name: EwdVars.engine2Tla, type: SimVarValueType.Number }],
    ['autoThrustWarningToga', { name: EwdVars.autoThrustWarningToga, type: SimVarValueType.Bool }],
    ['packs1Supplying', { name: EwdVars.packs1Supplying, type: SimVarValueType.Bool }],
    ['packs2Supplying', { name: EwdVars.packs2Supplying, type: SimVarValueType.Bool }],
    ['engine1AntiIce', { name: EwdVars.engine1AntiIce, type: SimVarValueType.Bool }],
    ['engine1EGT', { name: EwdVars.engine1EGT, type: SimVarValueType.Number }],
    ['engine1Fadec', { name: EwdVars.engine1Fadec, type: SimVarValueType.Bool }],
    ['engine1Master', { name: 'A:FUELSYSTEM VALVE SWITCH:1', type: SimVarValueType.Bool }],
    ['engine1FF', { name: EwdVars.engine1FF, type: SimVarValueType.Number }],
    ['engine1N1', { name: EwdVars.engine1N1, type: SimVarValueType.Number }],
    ['engine1N2', { name: EwdVars.engine1N2, type: SimVarValueType.Number }],
    ['engine1ReverserTransit', { name: EwdVars.engine1ReverserTransit, type: SimVarValueType.Bool }],
    ['engine1ReverserDeployed', { name: EwdVars.engine1ReverserDeployed, type: SimVarValueType.Bool }],
    ['engine1State', { name: EwdVars.engine1State, type: SimVarValueType.Enum }],
    ['engine1StartPhase', { name: EwdVars.engine1StartPhase, type: SimVarValueType.Enum }],
    ['engine2AntiIce', { name: EwdVars.engine2AntiIce, type: SimVarValueType.Bool }],
    ['engine2EGT', { name: EwdVars.engine2EGT, type: SimVarValueType.Number }],
    ['engine2Fadec', { name: EwdVars.engine2Fadec, type: SimVarValueType.Bool }],
    ['engine2FF', { name: EwdVars.engine2FF, type: SimVarValueType.Number }],
    ['engine2Master', { name: 'A:FUELSYSTEM VALVE SWITCH:2', type: SimVarValueType.Bool }],
    ['engine2N1', { name: EwdVars.engine2N1, type: SimVarValueType.Number }],
    ['engine2N2', { name: EwdVars.engine2N2, type: SimVarValueType.Number }],
    ['engine2ReverserTransit', { name: EwdVars.engine2ReverserTransit, type: SimVarValueType.Bool }],
    ['engine2ReverserDeployed', { name: EwdVars.engine2ReverserDeployed, type: SimVarValueType.Bool }],
    ['engine2State', { name: EwdVars.engine2State, type: SimVarValueType.Enum }],
    ['engine2StartPhase', { name: EwdVars.engine2StartPhase, type: SimVarValueType.Enum }],
    ['wingAntiIce', { name: EwdVars.wingAntiIce, type: SimVarValueType.Bool }],
    ['apuBleedPressure', { name: EwdVars.apuBleedPressure, type: SimVarValueType.PSI }],
    ['left1LandingGear', { name: EwdVars.left1LandingGear, type: SimVarValueType.Bool }],
    ['right1LandingGear', { name: EwdVars.right1LandingGear, type: SimVarValueType.Bool }],
    ['throttle1Position', { name: EwdVars.throttle1Position, type: SimVarValueType.Number }],
    ['throttle2Position', { name: EwdVars.throttle2Position, type: SimVarValueType.Number }],
    ['fwcFlightPhase', { name: EwdVars.fwcFlightPhase, type: SimVarValueType.Enum }],
    ['idleN1', { name: EwdVars.idleN1, type: SimVarValueType.Number }],
    ['idleSettingN1', { name: EwdVars.idleSettingN1, type: SimVarValueType.Number }],
    ['engine1SensorFault', { name: EwdVars.engine1SensorFault, type: SimVarValueType.Bool }],
    ['engine1N1Discrepancy', { name: EwdVars.engine1N1Discrepancy, type: SimVarValueType.Bool }],
    ['engine1N2Discrepancy', { name: EwdVars.engine1N2Discrepancy, type: SimVarValueType.Bool }],
    ['engine1EgtDiscrepancy', { name: EwdVars.engine1EgtDiscrepancy, type: SimVarValueType.Bool }],
    ['engine1FFDiscrepancy', { name: EwdVars.engine1FFDiscrepancy, type: SimVarValueType.Bool }],
    ['engine2SensorFault', { name: EwdVars.engine2SensorFault, type: SimVarValueType.Bool }],
    ['engine2N1Discrepancy', { name: EwdVars.engine2N1Discrepancy, type: SimVarValueType.Bool }],
    ['engine2N2Discrepancy', { name: EwdVars.engine2N2Discrepancy, type: SimVarValueType.Bool }],
    ['engine2EgtDiscrepancy', { name: EwdVars.engine2EgtDiscrepancy, type: SimVarValueType.Bool }],
    ['engine2FFDiscrepancy', { name: EwdVars.engine2FFDiscrepancy, type: SimVarValueType.Bool }],
    ['dmcSwitchingKnob', { name: EwdVars.dmcSwitchingKnob, type: SimVarValueType.Enum }],
    ['flexTemp', { name: EwdVars.flexTemp, type: SimVarValueType.Number }],
    ['takeoffDerate', { name: EwdVars.takeoffDerate, type: SimVarValueType.Number }],
    ['deratedClimbPercent', { name: EwdVars.deratedClimbPercent, type: SimVarValueType.Number }],
    ['gaSoftActive', { name: EwdVars.gaSoftActive, type: SimVarValueType.Number }],
    ['satRaw', { name: EwdVars.satRaw, type: SimVarValueType.Number }],
    ['totalFuel', { name: EwdVars.totalFuel, type: SimVarValueType.Number }],
    ['leftOuterXfrClosed', { name: EwdVars.leftOuterXfrClosed, type: SimVarValueType.Bool }],
    ['rightOuterXfrClosed', { name: EwdVars.rightOuterXfrClosed, type: SimVarValueType.Bool }],
    ['leftCtrXfrFailedClosed', { name: EwdVars.leftCtrXfrFailedClosed, type: SimVarValueType.Bool }],
    ['rightCtrXfrFailedClosed', { name: EwdVars.rightCtrXfrFailedClosed, type: SimVarValueType.Bool }],
    ['greenHydPressurised', { name: EwdVars.greenHydPressurised, type: SimVarValueType.Bool }],
    ['blueHydPressurised', { name: EwdVars.blueHydPressurised, type: SimVarValueType.Bool }],
    ['yellowHydPressurised', { name: EwdVars.yellowHydPressurised, type: SimVarValueType.Bool }],
    ['ewdLowerLeft1', { name: EwdVars.ewdLowerLeft1, type: SimVarValueType.Number }],
    ['ewdLowerLeft2', { name: EwdVars.ewdLowerLeft2, type: SimVarValueType.Number }],
    ['ewdLowerLeft3', { name: EwdVars.ewdLowerLeft3, type: SimVarValueType.Number }],
    ['ewdLowerLeft4', { name: EwdVars.ewdLowerLeft4, type: SimVarValueType.Number }],
    ['ewdLowerLeft5', { name: EwdVars.ewdLowerLeft5, type: SimVarValueType.Number }],
    ['ewdLowerLeft6', { name: EwdVars.ewdLowerLeft6, type: SimVarValueType.Number }],
    ['ewdLowerLeft7', { name: EwdVars.ewdLowerLeft7, type: SimVarValueType.Number }],
    ['ewdLowerLeftOverflow', { name: EwdVars.ewdLowerLeftOverflow, type: SimVarValueType.Bool }],
    ['ewdStsReminder', { name: EwdVars.ewdStsReminder, type: SimVarValueType.Bool }],
    ['ewdLowerRight1', { name: EwdVars.ewdLowerRight1, type: SimVarValueType.Number }],
    ['ewdLowerRight2', { name: EwdVars.ewdLowerRight2, type: SimVarValueType.Number }],
    ['ewdLowerRight3', { name: EwdVars.ewdLowerRight3, type: SimVarValueType.Number }],
    ['ewdLowerRight4', { name: EwdVars.ewdLowerRight4, type: SimVarValueType.Number }],
    ['ewdLowerRight5', { name: EwdVars.ewdLowerRight5, type: SimVarValueType.Number }],
    ['ewdLowerRight6', { name: EwdVars.ewdLowerRight6, type: SimVarValueType.Number }],
    ['ewdLowerRight7', { name: EwdVars.ewdLowerRight7, type: SimVarValueType.Number }],
  ]);

  public constructor(bus: EventBus) {
    super(EwdSimvarPublisher.simvars, bus);
  }
}
