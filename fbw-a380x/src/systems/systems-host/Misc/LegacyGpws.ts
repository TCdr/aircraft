// @ts-strict-ignore
import { Arinc429SignStatusMatrix, Arinc429Word, MathUtils, NXDataStore, UpdateThrottler } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { LegacySoundManager, soundList } from './LegacySoundManager';
import {
  A380X_DEFAULT_RADIO_AUTO_CALL_OUTS,
  A380XRadioAutoCallOutFlags,
  IntermediateCallout,
  isFiveHundredCalloutDue,
} from '../../shared/src/AutoCallOuts';
import { EventBus, SimVarValueType } from '@microsoft/msfs-sdk';
import { FwsSoundManagerControlEvents } from '../CpiomC/FlightWarningSystem/FwsSoundManager';
import { GpwsMode2 } from './GpwsMode2';
import { isFwsStallWarningActive, isReactiveWindshearWarningActive } from './SurvAlertPriority';

type ModesType = {
  current: number;
  previous: number;
  type: any[];
  onChange?: (arg0: number, arg1: number) => void;
};

/**
 * This 1:1 port from the A32NX's GPWS+FWS serves as temporary replacement, until a more sophisticated system simulation is in place.
 */
export class LegacyGpws {
  /** Mode 4A: TOO LOW TERRAIN instead of TOO LOW GEAR above this speed */
  static readonly MODE_4A_TERRAIN_SPEED_KT = 200;

  /** Mode 4B: TOO LOW TERRAIN instead of TOO LOW FLAPS above this speed */
  static readonly MODE_4B_TERRAIN_SPEED_KT = 180;

  /**
   * Whether the crew can rely on the terrain awareness (TAD) function, for the mode 4 envelope. Design choice: on the
   * aircraft it depends on the aircraft position and the terrain database; the sim has neither failure, so the TERR
   * SYS pb (MFD SURV CONTROLS, L:A32NX_GPWS_TERR_OFF) and the TERR failure of the selected AESU system
   * (L:A32NX_TERR_n_FAILED, L:A32NX_WXR_TAWS_SYS_SELECTED) stand for it.
   * @returns true when the TAD function is operative
   */
  static isTerrainFunctionOperative(): boolean {
    const selected: number = SimVar.GetSimVarValue('L:A32NX_WXR_TAWS_SYS_SELECTED', SimVarValueType.Number);
    const terrFailed =
      selected === 1 || selected === 2 ? SimVar.GetSimVarValue(`L:A32NX_TERR_${selected}_FAILED`, 'Bool') > 0 : true;
    return !(SimVar.GetSimVarValue('L:A32NX_GPWS_TERR_OFF', 'Bool') > 0) && !terrFailed;
  }

  /**
   * Stall and windshear alerts have priority over the GPWS visual and aural alerts: the FWS STALL warning or the
   * reactive WINDSHEAR warning.
   * @returns true while one of them is on, the GPWS modes then give no alert
   */
  static isStallOrWindshearWarningActive(): boolean {
    return isReactiveWindshearWarningActive() || isFwsStallWarningActive();
  }

  /**
   * Mode 2B condition: on an ILS (GLS) approach with both the glide slope and the LOC deviations below 2 dots.
   * One dot: 0.4 degree of glide slope (as mode 5), 0.8 degree of localizer.
   * @returns true when both the glide slope and the localizer are received with less than 2 dots of deviation
   */
  static areIlsDeviationsBelowTwoDots(): boolean {
    if (
      !(SimVar.GetSimVarValue('L:A32NX_RADIO_RECEIVER_GS_IS_VALID', 'number') > 0) ||
      !(SimVar.GetSimVarValue('L:A32NX_RADIO_RECEIVER_LOC_IS_VALID', 'number') > 0)
    ) {
      return false;
    }
    const glideSlopeDots = Math.abs(SimVar.GetSimVarValue('L:A32NX_RADIO_RECEIVER_GS_DEVIATION', 'number')) / 0.4;
    const localizerDots =
      Math.abs(
        MathUtils.correctMsfsLocaliserError(SimVar.GetSimVarValue('L:A32NX_RADIO_RECEIVER_LOC_DEVIATION', 'number')),
      ) / 0.8;
    return glideSlopeDots < 2 && localizerDots < 2;
  }

  private updateThrottler = new UpdateThrottler(125); // has to be > 100 due to pulse nodes

  private pub = this.bus.getPublisher<FwsSoundManagerControlEvents>();

  /** See shared/src/AutoCallOuts.ts */
  private readonly intermediateCallout = new IntermediateCallout();

  /** A height callout (or MINIMUM, HUNDRED ABOVE, RETARD) was enqueued during the current update */
  private heightCalloutEnqueued = false;

  /** The radio height of the previous update, to see a climb, NaN when invalid */
  private intermediateCalloutPreviousHeight = NaN;

