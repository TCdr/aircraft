// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';

import {
  AeroMath,
  ArraySubject,
  ClockEvents,
  FSComponent,
  MappedSubject,
  NumberFormatter,
  NumberUnitSubject,
  Subject,
  Subscribable,
  Subscription,
  UnitType,
  VNode,
} from '@microsoft/msfs-sdk';

import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { RadioButtonGroup } from '../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { AbstractMfdPageProps } from '../../MFD';
import { Footer } from '../common/Footer';

import './MfdFmsPerf.scss';
import {
  AltitudeFormat,
  AltitudeOrFlightLevelFormat,
  CostIndexFormat,
  DescentRateFormat,
  FlightLevelFormat,
  LengthFormat,
  PercentageFormat,
  QnhFormat,
  RadioAltitudeFormat,
  SpeedKnotsFormat,
  SpeedMachFormat,
  TemperatureFormat,
  WindDirectionFormat,
  WindSpeedFormat,
} from '../common/DataEntryFormats';
import { maxCertifiedAlt, Mmo, Vmo } from '@shared/PerformanceConstants';
import { ConfirmationDialog } from '../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import { FmsPage } from '../common/FmsPage';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FmgcData } from '../../FMC/fmgc';
import { ConditionalComponent } from '../../../MsfsAvionicsCommon/UiWidgets/ConditionalComponent';
import { MfdSimvars } from '../../shared/MFDSimvarPublisher';
import { VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { NXSystemMessages } from '../../shared/NXSystemMessages';
import { qnhToMillibar } from '../../shared/QnhUtils';
import { CompanyTakeoffDataButton } from './MfdFmsCpnyToRequest';
import {
  getEtaFromUtcOrPresent as getEtaUtcOrFromPresent,
  getApproachName,
  showReturnButtonUriExtra,
} from '../../shared/utils';
import { ApproachType, NXDataStore } from '@flybywiresim/fbw-sdk';
import { MfdFmsFplnVertRev } from './F-PLN/MfdFmsFplnVertRev';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanChangeNotifier } from '@fmgc/flightplanning/sync/FlightPlanChangeNotifier';
import {
  ClimbDerated,
  CostIndexMode,
  TakeoffAntiIce,
  TakeoffDerated,
  TakeoffPacks,
  TakeoffPowerSetting,
} from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { fcomAt, fcomCentre, fcomLine, fcomRight, fcomTabBar } from '../common/FcomLayout';
import { longRangeCruiseMach, maxTurbulenceMach, maxTurbulenceSpeedKnots } from '../../FMC/CruiseSpeeds';

interface MfdFmsPerfProps extends AbstractMfdPageProps {}

enum FlightPhaseTabIndex {
  Takeoff = 0,
  Climb = 1,
  Cruise = 2,
  Descent = 3,
  Approach = 4,
  GoAround = 5,
}

export class MfdFmsPerf extends FmsPage<MfdFmsPerfProps> {
  /** FCOM DSC-22-FMS-20-30 P 34 / P 231: the tab panels span y = 266 to 890 of the display */
  private static readonly panelFrameStyle = 'flex: 0 0 auto; box-sizing: border-box; height: 624px;';

  /** T.O panel: origin of its content at display x = 12, y = 274 */
  private static readonly panelStyle = `${MfdFmsPerf.panelFrameStyle} padding: 8px 0 0 1px;`;

  private readonly weightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((v) =>
    v ? UnitType.KILOGRAM : UnitType.POUND,
  );
  private readonly weightUnitText = this.weightUnit.map((v) => (v === UnitType.KILOGRAM ? 'T' : 'KLB'));

  private readonly weightFormatter = NumberFormatter.create({
    nanString: '---.-',
    precision: 0.1,
  });

  private vdevSub: Subscription | null = null;

  private readonly flightPlanChangeNotifier = new FlightPlanChangeNotifier(this.props.bus);

  private readonly isActiveOrCopyOfActive = Subject.create(false);

  private readonly destEfobAmber = MappedSubject.create(
    ([destEfobBelowM, loadedFpIndex]) => destEfobBelowM && loadedFpIndex === FlightPlanIndex.Active,
    this.props.fmcService.master.fmgc.data.destEfobBelowMinInActive,
    this.loadedFlightPlanIndex,
  );

  private readonly mandatoryAndActiveFpln = this.loadedFlightPlanIndex.map(
    (it) => it === FlightPlanIndex.Active || it === FlightPlanIndex.Temporary,
  );

  private readonly approachParametersMandatory = Subject.create<boolean>(false);

  private readonly visibilityConsideringFlightPlanIndex = this.loadedFlightPlanIndex.map((it) =>
    it === FlightPlanIndex.Active || it === FlightPlanIndex.Temporary ? 'inherit' : 'hidden',
  );

  private approachPhaseConfirmationDialogVisible = Subject.create<boolean>(false);

  private readonly activateApprButtonVisibility = MappedSubject.create(
    ([fp, flightPlanIndex]) =>
      (flightPlanIndex === FlightPlanIndex.Active || flightPlanIndex === FlightPlanIndex.Temporary) &&
      (fp === FmgcFlightPhase.Climb ||
        fp === FmgcFlightPhase.Cruise ||
        fp === FmgcFlightPhase.Descent ||
        fp === FmgcFlightPhase.GoAround)
        ? 'visible'
        : 'hidden',
    this.activeFlightPhase,
    this.loadedFlightPlanIndex,
  );

  private clearEoConfirmationDialogVisible = Subject.create<boolean>(false);

  private readonly clearEoButtonVisibility = this.eoActive.map((eo) => (eo ? 'visible' : 'hidden'));

  private managedSpeedActive = Subject.create<boolean>(false);

  private previousFmsFlightPhase: FmgcFlightPhase | null = null;

  // Subjects
  private readonly crzFl = Subject.create<number | null>(null);

  private readonly crzFlIsMandatory = Subject.create(true);

  private readonly recMaxFl = Subject.create<string>('---');
  private readonly recMaxFlNotAvail = Subject.create<boolean>(false);

  private readonly optFl = Subject.create<string>('---');
  private readonly optFlNotAvail = Subject.create<boolean>(false);

  private readonly eoMaxFl = Subject.create<string>('---');
  private readonly eoMaxFlNotAvail = Subject.create<boolean>(false);

  /** FCOM DSC-22-FMS-20-30 PERF page: in engine-out, the REC MAX label reads EO MAX in amber (EO maximum FL) */
  private readonly maxFlLabel = this.eoActive.map((eo) => (eo ? 'EO MAX' : 'REC MAX'));

  private readonly maxFlDisplay = MappedSubject.create(
    ([eo, recMax, eoMax]) => (eo ? eoMax : recMax),
    this.eoActive,
    this.recMaxFl,
    this.eoMaxFl,
  );

  private readonly maxFlNotAvail = MappedSubject.create(
    ([eo, recMaxNotAvail, eoMaxNotAvail]) => (eo ? eoMaxNotAvail : recMaxNotAvail),
    this.eoActive,
    this.recMaxFlNotAvail,
    this.eoMaxFlNotAvail,
  );

  private readonly flightPhasesSelectedPageIndex = Subject.create(FlightPhaseTabIndex.Takeoff);

  private readonly highlightedTab = this.activeFlightPhase.map((fp) => fp - 1);

  private readonly costIndex = Subject.create<number | null>(null);

  /** in feet */
  private readonly transAlt = Subject.create<number | null>(null);

  private readonly transitionAltitudeIsFromDatabase = Subject.create<boolean>(false);
  private readonly transAltIsPilotEntered = this.transitionAltitudeIsFromDatabase.map((it) => !it);

  private readonly thrRedAlt = Subject.create<number | null>(null);

  private readonly thrRedAltIsPilotEntered = Subject.create<boolean>(false);

  private readonly accelAlt = Subject.create<number | null>(null);

  private readonly accelAltIsPilotEntered = Subject.create<boolean>(false);

  private readonly noiseEndAltitude = Subject.create<number | null>(800);

  private showNoiseFields(visible: boolean) {
    // Only check for one, if one is instantiated the rest also is
    if (this.toNoiseButtonRef.getOrDefault()) {
      if (visible) {
        // TO page
        this.toNoiseButtonRef.instance.style.display = 'none';
        this.toNoiseEndLabelRef.instance.style.display = 'flex';
        this.toNoiseEndInputRef.instance.style.display = 'flex';
        this.toNoiseFieldsRefs.forEach((el) => {
          el.instance.style.visibility = 'visible';
        });
      } else {
        // TO page
        this.toNoiseButtonRef.instance.style.display = 'flex';
        this.toNoiseEndLabelRef.instance.style.display = 'none';
        this.toNoiseEndInputRef.instance.style.display = 'none';
        this.toNoiseFieldsRefs.forEach((el) => {
          el.instance.style.visibility = 'hidden';
        });
      }
    }
  }