  /** Seconds the radio height has been increasing (the height callouts are not made in a climb) */
  private radioHeightIncreasingSeconds = 0;

  autoCallOutPins: number;

  minimumsState = 0;

  Mode3MaxBaroAlt: number;

  Mode4MaxRAAlt: number;

  /** Mode 2, excessive terrain closure rate */
  private readonly mode2 = new GpwsMode2();

  modes: ModesType[];

  PrevShouldPullUpPlay: boolean;

  AltCallState: LegacyStateMachine;

  RetardState: LegacyStateMachine;

  egpwsAlertDiscreteWord1 = Arinc429Word.empty();

  egpwsAlertDiscreteWord2 = Arinc429Word.empty();

  // eslint-disable-next-line camelcase
  constructor(
    private bus: EventBus,
    private soundManager: LegacySoundManager,
  ) {
    this.autoCallOutPins = A380X_DEFAULT_RADIO_AUTO_CALL_OUTS;

    this.minimumsState = 0;

    this.Mode3MaxBaroAlt = NaN;

    this.Mode4MaxRAAlt = NaN;

    this.modes = [
      // Mode 1
      {
        // 0: no warning, 1: "sink rate", 2 "pull up"
        current: 0,
        previous: 0,
        type: [
          {},
          { sound: soundList.sink_rate, soundPeriod: 1.1, gpwsLight: true },
          { gpwsLight: true, pullUp: true },
        ],
      },
      // Mode 2 (GpwsMode2)
      {
        // 0: no warning, 1: "terrain", 2: "pull up". TERRAIN TERRAIN, also in mode 2B: the aural_terrain voice of the
        // A32NX GPWS.
        current: 0,
        previous: 0,
        type: [{}, { sound: soundList.terrain, soundPeriod: 1.1, gpwsLight: true }, { gpwsLight: true, pullUp: true }],
      },
      // Mode 3
      {
        // 0: no warning, 1: "don't sink"
        current: 0,
        previous: 0,
        type: [{}, { sound: soundList.dont_sink, soundPeriod: 1.1, gpwsLight: true }],
      },
      // Mode 4
      {
        // 0: no warning, 1: "too low gear", 2: "too low flaps", 3: "too low terrain"
        current: 0,
        previous: 0,
        type: [
          {},
          { sound: soundList.too_low_gear, soundPeriod: 1.1, gpwsLight: true },
          { sound: soundList.too_low_flaps, soundPeriod: 1.1, gpwsLight: true },
          { sound: soundList.too_low_terrain, soundPeriod: 1.1, gpwsLight: true },
        ],
      },
      // Mode 5, not all warnings are fully implemented
      {
        // 0: no warning, 1: "glideslope", 2: "hard glideslope" (louder)
        current: 0,
        previous: 0,
        // GLIDE SLOPE repeated while below the glide slope, louder below 300 ft more than 2 dots below: the
        // aural_glideslope_quiet / _loud voices of the A32NX GPWS.
        type: [
          {},
          { sound: soundList.glideslope_quiet, soundPeriod: soundList.glideslope_quiet.length },
          { sound: soundList.glideslope_loud, soundPeriod: soundList.glideslope_loud.length },
        ],
        onChange: (current) => {
          this.setGlideSlopeWarning(current >= 1);
        },
      },
    ];

    this.PrevShouldPullUpPlay = false;

    this.AltCallState = createStateMachine(AltCallStateMachine);
    this.AltCallState.setState('ground');
    this.RetardState = createStateMachine(RetardStateMachine);
    this.RetardState.setState('landed');
  }

  gpwsUpdateDiscreteWords() {
    this.egpwsAlertDiscreteWord1.ssm = Arinc429SignStatusMatrix.NormalOperation;
    this.egpwsAlertDiscreteWord1.setBitValue(11, this.modes[0].current === 1);
    // PULL UP: mode 1 or mode 2 in one bit (separate writes would let mode 2 overwrite a mode 1 PULL UP)
    this.egpwsAlertDiscreteWord1.setBitValue(12, this.modes[0].current === 2 || this.modes[1].current === 2);
    this.egpwsAlertDiscreteWord1.setBitValue(13, this.modes[1].current === 1);
    this.egpwsAlertDiscreteWord1.setBitValue(14, this.modes[2].current === 1);
    this.egpwsAlertDiscreteWord1.setBitValue(15, this.modes[3].current === 1);
    this.egpwsAlertDiscreteWord1.setBitValue(16, this.modes[3].current === 2);
    this.egpwsAlertDiscreteWord1.setBitValue(17, this.modes[3].current === 3);
    this.egpwsAlertDiscreteWord1.setBitValue(18, this.modes[4].current === 1);
    Arinc429Word.toSimVarValue(
      'L:A32NX_EGPWS_ALERT_1_DISCRETE_WORD_1',
      this.egpwsAlertDiscreteWord1.value,
      this.egpwsAlertDiscreteWord1.ssm,
    );
    Arinc429Word.toSimVarValue(
      'L:A32NX_EGPWS_ALERT_2_DISCRETE_WORD_1',
      this.egpwsAlertDiscreteWord1.value,
      this.egpwsAlertDiscreteWord1.ssm,
    );

    this.egpwsAlertDiscreteWord2.ssm = Arinc429SignStatusMatrix.NormalOperation;
    this.egpwsAlertDiscreteWord2.setBitValue(14, false);
    Arinc429Word.toSimVarValue(
      'L:A32NX_EGPWS_ALERT_1_DISCRETE_WORD_2',
      this.egpwsAlertDiscreteWord2.value,
      this.egpwsAlertDiscreteWord2.ssm,
    );
    Arinc429Word.toSimVarValue(
      'L:A32NX_EGPWS_ALERT_2_DISCRETE_WORD_2',
      this.egpwsAlertDiscreteWord2.value,
      this.egpwsAlertDiscreteWord2.ssm,
    );
  }

  setGlideSlopeWarning(state: boolean) {
    SimVar.SetSimVarValue('L:A32NX_GPWS_GS_Warning_Active', 'Bool', state ? 1 : 0); // Still need this for XML
    this.egpwsAlertDiscreteWord2.setBitValue(11, state);
    Arinc429Word.toSimVarValue(
      'L:A32NX_EGPWS_ALERT_1_DISCRETE_WORD_2',
      this.egpwsAlertDiscreteWord2.value,
      this.egpwsAlertDiscreteWord2.ssm,
    );
    Arinc429Word.toSimVarValue(
      'L:A32NX_EGPWS_ALERT_2_DISCRETE_WORD_2',
      this.egpwsAlertDiscreteWord2.value,
      this.egpwsAlertDiscreteWord2.ssm,
    );
  }

  setGpwsWarning(state: boolean) {
    SimVar.SetSimVarValue('L:A32NX_GPWS_Warning_Active', 'Bool', state ? 1 : 0); // Still need this for XML
    this.egpwsAlertDiscreteWord2.setBitValue(12, state);
    this.egpwsAlertDiscreteWord2.setBitValue(13, state);
    Arinc429Word.toSimVarValue(
      'L:A32NX_EGPWS_ALERT_1_DISCRETE_WORD_2',
      this.egpwsAlertDiscreteWord2.value,
      this.egpwsAlertDiscreteWord2.ssm,
    );
    Arinc429Word.toSimVarValue(
      'L:A32NX_EGPWS_ALERT_2_DISCRETE_WORD_2',
      this.egpwsAlertDiscreteWord2.value,
      this.egpwsAlertDiscreteWord2.ssm,
    );
  }

  init() {
    console.log('A32NX_GPWS init');

    this.setGlideSlopeWarning(false);
    this.setGpwsWarning(false);
    this.egpwsAlertDiscreteWord1.ssm = Arinc429SignStatusMatrix.NormalOperation;
    this.egpwsAlertDiscreteWord1.setBitValue(12, false);

    // eslint-disable-next-line max-len
    NXDataStore.getAndSubscribeLegacy(
      'CONFIG_A380X_FWC_RADIO_AUTO_CALL_OUT_PINS',
      (k, v) => k === 'CONFIG_A380X_FWC_RADIO_AUTO_CALL_OUT_PINS' && (this.autoCallOutPins = Number(v)),
      A380X_DEFAULT_RADIO_AUTO_CALL_OUTS.toString(),
    );
  }

  update(deltaTime: number) {
    const throttledT = this.updateThrottler.canUpdate(deltaTime);

    if (throttledT > 0) {
      this.gpws(throttledT);
    }
  }