  private readonly toPageInactive = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => isActiveOrCopyOfActive && flightPhase >= FmgcFlightPhase.Takeoff,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );
  private readonly clbPageInactive = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => isActiveOrCopyOfActive && flightPhase > FmgcFlightPhase.Climb,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );

  private readonly atOrAfterClimbPhase = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => isActiveOrCopyOfActive && flightPhase >= FmgcFlightPhase.Climb,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );

  private readonly crzPageInactive = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => isActiveOrCopyOfActive && flightPhase > FmgcFlightPhase.Cruise,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );
  private readonly desPageInactive = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => isActiveOrCopyOfActive && flightPhase > FmgcFlightPhase.Descent,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );

  private readonly notYetInClimb = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => !isActiveOrCopyOfActive || flightPhase < FmgcFlightPhase.Climb,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );
  private readonly notYetInCruise = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => !isActiveOrCopyOfActive || flightPhase < FmgcFlightPhase.Cruise,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );
  private readonly notYetInDescent = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => !isActiveOrCopyOfActive || flightPhase < FmgcFlightPhase.Descent,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );
  private readonly notInDescent = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => !isActiveOrCopyOfActive || flightPhase !== FmgcFlightPhase.Descent,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );

  // TO page subjects, refs and methods
  private readonly originRunwayIdent = Subject.create<string>('---');

  private readonly toShift = Subject.create<number | null>(null);

  private readonly toV1 = Subject.create<number | null>(null);

  private readonly toVR = Subject.create<number | null>(null);

  private readonly toV2 = Subject.create<number | null>(null);

  private readonly toGreenDotSpeed = Subject.create<number | null>(null);

  private readonly toFlapRetractionSpeed = Subject.create<number | null>(null);

  private readonly toSlatRetractionSpeed = Subject.create<number | null>(null);

  private readonly takeoffFlaps = Subject.create<number | null>(null);
  private readonly toSelectedFlapsIndex = this.takeoffFlaps.map((flaps) =>
    flaps !== null && flaps > 0 ? flaps - 1 : null,
  );

  private vSpeedsConfirmationRef = [
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
  ];

  private flapSpeedsRef = [
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
  ];

  private shouldShowConfirmVSpeeds() {
    const pd = this.loadedFlightPlan?.performanceData;
    const fm = this.props.fmcService.master.fmgc.data;

    if (!pd || !fm) {
      return;
    }

    const vSpeedSet = pd.v1 !== undefined || pd.vr !== undefined || pd.v2 !== undefined;
    const tbc =
      fm.v1ToBeConfirmed.get() !== null || fm.vrToBeConfirmed.get() !== null || fm.v2ToBeConfirmed.get() !== null;
    this.showConfirmVSpeeds(!vSpeedSet && tbc);
  }

  private showConfirmVSpeeds(visible: boolean) {
    if (visible) {
      this.flapSpeedsRef.forEach((ref) => {
        if (ref.getOrDefault()) {
          ref.instance.style.display = 'none';
        }
      });
      this.vSpeedsConfirmationRef.forEach((ref) => {
        if (ref.getOrDefault()) {
          ref.instance.style.display = 'flex';
        }
      });
    } else {
      this.flapSpeedsRef.forEach((ref) => {
        if (ref.getOrDefault()) {
          ref.instance.style.display = 'flex';
        }
      });
      this.vSpeedsConfirmationRef.forEach((ref) => {
        if (ref.getOrDefault()) {
          ref.instance.style.display = 'none';
        }
      });
    }
  }

  private readonly toFlexTemp = Subject.create<number | null>(null);

  private readonly takeoffShiftDisabled = Subject.create(false);

  private readonly takeoffShiftMaxValueMeters = Subject.create<number>(Infinity);

  private readonly takeoffPowerSetting = Subject.create<TakeoffPowerSetting | null>(null);

  private readonly takeoffThsFor = Subject.create<number | null>(null);

  private readonly takeoffPacks = Subject.create<TakeoffPacks | null>(null);

  private readonly takeoffAntiIce = Subject.create<TakeoffAntiIce | null>(null);

  private readonly takeoffDerated = Subject.create<TakeoffDerated | null>(null);

  private readonly eoAccelAlt = Subject.create<number | null>(null);

  private readonly eoAccelAltIsPilotEntered = Subject.create<boolean>(false);

  private readonly toFlexInputRef = FSComponent.createRef<HTMLDivElement>();

  private readonly toDeratedInputRef = FSComponent.createRef<HTMLDivElement>();

  private readonly toDeratedThrustOptions = ArraySubject.create(['D01', 'D02', 'D03', 'D04', 'D05']);

  private toThrustSettingChanged(newIndex: TakeoffPowerSetting) {
    const fpIndex = this.loadedFlightPlanIndex.get();
    this.props.flightPlanInterface.setPerformanceData('takeoffPowerSetting', newIndex, fpIndex);
    this.showToThrustSettings(newIndex);

    if (fpIndex === FlightPlanIndex.Active) {
      if (newIndex === TakeoffPowerSetting.FLEX) {
        const flex = this.props.flightPlanInterface.active.performanceData.flexTakeoffTemperature.get();
        // FLEX
        SimVar.SetSimVarValue('L:A32NX_AIRLINER_TO_FLEX_TEMP', 'Number', flex === 0 ? 0.1 : flex ?? 0);
      } else if (newIndex === TakeoffPowerSetting.DERATED) {
        // DERATED
        SimVar.SetSimVarValue('L:A32NX_AIRLINER_TO_FLEX_TEMP', 'Number', 0); // 0 meaning no FLEX
      } else {
        // TOGA
        SimVar.SetSimVarValue('L:A32NX_AIRLINER_TO_FLEX_TEMP', 'Number', 0); // 0 meaning no FLEX
      }
    }
  }

  private showToThrustSettings(st: TakeoffPowerSetting) {
    if (this.toFlexInputRef.getOrDefault() && this.toDeratedInputRef.getOrDefault()) {
      if (st === TakeoffPowerSetting.FLEX) {
        this.toFlexInputRef.instance.style.visibility = 'visible';
        this.toDeratedInputRef.instance.style.visibility = 'hidden';
      } else if (st === TakeoffPowerSetting.DERATED) {
        this.toFlexInputRef.instance.style.visibility = 'hidden';
        this.toDeratedInputRef.instance.style.visibility = 'visible';
      } else {
        this.toFlexInputRef.instance.style.visibility = 'hidden';
        this.toDeratedInputRef.instance.style.visibility = 'hidden';
      }
    }
  }

  private toDeratedDialogVisible = Subject.create(false);

  private toDeratedDialogTitle = Subject.create<string>('');

  private toDeratedThrustPrevious: TakeoffDerated | null = null;

  private toDeratedThrustNext: TakeoffDerated | null = null;

  private takeoffDeratedSelected() {
    this.toDeratedDialogVisible.set(true);
  }

  private toNoiseFieldsRefs = [
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
    FSComponent.createRef<HTMLDivElement>(),
  ];

  private toNoiseButtonRef = FSComponent.createRef<HTMLDivElement>();

  private toNoiseEndLabelRef = FSComponent.createRef<HTMLSpanElement>();

  private toNoiseEndInputRef = FSComponent.createRef<HTMLDivElement>();

  public readonly noiseEnabled = Subject.create<boolean>(false);
  public readonly noiseN1 = Subject.create<number | null>(null);
  public readonly noiseSpeed = Subject.create<number | null>(null);

  private readonly toThrustSettingsDisabled = this.activeFlightPhase.map((it) => [
    ...Array(2).fill(it >= FmgcFlightPhase.Takeoff),
    true,
  ]);

  // FCOM DSC-22-FMS-20-30 PERF page: the CI field has no LRC / ECON mode selector
  private readonly costIndexDisabled = MappedSubject.create(
    ([flightPhase, isActiveOrCopyOfActive]) => flightPhase >= FmgcFlightPhase.Descent && isActiveOrCopyOfActive,
    this.activeFlightPhase,
    this.isActiveOrCopyOfActive,
  );

  private readonly speedConstraintSpeed = Subject.create<number | null>(null);

  private readonly speedConstraintAltitude = Subject.create<number | null>(null);

  private readonly speedConstraintReason = this.speedConstraintAltitude.map((v) => (v ? (v / 100).toFixed(0) : null));

  // CLB page subjects, refs and methods
  private clbTableModeLine1 = Subject.create<string | null>('PRESEL');

  private clbTableSpdLine1 = Subject.create<string | null>(null);

  private clbTableMachLine1 = Subject.create<string | null>(null);

  private clbTablePredLine1 = Subject.create<string | null>('--:--   ----');

  private clbTableModeLine2 = Subject.create<string | null>('MANAGED');

  private clbTableSpdLine2 = Subject.create<string | null>('250');

  private readonly clbTableSpdLine2Unit = this.clbTableSpdLine2.map((it) => (it ? 'KT' : ''));

  private clbTableMachLine2 = Subject.create<string | null>(null);

  private clbTablePredLine2 = Subject.create<string | null>(null);

  private clbTableModeLine3 = Subject.create<string | null>('ECON');

  private clbTableSpdLine3 = Subject.create<string | null>('314');

  private readonly clbTableSpdLine3Unit = this.clbTableSpdLine3.map((it) => (it ? 'KT' : ''));

  private clbTableMachLine3 = Subject.create<string | null>('.82');

  private clbTablePredLine3 = Subject.create<string | null>(null);

  private readonly climbPreselectedSpeed = Subject.create<number | null>(null);

  private readonly climbPreSelSpeedGreen = MappedSubject.create(
    ([fp, pSpeed, eo]) =>
      (fp >= FmgcFlightPhase.Climb && fp <= FmgcFlightPhase.Descent && !eo) ||
      (fp < FmgcFlightPhase.Climb && Number.isFinite(pSpeed)),
    this.activeFlightPhase,
    this.climbPreselectedSpeed,
    this.eoActive,
  );

  private readonly climbPreSelSpeedAmber = MappedSubject.create(
    ([fp, eo]) => fp >= FmgcFlightPhase.Climb && fp <= FmgcFlightPhase.Descent && eo,
    this.activeFlightPhase,
    this.eoActive,
  );

  private readonly climbPreSelManagedSpeedGreen = MappedSubject.create(
    ([fp, pSpeed]) =>
      (fp >= FmgcFlightPhase.Climb && fp <= FmgcFlightPhase.Descent) || (fp < FmgcFlightPhase.Climb && pSpeed === null),
    this.activeFlightPhase,
    this.climbPreselectedSpeed,
  );

  public readonly climbDerated = Subject.create<ClimbDerated | null>(null);

  // CRZ page subjects, refs and methods
  private crzPredStepRef = FSComponent.createRef<HTMLDivElement>();

  private crzPredTdRef = FSComponent.createRef<HTMLDivElement>();

  private crzPredStepAheadRef = FSComponent.createRef<HTMLDivElement>();

  private crzPredDriftDownRef = FSComponent.createRef<HTMLDivElement>();

  private crzPredWaypoint = Subject.create<string>('');

  /** in feet */
  private crzPredAltitudeTarget = Subject.create<number | null>(null);

  private crzTableModeLine1 = Subject.create<string | null>('PRESEL');

  private crzTableSpdLine1 = Subject.create<string | null>(null);

  private crzTableMachLine1 = Subject.create<string | null>(null);

  private crzTablePredLine1 = Subject.create<string | null>(null);

  private readonly crzTablePredLine1Unit = this.crzTablePredLine1.map((it) => (it ? 'NM' : ''));

  private crzTableModeLine2 = Subject.create<string | null>('MANAGED');

  private crzTableSpdLine2 = Subject.create<string | null>('---');

  private readonly crzTableSpdLine2Unit = this.crzTableSpdLine2.map((it) => (it ? 'KT' : ''));

  private crzTableMachLine2 = Subject.create<string | null>('.82');

  private crzTablePredLine2 = Subject.create<string | null>('--:--   ----');

  private readonly crzTablePredLine2Unit = this.crzTablePredLine2.map((it) => (it ? 'NM' : ''));

  private crzTableModeLine3 = Subject.create<string | null>(null);

  /** FCOM DSC-22-FMS-20-30 P 252: LRC Mach / speed of the CRZ panel (the non-limiting one is dashed) */
  private readonly lrcMach = Subject.create('.--');

  private readonly lrcSpeed = Subject.create('---');

  /** FCOM DSC-22-FMS-20-30 P 252: MAX TURB Mach / speed of the CRZ panel */
  private readonly maxTurbMach = Subject.create('.--');

  private readonly maxTurbSpeed = Subject.create('---');

  private crzTableSpdLine3 = Subject.create<string | null>(null);

  private readonly crzTableSpdLine3Unit = this.crzTableSpdLine3.map((it) => (it ? 'KT' : ''));

  private crzTableMachLine3 = Subject.create<string | null>(null);

  private crzTablePredLine3 = Subject.create<string | null>(null);

  private readonly destAirportIdent = Subject.create<string>('----');

  private readonly destEta = Subject.create<string>('--:--');

  private readonly destEfob = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly destEfobFormatted = MappedSubject.create(
    ([value, weightUnit]) => this.weightFormatter(value.asUnit(weightUnit) / 1000),
    this.destEfob,
    this.weightUnit,
  );

  private readonly cruisePreselectedSpeed = Subject.create<number | null>(null);

  private readonly cruisePreSelectedSpeedKnotsDisplay = this.cruisePreselectedSpeed.map((v) =>
    v !== null && v > 1 ? v : null,
  );

  private readonly cruisePreSelectedMachDisplay = this.cruisePreselectedSpeed.map((v) =>
    v !== null && v < 1 ? v : null,
  );

  private readonly crzPreSelManagedGreenLine1 = MappedSubject.create(
    ([fp, pSpeed, eo]) =>
      (fp >= FmgcFlightPhase.Climb && fp <= FmgcFlightPhase.Descent && !eo) ||
      (fp < FmgcFlightPhase.Climb && pSpeed !== null),
    this.activeFlightPhase,
    this.cruisePreselectedSpeed,
    this.eoActive,
  );

  private readonly crzPreSelManagedAmberLine1 = MappedSubject.create(
    ([fp, eo]) => fp >= FmgcFlightPhase.Climb && fp <= FmgcFlightPhase.Descent && eo,
    this.activeFlightPhase,
    this.eoActive,
  );

  private readonly crzPreSelManagedGreenLine2 = MappedSubject.create(
    ([fp, managed, pSpeed]) => fp < FmgcFlightPhase.Climb && managed && pSpeed === null,
    this.activeFlightPhase,
    this.managedSpeedActive,
    this.cruisePreselectedSpeed,
  );

  private readonly flightPhaseInFlight = this.activeFlightPhase.map(
    (it) => it >= FmgcFlightPhase.Climb && it <= FmgcFlightPhase.Descent,
  );

  // DES page subjects, refs and methods
  private readonly descentCabinRate = Subject.create<number | null>(null);

  private readonly desManagedSpdTarget = Subject.create<number | null>(null);

  private readonly desManagedMachTarget = Subject.create<number | null>(null);

  private readonly desPredictionsReference = Subject.create<number | null>(null);

  private readonly desTableModeLine1 = Subject.create<string | null>('PRESEL');

  private readonly desTableModeLine1Green = MappedSubject.create(
    ([fp]) => fp >= FmgcFlightPhase.Climb && fp <= FmgcFlightPhase.Descent,
    this.activeFlightPhase,
  );

  private desTableSpdLine1 = Subject.create<string | null>(null);

  private desTableMachLine1 = Subject.create<string | null>(null);

  private desTablePredLine1 = Subject.create<string | null>('--:--   ----');

  private desTableModeLine2 = Subject.create<string | null>('MANAGED');

  private readonly desTableModeLine2Green = MappedSubject.create(
    ([fp, managed]) => fp < FmgcFlightPhase.Climb && managed,
    this.activeFlightPhase,
    this.managedSpeedActive,
  );

  private desTableSpdLine2 = Subject.create<string | null>('250');

  private readonly desTableSpdLine2Unit = this.desTableSpdLine2.map((it) => (it ? 'KT' : ''));

  private desTableMachLine2 = Subject.create<string | null>(null);

  private desTablePredLine2 = Subject.create<string | null>(null);

  private readonly desTablePredLine2Unit = this.desTablePredLine2.map((it) => (it ? 'NM' : ''));

  private readonly transFl = Subject.create<number | null>(null);

  private readonly transFlToAlt = this.transFl.map((it) => (it !== null ? it * 100 : null));

  private readonly transitionLevelIsFromDatabase = Subject.create<boolean>(true);
  private readonly transFlIsPilotEntered = this.transitionLevelIsFromDatabase.map((it) => !it);

  // APPR page subjects, refs and methods

  private readonly precisionApproachSelected = Subject.create<boolean>(false);

  private readonly apprIdent = Subject.create<string>('-------');

  private readonly approachCrossWindComponent = Subject.create<number | null>(null);

  private readonly approachHeadWindComponent = Subject.create<number | null>(null);

  private readonly apprCrosswind = this.approachCrossWindComponent.map((v) =>
    v !== null ? Math.abs(v).toFixed(0).padStart(3, '0') : '---',
  );

  private readonly windDirectionLabel = this.approachHeadWindComponent.map((v) => (v !== null && v < 0 ? 'TL' : 'HD'));

  private readonly windSpeedDisplay = this.approachHeadWindComponent.map((v) =>
    v === null ? '---' : Math.abs(v).toFixed(0).padStart(3, '0'),
  );

  private readonly apprFlaps3Selected = Subject.create<boolean>(false);
  private readonly apprSelectedFlapsIndex = this.apprFlaps3Selected.map((isFlaps3) => (isFlaps3 ? 0 : 1));

  private readonly apprLandingWeight = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly apprLandingWeightFormatted = MappedSubject.create(
    ([value, weightUnit]) => this.weightFormatter(value.asUnit(weightUnit) / 1000),
    this.apprLandingWeight,
    this.weightUnit,
  );

  private readonly approachWindDirection = Subject.create<number | null>(null);

  private readonly approachWindMagnitude = Subject.create<number | null>(null);

  private readonly approachTemperature = Subject.create<number | null>(null);

  private readonly approachQnh = Subject.create<number | null>(null);

  private readonly approachBaroMinimum = Subject.create<number | null>(null);

  private readonly approachRadioMinimum = Subject.create<number | null>(null);

  private readonly approachVapp = Subject.create<number | null>(null);

  private readonly approachVappPilotEntry = Subject.create<boolean>(false);

  private readonly approachGreenDotSpeed = Subject.create<number | null>(null);

  private readonly approachSlatRetractionSpeed = Subject.create<number | null>(null);

  private readonly approachFlapRetractionSpeed = Subject.create<number | null>(null);

  private readonly approachVls = Subject.create<number | null>(null);

  private readonly approachVref = Subject.create<number | null>(null);

  private readonly apprVerticalDeviation = Subject.create<string>('+-----');

  private readonly apprRadioText = this.precisionApproachSelected.map((v) => (v ? 'RADIO' : '-----'));

  private readonly missedThrRedAlt = Subject.create<number | null>(null);
  private readonly missedThrRedAltIsPilotEntered = Subject.create<boolean>(false);

  private readonly missedAccelAlt = Subject.create<number | null>(null);
  private readonly missedAccelAltIsPilotEntered = Subject.create<boolean>(false);

  private readonly missedEngineOutAccelAlt = Subject.create<number | null>(null);
  private readonly missedEngineOutAccelAltIsPilotEntered = Subject.create<boolean>(false);

  private readonly lengthUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((v) =>
    v ? UnitType.METER : UnitType.FOOT,
  );

  private readonly isDestAirportMissing = Subject.create(true);
  private readonly approachQnhFormatIsHpa = Subject.create(true);

  /** in feet */
  private ldgRwyThresholdLocation = Subject.create<number | null>(null);

  // GA page subjects, refs and methods

  protected onNewData(): void {
    const pd = this.loadedFlightPlan?.performanceData;

    if (!pd || !this.loadedFlightPlan) {
      return;
    }

    const fpIndex = this.loadedFlightPlanIndex.get();

    this.isActiveOrCopyOfActive.set(this.props.flightPlanInterface.get(fpIndex).isActiveOrCopiedFromActive());

    this.crzFlIsMandatory.set(
      fpIndex === FlightPlanIndex.Active &&
        (this.props.fmcService.master.fmgc.getFlightPhase() ?? FmgcFlightPhase.Preflight) < FmgcFlightPhase.Descent,
    );

    this.showNoiseFields(pd.noiseEnabled!.get());

    this.takeoffShiftDisabled.set(this.loadedFlightPlan.originRunway === undefined);
    this.originRunwayIdent.set(this.loadedFlightPlan.originRunway?.ident.substring(4).padEnd(4, ' ') ?? '---');
    this.takeoffShiftMaxValueMeters.set(this.loadedFlightPlan.originRunway?.length ?? Infinity);

    // V-speeds to be confirmed due to rwy change?
    this.shouldShowConfirmVSpeeds();

    this.destAirportIdent.set(this.loadedFlightPlan.destinationAirport?.ident ?? '----');
    this.isDestAirportMissing.set(this.loadedFlightPlan.destinationAirport === undefined);

    let precisionApproach = false;
    if (this.loadedFlightPlan.approach) {
      this.apprIdent.set(getApproachName(this.loadedFlightPlan.approach, false));
      precisionApproach =
        this.loadedFlightPlan.approach.type === ApproachType.Ils ||
        this.loadedFlightPlan.approach.type === ApproachType.Gls;
    } else {
      this.apprIdent.set('-------');
    }

    this.precisionApproachSelected.set(precisionApproach);
    const vDev =
      fpIndex === FlightPlanIndex.Active
        ? this.props.fmcService.master.guidanceController.vnavDriver.getLinearDeviation()
        : null;
    if (this.activeFlightPhase.get() >= FmgcFlightPhase.Descent && vDev != null) {
      this.apprVerticalDeviation.set(vDev >= 0 ? `+${vDev.toFixed(0)}FT` : `${vDev.toFixed(0)}FT`);
    } else {
      this.apprVerticalDeviation.set('+-----');
    }

    const speedLimit = this.props.fmcService.master.fmgc.getClimbSpeedLimit(fpIndex);
    if (speedLimit) {
      this.speedConstraintSpeed.set(speedLimit.speed);
      this.speedConstraintAltitude.set(speedLimit.underAltitude);
    }
  }

  private loadFlightPlanPerformanceData(): void {
    const pd = this.loadedFlightPlan?.performanceData;
    this.crzFl.set(pd?.cruiseFlightLevel.get() ?? null);
    this.costIndex.set(pd?.costIndex.get() ?? null);
    this.toShift.set(pd?.takeoffShift.get() ?? null);
    this.toFlexTemp.set(pd?.flexTakeoffTemperature.get() ?? null);
    this.toV1.set(pd?.v1.get() ?? null);
    this.toVR.set(pd?.vr.get() ?? null);
    this.toV2.set(pd?.v2.get() ?? null);
    this.takeoffFlaps.set(pd?.takeoffFlaps.get() ?? null);
    this.transAlt.set(pd?.transitionAltitude.get() ?? null);
    this.transitionAltitudeIsFromDatabase.set(pd?.transitionAltitudeIsFromDatabase.get() ?? false);
    this.transFl.set(pd?.transitionLevel.get() ?? null);
    this.transitionLevelIsFromDatabase.set(pd?.transitionLevelIsFromDatabase.get() ?? false);
    this.thrRedAlt.set(pd?.thrustReductionAltitude.get() ?? null);
    this.thrRedAltIsPilotEntered.set(pd?.thrustReductionAltitudeIsPilotEntered.get() ?? false);
    this.accelAlt.set(pd?.accelerationAltitude.get() ?? null);
    this.accelAltIsPilotEntered.set(pd?.accelerationAltitudeIsPilotEntered.get() ?? false);
    this.eoAccelAlt.set(pd?.engineOutAccelerationAltitude.get() ?? null);
    this.eoAccelAltIsPilotEntered.set(pd?.engineOutAccelerationAltitudeIsPilotEntered.get() ?? false);
    this.missedThrRedAlt.set(pd?.missedThrustReductionAltitude.get() ?? null);
    this.missedThrRedAltIsPilotEntered.set(pd?.missedThrustReductionAltitudeIsPilotEntered.get() ?? false);
    this.missedAccelAlt.set(pd?.missedAccelerationAltitude.get() ?? null);
    this.missedAccelAltIsPilotEntered.set(pd?.missedAccelerationAltitudeIsPilotEntered.get() ?? false);
    this.missedEngineOutAccelAlt.set(pd?.missedEngineOutAccelerationAltitude.get() ?? null);
    this.missedEngineOutAccelAltIsPilotEntered.set(
      pd?.missedEngineOutAccelerationAltitudeIsPilotEntered.get() ?? false,
    );

    this.approachWindDirection.set(pd?.approachWindDirection.get() ?? null);
    this.approachWindMagnitude.set(pd?.approachWindMagnitude.get() ?? null);
    this.approachTemperature.set(pd?.approachTemperature.get() ?? null);
    this.approachQnh.set(pd?.approachQnh.get() ?? null);
    this.approachBaroMinimum.set(pd?.approachBaroMinimum.get() ?? null);
    const apprRadioMin = pd?.approachRadioMinimum.get();
    this.approachRadioMinimum.set(typeof apprRadioMin === 'number' ? apprRadioMin : null);
    this.apprFlaps3Selected.set(pd?.approachFlapsThreeSelected.get() ?? false);
    this.takeoffPowerSetting.set(pd?.takeoffPowerSetting ? pd.takeoffPowerSetting.get() : null);
    this.takeoffDerated.set(pd?.takeoffDeratedSetting ? pd.takeoffDeratedSetting.get() : null);
    this.takeoffThsFor.set(pd?.takeoffThsFor ? pd.takeoffThsFor.get() : null);
    this.takeoffPacks.set(pd?.takeoffPacks ? pd.takeoffPacks.get() : null);
    this.takeoffAntiIce.set(pd?.takeoffAntiIce ? pd.takeoffAntiIce.get() : null);
    this.noiseEndAltitude.set(pd?.noiseEndAltitude ? pd.noiseEndAltitude.get() : null);
    this.noiseN1.set(pd?.noiseN1 ? pd.noiseN1.get() : null);
    this.noiseSpeed.set(pd?.noiseSpeed ? pd.noiseSpeed.get() : null);
    this.noiseEnabled.set(pd?.noiseEnabled?.get() ?? false);
    this.climbDerated.set(pd?.climbDerated ? pd.climbDerated.get() : null);
    this.descentCabinRate.set(pd?.descentCabinRate ? pd.descentCabinRate.get() : null);
    this.climbPreselectedSpeed.set(pd?.preselectedClimbSpeed ? pd.preselectedClimbSpeed.get() : null);
    this.cruisePreselectedSpeed.set(pd?.preselectedCruiseSpeed ? pd.preselectedCruiseSpeed.get() : null);
  }

  /** CPNY T.O REQUEST, RECEIVED CPNY T.O once company takeoff data is received */
  private readonly cpnyToButton = new CompanyTakeoffDataButton(this.props.fmcService.master, 'CPNY T.O\nREQUEST');

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subs.push(this.cpnyToButton.subscription, this.cpnyToButton.label);

    const sub = this.props.bus.getSubscriber<ClockEvents & MfdSimvars>();

    // If extra parameter for activeUri is given, navigate to flight phase sub-page
    if (this.props.mfd.uiService.activeUri.get().extra) {
      switch (this.props.mfd.uiService.activeUri.get().extra) {
        case 'to':
          this.flightPhasesSelectedPageIndex.set(FlightPhaseTabIndex.Takeoff);
          break;
        case 'clb':
          this.flightPhasesSelectedPageIndex.set(FlightPhaseTabIndex.Climb);
          break;
        case 'crz':
          this.flightPhasesSelectedPageIndex.set(FlightPhaseTabIndex.Cruise);
          break;
        case 'des':
          this.flightPhasesSelectedPageIndex.set(FlightPhaseTabIndex.Descent);
          break;
        case 'appr':
          this.flightPhasesSelectedPageIndex.set(FlightPhaseTabIndex.Approach);
          break;
        case 'ga':
          this.flightPhasesSelectedPageIndex.set(FlightPhaseTabIndex.GoAround);
          break;

        default:
          break;
      }
    } else {
      const allowedPhases = this.props.flightPlanInterface
        .get(this.loadedFlightPlanIndex.get())
        .isActiveOrCopiedFromActive()
        ? Math.min(Math.max(this.activeFlightPhase.get(), 1), 6)
        : FmgcFlightPhase.Takeoff;
      this.flightPhasesSelectedPageIndex.set(allowedPhases - 1);
    }

    // Get flight phase
    this.subs.push(
      this.activeFlightPhase.sub((val) => {
        if (this.previousFmsFlightPhase) {
          const isSamePhase = this.flightPhasesSelectedPageIndex.get() + 1 === this.previousFmsFlightPhase;
          if (isSamePhase && this.isActiveOrCopyOfActive.get()) {
            switch (val) {
              case FmgcFlightPhase.Takeoff:
              case FmgcFlightPhase.Climb:
              case FmgcFlightPhase.Cruise:
              case FmgcFlightPhase.Descent:
              case FmgcFlightPhase.Approach:
              case FmgcFlightPhase.GoAround: {
                this.flightPhasesSelectedPageIndex.set(val - 1);
                break;
              }
            }
          }
        }
        this.previousFmsFlightPhase = val;
      }, true),
    );

    this.subs.push(
      this.takeoffPowerSetting.sub((v) => {
        this.showToThrustSettings(v ?? TakeoffPowerSetting.TOGA);
      }, true),
    );

    this.subs.push(
      sub
        .on('realTime')
        .atFrequency(1)
        .handle((_t) => {
          this.drawPage();
        }),
      this.windDirectionLabel,
      this.windSpeedDisplay,
    );

    // Update VERT DEV on APPR page. Possible optimization to only sub during descent phase
    (this.vdevSub = sub
      .on('realTime')
      .atFrequency(0.5)
      .handle((_t) => {
        if (this.activeFlightPhase.get() >= FmgcFlightPhase.Descent) {
          const vDev = this.props.fmcService.master.guidanceController.vnavDriver.getLinearDeviation();
          if (vDev != null) {
            this.apprVerticalDeviation.set(vDev >= 0 ? `+${vDev.toFixed(0)}FT` : `${vDev.toFixed(0)}FT`);
          }
        }
      }, true)),
      this.subs.push(
        this.flightPlanChangeNotifier.flightPlanChanged.sub(() => {
          if (this.loadedFlightPlan && this.loadedFlightPlanIndex.get() === FlightPlanIndex.Active) {
            this.vdevSub!.resume();
          } else {
            this.vdevSub!.pause();
            this.apprVerticalDeviation.set('+-----');
          }
        }, true),
      );

    this.subs.push(
      this.weightUnitText,
      this.lengthUnit,
      this.mandatoryAndActiveFpln,
      this.visibilityConsideringFlightPlanIndex,
      this.speedConstraintReason,
      this.climbPreSelSpeedGreen,
      this.cruisePreSelectedSpeedKnotsDisplay,
      this.cruisePreSelectedMachDisplay,
      this.climbPreSelSpeedAmber,
      this.climbPreSelManagedSpeedGreen,
      this.crzPreSelManagedGreenLine1,
      this.crzPreSelManagedAmberLine1,
      this.crzPreSelManagedGreenLine2,
      this.desTableModeLine1Green,
      this.desTableModeLine2Green,
      this.flightPhaseInFlight,
      this.toPageInactive,
      this.clbPageInactive,
      this.crzPageInactive,
      this.desPageInactive,
      this.notYetInClimb,
      this.notYetInCruise,
      this.notYetInDescent,
      this.notInDescent,
      this.toThrustSettingsDisabled,
      this.highlightedTab,
      this.clbTableSpdLine2Unit,
      this.clbTableSpdLine3Unit,
      this.crzTablePredLine1Unit,
      this.crzTableSpdLine2Unit,
      this.crzTablePredLine2Unit,
      this.crzTableSpdLine3Unit,
      this.desTableSpdLine2Unit,
      this.desTablePredLine2Unit,
      this.transFlToAlt,
      this.windDirectionLabel,
      this.windSpeedDisplay,
      this.apprSelectedFlapsIndex,
      this.apprRadioText,
      this.apprLandingWeightFormatted,
      this.clearEoButtonVisibility,
      this.activateApprButtonVisibility,
      this.maxFlLabel,
      this.maxFlDisplay,
      this.maxFlNotAvail,
      this.transAltIsPilotEntered,
      this.transFlIsPilotEntered,
      this.vdevSub,
      this.destEfobAmber,
      this.flightPhasesSelectedPageIndex.sub((val) => this.drawPage(val)),
      this.costIndexDisabled,
      this.atOrAfterClimbPhase,
    );
  }

  public destroy(): void {
    this.flightPlanChangeNotifier.destroy();

    super.destroy();
  }

  private drawPage(tab?: FlightPhaseTabIndex) {
    this.loadFlightPlanPerformanceData();

    const fpIndex = this.loadedFlightPlanIndex.get();
    const isActiveOrTmpy = fpIndex === FlightPlanIndex.Active || fpIndex === FlightPlanIndex.Temporary;

    // Update REC MAX FL, OPT FL. Only for active and temporary flightplan.
    if (fpIndex === FlightPlanIndex.Active || fpIndex === FlightPlanIndex.Temporary) {
      const recMaxFl = this.props.fmcService.master.getRecMaxFlightLevel();
      this.recMaxFl.set(recMaxFl && Number.isFinite(recMaxFl) ? recMaxFl.toFixed(0) : '---');
      this.recMaxFlNotAvail.set(recMaxFl === null);
      const optFl = this.props.fmcService.master.getOptFlightLevel();
      this.optFl.set(optFl && Number.isFinite(optFl) ? optFl.toFixed(0) : '---');
      this.optFlNotAvail.set(optFl === null);
      const eoMaxFl = this.props.fmcService.master.getEoMaxFlightLevel();
      this.eoMaxFl.set(eoMaxFl && Number.isFinite(eoMaxFl) ? eoMaxFl.toFixed(0) : '---');
      this.eoMaxFlNotAvail.set(eoMaxFl === null);
    }
    const obs = this.props.fmcService.master.guidanceController.verticalProfileComputationParametersObserver.get();
    this.managedSpeedActive.set((obs?.fcuSpeedManaged as unknown) === 1); // Should be boolean, but is number

    const selectedTabIndex = tab ?? this.flightPhasesSelectedPageIndex.get();

    if (selectedTabIndex === FlightPhaseTabIndex.Takeoff) {
      this.toFlapRetractionSpeed.set(this.props.fmcService.master.getFlapRetractionSpeed(fpIndex) ?? null);
      this.toSlatRetractionSpeed.set(this.props.fmcService.master.getSlatRetractionSpeed(fpIndex) ?? null);
      this.toGreenDotSpeed.set(this.props.fmcService.master.getGreenDotSpeed(fpIndex) ?? null);
    } else if (selectedTabIndex === FlightPhaseTabIndex.Climb) {
      // CLB PRED TO automatic update
      if (fpIndex === FlightPlanIndex.Active && this.activeFlightPhase.get() === FmgcFlightPhase.Climb) {
        this.props.fmcService.master.fmgc.data.climbPredictionsReferenceAutomatic.set(
          this.props.fmcService.master.guidanceController.verticalProfileComputationParametersObserver.get()
            .fcuAltitude,
        );
      } else {
        this.props.fmcService.master.fmgc.data.climbPredictionsReferenceAutomatic.set(null);
      }
      // Update CLB speed table
      const clbSpeedLimit = this.props.fmcService.master.fmgc.getClimbSpeedLimit(fpIndex);
      if (this.activeFlightPhase.get() < FmgcFlightPhase.Climb) {
        this.clbTableModeLine1.set('PRESEL');
        this.clbTableSpdLine1.set(null);
        this.clbTableMachLine1.set(null);
        this.clbTablePredLine1.set(null);
        this.clbTableModeLine2.set('MANAGED');
        this.clbTableSpdLine2.set(clbSpeedLimit?.speed.toFixed(0) ?? null);
        this.clbTableMachLine2.set(null);
        this.clbTablePredLine2.set('--:--   ----');
        this.clbTableModeLine3.set('ECON');
        this.clbTableSpdLine3.set(this.props.fmcService.master.fmgc.getManagedClimbSpeed(fpIndex).toFixed(0) ?? null);
        this.clbTableMachLine3.set(
          `.${this.props.fmcService.master.fmgc.getManagedClimbSpeedMach(fpIndex).toFixed(2).split('.')[1]}`,
        );
        this.clbTablePredLine3.set(null);
      } else if (this.managedSpeedActive.get()) {
        this.clbTableModeLine1.set('MANAGED');
        // TODO add speed restriction (ECON, SPD LIM, ...) in smaller font
        if (clbSpeedLimit && SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') < clbSpeedLimit.underAltitude) {
          this.clbTableSpdLine1.set(clbSpeedLimit.speed.toFixed(0));
          this.clbTableMachLine1.set(
            `.${(SimVar.GetGameVarValue('FROM KIAS TO MACH', 'number', clbSpeedLimit.speed) as number).toFixed(2).split('.')[1]}`,
          );
          this.clbTableModeLine3.set('ECON');
          this.clbTableSpdLine3.set(this.props.fmcService.master.fmgc.getManagedClimbSpeed(fpIndex).toFixed(0) ?? null);
          this.clbTableMachLine3.set(
            `.${this.props.fmcService.master.fmgc.getManagedClimbSpeedMach(fpIndex).toFixed(2).split('.')[1]}`,
          );
          this.clbTablePredLine3.set(null);
        } else {
          this.clbTableSpdLine1.set(this.props.fmcService.master.fmgc.getManagedClimbSpeed(fpIndex).toFixed(0) ?? null);
          this.clbTableMachLine1.set(
            `.${this.props.fmcService.master.fmgc.getManagedClimbSpeedMach(fpIndex).toFixed(2).split('.')[1]}`,
          );
          this.clbTableModeLine3.set(null);
          this.clbTableSpdLine3.set(null);
          this.clbTableMachLine3.set(null);
          this.clbTablePredLine3.set(null);
        }
        // TODO add predictions
        this.clbTablePredLine1.set(null);
        this.clbTableModeLine2.set(null);
        this.clbTableSpdLine2.set(null);
        this.clbTableMachLine2.set(null);
        this.clbTablePredLine2.set(null);
      } else {
        this.clbTableModeLine1.set('SELECTED');
        this.clbTableSpdLine1.set(obs && obs.fcuSpeed >= 1 ? obs?.fcuSpeed.toFixed(0) ?? null : null);
        this.clbTableMachLine1.set(obs && obs.fcuSpeed < 1 ? `.${obs.fcuSpeed.toFixed(2).split('.')[1]}` : null);
        this.clbTablePredLine1.set(null);

        this.clbTableModeLine2.set('MANAGED');
        // TODO add speed restriction (ECON, SPD LIM, ...) in smaller font
        if (clbSpeedLimit && SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') < clbSpeedLimit.underAltitude) {
          this.clbTableSpdLine2.set(clbSpeedLimit.speed.toFixed(0));
          this.clbTableMachLine2.set(
            `.${(SimVar.GetGameVarValue('FROM KIAS TO MACH', 'number', clbSpeedLimit.speed) as number).toFixed(2).split('.')[1]}`,
          );
        } else {
          this.clbTableSpdLine2.set(this.props.fmcService.master.fmgc.getManagedClimbSpeed(fpIndex).toFixed(0) ?? null);
          this.clbTableMachLine2.set(
            `.${this.props.fmcService.master.fmgc.getManagedClimbSpeedMach(fpIndex).toFixed(2).split('.')[1]}`,
          );
        }
        this.clbTablePredLine2.set(null);
        this.clbTableModeLine3.set('ECON');
        this.clbTableSpdLine3.set(this.props.fmcService.master.fmgc.getManagedClimbSpeed(fpIndex).toFixed(0) ?? null);
        this.clbTableMachLine3.set(
          `.${this.props.fmcService.master.fmgc.getManagedClimbSpeedMach(fpIndex).toFixed(2).split('.')[1]}`,
        );
        this.clbTablePredLine3.set(null);
      }
    } else if (selectedTabIndex === FlightPhaseTabIndex.Cruise) {
      // Update CRZ prediction
      const crzPred =
        fpIndex === FlightPlanIndex.Active
          ? this.props.fmcService.master.guidanceController?.vnavDriver?.getPerfCrzToPrediction()
          : null;
      if (
        this.crzPredStepRef.getOrDefault() &&
        this.crzPredDriftDownRef.getOrDefault() &&
        this.crzPredTdRef.getOrDefault() &&
        this.crzPredStepAheadRef.getOrDefault()
      ) {
        if (crzPred?.reason !== undefined && crzPred.reason === VerticalCheckpointReason.TopOfDescent) {
          this.crzPredStepRef.instance.style.display = 'none';
          this.crzPredDriftDownRef.instance.style.display = 'none';
          this.crzPredTdRef.instance.style.display = 'block';
          this.crzPredStepAheadRef.instance.style.display = 'none';
        } else {
          this.crzPredTdRef.instance.style.display = 'none';
          this.crzPredDriftDownRef.instance.style.display = 'none';
          if (crzPred?.distanceFromPresentPosition !== undefined && crzPred.distanceFromPresentPosition < 20) {
            this.crzPredStepRef.instance.style.display = 'none';
            this.crzPredStepAheadRef.instance.style.display = 'block';
          } else {
            this.crzPredStepRef.instance.style.display = 'block';
            this.crzPredStepAheadRef.instance.style.display = 'none';

            if (this.props.flightPlanInterface.active) {
              const [approachingCruiseStep, cruiseStepLegIndex] = MfdFmsFplnVertRev.nextCruiseStep(
                this.props.flightPlanInterface.active,
              );
              this.crzPredWaypoint.set(
                cruiseStepLegIndex && approachingCruiseStep
                  ? this.props.flightPlanInterface.active.legElementAt(cruiseStepLegIndex).ident
                  : '',
              );
              this.crzPredAltitudeTarget.set(approachingCruiseStep ? approachingCruiseStep.toAltitude / 100 : null);
              this.crzTablePredLine1.set(null);
            }
          }
        }
      }

      if (Number.isFinite(crzPred?.secondsFromPresent) && crzPred?.distanceFromPresentPosition !== undefined) {
        const timePrediction = getEtaUtcOrFromPresent(
          crzPred.distanceFromPresentPosition < 0 ? null : crzPred.secondsFromPresent,
          this.activeFlightPhase.get() == FmgcFlightPhase.Preflight,
        );
        if (this.activeFlightPhase.get() < FmgcFlightPhase.Cruise) {
          const preselCruiseSpeed = this.cruisePreselectedSpeed.get();
          if (preselCruiseSpeed !== null) {
            this.crzTablePredLine1.set(
              `${timePrediction}${crzPred.distanceFromPresentPosition.toFixed(0).padStart(6, ' ')}`,
            );
            this.crzTablePredLine2.set('');
          } else {
            // Managed
            this.crzTablePredLine1.set('');
            this.crzTablePredLine2.set(
              `${timePrediction}${crzPred.distanceFromPresentPosition.toFixed(0).padStart(6, ' ')}`,
            );
          }
        } else {
          this.crzTablePredLine1.set(
            `${timePrediction}${crzPred.distanceFromPresentPosition.toFixed(0).padStart(6, ' ')}`,
          );
          this.crzTablePredLine2.set('');
        }
      }

      // LRC and MAX TURB (FCOM PER-IFT LONG RANGE CRUISE SPEED, PRO-SUP-91-40): at the cruise level, the Mach is
      // displayed when it is the limiting target (CAS below the speed), otherwise the speed
      const crzLevel = this.crzFl.get();
      const grossWeightKg = this.props.fmcService.master.fmgc.getGrossWeightKg(fpIndex);
      if (crzLevel !== null && grossWeightKg !== null) {
        const pressure = AeroMath.isaPressure(UnitType.METER.convertFrom(crzLevel * 100, UnitType.FOOT));
        const casOf = (mach: number) => UnitType.KNOT.convertFrom(AeroMath.machToCas(mach, pressure), UnitType.MPS);
        const lrc = longRangeCruiseMach(grossWeightKg, crzLevel * 100);
        this.lrcMach.set(lrc !== null ? `.${lrc.toFixed(2).split('.')[1]}` : '.--');
        this.lrcSpeed.set('---');
        const turbMachLimiting = casOf(maxTurbulenceMach) <= maxTurbulenceSpeedKnots;
        this.maxTurbMach.set(turbMachLimiting ? `.${maxTurbulenceMach.toFixed(2).split('.')[1]}` : '.--');
        this.maxTurbSpeed.set(turbMachLimiting ? '---' : maxTurbulenceSpeedKnots.toFixed(0));
      } else {
        this.lrcMach.set('.--');
        this.lrcSpeed.set('---');
        this.maxTurbMach.set('.--');
        this.maxTurbSpeed.set('---');
      }

      // Update CRZ speed table
      this.crzTableModeLine3.set(null);
      this.crzTableSpdLine3.set(null);
      this.crzTableMachLine3.set(null);
      this.crzTablePredLine3.set(null);

      if (this.activeFlightPhase.get() < FmgcFlightPhase.Cruise) {
        this.crzTableModeLine1.set('PRESEL');
        this.crzTableSpdLine1.set(null);
        this.crzTableMachLine1.set(null);
        this.crzTableModeLine2.set('MANAGED');
        this.crzTableSpdLine2.set('---');
        this.crzTableMachLine2.set(
          `.${this.props.fmcService.master.fmgc.getManagedCruiseSpeedMach(fpIndex).toFixed(2).split('.')[1]}`,
        );
        this.crzTablePredLine2.set('--:--   ----');
      } else if (this.managedSpeedActive.get()) {
        this.crzTableModeLine1.set('MANAGED');
        // TODO add speed restriction (ECON, SPD LIM, ...) in smaller font
        this.crzTableSpdLine1.set(
          obs && obs.fcuSpeed < 1
            ? '---'
            : this.props.fmcService.master.fmgc.getManagedClimbSpeed(fpIndex).toFixed(0) ?? null,
        );
        this.crzTableMachLine1.set(
          obs && obs.fcuSpeed < 1
            ? `.${this.props.fmcService.master.fmgc.getManagedCruiseSpeedMach(fpIndex).toFixed(2).split('.')[1]}`
            : '.--',
        );

        // TODO add predictions
        this.crzTableModeLine2.set(null);
        this.crzTableSpdLine2.set(null);
        this.crzTableMachLine2.set(null);
        this.crzTablePredLine2.set(null);
      } else {
        this.crzTableModeLine1.set('SELECTED');
        this.crzTableSpdLine1.set(obs && obs.fcuSpeed < 1 ? '---' : obs?.fcuSpeed.toFixed(0) ?? null);
        this.crzTableMachLine1.set(obs && obs.fcuSpeed < 1 ? `.${obs.fcuSpeed.toFixed(2).split('.')[1]}` : null);

        this.crzTableModeLine2.set('MANAGED');
        // TODO add speed restriction (ECON, SPD LIM, ...) in smaller font
        this.crzTableSpdLine2.set(
          obs && obs.fcuSpeed < 1
            ? '---'
            : this.props.fmcService.master.fmgc.getManagedCruiseSpeed(fpIndex).toFixed(0) ?? null,
        );
        this.crzTableMachLine2.set(
          obs && obs.fcuSpeed < 1
            ? `.${this.props.fmcService.master.fmgc.getManagedCruiseSpeedMach(fpIndex).toFixed(2).split('.')[1]}`
            : '.--',
        );
        this.crzTablePredLine2.set(null);
      }
    }

    if (
      fpIndex === FlightPlanIndex.Active &&
      (selectedTabIndex === FlightPhaseTabIndex.Cruise || selectedTabIndex === FlightPhaseTabIndex.Descent)
    ) {
      let destEta = '--:--';
      const destPred = this.props.fmcService.master.guidanceController?.vnavDriver?.getDestinationPrediction();
      if (destPred?.secondsFromPresent !== undefined) {
        destEta = getEtaUtcOrFromPresent(
          destPred.secondsFromPresent,
          this.activeFlightPhase.get() == FmgcFlightPhase.Preflight,
        );
      }
      this.destEta.set(destEta);
      const destEfob = this.props.fmcService.master.fmgc.getDestEFOB(true, fpIndex);
      this.destEfob.set(destEfob === null ? NaN : destEfob * 1000);
    }

    if (selectedTabIndex === FlightPhaseTabIndex.Descent) {
      const managedDescentSpeed = this.props.fmcService.master.fmgc.getManagedDescentSpeed(fpIndex);
      this.desManagedSpdTarget.set(managedDescentSpeed);
      const managedDescentSpeedMach = this.props.fmcService.master.fmgc.getManagedDescentSpeedMach(fpIndex);
      this.desManagedMachTarget.set(managedDescentSpeedMach);

      // Update DES speed table
      if (this.activeFlightPhase.get() < FmgcFlightPhase.Descent) {
        this.desTableModeLine1.set('MANAGED');
        this.desTableSpdLine1.set(null);
        this.desTableMachLine1.set(null);
        this.desTablePredLine1.set('--:--  ----');
        this.desTableModeLine2.set(null);
        this.desTableSpdLine2.set(null);
        this.desTableMachLine2.set(null);
        this.desTablePredLine2.set(null);
      } else if (this.managedSpeedActive.get()) {
        this.desTableModeLine1.set('MANAGED');
        this.desTableSpdLine1.set(managedDescentSpeed?.toString());
        this.desTableMachLine1.set(`.${managedDescentSpeedMach.toFixed(2).split('.')[1]}`);
        this.desTablePredLine1.set('--:--  ----');
        this.desTableModeLine2.set(null);
        this.desTableSpdLine2.set(null);
        this.desTableMachLine2.set(null);
        this.desTablePredLine2.set(null);
      } else {
        this.desTableModeLine1.set('SELECTED');
        this.desTableSpdLine1.set(obs && obs.fcuSpeed >= 1 ? obs?.fcuSpeed.toFixed(0) ?? null : null);
        this.desTableMachLine1.set(obs && obs.fcuSpeed < 1 ? `.${obs.fcuSpeed.toFixed(2).split('.')[1]}` : null);
        this.desTablePredLine1.set('--:--  ----');
        this.desTableModeLine2.set('MANAGED');
        this.desTableSpdLine2.set(managedDescentSpeed?.toString());
        this.desTableMachLine2.set(`.${managedDescentSpeedMach.toFixed(2).split('.')[1]}`);
        this.desTablePredLine2.set(null);
      }
    }

    const updateApproachRetrationAndGreenDotSpeeds =
      selectedTabIndex === FlightPhaseTabIndex.Approach || selectedTabIndex === FlightPhaseTabIndex.GoAround;
    if (updateApproachRetrationAndGreenDotSpeeds) {
      this.approachFlapRetractionSpeed.set(
        this.props.fmcService.master.getApproachFlapRetractionSpeed(fpIndex) ?? null,
      );
      this.approachSlatRetractionSpeed.set(
        this.props.fmcService.master.getApproachSlatRetractionSpeed(fpIndex) ?? null,
      );
      this.approachGreenDotSpeed.set(this.props.fmcService.master.getApproachGreenDotSpeed(fpIndex) ?? null);
    }
    if (selectedTabIndex === FlightPhaseTabIndex.Approach) {
      // Update APPR page // FIXME: Logic should be in FMS code
      const distanceToDest = this.props.fmcService.master.fmgc.getDistanceToDestination(fpIndex);
      this.approachParametersMandatory.set(isActiveOrTmpy && (distanceToDest ?? 0) <= 180);
      this.approachVappPilotEntry.set(this.loadedFlightPlan?.performanceData.pilotVapp.get() !== null);
      this.apprLandingWeight.set(this.props.fmcService.master.getLandingWeight(fpIndex) ?? NaN);
      this.approachVapp.set(this.props.fmcService.master.getApproachVapp(fpIndex) ?? null);
      this.approachVls.set(this.props.fmcService.master.getApproachVls(fpIndex) ?? null);
      this.approachVref.set(this.props.fmcService.master.getApproachVref(fpIndex) ?? null);
      this.approachCrossWindComponent.set(this.props.fmcService.master.getApproachCrossWindComponent(fpIndex) ?? null);
      this.approachHeadWindComponent.set(this.props.fmcService.master.getApproachHeadWindComponent(fpIndex) ?? null);
    } else {
      this.approachParametersMandatory.set(false);
    }
    this.approachQnhFormatIsHpa.set(!this.props.fmcService.master.inchesSelectedOnFcu(this.props.mfd.side));
  }

  render(): VNode {
    return (
      this.props.fmcService.master && (
        <>
          {super.render()}
          {/* begin page content */}
          <div class="mfd-page-container" style="position: relative;">
            {/* FCOM DSC-22-FMS-20-30 P 34 / P 289: CRZ, OPT and REC MAX at y = 179, the tabs from y = 228 */}
            <div class="mfd-fcom-canvas" style="flex: 0 0 78px;">
              {fcomAt(36, 24, <span class="mfd-label">CRZ</span>)}
              {fcomAt(
                36,
                81,
                <InputField<number>
                  dataEntryFormat={new FlightLevelFormat()}
                  dataHandlerDuringValidation={async (v) =>
                    v ? this.props.fmcService.master.trySetCruiseFl(v, this.loadedFlightPlanIndex.get()) : false
                  }
                  mandatory={this.crzFlIsMandatory}
                  value={this.crzFl}
                  containerStyle="width: 101px;"
                  alignText="flex-end"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              <div style={{ visibility: this.visibilityConsideringFlightPlanIndex }}>
                {fcomAt(36, 288, [
                  <span class="mfd-label mfd-spacing-right">OPT</span>,
                  <span class="mfd-label-unit mfd-unit-leading">FL</span>,
                  <span class={{ 'mfd-value': true, bigger: true, white: this.optFlNotAvail }}>{this.optFl}</span>,
                ])}
                {fcomRight(36, 746, [
                  <span class={{ 'mfd-label': true, 'mfd-spacing-right': true, amber: this.eoActive }}>
                    {this.maxFlLabel}
                  </span>,
                  <span class="mfd-label-unit mfd-unit-leading">FL</span>,
                  <span class={{ 'mfd-value': true, bigger: true, white: this.maxFlNotAvail }}>
                    {this.maxFlDisplay}
                  </span>,
                ])}
              </div>
            </div>
            <TopTabNavigator
              pageTitles={Subject.create(['T.O', 'CLB', 'CRZ', 'DES', 'APPR', 'GA'])}
              selectedPageIndex={this.flightPhasesSelectedPageIndex}
              pageChangeCallback={(val) => {
                this.flightPhasesSelectedPageIndex.set(val);
              }}
              selectedTabTextColor="white"
              highlightedTab={this.highlightedTab}
              {...fcomTabBar}
            >
              <TopTabNavigatorPage containerStyle={MfdFmsPerf.panelStyle}>
                {/* T.O (FCOM DSC-22-FMS-20-30 P 34 and P 231): panel coordinates (display x - 12, display y - 274) */}
                <div class="mfd-fcom-canvas">
                  {fcomAt(28, 17, <span class="mfd-label">RWY</span>)}
                  {fcomAt(28, 72, <span class="mfd-value bigger">{this.originRunwayIdent}</span>)}
                  {fcomRight(28, 572, <span class="mfd-label">T.O SHIFT</span>)}
                  {fcomAt(
                    28,
                    577,
                    <InputField<number>
                      dataEntryFormat={
                        new LengthFormat(Subject.create(1), this.takeoffShiftMaxValueMeters, this.lengthUnit)
                      }
                      dataHandlerDuringValidation={async (v) =>
                        this.props.flightPlanInterface.setPerformanceData(
                          'takeoffShift',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        )
                      }
                      disabled={this.takeoffShiftDisabled}
                      inactive={this.toPageInactive}
                      value={this.toShift}
                      containerStyle="width: 140px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomLine(64, -1, 722)}

                  {fcomAt(104, 14, <span class="mfd-label">V1</span>)}
                  {fcomAt(
                    104,
                    59,
                    <InputField<number>
                      dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData('v1', v, this.loadedFlightPlanIndex.get());
                        SimVar.SetSimVarValue('L:AIRLINER_V1_SPEED', 'Knots', v);
                      }}
                      mandatory={this.mandatoryAndActiveFpln}
                      inactive={this.toPageInactive}
                      value={this.toV1}
                      containerStyle="width: 109px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomAt(155, 14, <span class="mfd-label">VR</span>)}
                  {fcomAt(
                    155,
                    59,
                    <InputField<number>
                      dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                      dataHandlerDuringValidation={async (v) => {
                        SimVar.SetSimVarValue('L:AIRLINER_VR_SPEED', 'Knots', v);
                        this.props.flightPlanInterface.setPerformanceData('vr', v, this.loadedFlightPlanIndex.get());
                      }}
                      mandatory={this.mandatoryAndActiveFpln}
                      inactive={this.toPageInactive}
                      value={this.toVR}
                      containerStyle="width: 109px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomAt(209, 14, <span class="mfd-label">V2</span>)}
                  {fcomAt(
                    209,
                    59,
                    <InputField<number>
                      dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                      dataHandlerDuringValidation={async (v) => {
                        SimVar.SetSimVarValue('L:AIRLINER_V2_SPEED', 'Knots', v);
                        this.props.flightPlanInterface.setPerformanceData('v2', v, this.loadedFlightPlanIndex.get());
                      }}
                      mandatory={this.mandatoryAndActiveFpln}
                      inactive={this.toPageInactive}
                      value={this.toV2}
                      containerStyle="width: 109px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}

                  {/* P 231: speeds to be confirmed in yellow right of the entry fields, CONFIRM T.O SPDs button */}
                  <div ref={this.vSpeedsConfirmationRef[0]}>
                    {fcomAt(104, 192, [
                      <span class="mfd-value tmpy">
                        {FmgcData.fmcFormatValue(this.props.fmcService.master.fmgc.data.v1ToBeConfirmed)}
                      </span>,
                      <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                    ])}
                  </div>
                  <div ref={this.vSpeedsConfirmationRef[1]}>
                    {fcomAt(155, 192, [
                      <span class="mfd-value tmpy">
                        {FmgcData.fmcFormatValue(this.props.fmcService.master.fmgc.data.vrToBeConfirmed)}
                      </span>,
                      <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                    ])}
                  </div>
                  <div ref={this.vSpeedsConfirmationRef[2]}>
                    {fcomAt(209, 192, [
                      <span class="mfd-value tmpy">
                        {FmgcData.fmcFormatValue(this.props.fmcService.master.fmgc.data.v2ToBeConfirmed)}
                      </span>,
                      <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                    ])}
                  </div>
                  <div ref={this.vSpeedsConfirmationRef[3]}>
                    {fcomAt(
                      202,
                      274,
                      <Button
                        label={
                          <span class="fr aic">
                            <span style="white-space: pre; text-align: center;">{'CONFIRM\nT.O SPDs'}</span>
                            <span style="margin-left: 16px;">*</span>
                          </span>
                        }
                        onClick={() => {
                          const fm = this.props.fmcService.master.fmgc.data;
                          if (fm && this.loadedFlightPlan) {
                            SimVar.SetSimVarValue('L:AIRLINER_V1_SPEED', 'Knots', fm.v1ToBeConfirmed.get());
                            this.props.flightPlanInterface.setPerformanceData(
                              'v1',
                              fm.v1ToBeConfirmed.get(),
                              this.loadedFlightPlanIndex.get(),
                            );
                            fm.v1ToBeConfirmed.set(null);
                            SimVar.SetSimVarValue('L:AIRLINER_VR_SPEED', 'Knots', fm.vrToBeConfirmed.get());
                            this.props.flightPlanInterface.setPerformanceData(
                              'vr',
                              fm.vrToBeConfirmed.get(),
                              this.loadedFlightPlanIndex.get(),
                            );
                            fm.vrToBeConfirmed.set(null);
                            SimVar.SetSimVarValue('L:AIRLINER_V2_SPEED', 'Knots', fm.v2ToBeConfirmed.get());
                            this.props.flightPlanInterface.setPerformanceData(
                              'v2',
                              fm.v2ToBeConfirmed.get(),
                              this.loadedFlightPlanIndex.get(),
                            );
                            fm.v2ToBeConfirmed.set(null);
                          }
                        }}
                        buttonStyle="color: yellow; min-width: 158px; min-height: 58px;"
                      />,
                    )}
                  </div>

                  {/* P 34: operating speeds F, S and green dot */}
                  <div ref={this.flapSpeedsRef[0]}>
                    {fcomAt(104, 270, <span class="mfd-label">F</span>)}
                    {fcomAt(104, 305, [
                      <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                        {FmgcData.fmcFormatValue(this.toFlapRetractionSpeed)}
                      </span>,
                      <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                    ])}
                  </div>
                  <div ref={this.flapSpeedsRef[1]}>
                    {fcomAt(155, 270, <span class="mfd-label">S</span>)}
                    {fcomAt(155, 305, [
                      <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                        {FmgcData.fmcFormatValue(this.toSlatRetractionSpeed)}
                      </span>,
                      <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                    ])}
                  </div>
                  <div ref={this.flapSpeedsRef[2]}>
                    {fcomAt(
                      209,
                      270,
                      <svg width="15" height="15" viewBox="0 0 15 15">
                        <circle cx="7.5" cy="7.5" r="6" stroke="#00ff00" stroke-width="2" fill="none" />
                      </svg>,
                    )}
                    {fcomAt(209, 305, [
                      <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                        {FmgcData.fmcFormatValue(this.toGreenDotSpeed)}
                      </span>,
                      <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                    ])}
                  </div>
                  <div class="mfd-fms-perf-vline" style="left: 423px; top: 74px; height: 167px;" />

                  {/* P 233: takeoff thrust option, FLEX temperature and derated level right of their label */}
                  {fcomAt(
                    156,
                    440,
                    <RadioButtonGroup
                      values={['TOGA', 'FLEX', 'DERATED']}
                      valuesDisabled={this.toThrustSettingsDisabled}
                      onModified={(val) => this.toThrustSettingChanged(val)}
                      selectedIndex={this.takeoffPowerSetting}
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_toThrustSettingRadio`}
                      additionalVerticalSpacing={15}
                    />,
                  )}
                  <div ref={this.toFlexInputRef}>
                    {fcomAt(
                      155,
                      545,
                      <InputField<number>
                        dataEntryFormat={new TemperatureFormat(Subject.create(0), Subject.create(99))}
                        dataHandlerDuringValidation={async (v) => {
                          const loadedFplnIndex = this.loadedFlightPlanIndex.get();
                          // Special case: 0 means no FLEX, 0.1 means FLEX TEMP of 0
                          if (loadedFplnIndex === FlightPlanIndex.Active) {
                            await SimVar.SetSimVarValue(
                              'L:A32NX_AIRLINER_TO_FLEX_TEMP',
                              'Number',
                              v === 0 ? 0.1 : v ?? 0,
                            );
                          }
                          this.props.flightPlanInterface.setPerformanceData(
                            'flexTakeoffTemperature',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          );
                        }}
                        inactive={this.toPageInactive}
                        value={this.toFlexTemp}
                        containerStyle="width: 84px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />,
                    )}
                  </div>
                  <div ref={this.toDeratedInputRef}>
                    {fcomAt(
                      207,
                      600,
                      <DropdownMenu
                        values={this.toDeratedThrustOptions}
                        selectedIndex={this.takeoffDerated}
                        onModified={(val) => {
                          this.toDeratedThrustPrevious = this.takeoffDerated.get();
                          this.toDeratedThrustNext = val;
                          this.toDeratedDialogTitle.set(`DERATED ${this.toDeratedThrustOptions.get(val ?? 0)}`);
                          this.takeoffDeratedSelected();
                        }}
                        inactive={this.toPageInactive}
                        idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_deratedDropdown`}
                        freeTextAllowed={false}
                        containerStyle="width: 90px;"
                        numberOfDigitsForInputField={3}
                        alignLabels="flex-start"
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />,
                    )}
                  </div>
                  <div class="mfd-fms-perf-dialog">
                    <ConfirmationDialog
                      visible={this.toDeratedDialogVisible}
                      cancelAction={() => {
                        this.toDeratedDialogVisible.set(false);
                        this.props.flightPlanInterface.setPerformanceData(
                          'takeoffDeratedSetting',
                          this.toDeratedThrustPrevious,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      confirmAction={() => {
                        this.toDeratedDialogVisible.set(false);
                        this.props.flightPlanInterface.setPerformanceData(
                          'takeoffDeratedSetting',
                          this.toDeratedThrustNext,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      contentContainerStyle="width: 325px; height: 165px; transform: translateX(-50%);"
                    >
                      {this.toDeratedDialogTitle}
                    </ConfirmationDialog>
                  </div>

                  {/* P 231, P 234-236: flaps, THS, packs and anti-ice settings */}
                  {fcomAt(279, 8, <span class="mfd-label">FLAPS</span>)}
                  {fcomAt(279, 128, <span class="mfd-label">THS FOR</span>)}
                  {fcomAt(279, 284, <span class="mfd-label">PACKS</span>)}
                  {fcomAt(279, 522, <span class="mfd-label">ANTI-ICE</span>)}
                  <div class="mfd-fms-perf-vline" style="left: 257px; top: 266px; height: 80px;" />
                  {fcomAt(
                    323,
                    12,
                    <DropdownMenu
                      values={ArraySubject.create(['1', '2', '3'])}
                      inactive={this.toPageInactive}
                      selectedIndex={this.toSelectedFlapsIndex}
                      onModified={(newIndex) => {
                        // Convert to FlapConf
                        if (newIndex != null) {
                          const flapConf = newIndex + 1;
                          this.props.flightPlanInterface.setPerformanceData(
                            'takeoffFlaps',
                            flapConf,
                            this.loadedFlightPlanIndex.get(),
                          );

                          if (this.loadedFlightPlanIndex.get() === FlightPlanIndex.Active) {
                            this.props.fmcService.master.acInterface.setTakeoffFlaps(flapConf);
                          }
                        }
                      }}
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_flapDropdown`}
                      freeTextAllowed={false}
                      containerStyle="width: 60px;"
                      numberOfDigitsForInputField={1}
                      alignLabels="center"
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomAt(
                    323,
                    122,
                    <InputField<number, number, false>
                      dataEntryFormat={new PercentageFormat(Subject.create(0), Subject.create(99.9))}
                      dataHandlerDuringValidation={async (v) => {
                        if (v) {
                          this.props.flightPlanInterface.setPerformanceData(
                            'takeoffThsFor',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          );
                          this.props.fmcService.master.acInterface.setTakeoffTrim(v);
                        }
                      }}
                      mandatory={this.mandatoryAndActiveFpln}
                      inactive={this.toPageInactive}
                      readonlyValue={this.takeoffThsFor}
                      containerStyle="width: 105px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomAt(
                    323,
                    282,
                    <DropdownMenu
                      values={ArraySubject.create(['OFF/APU', 'ON'])}
                      inactive={this.toPageInactive}
                      selectedIndex={this.takeoffPacks}
                      onModified={(val) => {
                        if (this.props.fmcService.master.enginesWereStarted.get()) {
                          this.props.fmcService.master.addMessageToQueue(
                            NXSystemMessages.checkToData,
                            undefined,
                            undefined,
                          );
                        }
                        this.props.flightPlanInterface.setPerformanceData(
                          'takeoffPacks',
                          val,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_packsDropdown`}
                      freeTextAllowed={false}
                      numberOfDigitsForInputField={8}
                      alignLabels="center"
                      containerStyle="width: 200px;"
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomAt(
                    323,
                    517,
                    <DropdownMenu
                      values={ArraySubject.create(['OFF', 'ENG ONLY', 'ENG + WING'])}
                      inactive={this.toPageInactive}
                      selectedIndex={this.takeoffAntiIce}
                      onModified={(val) => {
                        if (this.props.fmcService.master.enginesWereStarted.get()) {
                          this.props.fmcService.master.addMessageToQueue(
                            NXSystemMessages.checkToData,
                            undefined,
                            undefined,
                          );
                        }
                        this.props.flightPlanInterface.setPerformanceData(
                          'takeoffAntiIce',
                          val,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_antiIceDropdown`}
                      freeTextAllowed={false}
                      numberOfDigitsForInputField={10}
                      alignLabels="center"
                      containerStyle="width: 200px;"
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}

                  {/* P 231, P 237-241: thrust reduction, acceleration and noise */}
                  {fcomRight(388, 156, <span class="mfd-label">THR RED</span>)}
                  {fcomAt(
                    388,
                    181,
                    <InputField<number, number, false>
                      dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transAlt)}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'pilotThrustReductionAltitude',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      inactive={this.toPageInactive}
                      enteredByPilot={this.thrRedAltIsPilotEntered}
                      readonlyValue={this.thrRedAlt}
                      containerStyle="width: 139px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomRight(442, 156, <span class="mfd-label">ACCEL</span>)}
                  {fcomAt(
                    442,
                    181,
                    <InputField<number, number, false>
                      dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transAlt)}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'pilotAccelerationAltitude',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      inactive={this.toPageInactive}
                      enteredByPilot={this.accelAltIsPilotEntered}
                      readonlyValue={this.accelAlt}
                      containerStyle="width: 139px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  <div ref={this.toNoiseFieldsRefs[0]}>
                    {fcomAt(388, 360, [
                      <svg fill="#ffffff" height="30px" width="30px" viewBox="0 0 60 60">
                        <polygon points="0,28 50,28 50,20 60,30 50,40 50,32 0,32" />
                      </svg>,
                      <span class="mfd-label" style="width: 40px; margin-left: 10px; text-align: right">
                        N1
                      </span>,
                    ])}
                  </div>
                  <div ref={this.toNoiseFieldsRefs[1]}>
                    {fcomAt(
                      388,
                      450,
                      <InputField<number, number, false>
                        dataEntryFormat={new PercentageFormat(Subject.create(40), Subject.create(110), 0)}
                        dataHandlerDuringValidation={async (v) => {
                          this.props.flightPlanInterface.setPerformanceData(
                            'noiseN1',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          );
                        }}
                        inactive={this.toPageInactive}
                        readonlyValue={this.noiseN1}
                        containerStyle="width: 110px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />,
                    )}
                  </div>
                  <div ref={this.toNoiseFieldsRefs[2]}>
                    <div style={{ display: this.toPageInactive.map((v) => (v ? 'none' : 'block')) }}>
                      {fcomAt(
                        415,
                        600,
                        <Button
                          label="CANCEL<br />NOISE"
                          onClick={() => {
                            this.props.flightPlanInterface.setPerformanceData(
                              'noiseEnabled',
                              false,
                              this.loadedFlightPlanIndex.get(),
                            );
                            this.showNoiseFields(false);
                          }}
                          buttonStyle="min-width: 128px; min-height: 58px;"
                        />,
                      )}
                    </div>
                  </div>
                  <div ref={this.toNoiseFieldsRefs[3]}>
                    {fcomAt(442, 360, [
                      <svg fill="#ffffff" height="30px" width="30px" viewBox="0 0 60 60">
                        <polygon points="0,28 50,28 50,20 60,30 50,40 50,32 0,32" />
                      </svg>,
                      <span class="mfd-label" style="width: 40px; margin-left: 10px; text-align: right">
                        SPD
                      </span>,
                    ])}
                  </div>
                  <div ref={this.toNoiseFieldsRefs[4]}>
                    {fcomAt(
                      442,
                      450,
                      <InputField<number, number, false>
                        dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                        dataHandlerDuringValidation={async (v) =>
                          this.props.flightPlanInterface.setPerformanceData(
                            'noiseSpeed',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          )
                        }
                        inactive={this.toPageInactive}
                        readonlyValue={this.noiseSpeed}
                        containerStyle="width: 110px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />,
                    )}
                  </div>
                  <div ref={this.toNoiseEndLabelRef}>
                    {fcomRight(498, 156, <span class="mfd-label">NOISE END</span>)}
                  </div>
                  <div ref={this.toNoiseButtonRef}>
                    <div style={{ display: this.toPageInactive.map((v) => (v ? 'none' : 'block')) }}>
                      {fcomAt(
                        498,
                        180,
                        <Button
                          disabled={true}
                          label="NOISE"
                          onClick={() => {
                            this.props.flightPlanInterface.setPerformanceData(
                              'noiseEnabled',
                              true,
                              this.loadedFlightPlanIndex.get(),
                            );
                            this.showNoiseFields(true);
                          }}
                          buttonStyle="min-width: 99px; min-height: 40px;"
                        />,
                      )}
                    </div>
                  </div>
                  <div ref={this.toNoiseEndInputRef}>
                    {fcomAt(
                      498,
                      181,
                      <InputField<number>
                        dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transAlt)}
                        dataHandlerDuringValidation={async (v) =>
                          this.props.flightPlanInterface.setPerformanceData(
                            'noiseEndAltitude',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          )
                        }
                        inactive={this.toPageInactive}
                        value={this.noiseEndAltitude}
                        containerStyle="width: 139px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />,
                    )}
                  </div>

                  {/* P 231: TRANS, EO ACCEL and CPNY T.O REQUEST at the bottom of the panel */}
                  {fcomAt(587, 7, <span class="mfd-label">TRANS</span>)}
                  {fcomAt(
                    587,
                    96,
                    <InputField<number, number, false>
                      dataEntryFormat={new AltitudeFormat(Subject.create(1), Subject.create(maxCertifiedAlt))}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'pilotTransitionAltitude',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                        this.props.fmcService.master.acInterface.updateTransitionAltitudeLevel();
                      }}
                      enteredByPilot={this.transAltIsPilotEntered}
                      readonlyValue={this.transAlt}
                      containerStyle="width: 139px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomAt(587, 257, <span class="mfd-label">EO ACCEL</span>)}
                  {fcomAt(
                    587,
                    392,
                    <InputField<number>
                      dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transAlt)}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'pilotEngineOutAccelerationAltitude',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      inactive={this.toPageInactive}
                      enteredByPilot={this.eoAccelAltIsPilotEntered}
                      value={this.eoAccelAlt}
                      containerStyle="width: 141px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  <div style={{ visibility: this.visibilityConsideringFlightPlanIndex }}>
                    <div style={{ display: this.toPageInactive.map((v) => (v ? 'none' : 'block')) }}>
                      {fcomAt(
                        578,
                        560,
                        <Button
                          label={this.cpnyToButton.label}
                          // FCOM DSC-22-FMS-20-30 P 34: displays the COMPANY T.O DATA REQUEST page, or the RECEIVED
                          // COMPANY T.O DATA page once takeoff data is received
                          disabled={this.secActive}
                          onClick={() => this.props.mfd.uiService.navigateTo(this.cpnyToButton.target)}
                          buttonStyle="min-width: 174px; min-height: 60px;"
                        />,
                      )}
                    </div>
                  </div>
                </div>
              </TopTabNavigatorPage>
              <TopTabNavigatorPage
                containerStyle={`${MfdFmsPerf.panelFrameStyle} padding-top: 0px; padding-left: 0px;`}
              >
                {/* CLB */}
                <div style="display: flex; justify-content: space-between;">
                  <div class="mfd-label-value-container" style="margin-bottom: 15px;">
                    <span class="mfd-label mfd-spacing-right">CI</span>
                    <InputField<number>
                      dataEntryFormat={new CostIndexFormat()}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'costIndex',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                        this.props.flightPlanInterface.setPerformanceData(
                          'costIndexMode',
                          CostIndexMode.ECON,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      disabled={this.costIndexDisabled}
                      value={this.costIndex}
                      containerStyle="width: 75px;"
                      alignText="center"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                  <div class="mfd-label-value-container">
                    <span class="mfd-label mfd-spacing-right">DERATED CLB</span>
                    <DropdownMenu
                      values={ArraySubject.create(['NONE', '01', '02', '03', '04', '05'])}
                      inactive={Subject.create(true)}
                      selectedIndex={this.climbDerated as Subscribable<ClimbDerated>}
                      onModified={(v) =>
                        this.props.flightPlanInterface.setPerformanceData(
                          'climbDerated',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        )
                      }
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_deratedClbDropdown`}
                      freeTextAllowed={false}
                      containerStyle="width: 125px;"
                      numberOfDigitsForInputField={4}
                      alignLabels="center"
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                </div>
                <div class="mfd-fms-perf-clb-grid">
                  <div class="mfd-fms-perf-speed-table-cell br">
                    <div class="mfd-label">MODE</div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <div class="mfd-label">SPD</div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <div class="mfd-label">MACH</div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <div style={{ visibility: this.visibilityConsideringFlightPlanIndex }}>
                      <div class="mfd-label">PRED TO </div>
                      <InputField<number, number, false>
                        dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transAlt)}
                        dataHandlerDuringValidation={async (v) =>
                          this.props.fmcService.master.fmgc.data.climbPredictionsReferencePilotEntry.set(v)
                        }
                        inactive={this.clbPageInactive}
                        enteredByPilot={this.props.fmcService.master.fmgc.data.climbPredictionsReferenceIsPilotEntered}
                        readonlyValue={this.props.fmcService.master.fmgc.data.climbPredictionsReference}
                        containerStyle="width: 150px; margin-left: 15px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-presel-managed-table-cell">
                    <div
                      class={{
                        'mfd-label': true,
                        green: this.climbPreSelSpeedGreen,
                        amber: this.climbPreSelSpeedAmber,
                        biggest: this.flightPhaseInFlight,
                      }}
                    >
                      {this.clbTableModeLine1}
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <ConditionalComponent
                      condition={this.notYetInClimb}
                      componentIfTrue={
                        <InputField<number>
                          dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                          inactive={this.atOrAfterClimbPhase}
                          value={this.climbPreselectedSpeed}
                          dataHandlerDuringValidation={(v) =>
                            this.props.flightPlanInterface.setPerformanceData(
                              'preselectedClimbSpeed',
                              v,
                              this.loadedFlightPlanIndex.get(),
                            )
                          }
                          alignText="flex-end"
                          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                          hEventConsumer={this.props.mfd.hEventConsumer}
                          interactionMode={this.props.mfd.interactionMode}
                        />
                      }
                      componentIfFalse={
                        <div class="mfd-label-value-container">
                          <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.clbTableSpdLine1}</span>
                          <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                        </div>
                      }
                    />
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.clbTableMachLine1}</span>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.clbTablePredLine1}</span>
                  </div>
                  <div class="mfd-fms-perf-speed-presel-managed-table-cell">
                    <div
                      class={{
                        'mfd-label': true,
                        green: this.climbPreSelManagedSpeedGreen,
                      }}
                    >
                      {this.clbTableModeLine2}
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <div class="mfd-label-value-container">
                      <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.clbTableSpdLine2}</span>
                      <span class="mfd-label-unit mfd-unit-trailing">{this.clbTableSpdLine2Unit}</span>
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.clbTableMachLine2}</span>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.clbTablePredLine2}</span>
                  </div>
                  <div
                    class="mfd-fms-perf-speed-table-cell br"
                    style="justify-content: flex-end; padding: 5px 15px 5px 15px;"
                  >
                    <div class="mfd-label">{this.clbTableModeLine3}</div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell" style="padding: 5px 15px 5px 15px;">
                    <div class="mfd-label-value-container">
                      <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.clbTableSpdLine3}</span>
                      <span class="mfd-label-unit mfd-unit-trailing">{this.clbTableSpdLine3Unit}</span>
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell" style="padding: 5px 15px 5px 15px;">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.clbTableMachLine3}</span>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell" style="padding: 5px 15px 5px 15px;" />
                  <div style="border-right: 1px solid lightgrey; height: 40px;" />
                  <div />
                  <div />
                  <div />
                </div>
                {/* FCOM DSC-22-FMS-20-30 P 244-246: the CLB panel has no THR RED / ACCEL / noise fields (T.O panel only) */}
                <div class="mfd-label-value-container" style="padding-left: 15px; margin-top: 15px;">
                  <span class="mfd-label mfd-spacing-right">CLB SPD LIM</span>
                  <div class="mfd-label-value-container">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.speedConstraintSpeed}</span>
                    <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                  </div>
                  <span class={{ 'mfd-value': true, sec: this.secActive }}>/</span>
                  <div class="mfd-label-value-container">
                    <span class="mfd-label-unit mfd-unit-leading">FL</span>
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.speedConstraintReason}</span>
                  </div>
                </div>
                <div style="flex-grow: 1;" />
                {/* fill space vertically */}
                <div class="mfd-fms-perf-to-thrred-noise-grid-cell" style="margin: 5px 2px 3px 2px;">
                  <div class="mfd-label-value-container" style="margin-left: 50px;">
                    <span class="mfd-label mfd-spacing-right">TRANS</span>
                    <InputField<number, number, false>
                      dataEntryFormat={new AltitudeFormat(Subject.create(1), Subject.create(maxCertifiedAlt))}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'pilotTransitionAltitude',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                        this.props.fmcService.master.acInterface.updateTransitionAltitudeLevel();
                      }}
                      enteredByPilot={this.transAltIsPilotEntered}
                      readonlyValue={this.transAlt}
                      containerStyle="width: 150px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                  <Button
                    label="SPD CSTR"
                    onClick={() =>
                      this.props.mfd.uiService.navigateTo(
                        `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln-vert-rev/spd`,
                      )
                    }
                    disabled={this.clbPageInactive}
                  ></Button>
                </div>
              </TopTabNavigatorPage>
              <TopTabNavigatorPage containerStyle={`${MfdFmsPerf.panelFrameStyle} padding: 0;`}>
                {/* CRZ (FCOM DSC-22-FMS-20-30 P 250-258 and P 289): panel coordinates (display x - 11, display y - 266) */}
                <div class="mfd-fcom-canvas">
                  {fcomAt(34, 27, <span class="mfd-label">CI</span>)}
                  {fcomAt(
                    34,
                    66,
                    <InputField<number>
                      dataEntryFormat={new CostIndexFormat()}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'costIndex',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                        this.props.flightPlanInterface.setPerformanceData(
                          'costIndexMode',
                          CostIndexMode.ECON,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      disabled={this.costIndexDisabled}
                      value={this.costIndex}
                      containerStyle="width: 68px;"
                      alignText="center"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />,
                  )}
                  {fcomLine(72, 5, 728)}

                  {/* Speed mode table (P 251-253): MODE, MACH, SPD and predictions columns */}
                  <div class="mfd-fms-perf-vline" style="left: 179px; top: 133px; height: 261px;" />
                  <div class="mfd-fms-perf-vline" style="left: 277px; top: 133px; height: 261px;" />
                  <div class="mfd-fms-perf-vline" style="left: 460px; top: 133px; height: 261px;" />
                  {fcomLine(188, -7, 744)}
                  {fcomCentre(158, 85, <span class="mfd-label">MODE</span>)}
                  {fcomCentre(158, 226, <span class="mfd-label">MACH</span>)}
                  {fcomCentre(158, 367, <span class="mfd-label">SPD</span>)}
                  {/* P 250-251: predictions reference label */}
                  <div ref={this.crzPredTdRef}>
                    {fcomCentre(158, 593, [
                      <span class="mfd-label mfd-spacing-right">PRED TO</span>,
                      <span class="mfd-value bigger">T/D</span>,
                    ])}
                  </div>
                  <div ref={this.crzPredStepRef}>
                    {fcomCentre(143, 593, [
                      <span class="mfd-label mfd-spacing-right">AT</span>,
                      <span class={{ 'mfd-value': true, sec: this.secActive, bigger: true }}>
                        {this.crzPredWaypoint}
                      </span>,
                    ])}
                    {fcomCentre(172, 593, [
                      <span class="mfd-label mfd-spacing-right">STEP TO</span>,
                      <span class="mfd-label-unit mfd-unit-leading">FL</span>,
                      <span class="mfd-value bigger">{this.crzPredAltitudeTarget}</span>,
                    ])}
                  </div>
                  <div ref={this.crzPredStepAheadRef}>
                    {fcomCentre(158, 593, <span class="mfd-label green">STEP AHEAD</span>)}
                  </div>
                  <div ref={this.crzPredDriftDownRef}>
                    {fcomCentre(143, 593, <span class="mfd-label">DRIFT DOWN</span>)}
                    {fcomCentre(172, 593, [
                      <span class="mfd-label mfd-spacing-right">TO</span>,
                      <span class="mfd-label-unit mfd-unit-leading">FL</span>,
                      <span class={{ 'mfd-value': true, sec: this.secActive, bigger: true }}>
                        {this.crzPredAltitudeTarget}
                      </span>,
                    ])}
                  </div>

                  {/* Line 1: PRESEL (before CRZ), MANAGED or SELECTED (in CRZ) */}
                  {fcomAt(
                    214,
                    21,
                    <span
                      class={{
                        'mfd-label': true,
                        green: this.crzPreSelManagedGreenLine1,
                        amber: this.crzPreSelManagedAmberLine1,
                        biggest: this.flightPhaseInFlight,
                      }}
                    >
                      {this.crzTableModeLine1}
                    </span>,
                  )}
                  <div style={{ display: this.notYetInCruise.map((v) => (v ? 'block' : 'none')) }}>
                    {fcomAt(
                      214,
                      187,
                      <InputField<number, number, false>
                        dataEntryFormat={new SpeedMachFormat(Subject.create(0.1), Subject.create(Mmo))}
                        onModified={async (v) => {
                          this.props.flightPlanInterface.setPerformanceData(
                            'preselectedCruiseSpeed',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          );
                        }}
                        readonlyValue={this.cruisePreSelectedMachDisplay}
                        containerStyle="width: 72px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />,
                    )}
                    {fcomAt(
                      214,
                      300,
                      <InputField<number, number, false>
                        dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                        onModified={async (v) => {
                          this.props.flightPlanInterface.setPerformanceData(
                            'preselectedCruiseSpeed',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          );
                        }}
                        readonlyValue={this.cruisePreSelectedSpeedKnotsDisplay}
                        containerStyle="width: 100px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />,
                    )}
                  </div>
                  <div style={{ display: this.notYetInCruise.map((v) => (v ? 'none' : 'block')) }}>
                    {fcomRight(
                      214,
                      251,
                      <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                        {this.crzTableMachLine1}
                      </span>,
                    )}
                    {fcomRight(214, 422, [
                      <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                        {this.crzTableSpdLine1}
                      </span>,
                      <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                    ])}
                  </div>
                  {fcomRight(214, 734, [
                    <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                      {this.crzTablePredLine1}
                    </span>,
                    <span class="mfd-label-unit mfd-unit-trailing">{this.crzTablePredLine1Unit}</span>,
                  ])}

                  {/* Line 2: MANAGED below PRESEL or SELECTED */}
                  {fcomAt(
                    271,
                    21,
                    <span class={{ 'mfd-label': true, green: this.crzPreSelManagedGreenLine2, biggest: true }}>
                      {this.crzTableModeLine2}
                    </span>,
                  )}
                  {fcomRight(
                    271,
                    251,
                    <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                      {this.crzTableMachLine2}
                    </span>,
                  )}
                  {fcomRight(271, 422, [
                    <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                      {this.crzTableSpdLine2}
                    </span>,
                    <span class="mfd-label-unit mfd-unit-trailing">{this.crzTableSpdLine2Unit}</span>,
                  ])}
                  {fcomRight(271, 734, [
                    <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive }}>
                      {this.crzTablePredLine2}
                    </span>,
                    <span class="mfd-label-unit mfd-unit-trailing">{this.crzTablePredLine2Unit}</span>,
                  ])}

                  {/* P 252 / P 254: LRC and MAX TURB, for information (small font) */}
                  {fcomRight(329, 171, <span class="mfd-label">LRC</span>)}
                  {fcomRight(329, 251, <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.lrcMach}</span>)}
                  {fcomRight(329, 422, [
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.lrcSpeed}</span>,
                    <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                  ])}
                  {fcomRight(372, 171, <span class="mfd-label">MAX TURB</span>)}
                  {fcomRight(
                    372,
                    251,
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.maxTurbMach}</span>,
                  )}
                  {fcomRight(372, 422, [
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.maxTurbSpeed}</span>,
                    <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
                  ])}

                  {/* P 258: destination data, CMS and STEP ALTs buttons */}
                  {fcomAt(594, 18, <span class="mfd-label">DEST</span>)}
                  {fcomAt(
                    594,
                    94,
                    <span
                      class={{ 'mfd-value': true, bigger: true, white: this.mandatoryAndActiveFpln.map((v) => !v) }}
                    >
                      {this.destAirportIdent}
                    </span>,
                  )}
                  {fcomAt(
                    594,
                    202,
                    <span
                      class={{ 'mfd-value': true, bigger: true, white: this.mandatoryAndActiveFpln.map((v) => !v) }}
                    >
                      {this.destEta}
                    </span>,
                  )}
                  {fcomRight(594, 470, [
                    <span class={{ 'mfd-value': true, bigger: true, sec: this.secActive, amber: this.destEfobAmber }}>
                      {this.destEfobFormatted}
                    </span>,
                    <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
                  ])}
                  {fcomAt(
                    594,
                    496,
                    <Button
                      disabled={true}
                      label="CMS"
                      onClick={() =>
                        this.props.mfd.uiService.navigateTo(
                          `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln-vert-rev/cms`,
                        )
                      }
                      buttonStyle="min-width: 67px; min-height: 41px;"
                    />,
                  )}
                  {fcomAt(
                    594,
                    573,
                    <Button
                      label="STEP ALTs"
                      onClick={() =>
                        this.props.mfd.uiService.navigateTo(
                          `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln-vert-rev/step-alts`,
                        )
                      }
                      disabled={this.crzPageInactive}
                      buttonStyle="min-width: 162px; min-height: 41px;"
                    />,
                  )}
                </div>
              </TopTabNavigatorPage>
              <TopTabNavigatorPage
                containerStyle={`${MfdFmsPerf.panelFrameStyle} padding-top: 0px; padding-left: 0px;`}
              >
                {/* DES */}
                <div style="display: flex; justify-content: space-between;">
                  <div class="mfd-label-value-container">
                    <span class="mfd-label mfd-spacing-right">CI</span>
                    <InputField<number>
                      dataEntryFormat={new CostIndexFormat()}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'costIndex',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                        this.props.flightPlanInterface.setPerformanceData(
                          'costIndexMode',
                          CostIndexMode.ECON,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      disabled={this.costIndexDisabled}
                      inactive={this.crzPageInactive}
                      value={this.costIndex}
                      containerStyle="width: 75px;"
                      alignText="center"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                  <div
                    class="mfd-label-value-container"
                    style={{ padding: '15px', visibility: this.visibilityConsideringFlightPlanIndex }}
                  >
                    <span class="mfd-label mfd-spacing-right">DES CABIN RATE</span>
                    <InputField<number, number, false>
                      dataEntryFormat={new DescentRateFormat(Subject.create(-999), Subject.create(-100))}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'descentCabinRate',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                      }}
                      inactive={this.crzPageInactive}
                      readonlyValue={this.descentCabinRate}
                      containerStyle="width: 175px;"
                      alignText="flex-end"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                </div>
                <div class="mfd-fms-perf-crz-grid">
                  <div class="mfd-fms-perf-speed-table-cell br">
                    <div class="mfd-label">MODE</div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <div class="mfd-label">MACH</div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <div class="mfd-label">SPD</div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <div style={{ visibility: this.visibilityConsideringFlightPlanIndex }}>
                      <div class="mfd-label">PRED TO </div>
                      <InputField<number>
                        dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transFl, Subject.create(true))}
                        disabled={this.notInDescent}
                        value={this.desPredictionsReference}
                        containerStyle="width: 150px; margin-left: 15px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-presel-managed-table-cell">
                    <div
                      class={{
                        'mfd-label': true,
                        green: this.desTableModeLine1Green,
                        biggest: this.flightPhaseInFlight,
                      }}
                    >
                      {this.desTableModeLine1}
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <ConditionalComponent
                      condition={this.notYetInDescent}
                      componentIfFalse={
                        <InputField<number>
                          dataEntryFormat={new SpeedMachFormat(Subject.create(0.1), Subject.create(Mmo))}
                          dataHandlerDuringValidation={async (v) => {
                            this.props.flightPlanInterface.setPerformanceData(
                              'pilotManagedDescentMach',
                              v,
                              this.loadedFlightPlanIndex.get(),
                            );
                          }}
                          value={this.desManagedMachTarget}
                          alignText="flex-end"
                          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                          hEventConsumer={this.props.mfd.hEventConsumer}
                          interactionMode={this.props.mfd.interactionMode}
                        />
                      }
                      componentIfTrue={
                        <div class="mfd-label-value-container">
                          <span class="mfd-value">{this.desTableMachLine1}</span>
                        </div>
                      }
                    />
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <ConditionalComponent
                      condition={this.notYetInDescent}
                      componentIfTrue={
                        <InputField<number>
                          dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                          dataHandlerDuringValidation={async (v) => {
                            this.props.flightPlanInterface.setPerformanceData(
                              'pilotManagedDescentSpeed',
                              v,
                              this.loadedFlightPlanIndex.get(),
                            );
                          }}
                          value={this.desManagedSpdTarget}
                          alignText="flex-end"
                          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                          hEventConsumer={this.props.mfd.hEventConsumer}
                          interactionMode={this.props.mfd.interactionMode}
                        />
                      }
                      componentIfFalse={
                        <div class="mfd-label-value-container">
                          <span class="mfd-value">{this.desTableSpdLine1}</span>
                          <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                        </div>
                      }
                    />
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>--:-- ----</span>
                  </div>
                  <div class="mfd-fms-perf-speed-presel-managed-table-cell">
                    <div
                      class={{
                        'mfd-label': true,
                        green: this.desTableModeLine2Green,
                      }}
                    >
                      {this.desTableModeLine2}
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.desTableMachLine2}</span>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <div class="mfd-label-value-container">
                      <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.desTableSpdLine2}</span>
                      <span class="mfd-label-unit mfd-unit-trailing">{this.desTableSpdLine2Unit}</span>
                    </div>
                  </div>
                  <div class="mfd-fms-perf-speed-table-cell">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.desTablePredLine2}</span>
                    <span class="mfd-label-unit mfd-unit-trailing">{this.desTablePredLine2Unit}</span>
                  </div>
                  <div
                    class="mfd-fms-perf-speed-table-cell br"
                    style="border-bottom: none; justify-content: flex-end; height: 75px;"
                  />
                  <div class="mfd-fms-perf-speed-table-cell" style="border-bottom: none; padding: 5px;" />
                  <div class="mfd-fms-perf-speed-table-cell" style="border-bottom: none; padding: 5px;" />
                  <div class="mfd-fms-perf-speed-table-cell" style="border-bottom: none; padding: 5px;" />
                </div>
                <div style="flex-grow: 1;" />
                {/* fill space vertically */}
                {/* FCOM DSC-22-FMS-20-30 PERF page, DES panel: TRANS FL (mirrors the APPR panel entry) and VERT DEV */}
                <div class="mfd-fms-perf-appr-trans-vertdev">
                  <div class="mfd-label-value-container">
                    <span
                      class="mfd-label mfd-spacing-right"
                      style="width: 125px; text-align: right; align-self: center; padding-left: 20px;"
                    >
                      TRANS
                    </span>
                    <InputField<number, number, false>
                      dataEntryFormat={new FlightLevelFormat()}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'pilotTransitionLevel',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                        this.props.fmcService.master.acInterface.updateTransitionAltitudeLevel();
                      }}
                      enteredByPilot={this.transFlIsPilotEntered}
                      readonlyValue={this.transFl}
                      containerStyle="width: 110px;"
                      alignText="flex-start"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                  <div
                    class="mfd-label-value-container"
                    style={{ padding: '15px', visibility: this.visibilityConsideringFlightPlanIndex }}
                  >
                    <span class="mfd-label mfd-spacing-right">VERT DEV</span>
                    <span class="mfd-value">{this.apprVerticalDeviation}</span>
                  </div>
                </div>
                <div class="mfd-fms-perf-crz-dest">
                  <span class="mfd-label bigger">DEST</span>
                  <span class={{ 'mfd-label': true, green: this.mandatoryAndActiveFpln, bigger: true }}>
                    {this.destAirportIdent}
                  </span>
                  <span class={{ 'mfd-label': true, green: this.mandatoryAndActiveFpln, bigger: true }}>
                    {this.destEta}
                  </span>
                  <div class="mfd-label-value-container">
                    <span
                      class={{
                        'mfd-value': true,
                        sec: this.secActive,
                        amber: this.destEfobAmber,
                      }}
                    >
                      {this.destEfobFormatted}
                    </span>
                    <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>
                  </div>
                  <div style="display: flex; flex-direction: row;">
                    <Button
                      label="SPD CSTR"
                      onClick={() =>
                        this.props.mfd.uiService.navigateTo(
                          `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln-vert-rev/spd`,
                        )
                      }
                      disabled={this.desPageInactive}
                    />
                  </div>
                </div>
              </TopTabNavigatorPage>
              <TopTabNavigatorPage containerStyle={MfdFmsPerf.panelFrameStyle}>
                {/* APPR */}
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid lightgrey;">
                  <div class="mfd-label-value-container" style="padding: 15px;">
                    <span class="mfd-label mfd-spacing-right">APPR</span>
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.apprIdent}</span>
                  </div>
                  <div class="mfd-label-value-container" style="padding: 15px;">
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.destAirportIdent}</span>
                  </div>
                  <div class="mfd-label-value-container" style="padding: 15px;">
                    <span class="mfd-label mfd-spacing-right">LW</span>
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.apprLandingWeightFormatted}</span>
                    <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>
                  </div>
                </div>
                <div style="display: flex; flex-direction: row;">
                  {/* left column */}
                  <div style="flex: 5; display: flex; flex-direction: column;">
                    <div style="border: 1px solid lightgrey; display: flex; flex-direction: column; margin: 20px 40px 20px 0px; padding: 15px;">
                      <div style="display: flex; flex-direction: row;">
                        <span class="mfd-label mfd-spacing-right perf-appr-weather">MAG WIND</span>
                        <div style="border: 1px solid lightgrey; display: flex; flex-direction: row; padding: 2px;">
                          <InputField<number, number, false>
                            dataEntryFormat={new WindDirectionFormat()}
                            dataHandlerDuringValidation={async (v) => {
                              this.props.flightPlanInterface.setPerformanceData(
                                'approachWindDirection',
                                v,
                                this.loadedFlightPlanIndex.get(),
                              );
                            }}
                            readonlyValue={this.approachWindDirection}
                            alignText="center"
                            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                            hEventConsumer={this.props.mfd.hEventConsumer}
                            interactionMode={this.props.mfd.interactionMode}
                            disabled={this.isDestAirportMissing}
                          />
                          <InputField<number, number, false>
                            dataEntryFormat={new WindSpeedFormat()}
                            dataHandlerDuringValidation={async (v) => {
                              this.props.flightPlanInterface.setPerformanceData(
                                'approachWindMagnitude',
                                v,
                                this.loadedFlightPlanIndex.get(),
                              );
                            }}
                            readonlyValue={this.approachWindMagnitude}
                            containerStyle="margin-left: 10px;"
                            alignText="center"
                            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                            hEventConsumer={this.props.mfd.hEventConsumer}
                            interactionMode={this.props.mfd.interactionMode}
                            disabled={this.isDestAirportMissing}
                          />
                        </div>
                      </div>
                      <div style="display: flex; flex-direction: row; margin-top: 15px;">
                        <div class="mfd-label-value-container" style="padding: 15px;">
                          <span class="mfd-label mfd-spacing-right">{this.windDirectionLabel}</span>
                          <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.windSpeedDisplay}</span>
                          <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                        </div>
                        <div class="mfd-label-value-container" style="padding: 15px;">
                          <span class="mfd-label mfd-spacing-right">CROSS</span>
                          <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.apprCrosswind}</span>
                          <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                        </div>
                      </div>
                      <div style="display: flex; flex-direction: row; margin-top: 20px;">
                        <span class="mfd-label mfd-spacing-right perf-appr-weather">OAT</span>
                        <InputField<number, number, false>
                          dataEntryFormat={new TemperatureFormat(Subject.create(-99), Subject.create(99))}
                          dataHandlerDuringValidation={async (v) => {
                            this.props.flightPlanInterface.setPerformanceData(
                              'approachTemperature',
                              v,
                              this.loadedFlightPlanIndex.get(),
                            );
                          }}
                          mandatory={this.approachParametersMandatory}
                          readonlyValue={this.approachTemperature}
                          containerStyle="width: 125px;"
                          alignText="flex-end"
                          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                          hEventConsumer={this.props.mfd.hEventConsumer}
                          interactionMode={this.props.mfd.interactionMode}
                          disabled={this.isDestAirportMissing}
                        />
                      </div>
                      <div style="display: flex; flex-direction: row; margin-top: 15px;">
                        <span class="mfd-label mfd-spacing-right perf-appr-weather">QNH</span>
                        <InputField<number, number, false>
                          dataEntryFormat={new QnhFormat(this.approachQnhFormatIsHpa)}
                          dataHandlerDuringValidation={async (v) => {
                            if (!v) {
                              return;
                            }

                            this.props.flightPlanInterface.setPerformanceData(
                              'approachQnh',
                              v,
                              this.loadedFlightPlanIndex.get(),
                            );
                            SimVar.SetSimVarValue('L:A32NX_DESTINATION_QNH', 'Millibar', qnhToMillibar(v));
                          }}
                          mandatory={this.approachParametersMandatory}
                          readonlyValue={this.approachQnh}
                          containerStyle="width: 125px;"
                          alignText="flex-end"
                          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                          hEventConsumer={this.props.mfd.hEventConsumer}
                          interactionMode={this.props.mfd.interactionMode}
                          disabled={this.isDestAirportMissing}
                        />
                      </div>
                    </div>
                    <div class="mfd-fms-perf-appr-min-container">
                      <span class="mfd-label mfd-spacing-right mfd-fms-perf-appr-min-label">MINIMUM</span>
                      <div style="display: flex; flex-direction: row;">
                        <span class="mfd-label mfd-spacing-right perf-appr-weather">BARO</span>
                        <InputField<number, number, false>
                          dataEntryFormat={new AltitudeFormat(Subject.create(0), Subject.create(maxCertifiedAlt))}
                          dataHandlerDuringValidation={async (v) => {
                            this.props.flightPlanInterface.setPerformanceData(
                              'approachBaroMinimum',
                              v,
                              this.loadedFlightPlanIndex.get(),
                            );
                            SimVar.SetSimVarValue('L:AIRLINER_MINIMUM_DESCENT_ALTITUDE', 'feet', v);
                          }}
                          readonlyValue={this.approachBaroMinimum}
                          containerStyle="width: 150px;"
                          alignText="flex-end"
                          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                          hEventConsumer={this.props.mfd.hEventConsumer}
                          interactionMode={this.props.mfd.interactionMode}
                        />
                      </div>
                      <div style="display: flex; flex-direction: row; margin-top: 15px;">
                        <span class="mfd-label mfd-spacing-right perf-appr-weather">{this.apprRadioText}</span>
                        <ConditionalComponent
                          condition={this.precisionApproachSelected}
                          componentIfTrue={
                            <InputField<number, number, false>
                              dataEntryFormat={new RadioAltitudeFormat()}
                              dataHandlerDuringValidation={async (v) => {
                                this.props.flightPlanInterface.setPerformanceData(
                                  'approachRadioMinimum',
                                  v,
                                  this.loadedFlightPlanIndex.get(),
                                );
                                SimVar.SetSimVarValue('L:AIRLINER_DECISION_HEIGHT', 'feet', v === null ? -1 : v);
                              }}
                              readonlyValue={this.approachRadioMinimum}
                              containerStyle="width: 150px;"
                              alignText="flex-end"
                              errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                              hEventConsumer={this.props.mfd.hEventConsumer}
                              interactionMode={this.props.mfd.interactionMode}
                            />
                          }
                          componentIfFalse={<></>}
                        />
                      </div>
                    </div>
                  </div>
                  {/* right column */}
                  <div style="flex: 4; display: flex; flex-direction: column;">
                    <div style="display: flex; flex-direction: column; align-items: center; margin-top: 30px;">
                      <div class="mfd-label-value-container">
                        <span class="mfd-fms-perf-appr-flap-speeds">
                          <svg width="13" height="13" viewBox="0 0 13 13">
                            <circle cx="6" cy="6" r="5" stroke="#00ff00" stroke-width="2" />
                          </svg>
                        </span>
                        <span class={{ 'mfd-value': true, sec: this.secActive }}>
                          {FmgcData.fmcFormatValue(this.approachGreenDotSpeed)}
                        </span>
                        <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                      </div>
                      <div class="mfd-label-value-container">
                        <span class="mfd-label mfd-spacing-right mfd-fms-perf-appr-flap-speeds">S</span>
                        <span class={{ 'mfd-value': true, sec: this.secActive }}>
                          {FmgcData.fmcFormatValue(this.approachSlatRetractionSpeed)}
                        </span>
                        <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                      </div>
                      <div class="mfd-label-value-container">
                        <span class="mfd-label mfd-spacing-right mfd-fms-perf-appr-flap-speeds">F</span>
                        <span class={{ 'mfd-value': true, sec: this.secActive }}>
                          {FmgcData.fmcFormatValue(this.approachFlapRetractionSpeed)}
                        </span>
                        <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                      </div>
                      <div
                        class="mfd-label-value-container"
                        style={{ paddingTop: '15px', visibility: this.visibilityConsideringFlightPlanIndex }}
                      >
                        <span class="mfd-label mfd-spacing-right mfd-fms-perf-appr-flap-speeds">VREF</span>
                        <span class="mfd-value">{FmgcData.fmcFormatValue(this.approachVref)}</span>
                        <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                      </div>
                    </div>
                    <div class="mfd-fms-perf-appr-conf-box">
                      <RadioButtonGroup
                        values={['CONF 3', 'FULL']}
                        selectedIndex={this.apprSelectedFlapsIndex}
                        onModified={(v) =>
                          this.props.flightPlanInterface.setPerformanceData(
                            'approachFlapsThreeSelected',
                            v === 0,
                            this.loadedFlightPlanIndex.get(),
                          )
                        }
                        idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_apprFlapsSettingsRadio`}
                        additionalVerticalSpacing={15}
                      />
                      <div class="mfd-label-value-container" style="margin-top: 10px;">
                        <span class="mfd-label mfd-spacing-right">VLS</span>
                        <span class={{ 'mfd-value': true, sec: this.secActive }}>
                          {FmgcData.fmcFormatValue(this.approachVls)}
                        </span>
                        <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                      </div>
                    </div>
                    <div class="mfd-fms-perf-appr-vapp-box">
                      <div style="display: flex; flex-direction: row; justify-content: center; justify-self; center;">
                        <span class="mfd-label mfd-spacing-right" style="text-align: right; align-self: center;">
                          VAPP
                        </span>
                        <InputField<number, number, false>
                          dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                          dataHandlerDuringValidation={async (v) =>
                            this.props.flightPlanInterface.setPerformanceData(
                              'pilotVapp',
                              v,
                              this.loadedFlightPlanIndex.get(),
                            )
                          }
                          readonlyValue={this.approachVapp}
                          enteredByPilot={this.approachVappPilotEntry}
                          alignText="flex-end"
                          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                          hEventConsumer={this.props.mfd.hEventConsumer}
                          interactionMode={this.props.mfd.interactionMode}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div style="flex-grow: 1;" />
                {/* fill space vertically */}
                <div class="mfd-fms-perf-appr-trans-vertdev">
                  <div class="mfd-label-value-container">
                    <span
                      class="mfd-label mfd-spacing-right"
                      style="width: 125px; text-align: right; align-self: center; padding-left: 20px;"
                    >
                      TRANS
                    </span>
                    <InputField<number, number, false>
                      dataEntryFormat={new FlightLevelFormat()}
                      dataHandlerDuringValidation={async (v) => {
                        this.props.flightPlanInterface.setPerformanceData(
                          'pilotTransitionLevel',
                          v,
                          this.loadedFlightPlanIndex.get(),
                        );
                        this.props.fmcService.master.acInterface.updateTransitionAltitudeLevel();
                      }}
                      enteredByPilot={this.transFlIsPilotEntered}
                      readonlyValue={this.transFl}
                      containerStyle="width: 110px;"
                      alignText="flex-start"
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                  <div
                    class="mfd-label-value-container"
                    style={{ padding: '15px', visibility: this.visibilityConsideringFlightPlanIndex }}
                  >
                    <span class="mfd-label mfd-spacing-right">VERT DEV</span>
                    <span class="mfd-value">{this.apprVerticalDeviation}</span>
                  </div>
                </div>
              </TopTabNavigatorPage>
              <TopTabNavigatorPage containerStyle={MfdFmsPerf.panelFrameStyle}>
                {/* GA */}
                <div style="margin: 60px 0px 100px 200px; display: flex; flex-direction: column;">
                  <div class="mfd-label-value-container">
                    <span class="mfd-label mfd-spacing-right">F</span>
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>
                      {FmgcData.fmcFormatValue(this.approachFlapRetractionSpeed)}
                    </span>
                    <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                  </div>
                  <div class="mfd-label-value-container">
                    <span class="mfd-label mfd-spacing-right">S</span>
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>
                      {FmgcData.fmcFormatValue(this.approachSlatRetractionSpeed)}
                    </span>
                    <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                  </div>
                  <div class="mfd-label-value-container">
                    <span style="margin-right: 15px; text-align: right;">
                      <svg width="13" height="13" viewBox="0 0 13 13">
                        <circle cx="6" cy="6" r="5" stroke="#00ff00" stroke-width="2" />
                      </svg>
                    </span>
                    <span class={{ 'mfd-value': true, sec: this.secActive }}>
                      {FmgcData.fmcFormatValue(this.approachGreenDotSpeed)}
                    </span>
                    <span class="mfd-label-unit mfd-unit-trailing">KT</span>
                  </div>
                </div>
                <div style="display: flex; flex-direction: column;">
                  <div style="display: flex; flex-direction: row;">
                    <div class="mfd-fms-perf-appr-thrred-accel">
                      <span class="mfd-label">THR RED</span>
                    </div>
                    <div style="margin-bottom: 15px;">
                      <InputField<number, number, false>
                        dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transFlToAlt)}
                        dataHandlerDuringValidation={async (v) => {
                          this.props.flightPlanInterface.setPerformanceData(
                            'pilotMissedThrustReductionAltitude',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          );
                        }}
                        enteredByPilot={this.missedThrRedAltIsPilotEntered}
                        readonlyValue={this.missedThrRedAlt}
                        containerStyle="width: 150px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: row;">
                    <div class="mfd-fms-perf-appr-thrred-accel">
                      <span class="mfd-label">ACCEL</span>
                    </div>
                    <div style="margin-bottom: 15px;">
                      <InputField<number, number, false>
                        dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transFlToAlt)}
                        dataHandlerDuringValidation={async (v) => {
                          this.props.flightPlanInterface.setPerformanceData(
                            'pilotMissedAccelerationAltitude',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          );
                        }}
                        enteredByPilot={this.missedAccelAltIsPilotEntered}
                        readonlyValue={this.missedAccelAlt}
                        containerStyle="width: 150px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />
                    </div>
                    <div class="mfd-fms-perf-appr-eo-accel">
                      <span class="mfd-label">EO ACCEL</span>
                    </div>
                    <div style="margin-bottom: 15px;">
                      <InputField<number, number, false>
                        dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transFlToAlt)}
                        dataHandlerDuringValidation={async (v) => {
                          this.props.flightPlanInterface.setPerformanceData(
                            'pilotMissedEngineOutAccelerationAltitude',
                            v,
                            this.loadedFlightPlanIndex.get(),
                          );
                        }}
                        enteredByPilot={this.missedEngineOutAccelAltIsPilotEntered}
                        readonlyValue={this.missedEngineOutAccelAlt}
                        containerStyle="width: 150px;"
                        alignText="flex-end"
                        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />
                    </div>
                  </div>
                </div>
                <div style="flex-grow: 1;" />
                {/* fill space vertically */}
                <div class="mfd-label-value-container">
                  <span class="mfd-label mfd-spacing-right" style="width: 150px; text-align: right;">
                    TRANS
                  </span>
                  <span class={{ 'mfd-value': true, sec: this.secActive }}>
                    {FmgcData.fmcFormatValue(this.transFlToAlt)}
                  </span>
                  <span class="mfd-label-unit mfd-unit-trailing">FT</span>
                </div>
              </TopTabNavigatorPage>
            </TopTabNavigator>
            <div class="mfd-fms-perf-appr-footer">
              <div class="mfd-fms-perf-footer-item" style="left: 4px;">
                <Button
                  label="RETURN"
                  onClick={() =>
                    // FCOM DSC-22-FMS-20-30 PERF page: RETURN displays the INIT page
                    this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/init`)
                  }
                  buttonStyle="min-width: 129px;"
                />
                <ConfirmationDialog
                  visible={this.approachPhaseConfirmationDialogVisible}
                  cancelAction={() => {
                    this.approachPhaseConfirmationDialogVisible.set(false);
                  }}
                  confirmAction={() => {
                    this.approachPhaseConfirmationDialogVisible.set(false);
                    this.props.fmcService.master.tryGoInApproachPhase();
                  }}
                  contentContainerStyle="width: 280px; height: 165px; bottom: -6px; left: -5px;"
                  amberLabel={true}
                >
                  {'ACTIVATE APPR ?'}
                </ConfirmationDialog>
                <ConfirmationDialog
                  visible={this.clearEoConfirmationDialogVisible}
                  cancelAction={() => {
                    this.clearEoConfirmationDialogVisible.set(false);
                  }}
                  confirmAction={() => {
                    this.clearEoConfirmationDialogVisible.set(false);
                    this.props.fmcService.master.fmgc.data.engineOut.set(false);
                  }}
                  contentContainerStyle="width: 450px; height: 165px; bottom: -6px; left: -5px; text-align: center;"
                  amberLabel={true}
                >
                  {'CLEAR EO ?'}
                  <br />
                  <br />
                  <span style="color: white;">(BACK TO ALL ENGs COMPUTATION)</span>
                </ConfirmationDialog>
              </div>
              <div
                class="mfd-fms-perf-footer-item"
                style={{ left: '606px', visibility: this.activateApprButtonVisibility }}
              >
                <Button
                  label={
                    <div style="display: flex; flex-direction: row; justify-content: space-between;">
                      <span style="text-align: center; vertical-align: center; margin-right: 10px;">
                        ACTIVATE
                        <br />
                        APPR
                      </span>
                      <span style="display: flex; align-items: center; justify-content: center;">*</span>
                    </div>
                  }
                  onClick={() => this.approachPhaseConfirmationDialogVisible.set(true)}
                  buttonStyle="color: #e68000; padding-right: 2px; min-width: 160px; min-height: 60px;"
                />
              </div>
              <div
                class="mfd-fms-perf-footer-item"
                style={{
                  left: '280px',
                  visibility: this.visibilityConsideringFlightPlanIndex,
                }}
              >
                <Button
                  label="POS MONITOR"
                  onClick={() =>
                    this.props.mfd.uiService.navigateTo(`fms/position/monitor/${showReturnButtonUriExtra}`)
                  }
                  buttonStyle="min-width: 181px;"
                />
              </div>
              <div class="mfd-fms-perf-footer-item" style={{ left: '462px', visibility: this.clearEoButtonVisibility }}>
                <Button
                  label={
                    <div style="display: flex; flex-direction: row; justify-content: space-between;">
                      <span style="text-align: center; vertical-align: center; margin-right: 10px;">
                        CLEAR
                        <br />
                        EO
                      </span>
                      <span style="display: flex; align-items: center; justify-content: center;">*</span>
                    </div>
                  }
                  onClick={() => this.clearEoConfirmationDialogVisible.set(true)}
                  buttonStyle="color: #e68000; padding-right: 2px; min-width: 138px; min-height: 60px;"
                />
              </div>
            </div>
          </div>
          {/* end page content */}
          <Footer
            bus={this.props.bus}
            mfd={this.props.mfd}
            fmcService={this.props.fmcService}
            flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
          />
        </>
      )
    );
  }
}