  gpws(deltaTime) {
    // EGPWS receives ADR1 only
    const baroAlt = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_BARO_CORRECTED_ALTITUDE_1');
    const radioAlt1 = Arinc429Word.fromSimVarValue('L:A32NX_RA_1_RADIO_ALTITUDE');
    const radioAlt2 = Arinc429Word.fromSimVarValue('L:A32NX_RA_2_RADIO_ALTITUDE');
    const radioAlt = radioAlt1.isFailureWarning() || radioAlt1.isNoComputedData() ? radioAlt2 : radioAlt1;
    const radioAltValid = radioAlt.isNormalOperation();
    const onGround = SimVar.GetSimVarValue('SIM ON GROUND', 'Bool');

    this.heightCalloutEnqueued = false;
    this.UpdateAltState(radioAltValid ? radioAlt.value : NaN);
    this.mode2.updateAirGroundState(!!onGround, deltaTime / 1000);

    const mda = SimVar.GetSimVarValue('L:AIRLINER_MINIMUM_DESCENT_ALTITUDE', 'feet');
    const dh = SimVar.GetSimVarValue('L:AIRLINER_DECISION_HEIGHT', 'feet');
    const phase = SimVar.GetSimVarValue('L:A32NX_FMGC_FLIGHT_PHASE', 'Enum');

    if (mda !== 0 || (dh !== -1 && dh !== -2 && phase === FmgcFlightPhase.Approach)) {
      let minimumsDA; // MDA or DH
      let minimumsIA; // radio or baro altitude
      if (dh >= 0) {
        minimumsDA = dh;
        minimumsIA = radioAlt.isNormalOperation() || radioAlt.isFunctionalTest() ? radioAlt.value : NaN;
      } else {
        minimumsDA = mda;
        minimumsIA = baroAlt.isNormalOperation() || baroAlt.isFunctionalTest() ? baroAlt.value : NaN;
      }
      if (Number.isFinite(minimumsDA) && Number.isFinite(minimumsIA)) {
        this.gpwsMinimums(minimumsDA, minimumsIA);
      }
    }

    const tawsSelected: number = SimVar.GetSimVarValue('L:A32NX_WXR_TAWS_SYS_SELECTED', SimVarValueType.Number);
    const gpwsFailed =
      tawsSelected === 1 || tawsSelected === 2
        ? SimVar.GetSimVarValue(`L:A32NX_GPWS_${tawsSelected}_FAILED`, 'Bool')
        : true;

    if (
      radioAltValid &&
      radioAlt.value >= 10 &&
      radioAlt.value <= 2450 &&
      !SimVar.GetSimVarValue('L:A32NX_GPWS_SYS_OFF', 'Bool') &&
      !gpwsFailed
    ) {
      // Activate between 10 - 2450 radio alt unless SYS is off
      const flapsThreeSelected = SimVar.GetSimVarValue('L:A380X_FM_LANDING_CONF3', 'Bool');
      const FlapPosition = SimVar.GetSimVarValue('L:A32NX_FLAPS_HANDLE_INDEX', 'Number');
      const FlapsInLandingConfig = flapsThreeSelected ? FlapPosition === 3 : FlapPosition === 4; // fixme should be actual flap angle
      const vSpeed = Simplane.getVerticalSpeed();
      const Airspeed = SimVar.GetSimVarValue('AIRSPEED INDICATED', 'Knots');
      const gearExtended = SimVar.GetSimVarValue('GEAR TOTAL PCT EXTENDED', 'Percent') > 0.9;

      this.updateMaxRA(radioAlt.value, onGround, phase);

      this.GPWSMode1(this.modes[0], radioAlt.value, vSpeed);
      this.modes[1].current = this.mode2.update({
        deltaTimeS: deltaTime / 1000,
        radioAltitudeFt: radioAlt.value,
        computedAirspeedKt: Airspeed,
        verticalSpeedFtMin: vSpeed,
        altitudeFt: baroAlt.isNormalOperation() ? baroAlt.value : SimVar.GetSimVarValue('PLANE ALTITUDE', 'feet'),
        landingFlaps: FlapsInLandingConfig,
        gearDown: gearExtended,
        ilsDeviationsBelowTwoDots: LegacyGpws.areIlsDeviationsBelowTwoDots(),
      });
      this.GPWSMode3(this.modes[2], radioAlt.value, phase);
      this.GPWSMode4(this.modes[3], radioAlt.value, Airspeed, FlapsInLandingConfig, gearExtended, phase);
      this.GPWSMode5(this.modes[4], radioAlt.value);
      // Stall and windshear alerts have priority over the GPWS alerts
      if (LegacyGpws.isStallOrWindshearWarningActive()) {
        this.modes.forEach((mode) => {
          mode.current = 0;
        });
      }
    } else {
      this.modes.forEach((mode) => {
        mode.current = 0;
      });
      this.mode2.reset();

      this.Mode3MaxBaroAlt = NaN;
      if (onGround || (radioAltValid && radioAlt.value < 10)) {
        this.Mode4MaxRAAlt = NaN;
      }

      this.setGlideSlopeWarning(false);
      this.setGpwsWarning(false);
    }

    this.GPWSComputeLightsAndCallouts();
    this.gpwsUpdateDiscreteWords();

    this.updateIntermediateCallout(radioAltValid ? radioAlt.value : null, onGround > 0, deltaTime / 1000);
  }

  /** Enqueues a predetermined callout: the intermediate callout counts its time from it */
  private enqueueHeightCallout(sound: string): void {
    this.heightCalloutEnqueued = true;
    this.pub.pub('enqueueSound', sound);
  }

  /**
   * The intermediate callout. It waits while the height callouts are not made: on
   * ground, climbing (the radio height increasing for 0.3 s, as the A32NX FWC), RETARD, or a GPWS alert.
   * @param radioAlt the radio height in feet, null when invalid
   * @param onGround the aircraft is on ground
   * @param deltaTimeSeconds the time since the last update
   */
  updateIntermediateCallout(radioAlt: number | null, onGround: boolean, deltaTimeSeconds: number): void {
    const increasing =
      radioAlt !== null && !Number.isNaN(this.intermediateCalloutPreviousHeight)
        ? radioAlt > this.intermediateCalloutPreviousHeight
        : false;
    this.radioHeightIncreasingSeconds = increasing ? this.radioHeightIncreasingSeconds + deltaTimeSeconds : 0;
    this.intermediateCalloutPreviousHeight = radioAlt ?? NaN;
    const climbing = this.radioHeightIncreasingSeconds >= 0.3;
    const gpwsAlert = this.modes.some((mode) => mode.current > 0);
    const inhibited = onGround || climbing || gpwsAlert || this.RetardState.value === 'retardPlaying';

    const words = this.intermediateCallout.update(radioAlt, this.heightCalloutEnqueued, inhibited, deltaTimeSeconds);
    for (const word of words) {
      this.pub.pub('enqueueSound', word);
    }
  }

  updateMaxRA(radioAlt, onGround, phase) {
    // on ground check is to get around the fact that radio alt is set to around 300 while loading
    if (onGround || phase === FmgcFlightPhase.GoAround) {
      this.Mode4MaxRAAlt = NaN;
    } else if (this.Mode4MaxRAAlt < radioAlt || Number.isNaN(this.Mode4MaxRAAlt)) {
      this.Mode4MaxRAAlt = radioAlt;
    }
  }

  gpwsMinimums(minimumsDA, minimumsIA) {
    let over100Above = false;
    let overMinimums = false;

    if (minimumsDA <= 90) {
      overMinimums = minimumsIA >= minimumsDA + 15;
      over100Above = minimumsIA >= minimumsDA + 115;
    } else {
      overMinimums = minimumsIA >= minimumsDA + 5;
      over100Above = minimumsIA >= minimumsDA + 105;
    }
    if (this.minimumsState === 0 && overMinimums) {
      this.minimumsState = 1;
    } else if (this.minimumsState === 1 && over100Above) {
      this.minimumsState = 2;
    } else if (this.minimumsState === 2 && !over100Above) {
      this.enqueueHeightCallout('hundred_above');
      this.minimumsState = 1;
    } else if (this.minimumsState === 1 && !overMinimums) {
      this.enqueueHeightCallout('minimums');
      this.minimumsState = 0;
    }
  }

  GPWSComputeLightsAndCallouts() {
    this.modes.forEach((mode) => {
      if (mode.current === mode.previous) {
        return;
      }

      const previousType = mode.type[mode.previous];
      this.soundManager.removePeriodicSound(previousType.sound);

      const currentType = mode.type[mode.current];
      this.soundManager.addPeriodicSound(currentType.sound, currentType.soundPeriod);

      if (mode.onChange) {
        mode.onChange(mode.current, mode.previous);
      }

      mode.previous = mode.current;
    });

    const activeTypes = this.modes.map((mode) => mode.type[mode.current]);

    const shouldPullUpPlay = activeTypes.some((type) => type.pullUp);
    if (shouldPullUpPlay !== this.PrevShouldPullUpPlay) {
      if (shouldPullUpPlay) {
        this.soundManager.addPeriodicSound(soundList.pull_up, 1.1);
      } else {
        this.soundManager.removePeriodicSound(soundList.pull_up);
      }
      this.PrevShouldPullUpPlay = shouldPullUpPlay;
    }

    const illuminateGpwsLight = activeTypes.some((type) => type.gpwsLight);
    this.setGpwsWarning(illuminateGpwsLight);
  }

  /**
   * Compute the GPWS Mode 1 state.
   * @param mode - The mode object which stores the state.
   * @param radioAlt - Radio altitude in feet
   * @param vSpeed - Vertical speed, in feet/min, should be inertial vertical speed, not sure if simconnect provides that
   */
  GPWSMode1(mode, radioAlt, vSpeed) {
    const sinkrate = -vSpeed;

    if (sinkrate <= 1000) {
      mode.current = 0;
      return;
    }

    const maxSinkrateAlt = 0.61 * sinkrate - 600;
    const maxPullUpAlt = sinkrate < 1700 ? 1.3 * sinkrate - 1940 : 0.4 * sinkrate - 410;

    if (radioAlt <= maxPullUpAlt) {
      mode.current = 2;
    } else if (radioAlt <= maxSinkrateAlt) {
      mode.current = 1;
    } else {
      mode.current = 0;
    }
  }

  /**
   * Compute the GPWS Mode 3 state.
   * @param mode - The mode object which stores the state.
   * @param radioAlt - Radio altitude in feet
   * @param phase - Flight phase index
   * @param FlapsInLandingConfig - If flaps is in landing config
   * @constructor
   */
  GPWSMode3(mode, radioAlt, phase) {
    if (
      !(phase === FmgcFlightPhase.Takeoff || phase === FmgcFlightPhase.GoAround) ||
      radioAlt > 1500 ||
      radioAlt < 10
    ) {
      this.Mode3MaxBaroAlt = NaN;
      mode.current = 0;
      return;
    }

    const baroAlt = SimVar.GetSimVarValue('PLANE ALTITUDE', 'feet');

    const maxAltLoss = 0.09 * radioAlt + 7.1;

    if (baroAlt > this.Mode3MaxBaroAlt || Number.isNaN(this.Mode3MaxBaroAlt)) {
      this.Mode3MaxBaroAlt = baroAlt;
      mode.current = 0;
    } else if (this.Mode3MaxBaroAlt - baroAlt > maxAltLoss) {
      mode.current = 1;
    } else {
      mode.current = 0;
    }
  }

  /**
   * Compute the GPWS Mode 4 state.
   * @param mode - The mode object which stores the state.
   * @param radioAlt - Radio altitude in feet
   * @param speed - Airspeed in knots.
   * @param FlapsInLandingConfig - If flaps is in landing config
   * @param gearExtended - If the gear is extended
   * @param phase - Flight phase index
   * @constructor
   */
  GPWSMode4(mode, radioAlt, speed, FlapsInLandingConfig, gearExtended, phase) {
    if (radioAlt < 30 || radioAlt > 1000) {
      mode.current = 0;
      return;
    }
    // FLAP MODE OFF on the MFD SURV CONTROLS page inhibits mode 4B TOO LOW FLAPS
    const FlapModeOff = SimVar.GetSimVarValue('L:A32NX_GPWS_FLAPS_OFF', 'Bool');

    // Mode 4 A and B logic: mode 4A gives TOO LOW TERRAIN instead of TOO LOW GEAR above 200 kt, mode 4B instead of
    // TOO LOW FLAPS above 180 kt (A380 values, not the A320 190 kt and 159 kt). The ceiling is flat, 500 ft (4A) and
    // 245 ft (4B); when the crew cannot rely on the TAD function it rises to 1 000 ft (design choice: reached at
    // 250 kt, as on the A320; the published envelope is not precise enough to read the speed).
    const terrainFunctionOperative = LegacyGpws.isTerrainFunctionOperative();
    // Each branch sets mode.current in every case, so the alert stops when the aircraft climbs back above the ceiling
    // at a low speed (no TOO LOW TERRAIN).
    if (!gearExtended && !FlapsInLandingConfig && phase === FmgcFlightPhase.Approach) {
      // Mode 4A: landing gear up and the flaps not in the landing configuration
      if (speed < LegacyGpws.MODE_4A_TERRAIN_SPEED_KT) {
        mode.current = radioAlt < 500 ? 1 : 0;
      } else {
        const maxWarnAlt = terrainFunctionOperative
          ? 500
          : 500 + ((speed - LegacyGpws.MODE_4A_TERRAIN_SPEED_KT) * (1000 - 500)) / (250 - 200);
        mode.current = radioAlt < maxWarnAlt ? 3 : 0;
      }
    } else if (!gearExtended && phase === FmgcFlightPhase.Approach) {
      // Mode 4B, landing gear up and the flaps in the landing configuration: TOO LOW GEAR only, no TOO LOW TERRAIN at
      // any speed. The ceiling is a flat 245 ft up to 400 kt, with no variant for an inoperative TERR function.
      // Design choice: FLAP MODE OFF does not inhibit it; the button is for a landing with an abnormal flaps
      // configuration and only the flaps signal changes with it (the gear-up warning stays).
      mode.current = radioAlt < 245 ? 1 : 0;
    } else if (!FlapsInLandingConfig && !FlapModeOff && phase === FmgcFlightPhase.Approach) {
      // Mode 4B: landing gear down and the flaps not in the landing configuration
      if (speed < LegacyGpws.MODE_4B_TERRAIN_SPEED_KT) {
        mode.current = radioAlt < 245 ? 2 : 0;
      } else {
        const maxWarnAlt = terrainFunctionOperative
          ? 245
          : 245 + ((speed - LegacyGpws.MODE_4B_TERRAIN_SPEED_KT) * (1000 - 245)) / (250 - 180);
        mode.current = radioAlt < maxWarnAlt ? 3 : 0;
      }
    } else {
      mode.current = 0;
    }
    if (!FlapsInLandingConfig || !gearExtended) {
      const maxWarnAltSpeed = Math.max(Math.min(8.3333 * speed - 1083.33, 1000), 500);
      const maxWarnAlt = 0.750751 * this.Mode4MaxRAAlt - 0.750751;

      if (this.Mode4MaxRAAlt > 100 && radioAlt < maxWarnAltSpeed && radioAlt < maxWarnAlt) {
        mode.current = 3;
      }
    }
  }

  /**
   * Compute the GPWS Mode 5 state.
   * @param mode - The mode object which stores the state.
   * @param - radioAlt Radio altitude in feet
   * @constructor
   */
  GPWSMode5(mode, radioAlt) {
    if (radioAlt > 1000 || radioAlt < 30 || SimVar.GetSimVarValue('L:A32NX_GPWS_GS_OFF', 'Bool')) {
      mode.current = 0;
      return;
    }
    if (!SimVar.GetSimVarValue('L:A32NX_RADIO_RECEIVER_GS_IS_VALID', 'number')) {
      mode.current = 0;
      return;
    }
    const error = SimVar.GetSimVarValue('L:A32NX_RADIO_RECEIVER_GS_DEVIATION', 'number');
    const dots = -error * 2.5; // According to the FCOM, one dot is approx. 0.4 degrees. 1/0.4 = 2.5

    const minAltForWarning = dots < 2.9 ? -75 * dots + 247.5 : 30;
    const minAltForHardWarning = dots < 3.8 ? -66.66 * dots + 283.33 : 30;

    if (dots > 2 && radioAlt > minAltForHardWarning && radioAlt < 350) {
      mode.current = 2;
    } else if (dots > 1.3 && radioAlt > minAltForWarning) {
      mode.current = 1;
    } else {
      mode.current = 0;
    }
  }

  UpdateAltState(radioAlt) {
    if (Number.isNaN(radioAlt)) {
      return;
    }
    switch (this.AltCallState.value) {
      case 'ground':
        if (radioAlt > 6) {
          this.AltCallState.action('up');
        }
        break;
      case 'over5':
        if (radioAlt > 12) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 6) {
          if (this.RetardState.value !== 'retardPlaying' && this.autoCallOutPins & A380XRadioAutoCallOutFlags.Five) {
            this.enqueueHeightCallout('alt_5');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over10':
        if (radioAlt > 22) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 12) {
          if (this.RetardState.value !== 'retardPlaying' && this.autoCallOutPins & A380XRadioAutoCallOutFlags.Ten) {
            this.enqueueHeightCallout('alt_10');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over20':
        if (radioAlt > 32) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 22) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.Twenty) {
            this.enqueueHeightCallout('alt_20');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over30':
        if (radioAlt > 42) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 32) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.Thirty) {
            this.enqueueHeightCallout('alt_30');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over40':
        if (radioAlt > 53) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 42) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.Forty) {
            this.enqueueHeightCallout('alt_40');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over50':
        if (radioAlt > 65) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 53) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.Fifty) {
            this.enqueueHeightCallout('alt_50');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over60':
        if (radioAlt > 75) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 63) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.Sixty) {
            this.enqueueHeightCallout('alt_60');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over70':
        if (radioAlt > 85) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 73) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.Seventy) {
            this.enqueueHeightCallout('alt_70');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over80':
        if (radioAlt > 95) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 83) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.Eighty) {
            this.enqueueHeightCallout('alt_80');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over90':
        if (radioAlt > 110) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 93) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.Ninety) {
            this.enqueueHeightCallout('alt_90');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over100':
        if (radioAlt > 210) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 110) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.OneHundred) {
            this.enqueueHeightCallout('alt_100');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over200':
        if (radioAlt > 310) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 210) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.TwoHundred) {
            this.enqueueHeightCallout('alt_200');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over300':
        if (radioAlt > 410) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 310) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.ThreeHundred) {
            this.enqueueHeightCallout('alt_300');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over400':
        if (radioAlt > 513) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 410) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.FourHundred) {
            this.enqueueHeightCallout('alt_400');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over500':
        if (radioAlt > 1020) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 513) {
          // FIVE HUNDRED, or smart FIVE HUNDRED: only when off the glide by more than half a dot
          const glideValid = SimVar.GetSimVarValue('L:A32NX_RADIO_RECEIVER_GS_IS_VALID', 'number') > 0;
          // one dot is approx. 0.4 degrees, as in GPWSMode5
          const glideDots = SimVar.GetSimVarValue('L:A32NX_RADIO_RECEIVER_GS_DEVIATION', 'number') * 2.5;
          if (isFiveHundredCalloutDue(this.autoCallOutPins, glideValid, glideDots)) {
            this.enqueueHeightCallout('alt_500');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over1000':
        if (radioAlt > 2020) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 1020) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.OneThousand) {
            this.enqueueHeightCallout('alt_1000');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over2000':
        if (radioAlt > 2530) {
          this.AltCallState.action('up');
        } else if (radioAlt <= 2020) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.TwoThousand) {
            this.enqueueHeightCallout('alt_2000');
          }
          this.AltCallState.action('down');
        }
        break;
      case 'over2500':
        if (radioAlt <= 2530) {
          if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.TwoThousandFiveHundred) {
            this.enqueueHeightCallout('alt_2500');
          } else if (this.autoCallOutPins & A380XRadioAutoCallOutFlags.TwentyFiveHundred) {
            this.enqueueHeightCallout('alt_2500b');
          }
          this.AltCallState.action('down');
        }
        break;
      default:
        break;
    }

    switch (this.RetardState.value) {
      case 'overRetard':
        if (radioAlt < 20) {
          if (!SimVar.GetSimVarValue('L:A32NX_AUTOPILOT_ACTIVE', 'Bool')) {
            this.RetardState.action('play');
            this.enqueueHeightCallout('retard');
          } else if (radioAlt < 10) {
            this.RetardState.action('play');
            this.enqueueHeightCallout('retard');
          }
        }
        break;
      case 'retardPlaying':
        if (
          SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:1', 'number') < 2.6 ||
          SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:2', 'number') < 2.6 ||
          SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:3', 'number') < 2.6 ||
          SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:4', 'number') < 2.6
        ) {
          this.RetardState.action('land');
          this.pub.pub('dequeueSound', 'retard');
        } else if (
          SimVar.GetSimVarValue('L:A32NX_FMGC_FLIGHT_PHASE', 'Enum') === FmgcFlightPhase.GoAround ||
          radioAlt > 20
        ) {
          this.RetardState.action('go_around');
          this.pub.pub('dequeueSound', 'retard');
        }
        break;
      case 'landed':
        if (radioAlt > 20) {
          this.RetardState.action('up');
        }
        break;
      default:
        break;
    }
  }
}

const RetardStateMachine = {
  overRetard: { transitions: { play: { target: 'retardPlaying' } } },
  retardPlaying: {
    transitions: {
      land: { target: 'landed' },
      go_around: { target: 'overRetard' },
    },
  },
  landed: { transitions: { up: { target: 'overRetard' } } },
};

const AltCallStateMachine = {
  init: 'ground',
  over2500: { transitions: { down: { target: 'over2000' } } },
  over2000: {
    transitions: {
      down: { target: 'over1000' },
      up: { target: 'over2500' },
    },
  },
  over1000: {
    transitions: {
      down: { target: 'over500' },
      up: { target: 'over2000' },
    },
  },
  over500: {
    transitions: {
      down: { target: 'over400' },
      up: { target: 'over1000' },
    },
  },
  over400: {
    transitions: {
      down: { target: 'over300' },
      up: { target: 'over500' },
    },
  },
  over300: {
    transitions: {
      down: { target: 'over200' },
      up: { target: 'over400' },
    },
  },
  over200: {
    transitions: {
      down: { target: 'over100' },
      up: { target: 'over300' },
    },
  },
  over100: {
    transitions: {
      down: { target: 'over90' },
      up: { target: 'over200' },
    },
  },
  over90: {
    transitions: {
      down: { target: 'over80' },
      up: { target: 'over100' },
    },
  },
  over80: {
    transitions: {
      down: { target: 'over70' },
      up: { target: 'over90' },
    },
  },
  over70: {
    transitions: {
      down: { target: 'over60' },
      up: { target: 'over80' },
    },
  },
  over60: {
    transitions: {
      down: { target: 'over50' },
      up: { target: 'over70' },
    },
  },
  over50: {
    transitions: {
      down: { target: 'over40' },
      up: { target: 'over60' },
    },
  },
  over40: {
    transitions: {
      down: { target: 'over30' },
      up: { target: 'over50' },
    },
  },
  over30: {
    transitions: {
      down: { target: 'over20' },
      up: { target: 'over40' },
    },
  },
  over20: {
    transitions: {
      down: { target: 'over10' },
      up: { target: 'over30' },
    },
  },
  over10: {
    transitions: {
      down: { target: 'over5' },
      up: { target: 'over20' },
    },
  },
  over5: {
    transitions: {
      down: { target: 'ground' },
      up: { target: 'over10' },
    },
  },
  ground: { transitions: { up: { target: 'over5' } } },
};

type LegacyStateMachine = {
  value: string;
  action(event: string): void;
  setState(newState: string): void;
};

const createStateMachine = (machineDef: any): LegacyStateMachine => {
  const machine = {
    value: machineDef.init,
    action(event: string) {
      const currStateDef = machineDef[machine.value];
      const destTransition = currStateDef.transitions[event];
      if (!destTransition) {
        return;
      }
      const destState = destTransition.target;

      machine.value = destState;
    },
    setState(newState: string) {
      const valid = machineDef[newState];
      if (valid) {
        machine.value = newState;
      }
    },
  };
  return machine;
};
