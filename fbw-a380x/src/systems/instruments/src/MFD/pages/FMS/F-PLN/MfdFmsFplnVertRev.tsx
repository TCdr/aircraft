// Copyright (c) 2024-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0
import { TopTabNavigator, TopTabNavigatorPage } from '../../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';

import {
  ArraySubject,
  ClockEvents,
  FSComponent,
  MappedSubject,
  Subject,
  SubscribableMapFunctions,
  Subscription,
  UnitType,
  VNode,
} from '@microsoft/msfs-sdk';

import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { AbstractMfdPageProps } from '../../../MFD';
import { Footer } from '../../common/Footer';

import './MfdFmsFplnVertRev.scss';
import { FmsPage } from '../../common/FmsPage';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { AltitudeOrFlightLevelFormat, SpeedKnotsFormat, TimeHHMMSSFormat } from '../../common/DataEntryFormats';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { Vmo } from '@shared/PerformanceConstants';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { RadioButtonColor, RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { AltitudeDescriptor, WaypointConstraintType } from '@flybywiresim/fbw-sdk';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { FmgcData } from '../../../FMC/fmgc';
import { CruiseStepEntry } from '@fmgc/flightplanning/CruiseStep';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';
import { getEtaFromUtcOrPresent, isConstraintRevisionAllowed } from '../../../shared/utils';
import { FmgcFlightPhase } from '@shared/flightphase';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { ReadonlyFlightPlanLeg } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { fcomAt, fcomCentre, fcomLine, fcomRight, fcomTabBar } from '../../common/FcomLayout';
import { TimeConstraint, TimeConstraintType } from '../../../FMC/TimeConstraint';

interface MfdFmsFplnVertRevProps extends AbstractMfdPageProps {}

enum SpeedLimitType {
  CLB,
  DES,
}

enum SelectedPage {
  RTA = 0,
  SPD = 1,
  CMS = 2,
  ALT = 3,
  STEP_ALTS = 4,
}

enum StepDisabledReason {
  EngineOut = 'STEP ALTs NOT ALLOWED IN EO',
  Descent = 'STEP ALTs NOT ALLOWED IN DES',
  Approach = 'STEP ALTs NOT ALLOWED IN APPR',
  GoAround = 'STEP ALTs NOT ALLOWED IN GA',
  Done = 'STEP ALTs NOT ALLOWED IN DONE',
  NoCruiseLevel = 'STEP ALTs NOT ALLOWED: NO CRZ FL',
}

export class MfdFmsFplnVertRev extends FmsPage<MfdFmsFplnVertRevProps> {
  private readonly selectedPageIndex = Subject.create(SelectedPage.RTA);
  private availableWaypointsIdents: string[] = [];
  private readonly availableWaypoints = ArraySubject.create<string>([]);
  private initialLoadRevisedWaypointIndex = true;

  private availableWaypointsToLegIndex: number[] = [];
  private readonly selectedLegIndex = Subject.create<number | null>(null);

  private readonly altitudeErrorText = Subject.create('');

  private readonly altitudeErrorAmber = Subject.create(false);

  private readonly altitudeErrorUnitVisibility = this.altitudeErrorText.map((t) => (t ? 'inherit' : 'hidden'));

  /** Display state of the altitude error, with the FCOM hysteresis */
  private altitudeErrorState: 'hidden' | 'green' | 'amber' = 'hidden';
  private selectedLegIsAlternate: boolean | null = null;
  private readonly dropdownMenuSelectedWaypointIndex = this.selectedLegIndex.map((si) => {
    if (si === null) {
      return null;
    } else {
      const idx = this.availableWaypointsToLegIndex.findIndex((i) => i === si);
      return idx !== -1 ? idx : null;
    }
  });

  private readonly returnButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly tmpyInsertButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly tmpyColor = this.tmpyActive.map((it) => (it ? RadioButtonColor.Yellow : RadioButtonColor.Cyan));

  /** in feet */
  private readonly transitionAltitude = Subject.create<number | null>(null);
  /** in feet */
  private readonly transitionLevel = Subject.create<number | null>(null);

  private readonly constraintType = Subject.create<'CLB' | 'DES' | ''>('');

  private readonly spdConstraintTypeRadioSelected = Subject.create<number | null>(null);
  private readonly altConstraintTypeRadioSelected = Subject.create<number | null>(null);

  // RTA page (FCOM DSC-22-FMS-20-30 P 360-364)

  /** RTA message area: EXISTING RTA AT / RTA NOT ALLOWED AT (amber) followed by the waypoint ident (big font) */
  private readonly rtaMessage = Subject.create('');

  private readonly rtaMessageIdent = Subject.create('');

  private readonly rtaMessageSuffix = Subject.create('');

  /** FCOM P 344: RTA NOT ALLOWED IN EO, the panel is empty with this message */
  private readonly rtaPanelMessage = Subject.create('');

  private readonly rtaPanelVisible = this.rtaPanelMessage.map((m) => m === '');

  private readonly rtaDistance = Subject.create('----');

  private readonly rtaUtc = Subject.create('--:--:--');

  private readonly rtaEta = Subject.create('--:--:--');

  /** Selected RTA option (AT, AT OR BEFORE, AT OR AFTER), null when no RTA is defined on the selected waypoint */
  private readonly rtaType = Subject.create<number | null>(null);

  private readonly rtaTime = Subject.create<number | null>(null);

  /** The RTA entry field is displayed on the line of the selected option (FCOM P 362) */
  private readonly rtaFieldStyle = this.rtaType.map((t) =>
    t === null ? 'display: none;' : `display: block; position: absolute; left: 0; top: ${t * 50}px;`,
  );

  private readonly rtaDeleteVisible = Subject.create(false);

  private readonly rtaTimeError = Subject.create('');

  private readonly rtaTimeErrorType = Subject.create('');

  private readonly rtaTimeErrorAmber = Subject.create(false);

  /** Display state of the time error, with the FCOM P 364 hysteresis */
  private rtaTimeErrorState: 'hidden' | 'green' | 'amber' = 'hidden';

  private readonly inPreflight = Subject.create(true);

  // SPD page
  private readonly speedMessageArea = Subject.create<string>('');

  /** in knots */
  private readonly speedConstraintInput = Subject.create<number | null>(null);

  private readonly spdConstraintDisabled = Subject.create(true);

  private readonly cannotDeleteSpeedConstraint = Subject.create(true);

  private readonly speedLimitType = Subject.create<SpeedLimitType>(SpeedLimitType.CLB);

  private readonly speedLimitPilotEntered = Subject.create(false);

  private readonly speedLimitSpeed = Subject.create<number | null>(null);

  private readonly speedLimitAltitude = Subject.create<number | null>(null);

  private readonly speedLimitTransition = Subject.create<number | null>(null);

  private readonly isSpeedLimitTransitionFL = Subject.create(false);

  private readonly speedLimitText = this.speedLimitType.map(
    (v) => `${v === SpeedLimitType.CLB ? 'CLB' : 'DES'} SPD LIMIT`,
  );

  private readonly deleteSpeedLimitDisabled = MappedSubject.create(
    ([speed, altitude]) => speed === null || altitude === null,
    this.speedLimitSpeed,
    this.speedLimitAltitude,
  );

  // CMS page

  // ALT page
  private readonly altitudeMessageArea = Subject.create<string>('');

  /** in feet */
  private readonly altitudeConstraintInput = Subject.create<number | null>(null);

  private readonly altConstraintDisabled = Subject.create(true);

  private readonly cannotDeleteAltConstraint = Subject.create(true);

  private readonly altitudeClbDesConstraintVisibility = Subject.create('hidden');

  private readonly altConstraintTransitionAltitude = Subject.create<number | null>(null);

  private readonly altConstraintTransitionIsFlightLevel = Subject.create<boolean>(false);

  /** 0: AT, 1: AT OR ABOVE 2: AT OR BELOW */
  private readonly selectedAltitudeConstraintOption = Subject.create<number | null>(null);

  private readonly selectedAltitudeConstraintDisabled = this.altConstraintDisabled.map((it) => Array(3).fill(it));

  private readonly selectedAltitudeConstraintInvisible = this.selectedAltitudeConstraintOption.map((v) => v === null);

  private readonly altWindowLabelRef = FSComponent.createRef<HTMLDivElement>();

  private readonly altWindowValueRef = FSComponent.createRef<HTMLDivElement>();

  private readonly altWindowUnitLeading = Subject.create<string>('');

  private readonly altWindowUnitValue = Subject.create<string>('EMPTY');

  private readonly altWindowUnitTrailing = Subject.create<string>('');

  // STEP ALTs page
  /** Paused when not in STEP ALts page */
  private stepsAltsClockSub?: Subscription;

  private readonly stepPageDisabledReason = Subject.create<StepDisabledReason | null>(null);
  private readonly stepPageDisabledMessageDisplay = this.stepPageDisabledReason.map((reason) =>
    reason ? 'inherit' : 'none',
  );
  private readonly stepAltsPageDisplay = this.stepPageDisabledReason.map((reason) => (reason ? 'none' : 'block'));
  private readonly fillPageDisplay = MappedSubject.create(
    ([page, stepAltDisabled]) => (page === SelectedPage.STEP_ALTS && !stepAltDisabled ? 'inherit' : 'none'),
    this.selectedPageIndex,
    this.stepPageDisabledReason,
  );

  private readonly crzFl = Subject.create<number | null>(null);
  private readonly crzFlFormatted = FmgcData.fmcFormatValue(this.crzFl);

  private readonly stepAltsTimeHeader = this.activeFlightPhase.map((fp) =>
    fp === FmgcFlightPhase.Preflight ? 'TIME' : 'UTC',
  );

  /** If set to true, a re-layouting of the lines is forced, e.g. if an entry in the middle was deleted. */
  private forceRebuildList = false;

  private readonly stepAltsLineVisibility = Array.from(Array(5), () => Subject.create<'visible' | 'hidden'>('hidden'));
  private readonly stepLinesPredictionsVisibility = Array.from(Array(5), () =>
    Subject.create<'visible' | 'hidden'>('hidden'),
  );
  private readonly stepAltsWptIndices = Array.from(Array(5), () => Subject.create<number | null>(null));
  private readonly stepAltsAltitude = Array.from(Array(5), () => Subject.create<number | null>(null));
  private readonly stepAltsDistances = Array.from(Array(5), () => Subject.create<number | null>(null));
  private readonly stepAltsDistancesFormatted = Array.from(Array(5), (_, x) =>
    FmgcData.fmcFormatValue(this.stepAltsDistances[x]),
  );
  private readonly stepAltsTimes = Array.from(Array(5), () => Subject.create<string>('--:--'));
  private readonly stepAltsIgnored = Array.from(Array(5), () => Subject.create<boolean>(false));
  private readonly stepAltsAboveMaxFl = Array.from(Array(5), () => Subject.create<boolean>(false));
  private readonly stepAltsMessage = Array.from(Array(5), () => Subject.create<string>(''));
  private readonly stepAltsMessageDisplay = Array.from(Array(5), (_, x) =>
    MappedSubject.create(SubscribableMapFunctions.or(), this.stepAltsIgnored[x], this.stepAltsAboveMaxFl[x]).map((i) =>
      i ? 'flex' : 'none',
    ),
  );
  private readonly stepAltsNoMessageDisplay = Array.from(Array(5), (_, x) =>
    MappedSubject.create(SubscribableMapFunctions.or(), this.stepAltsIgnored[x], this.stepAltsAboveMaxFl[x]).map((i) =>
      i ? 'none' : 'flex',
    ),
  );

  private readonly stepNotAllowedAt = Subject.create<string | null>(null);
  private readonly stepNotAllowedAtVisibility = this.stepNotAllowedAt.map((s) => (!s ? 'hidden' : 'visible'));

  private readonly stepAltsStartAtStepIndex = Subject.create<number>(0);
  private readonly stepAltsNumberOfCruiseSteps = Subject.create<number>(0);

  private readonly stepAltsScrollDownDisabled = Subject.create(true);
  private readonly stepAltsScrollUpDisabled = Subject.create(true);

  protected onNewData(): void {
    const pd = this.loadedFlightPlan?.performanceData;

    this.transitionAltitude.set(pd?.transitionAltitude.get() ?? null);
    this.transitionLevel.set(pd?.transitionLevel.get() ?? null);

    // Do not update till a flightplan has been fully loaded.
    const fpLoaded = this.selectedLegIsAlternate !== null;
    if (!fpLoaded) {
      return;
    }

    const plan = this.selectedLegIsAlternate ? this.loadedAlternateFlightPlan : this.loadedFlightPlan;
    const activeLegIndex = plan?.activeLegIndex;
    let indexToSelect: number | null = null;
    this.availableWaypointsToLegIndex = [];
    this.availableWaypointsIdents = [];
    if (activeLegIndex !== undefined && plan !== null) {
      for (let i = activeLegIndex; i < plan.legCount; i++) {
        const leg = plan.maybeElementAt(i);
        if (isLeg(leg) && leg.isXF()) {
          this.availableWaypointsToLegIndex.push(i);
          this.availableWaypointsIdents.push(leg.ident);
        }
      }
      indexToSelect = this.availableWaypointsToLegIndex[0] ?? null;
    }
    this.availableWaypoints.set(this.availableWaypointsIdents);
    if (this.initialLoadRevisedWaypointIndex) {
      this.selectedLegIndex.set(this.props.fmcService.master.revisedLegIndex.get() ?? indexToSelect);
      this.initialLoadRevisedWaypointIndex = false;
    } else {
      const currentSelection = this.selectedLegIndex.get();
      this.selectedLegIndex.set(
        currentSelection !== null && this.availableWaypointsToLegIndex.includes(currentSelection)
          ? currentSelection
          : indexToSelect,
      );
      const newSelection = this.selectedLegIndex.get();
      if (currentSelection !== newSelection) {
        // Reset leg constraint options in case they were manually entered but not persisted.
        this.spdConstraintTypeRadioSelected.set(null);
        this.altConstraintTypeRadioSelected.set(null);
        this.selectedAltitudeConstraintOption.set(null);
        this.altitudeConstraintInput.set(null);
        this.speedConstraintInput.set(null);
      }
    }

    this.crzFl.set(pd?.cruiseFlightLevel.get() ?? null);
    this.updateConstraints();
    this.updateCruiseSteps();
  }

  public static isEligibleForVerticalRevision(
    legIndex: number,
    leg: ReadonlyFlightPlanLeg,
    flightPlan: ReadonlyFlightPlan,
  ): boolean {
    return isConstraintRevisionAllowed(leg) && legIndex >= flightPlan.activeLegIndex;
  }

  private updateConstraints() {
    if (!this.props.fmcService.master || this.selectedLegIsAlternate === null) {
      return;
    }

    const plan = this.selectedLegIsAlternate ? this.loadedAlternateFlightPlan : this.loadedFlightPlan;
    const selectedLegIdx = this.selectedLegIndex.get();
    const leg = selectedLegIdx !== null ? plan?.legElementAt(selectedLegIdx) : null;
    const previousElement = selectedLegIdx !== null ? plan?.maybeElementAt(selectedLegIdx - 1) : null;
    const isPartOfTooSteepPathSegment = leg
      ? leg.calculated?.endsInTooSteepPath ||
        (previousElement?.isDiscontinuity === false && previousElement.calculated?.endsInTooSteepPath)
      : null;

    if (
      plan &&
      leg &&
      selectedLegIdx !== null &&
      !MfdFmsFplnVertRev.isEligibleForVerticalRevision(selectedLegIdx, leg, plan)
    ) {
      this.speedMessageArea.set(`SPD CSTR NOT ALLOWED AT ${leg.ident}`);
      this.spdConstraintDisabled.set(true);
      this.spdConstraintTypeRadioSelected.set(null);
      this.speedConstraintInput.set(null);
      this.altitudeMessageArea.set(`ALT CSTR NOT ALLOWED AT ${leg.ident}`);
      this.altConstraintDisabled.set(true);
      this.altitudeConstraintInput.set(null);
      this.selectedAltitudeConstraintOption.set(null);
      return;
    }
    // Load speed constraints
    const selectedIndex = this.selectedPageIndex.get();
    if (selectedIndex === SelectedPage.SPD) {
      this.speedMessageArea.set('');
      this.spdConstraintDisabled.set(false);
      const constraintType =
        plan && selectedLegIdx !== null && leg?.constraintType === WaypointConstraintType.Unknown
          ? plan.autoConstraintTypeForLegIndex(selectedLegIdx)
          : leg?.constraintType ?? WaypointConstraintType.Unknown;
      const speedLimitType =
        constraintType === WaypointConstraintType.DES ||
        (this.props.fmcService.master.flightPlanInterface
          .get(this.loadedFlightPlanIndex.get())
          .isActiveOrCopiedFromActive() &&
          this.activeFlightPhase.get() > FmgcFlightPhase.Cruise &&
          this.activeFlightPhase.get() < FmgcFlightPhase.GoAround)
          ? SpeedLimitType.DES
          : SpeedLimitType.CLB;
      this.speedLimitType.set(speedLimitType);

      this.isSpeedLimitTransitionFL.set(speedLimitType === SpeedLimitType.DES);
      this.speedLimitTransition.set(
        speedLimitType === SpeedLimitType.CLB ? this.transitionAltitude.get() : this.transitionLevel.get(),
      );

      const climbSpeedLimit = speedLimitType === SpeedLimitType.CLB;
      const isAlternate = this.selectedLegIsAlternate;

      const speedLimitSpeed = climbSpeedLimit
        ? isAlternate
          ? plan?.performanceData.alternateClimbSpeedLimitSpeed.get()
          : plan?.performanceData.climbSpeedLimitSpeed.get()
        : isAlternate
          ? plan?.performanceData.alternateDescentSpeedLimitSpeed.get()
          : plan?.performanceData.descentSpeedLimitSpeed.get();

      const speedLimitAltitude = climbSpeedLimit
        ? isAlternate
          ? plan?.performanceData.alternateClimbSpeedLimitAltitude.get()
          : plan?.performanceData.climbSpeedLimitAltitude.get()
        : isAlternate
          ? plan?.performanceData.alternateDescentSpeedLimitAltitude.get()
          : plan?.performanceData.descentSpeedLimitAltitude.get();

      this.speedLimitSpeed.set(speedLimitSpeed ?? null);
      this.speedLimitAltitude.set(speedLimitAltitude ?? null);
      this.speedLimitPilotEntered.set(
        climbSpeedLimit
          ? isAlternate
            ? plan?.performanceData.isAlternateClimbSpeedLimitPilotEntered.get() ?? false
            : plan?.performanceData.isClimbSpeedLimitPilotEntered.get() ?? false
          : isAlternate
            ? plan?.performanceData.isAlternateDescentSpeedLimitPilotEntered.get() ?? false
            : plan?.performanceData.isDescentSpeedLimitPilotEntered.get() ?? false,
      );

      if (constraintType !== WaypointConstraintType.Unknown) {
        this.constraintType.set(constraintType === WaypointConstraintType.CLB ? 'CLB' : 'DES');
        this.spdConstraintTypeRadioSelected.set(constraintType === WaypointConstraintType.CLB ? 0 : 1);
        this.altitudeClbDesConstraintVisibility.set('hidden');
        this.speedConstraintInput.set(leg?.speedConstraint?.speed ?? null);
      } else {
        this.altitudeClbDesConstraintVisibility.set('visible');
      }
      this.cannotDeleteSpeedConstraint.set(!leg?.speedConstraint || !leg?.speedConstraint?.speed);
    } else if (selectedIndex === SelectedPage.ALT) {
      this.altitudeMessageArea.set(isPartOfTooSteepPathSegment ? 'TOO STEEP PATH AHEAD' : '');
      this.altConstraintDisabled.set(false);
      const constraintType =
        plan && selectedLegIdx !== null && leg?.constraintType === WaypointConstraintType.Unknown
          ? plan.autoConstraintTypeForLegIndex(selectedLegIdx)
          : leg?.constraintType ?? WaypointConstraintType.Unknown;
      this.constraintType.set(
        constraintType === WaypointConstraintType.CLB
          ? 'CLB'
          : constraintType === WaypointConstraintType.DES
            ? 'DES'
            : '',
      );
      if (constraintType !== WaypointConstraintType.Unknown) {
        this.altConstraintTypeRadioSelected.set(constraintType === WaypointConstraintType.CLB ? 0 : 1);
        this.altitudeClbDesConstraintVisibility.set('hidden');
        // Load altitude constraints
        switch (leg?.altitudeConstraint?.altitudeDescriptor) {
          case AltitudeDescriptor.AtAlt1:
          case AltitudeDescriptor.AtAlt1GsIntcptAlt2:
          case AltitudeDescriptor.AtAlt1AngleAlt2:
            this.selectedAltitudeConstraintOption.set(0);
            break;
          case AltitudeDescriptor.AtOrAboveAlt1:
          case AltitudeDescriptor.AtOrAboveAlt1GsIntcptAlt2:
          case AltitudeDescriptor.AtOrAboveAlt1AngleAlt2:
            this.selectedAltitudeConstraintOption.set(1);
            break;
          case AltitudeDescriptor.AtOrBelowAlt1:
          case AltitudeDescriptor.AtOrBelowAlt1AngleAlt2:
            this.selectedAltitudeConstraintOption.set(2);
            break;
          default:
            this.selectedAltitudeConstraintOption.set(null);
            break;
        }
        this.altitudeConstraintInput.set(leg?.altitudeConstraint?.altitude1 ?? null);
      } else {
        this.altitudeClbDesConstraintVisibility.set('visible');
      }

      this.cannotDeleteAltConstraint.set(
        !leg?.altitudeConstraint || leg.altitudeConstraint?.altitudeDescriptor === AltitudeDescriptor.None,
      );

      const ac = leg?.altitudeConstraint;
      if (ac) {
        const transAltIsFlightLevel = leg.constraintType === WaypointConstraintType.DES;
        const transAlt = transAltIsFlightLevel ? this.transitionLevel.get() : this.transitionAltitude.get();
        this.altConstraintTransitionAltitude.set(transAlt);

        this.altConstraintTransitionIsFlightLevel.set(transAltIsFlightLevel);
        if (
          ac.altitudeDescriptor === AltitudeDescriptor.BetweenAlt1Alt2 &&
          ac.altitude1 !== undefined &&
          ac.altitude2 !== undefined
        ) {
          // ALT window, alt 1 is the higher altitude, displayed 2nd in the box
          const transAltFeet = transAlt !== null ? (transAltIsFlightLevel ? transAlt * 100 : transAlt) : null;

          // FIXME check format when only the higher altitude is above TA/TL
          const alt1IsFl = this.isAltitudeConstraintFlightLevel(ac.altitude1, transAltFeet, leg);
          const alt2IsFl = this.isAltitudeConstraintFlightLevel(ac.altitude2, transAltFeet, leg);
          this.altWindowUnitLeading.set(alt1IsFl && !alt2IsFl ? 'FT' : '');
          this.altWindowUnitTrailing.set(alt1IsFl ? 'FL' : 'FT');
          this.altWindowUnitValue.set(
            `${(alt2IsFl ? ac.altitude2 / 100 : ac.altitude2).toFixed(0).padStart(3, '0')}-${(alt1IsFl ? ac.altitude1 / 100 : ac.altitude1).toFixed(0).padStart(3, '0')}`,
          );

          this.altWindowLabelRef.instance.style.visibility = 'visible';
          this.altWindowValueRef.instance.style.visibility = 'visible';
        } else {
          if (ac?.altitudeDescriptor === AltitudeDescriptor.BetweenAlt1Alt2) {
            console.error(
              'BetweenAlt1Alt2 constraint with either altitude1 or altitude2 undefined!',
              leg.ident,
              leg.definition.procedureIdent,
              ac?.altitude1,
              ac?.altitude2,
            );
          }
          this.altWindowLabelRef.instance.style.visibility = 'hidden';
          this.altWindowValueRef.instance.style.visibility = 'hidden';
        }
      }
    }
  }

  /**
   * FCOM DSC-22-FMS-20-30 VERT REV page, ALT panel, ALTITUDE ERROR: predicted altitude - altitude constraint, only in
   * the direction that misses the constraint. Displayed green from 100 ft (hidden again below 80 ft), amber from
   * 250 ft (green again below 200 ft).
   */
  private updateAltitudeError(): void {
    const legIndex = this.selectedLegIndex.get();
    const plan = this.loadedFlightPlan;
    const leg = legIndex !== null && plan ? plan.maybeElementAt(legIndex) : undefined;
    const constraint = isLeg(leg) ? leg.altitudeConstraint : undefined;
    const prediction =
      legIndex !== null && this.loadedFlightPlanIndex.get() < FlightPlanIndex.Uplink && !this.selectedLegIsAlternate
        ? this.props.fmcService.master?.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions?.get(legIndex)
        : undefined;

    let error: number | null = null;
    if (constraint && constraint.altitude1 !== undefined && prediction?.altitude !== undefined) {
      const predicted = prediction.altitude;
      switch (constraint.altitudeDescriptor) {
        case AltitudeDescriptor.AtOrAboveAlt1:
        case AltitudeDescriptor.AtOrAboveAlt1GsIntcptAlt2:
        case AltitudeDescriptor.AtOrAboveAlt1AngleAlt2:
          error = Math.min(0, predicted - constraint.altitude1);
          break;
        case AltitudeDescriptor.AtOrBelowAlt1:
        case AltitudeDescriptor.AtOrBelowAlt1AngleAlt2:
          error = Math.max(0, predicted - constraint.altitude1);
          break;
        case AltitudeDescriptor.BetweenAlt1Alt2:
          if (constraint.altitude2 !== undefined) {
            error =
              predicted > constraint.altitude1
                ? predicted - constraint.altitude1
                : predicted < constraint.altitude2
                  ? predicted - constraint.altitude2
                  : 0;
          }
          break;
        case AltitudeDescriptor.AtAlt1:
        case AltitudeDescriptor.AtAlt1GsIntcptAlt2:
        case AltitudeDescriptor.AtAlt1AngleAlt2:
          error = predicted - constraint.altitude1;
          break;
        default:
          break;
      }
    }

    const magnitude = error !== null ? Math.abs(error) : 0;
    const state = this.altitudeErrorState;
    if (magnitude >= 250 || (state === 'amber' && magnitude >= 200)) {
      this.altitudeErrorState = 'amber';
    } else if (magnitude >= 100 || (state !== 'hidden' && magnitude >= 80)) {
      this.altitudeErrorState = 'green';
    } else {
      this.altitudeErrorState = 'hidden';
    }

    this.altitudeErrorAmber.set(this.altitudeErrorState === 'amber');
    this.altitudeErrorText.set(
      error !== null && this.altitudeErrorState !== 'hidden'
        ? `${error > 0 ? '+' : '-'}${Math.round(Math.abs(error)).toFixed(0)}`
        : '',
    );
  }

  private isAltitudeConstraintFlightLevel(
    altitude: number,
    transitionAltitude: number | null,
    leg: ReadonlyFlightPlanLeg,
  ): boolean {
    if (transitionAltitude === null) {
      return false;
    }
    if (leg.constraintType === WaypointConstraintType.DES) {
      return altitude >= transitionAltitude;
    }
    if (leg.constraintType === WaypointConstraintType.CLB) {
      return altitude > transitionAltitude;
    }
    return false;
  }

  private updateCruiseSteps() {
    if (
      this.loadedFlightPlan &&
      this.selectedPageIndex.get() === SelectedPage.STEP_ALTS &&
      !this.selectedLegIsAlternate
    ) {
      const stepDisabledReason = this.checkStepAltsAccessPrerequisites();
      this.stepPageDisabledReason.set(stepDisabledReason ?? null);
      if (stepDisabledReason === undefined) {
        const activeLegIndex = this.loadedFlightPlan.activeLegIndex;
        const cruiseSteps = this.loadedFlightPlan.allLegs
          .map((l, index) =>
            l.isDiscontinuity === false && index >= activeLegIndex && l.cruiseStep ? l.cruiseStep : null,
          )
          .filter((it) => it !== null);
        const cruiseStepLegIndices = this.loadedFlightPlan.allLegs
          .map((l, index) => (l.isDiscontinuity === false && index >= activeLegIndex && l.cruiseStep ? index : null))
          .filter((it) => it !== null);

        for (let i = 0; i < 5; i++) {
          this.stepAltsLineVisibility[i].set('hidden');
          this.stepLinesPredictionsVisibility[i].set('hidden');
        }

        if (this.stepAltsNumberOfCruiseSteps.get() !== cruiseSteps.length) {
          this.forceRebuildList = true;
        }

        this.stepAltsNumberOfCruiseSteps.set(cruiseSteps.length);
        this.stepAltsScrollUpDisabled.set(this.stepAltsStartAtStepIndex.get() === 0);
        this.stepAltsScrollDownDisabled.set(cruiseSteps.length - this.stepAltsStartAtStepIndex.get() <= 4);

        for (let i = this.stepAltsStartAtStepIndex.get(); i < this.stepAltsStartAtStepIndex.get() + 5; i++) {
          const line = i - this.stepAltsStartAtStepIndex.get();

          if (!(i in cruiseSteps)) {
            if (this.forceRebuildList) {
              this.stepAltsWptIndices[line].set(null);
              this.stepAltsWptIndices[line].notify();
              this.stepAltsAltitude[line].set(null);
              this.forceRebuildList = false;
            }
            this.stepLinesPredictionsVisibility[line].set('hidden');
            this.stepAltsLineVisibility[line].set('visible');
            this.stepAltsDistances[line].set(null);
            this.stepAltsTimes[line].set('--:--');
            this.stepAltsIgnored[line].set(false);
            this.stepAltsAboveMaxFl[line].set(false);

            break;
          }

          const pred =
            this.loadedFlightPlanIndex.get() < FlightPlanIndex.Uplink
              ? this.props.fmcService?.master?.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions?.get(
                  cruiseStepLegIndices[i],
                )
              : undefined;
          const wptEta = getEtaFromUtcOrPresent(
            pred?.secondsFromPresent,
            this.activeFlightPhase.get() == FmgcFlightPhase.Preflight,
          );
          const wptIndex = this.availableWaypointsToLegIndex.indexOf(cruiseStepLegIndices[i]);
          const step = cruiseSteps[i];

          this.stepAltsLineVisibility[line].set('visible');
          this.stepAltsWptIndices[line].set(wptIndex !== -1 ? wptIndex : null);
          this.stepAltsAltitude[line].set(step.toAltitude);
          this.stepLinesPredictionsVisibility[line].set(
            wptIndex !== -1 && step.toAltitude !== null ? 'visible' : 'hidden',
          );

          if (pred) {
            this.stepAltsDistances[line].set(pred.distanceFromAircraft - step.distanceBeforeTermination);
            this.stepAltsTimes[line].set(wptEta);
          } else {
            this.stepAltsDistances[line].set(null);
            this.stepAltsTimes[line].set('--:--');
          }
          this.stepAltsIgnored[line].set(step.isIgnored);

          const estGrossWeight = this.getEstimatedGrossWeightAtIndex(cruiseStepLegIndices[i]);
          this.stepAltsAboveMaxFl[line].set(
            estGrossWeight !== null
              ? step.toAltitude >
                  (this.props.fmcService.master.getRecMaxAltitude(this.loadedFlightPlanIndex.get(), estGrossWeight) ??
                    Infinity)
              : false,
          );

          if (this.stepAltsIgnored[line].get()) {
            this.stepAltsMessage[line].set('IGNORED');
          } else if (this.stepAltsAboveMaxFl[line].get()) {
            this.stepAltsMessage[line].set('ABOVE MAX FL');
          } else {
            this.stepAltsMessage[line].set('');
          }
        }
      }
    }
  }

  /**
   * Checks if step altitude modification is allowed based on flight phase, engine out status and whether a cruise flight level is set.
   * @returns the reason why the step altitude modification is not allowed, or undefined if it is allowed.
   */
  private checkStepAltsAccessPrerequisites(): StepDisabledReason | undefined {
    if (this.props.fmcService.master.engineOutActive()) {
      return StepDisabledReason.EngineOut;
    } else {
      const fp = this.props.flightPlanInterface.get(this.loadedFlightPlanIndex.get());
      const phase = fp.isActiveOrCopiedFromActive() ? this.activeFlightPhase.get() : null;
      if (phase === FmgcFlightPhase.Descent) {
        return StepDisabledReason.Descent;
      } else if (phase === FmgcFlightPhase.Approach) {
        return StepDisabledReason.Approach;
      } else if (phase === FmgcFlightPhase.GoAround) {
        return StepDisabledReason.GoAround;
      } else if (phase === FmgcFlightPhase.Done) {
        return StepDisabledReason.Done;
      } else if (fp.performanceData.cruiseFlightLevel.get() === null) {
        return StepDisabledReason.NoCruiseLevel;
      }
    }
  }

  static nextCruiseStep(flightPlan: ReadonlyFlightPlan): [CruiseStepEntry | undefined, number | undefined] {
    const cruiseStepLegIndex = flightPlan.allLegs.findIndex(
      (l, index) => l.isDiscontinuity === false && index >= flightPlan.activeLegIndex && l.cruiseStep,
    );

    if (cruiseStepLegIndex < 0) {
      return [undefined, undefined];
    }

    const cruiseStep = flightPlan.legElementAt(cruiseStepLegIndex).cruiseStep;
    return cruiseStep
      ? [
          {
            distanceBeforeTermination: cruiseStep.distanceBeforeTermination,
            isIgnored: cruiseStep.isIgnored,
            toAltitude: cruiseStep.toAltitude,
            waypointIndex: cruiseStepLegIndex, // Fix waypointIndex
          },
          cruiseStepLegIndex,
        ]
      : [undefined, undefined];
  }

  private checkLegModificationAllowed(): boolean {
    return (
      this.props.fmcService.master !== null && this.selectedLegIndex.get() !== null && this.loadedFlightPlan !== null
    );
  }

  private async onWptDropdownModified(idx: number | null): Promise<void> {
    if (idx !== null) {
      const legIndex = this.availableWaypointsToLegIndex[idx];
      this.selectedLegIndex.set(legIndex);
      this.updateConstraints();
    } else {
      this.selectedLegIndex.set(null);
    }
  }

  private async tryUpdateSpeedConstraint() {
    if (this.checkLegModificationAllowed() && this.spdConstraintTypeRadioSelected.get() !== null) {
      const speed = this.speedConstraintInput.get();
      if (speed !== null) {
        this.props.fmcService.master!.flightPlanInterface.setPilotEnteredSpeedConstraintAt(
          this.selectedLegIndex.get()!,
          this.spdConstraintTypeRadioSelected.get() === 1,
          speed,
          this.loadedFlightPlanIndex.get(),
          this.selectedLegIsAlternate ?? false,
        );
      }
    }
  }

  private async deleteSpeedConstraint() {
    if (this.checkLegModificationAllowed() && this.spdConstraintTypeRadioSelected.get() !== null) {
      this.props.fmcService.master!.flightPlanInterface.setPilotEnteredSpeedConstraintAt(
        this.selectedLegIndex.get()!,
        this.spdConstraintTypeRadioSelected.get() === 1,
        undefined,
        this.loadedFlightPlanIndex.get(),
        this.selectedLegIsAlternate ?? false,
      );
    }
  }

  private async tryUpdateAltitudeConstraint(newAlt?: number) {
    if (
      !this.checkLegModificationAllowed() ||
      this.altConstraintTypeRadioSelected.get() === null ||
      this.selectedAltitudeConstraintOption.get() === null
    ) {
      return;
    }

    const alt = Number.isFinite(newAlt) ? newAlt : this.altitudeConstraintInput.get();
    if (alt && this.selectedAltitudeConstraintOption.get() !== null) {
      let option: AltitudeDescriptor;

      switch (this.selectedAltitudeConstraintOption.get()) {
        case 0:
          option = AltitudeDescriptor.AtAlt1;
          break;
        case 1:
          option = AltitudeDescriptor.AtOrAboveAlt1;
          break;
        case 2:
          option = AltitudeDescriptor.AtOrBelowAlt1;
          break;

        default:
          option = AltitudeDescriptor.AtAlt1;
          break;
      }

      this.props.fmcService.master!.flightPlanInterface.setPilotEnteredAltitudeConstraintAt(
        this.selectedLegIndex.get()!,
        this.altConstraintTypeRadioSelected.get() === 1,
        { altitude1: alt, altitudeDescriptor: option },
        this.loadedFlightPlanIndex.get(),
        this.selectedLegIsAlternate ?? false,
      );
    }
  }

  private deleteAltitudeConstraint() {
    if (this.checkLegModificationAllowed()) {
      this.props.fmcService.master!.flightPlanInterface.setPilotEnteredAltitudeConstraintAt(
        this.selectedLegIndex.get()!,
        this.altConstraintTypeRadioSelected.get() === 1,
        undefined,
        this.loadedFlightPlanIndex.get(),
        this.selectedLegIsAlternate ?? false,
      );
    }
  }

  private checkPerformanceDataEditCondition() {
    return this.checkLegModificationAllowed() && this.loadedFlightPlan?.performanceData;
  }

  private async tryUpdateSpeedLimitValue(value: number | null) {
    if (value === null) {
      this.deleteSpeedLimit();
    } else if (this.checkPerformanceDataEditCondition()) {
      if (this.speedLimitType.get() === SpeedLimitType.CLB) {
        this.props.flightPlanInterface.setPilotEntryClimbSpeedLimitSpeed(
          value,
          this.loadedFlightPlanIndex.get(),
          this.selectedLegIsAlternate ?? false,
        );
      } else {
        this.props.flightPlanInterface.setPilotEntryDescentSpeedLimitSpeed(
          value,
          this.loadedFlightPlanIndex.get(),
          this.selectedLegIsAlternate ?? false,
        );
      }
    }
  }

  private async tryUpdateSpeedLimitAltitude(value: number | null) {
    if (value === null) {
      this.deleteSpeedLimit();
    } else if (this.checkPerformanceDataEditCondition()) {
      if (this.speedLimitType.get() === SpeedLimitType.CLB) {
        this.props.flightPlanInterface.setPilotEntryClimbSpeedLimitAltitude(
          value,
          this.loadedFlightPlanIndex.get(),
          this.selectedLegIsAlternate ?? false,
        );
      } else {
        this.props.flightPlanInterface.setPilotEntryDescentSpeedLimitAltitude(
          value,
          this.loadedFlightPlanIndex.get(),
          this.selectedLegIsAlternate ?? false,
        );
      }
    }
  }

  private async deleteSpeedLimit() {
    if (this.checkPerformanceDataEditCondition()) {
      if (this.speedLimitType.get() === SpeedLimitType.CLB) {
        this.props.flightPlanInterface.deleteClimbSpeedLimit(
          this.loadedFlightPlanIndex.get(),
          this.selectedLegIsAlternate ?? false,
        );
      } else {
        this.props.flightPlanInterface.deleteDescentSpeedLimit(
          this.loadedFlightPlanIndex.get(),
          this.selectedLegIsAlternate ?? false,
        );
      }
    }
  }

  /**
   * Copied from A32NX
   * Check a couple of rules about insertion of step:
   * - Minimum step size is 1000ft
   * - S/C follows step descent
   * TODO: It's possible that the insertion of a step in between already inserted steps causes a step descent after step climb
   * I don't know how the plane handles this.
   * @param crzFl cruise FL in hundreds of feet
   * @param stepLegs Existing steps
   * @param insertAtIndex Index of waypoint to insert step at
   * @param toAltitude Altitude of step
   */
  static checkStepInsertionRules(
    crzFl: number,
    cruiseSteps: CruiseStepEntry[],
    insertAtIndex: number,
    toAltitude: number,
  ) {
    let altitude = crzFl * 100;
    let doesHaveStepDescent = false;

    let i = 0;
    for (; i < cruiseSteps.length; i++) {
      const step = cruiseSteps[i];
      if (step.waypointIndex > insertAtIndex) {
        break;
      }

      const stepAltitude = step.toAltitude;
      if (stepAltitude < altitude) {
        doesHaveStepDescent = true;
      }

      altitude = stepAltitude;
    }

    const isStepSizeValid = Math.abs(toAltitude - altitude) >= 1000;
    if (!isStepSizeValid) {
      return false;
    }

    const isClimbVsDescent = toAltitude > altitude;
    if (!isClimbVsDescent) {
      doesHaveStepDescent = true;
    } else if (doesHaveStepDescent) {
      return false;
    }

    if (i < cruiseSteps.length) {
      const stepAfter = cruiseSteps[i];
      const isStepSizeValid = Math.abs(stepAfter.toAltitude - toAltitude) >= 1000;
      const isClimbVsDescent = stepAfter.toAltitude > toAltitude;

      const isClimbAfterDescent = isClimbVsDescent && doesHaveStepDescent;

      return isStepSizeValid && !isClimbAfterDescent;
    }

    return true;
  }

  private tryAddCruiseStep(dropdownIndex: number | null, altitude: number | null) {
    const crzFl = this.crzFl.get();
    if (
      crzFl &&
      dropdownIndex !== null &&
      dropdownIndex in this.availableWaypointsToLegIndex &&
      altitude !== null &&
      this.loadedFlightPlan !== null
    ) {
      const legIndex = this.availableWaypointsToLegIndex[dropdownIndex];
      const cruiseSteps = this.loadedFlightPlan.allLegs
        .map((l) => (l.isDiscontinuity === false && l.cruiseStep ? l.cruiseStep : null))
        .filter((it) => it !== null);
      const isValid = MfdFmsFplnVertRev.checkStepInsertionRules(crzFl, cruiseSteps, legIndex, altitude);
      const estGrossWeight = this.getEstimatedGrossWeightAtIndex(legIndex);
      if (
        estGrossWeight !== null &&
        altitude >
          (this.props.fmcService.master.getRecMaxAltitude(this.loadedFlightPlanIndex.get(), estGrossWeight) ?? Infinity)
      ) {
        this.props.fmcService.master?.addMessageToQueue(NXSystemMessages.stepAboveMaxFl, undefined, undefined);
      }

      if (isValid) {
        this.props.flightPlanInterface.addOrUpdateCruiseStep(legIndex, altitude, this.loadedFlightPlanIndex.get());
      } else {
        const selectedLegIndex = this.selectedLegIndex.get();
        if (selectedLegIndex !== null) {
          const leg = this.loadedFlightPlan?.maybeElementAt(selectedLegIndex);
          this.stepNotAllowedAt.set(leg?.isDiscontinuity === false ? `STEP NOT ALLOWED AT ${leg.ident}` : '');
        }
      }
    }
  }

  private tryDeleteCruiseStep(lineIndex: number, previousDropdownIndex: number) {
    const legIndex = this.availableWaypointsToLegIndex[previousDropdownIndex];
    this.props.flightPlanInterface.removeCruiseStep(legIndex, this.loadedFlightPlanIndex.get());
    this.stepAltsWptIndices[lineIndex].set(null);
    this.stepAltsAltitude[lineIndex].set(null);
    this.forceRebuildList = true;
  }

  private handleCruiseStepWaypointModified(newWptIndex: number | null, lineIndex: number) {
    const oldWptIndex = this.stepAltsWptIndices[lineIndex].get();
    const altitude = this.stepAltsAltitude[lineIndex].get();

    if (newWptIndex === null && oldWptIndex !== null) {
      // Remove step
      this.tryDeleteCruiseStep(lineIndex, oldWptIndex);
    } else if (oldWptIndex === null && newWptIndex !== null && altitude !== null) {
      // Add new step
      this.tryAddCruiseStep(newWptIndex, altitude);
    } else if (oldWptIndex !== null && newWptIndex !== null && altitude !== null) {
      // Change step's waypoint
      this.tryDeleteCruiseStep(lineIndex, oldWptIndex);
      this.tryAddCruiseStep(newWptIndex, altitude);
    }
    this.stepAltsWptIndices[lineIndex].set(newWptIndex);
    this.updateCruiseSteps();
  }

  private handleCruiseStepAltitudeModified(newAltitude: number | null, lineIndex: number) {
    const wptIndex = this.stepAltsWptIndices[lineIndex].get();
    const oldAltitude = this.stepAltsAltitude[lineIndex].get();

    if (newAltitude === null && wptIndex !== null) {
      // Remove step
      this.tryDeleteCruiseStep(lineIndex, wptIndex);
    } else if (oldAltitude === null && newAltitude !== null && wptIndex !== null) {
      // Add new step
      this.tryAddCruiseStep(wptIndex, newAltitude);
    } else if (oldAltitude !== null && newAltitude !== null && wptIndex !== null) {
      // Change step's flight level
      this.tryDeleteCruiseStep(lineIndex, wptIndex);
      this.tryAddCruiseStep(wptIndex, newAltitude);
    }
    this.stepAltsAltitude[lineIndex].set(newAltitude);
    this.updateCruiseSteps();
  }

  private getEstimatedGrossWeightAtIndex(legIndex: number): number | null {
    const zfw = this.loadedFlightPlan?.performanceData.zeroFuelWeight.get() ?? null;
    const pred =
      this.loadedFlightPlanIndex.get() < FlightPlanIndex.Uplink
        ? this.props.fmcService?.master?.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions?.get(legIndex)
        : undefined;
    return pred !== undefined && zfw !== null
      ? zfw * 1000 + UnitType.KILOGRAM.convertFrom(pred.estimatedFuelOnBoard, UnitType.POUND)
      : null;
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.rtaPanelVisible,
      this.rtaFieldStyle,
      this.props.fmcService.master.timeKeeper.utcSeconds.sub(() => this.updateRta()),
      this.props.fmcService.master.timeConstraint.sub(() => this.updateRta()),
      this.selectedLegIndex.sub(() => this.updateRta()),
    );

    // If extra parameter for activeUri is given, navigate to flight phase sub-page
    switch (this.props.mfd.uiService.activeUri.get().extra) {
      case 'rta':
        this.initialLoadRevisedWaypointIndex = false;
        this.selectedPageIndex.set(SelectedPage.RTA);
        break;
      case 'spd':
        this.selectedLegIsAlternate = this.props.fmcService.master.revisedLegIsAltn.get();
        this.initialLoadRevisedWaypointIndex = true;
        this.selectedPageIndex.set(SelectedPage.SPD);
        break;
      case 'cms':
        this.selectedPageIndex.set(SelectedPage.CMS);
        break;
      case 'alt':
        this.selectedLegIsAlternate = this.props.fmcService.master.revisedLegIsAltn.get();
        this.initialLoadRevisedWaypointIndex = true;
        this.selectedPageIndex.set(SelectedPage.ALT);
        break;
      case 'step-alts':
        this.initialLoadRevisedWaypointIndex = false;
        this.selectedPageIndex.set(SelectedPage.STEP_ALTS);
        break;

      default:
        break;
    }

    this.subs.push(
      this.tmpyActive.sub((v) => {
        if (this.returnButtonDiv.getOrDefault() && this.tmpyInsertButtonDiv.getOrDefault()) {
          this.returnButtonDiv.instance.style.visibility = v ? 'hidden' : 'visible';
          this.tmpyInsertButtonDiv.instance.style.visibility = v ? 'visible' : 'hidden';
        }
      }, true),
    );

    this.subs.push(this.crzFlFormatted, this.altitudeErrorUnitVisibility);

    this.subs.push(
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(1)
        .handle(() => {
          if (this.selectedPageIndex.get() === SelectedPage.ALT) {
            this.updateAltitudeError();
          }
        }),
    );

    for (const i of [0, 1, 2, 3, 4]) {
      this.subs.push(
        this.stepAltsMessageDisplay[i],
        this.stepAltsNoMessageDisplay[i],
        this.stepAltsDistancesFormatted[i],
      );
    }

    this.subs.push(
      this.stepAltsStartAtStepIndex.sub(() => {
        this.forceRebuildList = true;
        this.updateCruiseSteps();
      }),
    );

    this.stepsAltsClockSub = this.props.bus
      .getSubscriber<ClockEvents>()
      .on('realTime')
      .atFrequency(0.5)
      .handle(() => this.updateCruiseSteps());

    this.subs.push(
      this.tmpyColor,
      this.selectedAltitudeConstraintDisabled,
      this.selectedAltitudeConstraintInvisible,
      this.stepNotAllowedAtVisibility,
      this.speedLimitText,
      this.deleteSpeedLimitDisabled,
    );

    this.subs.push(
      this.selectedPageIndex.sub((val) => {
        if (val === SelectedPage.STEP_ALTS || val === SelectedPage.RTA || val === SelectedPage.CMS) {
          this.selectedLegIsAlternate = false;
        } else if (val === SelectedPage.SPD || val === SelectedPage.ALT) {
          this.selectedLegIsAlternate = this.props.fmcService.master.revisedLegIsAltn.get();
        }

        if (val === SelectedPage.STEP_ALTS) {
          this.stepsAltsClockSub?.resume();
        } else {
          this.stepsAltsClockSub?.pause();
        }
        this.onNewData();
      }, true),
      this.stepPageDisabledMessageDisplay,
      this.stepAltsPageDisplay,
      this.fillPageDisplay,
    );
  }

  public destroy(): void {
    super.destroy();
    this.stepsAltsClockSub?.destroy();
  }

  // ---- RTA panel (FCOM DSC-22-FMS-20-30 P 360-364) -------------------------------------------------------------------

  private static formatTimeOfDay(seconds: number): string {
    const s = ((Math.round(seconds) % 86400) + 86400) % 86400;
    const hh = Math.floor(s / 3600);
    const mm = Math.floor(s / 60) % 60;
    const ss = s % 60;
    return `${hh.toFixed(0).padStart(2, '0')}:${mm.toFixed(0).padStart(2, '0')}:${ss.toFixed(0).padStart(2, '0')}`;
  }

  /** The ETA at a leg of the active flight plan, seconds of the day (a flight time in preflight without ETT) */
  private rtaEtaSeconds(legIndex: number): number | null {
    const pred =
      this.loadedFlightPlanIndex.get() === FlightPlanIndex.Active
        ? this.props.fmcService.master.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions?.get(legIndex)
        : undefined;
    if (!pred || !Number.isFinite(pred.secondsFromPresent)) {
      return null;
    }
    if (this.inPreflight.get()) {
      const ett = this.props.fmcService.master.fmgc.data.estimatedTakeoffTime.get();
      return (ett ?? 0) + pred.secondsFromPresent;
    }
    return this.props.fmcService.master.timeKeeper.utcSeconds.get() + pred.secondsFromPresent;
  }

  private updateRta(): void {
    const fmc = this.props.fmcService.master;
    const plan = this.loadedFlightPlan;
    const phase = this.activeFlightPhase.get();
    this.inPreflight.set(phase === FmgcFlightPhase.Preflight);
    this.rtaUtc.set(MfdFmsFplnVertRev.formatTimeOfDay(fmc.timeKeeper.utcSeconds.get()));

    // FCOM P 344: RTA NOT ALLOWED IN EO / IN GA
    if (fmc.fmgc.data.engineOut.get()) {
      this.rtaPanelMessage.set('RTA NOT ALLOWED IN EO');
      return;
    }
    if (phase === FmgcFlightPhase.GoAround) {
      this.rtaPanelMessage.set('RTA NOT ALLOWED IN GA');
      return;
    }
    this.rtaPanelMessage.set('');

    const legIndex = this.selectedLegIndex.get();
    const leg = legIndex !== null && plan ? plan.maybeElementAt(legIndex) : undefined;
    const rta = fmc.timeConstraint.get();
    const rtaLegIndex =
      rta && plan
        ? plan.allLegs.findIndex((l) => isLeg(l) && l.definition.waypoint?.databaseId === rta.databaseId)
        : -1;
    const rtaOnSelected = rta !== null && legIndex !== null && rtaLegIndex === legIndex;

    // RTA message area (P 361)
    if (
      leg &&
      isLeg(leg) &&
      (this.selectedLegIsAlternate || this.loadedFlightPlanIndex.get() !== FlightPlanIndex.Active)
    ) {
      this.rtaMessage.set('RTA NOT ALLOWED AT');
      this.rtaMessageIdent.set(leg.ident);
      this.rtaMessageSuffix.set('');
    } else if (rta && !rtaOnSelected) {
      this.rtaMessage.set('EXISTING RTA AT');
      this.rtaMessageIdent.set(rta.ident);
      this.rtaMessageSuffix.set('');
    } else {
      this.rtaMessage.set('');
      this.rtaMessageIdent.set('');
      this.rtaMessageSuffix.set('');
    }

    // Waypoint distance and ETA (P 362)
    const pred =
      legIndex !== null && this.loadedFlightPlanIndex.get() === FlightPlanIndex.Active
        ? fmc.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions?.get(legIndex)
        : undefined;
    this.rtaDistance.set(
      pred && Number.isFinite(pred.distanceFromAircraft) ? Math.max(0, pred.distanceFromAircraft).toFixed(0) : '----',
    );
    const eta = legIndex !== null ? this.rtaEtaSeconds(legIndex) : null;
    this.rtaEta.set(eta !== null ? MfdFmsFplnVertRev.formatTimeOfDay(eta) : '--:--:--');

    if (rtaOnSelected && rta) {
      this.rtaType.set(rta.type);
      this.rtaTime.set(rta.utcSeconds);
      this.rtaDeleteVisible.set(true);
    } else {
      this.rtaDeleteVisible.set(false);
      if (this.rtaType.get() === null) {
        this.rtaTime.set(null);
      }
    }

    // Time error (P 363-364)
    this.updateRtaTimeError(rtaOnSelected ? rta : null, eta, pred?.distanceFromAircraft ?? 0);
  }

  private updateRtaTimeError(rta: TimeConstraint | null, eta: number | null, distance: number): void {
    if (!rta || eta === null) {
      this.rtaTimeErrorState = 'hidden';
      this.rtaTimeError.set('');
      this.rtaTimeErrorType.set('');
      return;
    }
    // Time error = ETA - RTA, over the day boundary
    let error = eta - rta.utcSeconds;
    error = ((((error + 43200) % 86400) + 86400) % 86400) - 43200;
    const late = error > 0;
    const applicable =
      rta.type === TimeConstraintType.At ||
      (rta.type === TimeConstraintType.AtOrBefore && late) ||
      (rta.type === TimeConstraintType.AtOrAfter && !late);
    const magnitude = Math.abs(error);

    // P 364: not displayed below 7 s (shown from 10 s), green up to dT1, amber above dT1 until back below dT2;
    // dT1 = 30 s and dT2 = 15 s up to 2 000 NM, then increased by 60 s per 1 000 NM
    const extra = Math.max(0, distance - 2000) * 0.06;
    const dT1 = 30 + extra;
    const dT2 = 15 + extra;
    if (!applicable) {
      this.rtaTimeErrorState = 'hidden';
    } else if (this.rtaTimeErrorState === 'hidden') {
      if (magnitude > dT1) {
        this.rtaTimeErrorState = 'amber';
      } else if (magnitude >= 10) {
        this.rtaTimeErrorState = 'green';
      }
    } else if (this.rtaTimeErrorState === 'green') {
      if (magnitude > dT1) {
        this.rtaTimeErrorState = 'amber';
      } else if (magnitude < 7) {
        this.rtaTimeErrorState = 'hidden';
      }
    } else if (magnitude < dT2) {
      this.rtaTimeErrorState = magnitude < 7 ? 'hidden' : 'green';
    }

    if (this.rtaTimeErrorState === 'hidden') {
      this.rtaTimeError.set('');
      this.rtaTimeErrorType.set('');
    } else {
      const mm = Math.floor(magnitude / 60);
      const ss = Math.round(magnitude % 60);
      this.rtaTimeError.set(`${mm.toFixed(0).padStart(2, '0')}:${ss.toFixed(0).padStart(2, '0')}`);
      this.rtaTimeErrorType.set(late ? 'LATE' : 'EARLY');
      this.rtaTimeErrorAmber.set(this.rtaTimeErrorState === 'amber');
    }
  }

  /** Creates (or changes) the RTA on the selected waypoint; the default RTA is the ETA (FCOM P 363) */
  private setRta(type: TimeConstraintType | null, utcSeconds: number | null): void {
    const legIndex = this.selectedLegIndex.get();
    const leg = legIndex !== null && this.loadedFlightPlan ? this.loadedFlightPlan.maybeElementAt(legIndex) : undefined;
    if (!leg || !isLeg(leg) || type === null || !leg.definition.waypoint) {
      return;
    }
    this.rtaType.set(type);
    const time = utcSeconds ?? this.rtaEtaSeconds(legIndex!);
    this.rtaTime.set(time);
    if (time !== null) {
      this.props.fmcService.master.timeConstraint.set({
        ident: leg.ident,
        databaseId: leg.definition.waypoint.databaseId,
        type,
        utcSeconds: time,
      });
    }
    this.updateRta();
  }

  private deleteRta(): void {
    this.props.fmcService.master.timeConstraint.set(null);
    this.rtaType.set(null);
    this.rtaTime.set(null);
    this.updateRta();
  }

  private renderRtaPanel(): VNode {
    return (
      <div class="mfd-fcom-canvas">
        <div style={{ display: this.rtaPanelVisible.map((v) => (v ? 'none' : 'block')) }}>
          {fcomCentre(40, 365, <span class="mfd-label amber">{this.rtaPanelMessage}</span>)}
        </div>
        <div style={{ display: this.rtaPanelVisible.map((v) => (v ? 'block' : 'none')) }}>
          {fcomCentre(40, 365, [
            <span class="mfd-label amber">{this.rtaMessage}</span>,
            <span class="mfd-value bigger amber" style="margin-left: 16px;">
              {this.rtaMessageIdent}
            </span>,
            <span class="mfd-label amber" style="margin-left: 16px;">
              {this.rtaMessageSuffix}
            </span>,
          ])}
          {fcomRight(96, 217, <span class="mfd-label">RTA AT</span>)}
          {fcomAt(
            96,
            236,
            <DropdownMenu
              idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_rtaWptDropdown`}
              selectedIndex={this.dropdownMenuSelectedWaypointIndex}
              values={this.availableWaypoints}
              freeTextAllowed={false}
              containerStyle="width: 171px;"
              alignLabels="flex-start"
              onModified={(i) => {
                this.rtaType.set(null);
                this.onWptDropdownModified(i).then(() => this.updateRta());
              }}
              numberOfDigitsForInputField={7}
              tmpyActive={this.tmpyActive}
              hEventConsumer={this.props.mfd.hEventConsumer}
              interactionMode={this.props.mfd.interactionMode}
            />,
          )}
          {fcomAt(96, 434, <span class="mfd-label">DIST</span>)}
          {fcomRight(96, 625, [
            <span class="mfd-value bigger">{this.rtaDistance}</span>,
            <span class="mfd-label-unit mfd-unit-trailing">NM</span>,
          ])}

          {/* P 362: UTC in flight, ETT entry field in preflight */}
          <div style={{ display: this.inPreflight.map((v) => (v ? 'none' : 'block')) }}>
            {fcomAt(202, 9, <span class="mfd-label">UTC</span>)}
            {fcomAt(202, 101, <span class="mfd-value bigger">{this.rtaUtc}</span>)}
          </div>
          <div style={{ display: this.inPreflight.map((v) => (v ? 'block' : 'none')) }}>
            {fcomAt(202, 9, <span class="mfd-label">ETT</span>)}
            {fcomAt(
              202,
              101,
              <InputField<number>
                dataEntryFormat={new TimeHHMMSSFormat()}
                value={this.props.fmcService.master.fmgc.data.estimatedTakeoffTime}
                alignText="center"
                containerStyle="width: 160px;"
                tmpyActive={this.tmpyActive}
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
          </div>

          <div class="mfd-vert-rev-rta-vline" />
          {fcomAt(262, 9, <span class="mfd-label">ETA</span>)}
          {fcomRight(262, 544, <span class="mfd-value bigger">{this.rtaEta}</span>)}
          {fcomLine(286, 9, 729)}

          {fcomAt(316, 9, <span class="mfd-label">RTA</span>)}
          {fcomAt(
            358,
            123,
            <RadioButtonGroup
              values={['AT', 'AT OR BEFORE', 'AT OR AFTER']}
              selectedIndex={this.rtaType}
              onModified={(i) => this.setRta(i, null)}
              idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_rtaTypeRadio`}
              additionalVerticalSpacing={20}
              color={this.tmpyColor}
            />,
          )}
          <div class="mfd-fcom-item" style="left: 384px; top: 316px;">
            <div style={this.rtaFieldStyle}>
              <InputField<number>
                dataEntryFormat={new TimeHHMMSSFormat()}
                value={this.rtaTime}
                onModified={(v) => this.setRta(this.rtaType.get(), v)}
                alignText="center"
                containerStyle="width: 160px; transform: translateY(-50%);"
                tmpyActive={this.tmpyActive}
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />
            </div>
          </div>
          <div style={{ display: this.rtaDeleteVisible.map((v) => (v ? 'block' : 'none')) }}>
            {fcomAt(
              326,
              602,
              <Button
                label={
                  <span class="fr aic">
                    <span style="white-space: pre; text-align: center;">{'DELETE\nRTA'}</span>
                    <span style="margin-left: 16px;">*</span>
                  </span>
                }
                onClick={() => this.deleteRta()}
                buttonStyle="width: 104px; height: 52px;"
              />,
            )}
          </div>
          {fcomLine(499, 9, 729)}

          {/* P 363: managed RTA speed; the FMS has no RTA speed control yet, so it is not computed */}
          {fcomAt(534, 246, <span class="mfd-label">RTA SPD</span>)}
          {fcomRight(534, 545, <span class="mfd-value bigger">.--</span>)}
          {fcomRight(534, 670, [
            <span class="mfd-value bigger">---</span>,
            <span class="mfd-label-unit mfd-unit-trailing">KT</span>,
          ])}
          {fcomLine(620, 9, 729)}

          {/* FCOM DSC-22-FMS-20-30 P 363-364: the TIME ERROR line is displayed with the time error only */}
          {fcomAt(
            650,
            9,
            <span
              class="mfd-label"
              style={{ visibility: this.rtaTimeError.map((t) => (t === '' ? 'hidden' : 'visible')) }}
            >
              TIME ERROR
            </span>,
          )}
          {fcomRight(
            650,
            542,
            <span class={{ 'mfd-value': true, bigger: true, amber: this.rtaTimeErrorAmber }}>{this.rtaTimeError}</span>,
          )}
          {fcomAt(
            650,
            574,
            <span class={{ 'mfd-value': true, bigger: true, amber: this.rtaTimeErrorAmber }}>
              {this.rtaTimeErrorType}
            </span>,
          )}
        </div>
      </div>
    );
  }

  render(): VNode {
    return (
      this.props.fmcService.master && (
        <>
          {super.render()}
          {/* begin page content */}
          <div class="mfd-page-container">
            {/* FCOM DSC-22-FMS-20-30 P 344-360: the tabs start right below the title bar (y = 150) */}
            <TopTabNavigator
              pageTitles={Subject.create(['RTA', 'SPD', 'CMS', 'ALT', 'STEP ALTs'])}
              selectedPageIndex={this.selectedPageIndex}
              pageChangeCallback={(val) => {
                this.selectedPageIndex.set(val);
              }}
              selectedTabTextColor="white"
              {...fcomTabBar}
            >
              <TopTabNavigatorPage containerStyle="padding: 0;">
                {/* RTA */}
                {this.renderRtaPanel()}
              </TopTabNavigatorPage>
              <TopTabNavigatorPage>
                {/* SPD */}
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; margin-top: 15px;">
                  <div>
                    <span class="mfd-label biggest amber">{this.speedMessageArea}</span>
                  </div>
                  <div style="display: flex; flex-direction: row; justify-content: center; align-items: center; margin-top: 25px;">
                    <span class="mfd-label biggest green mfd-spacing-right">{this.constraintType}</span>
                    <span class="mfd-label bigger mfd-spacing-right">SPD CSTR AT </span>
                    <DropdownMenu
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_clbConstraintWptDropdown`}
                      selectedIndex={this.dropdownMenuSelectedWaypointIndex}
                      values={this.availableWaypoints}
                      freeTextAllowed={false}
                      containerStyle="width: 175px;"
                      alignLabels="flex-start"
                      onModified={(i) => this.onWptDropdownModified(i)}
                      numberOfDigitsForInputField={7}
                      tmpyActive={this.tmpyActive}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                  <div class="mfd-vert-rev-spd-cstr-line">
                    <InputField<number>
                      dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                      onModified={(val) => {
                        this.speedConstraintInput.set(val);
                        this.tryUpdateSpeedConstraint();
                      }}
                      mandatory={Subject.create(false)}
                      disabled={this.spdConstraintDisabled}
                      value={this.speedConstraintInput}
                      alignText="flex-end"
                      tmpyActive={this.tmpyActive}
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                    <div class="mfd-vert-rev-clbdes" style={{ visibility: this.altitudeClbDesConstraintVisibility }}>
                      <RadioButtonGroup
                        idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_spdCstrClbDesRadioButtons`}
                        selectedIndex={this.spdConstraintTypeRadioSelected}
                        values={['CLB CSTR', 'DES CSTR']}
                        color={Subject.create(RadioButtonColor.Amber)}
                        onModified={(idx) => {
                          this.spdConstraintTypeRadioSelected.set(idx);
                          this.tryUpdateSpeedConstraint();
                        }}
                      />
                    </div>
                    <Button
                      label={
                        <div style="display: flex; flex-direction: row; justify-content: space-between;">
                          <span style="text-align: center; vertical-align: center; margin-right: 10px;">
                            DELETE
                            <br />
                            SPD CSTR
                          </span>
                          <span style="display: flex; align-items: center; justify-content: center;">*</span>
                        </div>
                      }
                      onClick={() => {
                        this.deleteSpeedConstraint();
                      }}
                      disabled={this.cannotDeleteSpeedConstraint}
                      buttonStyle="adding-right: 2px;"
                    />
                  </div>
                  <span class="mfd-vert-rev-spd-lim-header mfd-label bigger mfd-spacing-right">
                    {this.speedLimitText}
                  </span>
                  <div class="mfd-vert-rev-spd-lim">
                    <InputField<number>
                      dataEntryFormat={new SpeedKnotsFormat(Subject.create(90), Subject.create(Vmo))}
                      dataHandlerDuringValidation={(val) => this.tryUpdateSpeedLimitValue(val)}
                      mandatory={Subject.create(false)}
                      value={this.speedLimitSpeed}
                      alignText="flex-end"
                      tmpyActive={this.tmpyActive}
                      enteredByPilot={this.speedLimitPilotEntered}
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                    <span class="mfd-label bigger">AT OR BELOW</span>
                    <InputField<number>
                      dataEntryFormat={
                        new AltitudeOrFlightLevelFormat(this.speedLimitTransition, this.isSpeedLimitTransitionFL)
                      }
                      dataHandlerDuringValidation={(val) => this.tryUpdateSpeedLimitAltitude(val)}
                      mandatory={Subject.create(false)}
                      value={this.speedLimitAltitude}
                      enteredByPilot={this.speedLimitPilotEntered}
                      alignText="flex-end"
                      tmpyActive={this.tmpyActive}
                      errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />

                    <Button
                      label={
                        <div style="display: flex; flex-direction: row; justify-content: space-between;">
                          <span style="text-align: center; vertical-align: center; margin-right: 10px;">
                            DELETE
                            <br />
                            SPD LIMIT
                          </span>
                          <span style="display: flex; align-items: center; justify-content: center;">*</span>
                        </div>
                      }
                      onClick={() => {
                        this.deleteSpeedLimit();
                      }}
                      disabled={this.deleteSpeedLimitDisabled}
                      buttonStyle="adding-right: 2px;"
                    />
                  </div>
                </div>
              </TopTabNavigatorPage>
              <TopTabNavigatorPage>
                {/* CMS */}
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
                  <span class="mfd-label">NOT IMPLEMENTED</span>
                </div>
              </TopTabNavigatorPage>
              <TopTabNavigatorPage>
                {/* ALT */}
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; margin-top: 15px;">
                  <div>
                    <span class="mfd-label biggest amber">{this.altitudeMessageArea}</span>
                  </div>
                  <div style="display: flex; flex-direction: row; justify-content: center; align-items: center; margin-top: 25px;">
                    <span class="mfd-label biggest green mfd-spacing-right">{this.constraintType}</span>
                    <span class="mfd-label bigger mfd-spacing-right">ALT CSTR AT </span>
                    <DropdownMenu
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_altConstraintWptDropdown`}
                      selectedIndex={this.dropdownMenuSelectedWaypointIndex}
                      values={this.availableWaypoints}
                      freeTextAllowed={false}
                      containerStyle="width: 175px;"
                      alignLabels="flex-start"
                      onModified={(i) => this.onWptDropdownModified(i)}
                      numberOfDigitsForInputField={7}
                      tmpyActive={this.tmpyActive}
                      hEventConsumer={this.props.mfd.hEventConsumer}
                      interactionMode={this.props.mfd.interactionMode}
                    />
                  </div>
                  <div class="mfd-vert-rev-alt-cstr-line">
                    <div class="mfd-vert-rev-alt-cstr-rb">
                      <RadioButtonGroup
                        idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_altCstrRadioButtons`}
                        selectedIndex={this.selectedAltitudeConstraintOption}
                        values={['AT', 'AT OR ABOVE', 'AT OR BELOW']}
                        color={this.tmpyColor}
                        valuesDisabled={this.selectedAltitudeConstraintDisabled}
                        onModified={(newIdx) => {
                          this.selectedAltitudeConstraintOption.set(newIdx);
                          this.tryUpdateAltitudeConstraint();
                        }}
                      />
                      <div ref={this.altWindowLabelRef} class="mfd-label bigger mfd-vert-rev-alt-window-label">
                        WINDOW
                      </div>
                    </div>
                    <div class="mfd-vert-rev-alt-cstr-sel">
                      <div class={{ invisible: this.selectedAltitudeConstraintInvisible }}>
                        <InputField<number>
                          dataEntryFormat={
                            new AltitudeOrFlightLevelFormat(
                              this.altConstraintTransitionAltitude,
                              this.altConstraintTransitionIsFlightLevel,
                            )
                          }
                          onModified={(val) => {
                            this.altitudeConstraintInput.set(val);
                            this.tryUpdateAltitudeConstraint();
                          }}
                          mandatory={Subject.create(false)}
                          disabled={this.altConstraintDisabled}
                          value={this.altitudeConstraintInput}
                          alignText="flex-end"
                          tmpyActive={this.tmpyActive}
                          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                          hEventConsumer={this.props.mfd.hEventConsumer}
                          interactionMode={this.props.mfd.interactionMode}
                        />
                      </div>
                      <div ref={this.altWindowValueRef} class="mfd-vert-rev-alt-window-value">
                        <span class="mfd-label-unit bigger mfd-unit-leading">{this.altWindowUnitLeading}</span>
                        <span class="mfd-label green bigger">{this.altWindowUnitValue}</span>
                        <span class="mfd-label-unit bigger mfd-unit-trailing">{this.altWindowUnitTrailing}</span>
                      </div>
                    </div>
                    <div class="mfd-vert-rev-alt-right-container">
                      <Button
                        label={
                          <div class="fr" style="justify-content: space-between;">
                            <span style="text-align: center; vertical-align: center; margin-right: 10px;">
                              DELETE
                              <br />
                              ALT CSTR
                            </span>
                            <span style="display: flex; align-items: center; justify-content: center;">*</span>
                          </div>
                        }
                        onClick={() => {
                          this.deleteAltitudeConstraint();
                        }}
                        disabled={this.cannotDeleteAltConstraint}
                        buttonStyle="adding-right: 2px;"
                      />

                      <div class="mfd-vert-rev-clbdes" style={{ visibility: this.altitudeClbDesConstraintVisibility }}>
                        <RadioButtonGroup
                          idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_altCstrClbDesRadioButtons`}
                          selectedIndex={this.altConstraintTypeRadioSelected}
                          values={['CLB CSTR', 'DES CSTR']}
                          color={Subject.create(RadioButtonColor.Amber)}
                          onModified={(idx) => {
                            this.altConstraintTypeRadioSelected.set(idx);
                            this.tryUpdateAltitudeConstraint();
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div class="mfd-vert-rev-alt-error">
                    <span class="mfd-label bigger mfd-vert-rev-alt-error-label">ALT ERROR</span>
                    <div class="mfd-label-value-container">
                      <span class={{ 'mfd-value': true, bigger: true, amber: this.altitudeErrorAmber }}>
                        {this.altitudeErrorText}
                      </span>
                      <span
                        class="mfd-label-unit mfd-unit-trailing"
                        style={{ visibility: this.altitudeErrorUnitVisibility }}
                      >
                        FT
                      </span>
                    </div>
                  </div>
                </div>
              </TopTabNavigatorPage>
              <TopTabNavigatorPage>
                {/* STEP ALTs */}
                <div class="mfd-page-container" style={{ display: this.stepPageDisabledMessageDisplay }}>
                  <div class="mfd-amber-error-message">{this.stepPageDisabledReason}</div>
                </div>
                <div
                  style={{
                    flex: '1',
                    display: this.stepAltsPageDisplay,
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <div class="mfd-fms-fpln-labeled-box-container" style="width: 100%;">
                    <div class="mfd-fms-fpln-labeled-box-label" style="margin-left: 15px;">
                      <span class="mfd-label mfd-spacing-right">STEP ALTs FROM CRZ</span>
                      <span class="mfd-label-unit mfd-unit-leading">FL</span>
                      <span class={{ 'mfd-value': true, sec: this.secActive, tmpy: this.tmpyActive }}>
                        {this.crzFlFormatted}
                      </span>
                    </div>
                    <div style="width: 100%">
                      <div style="display: grid; grid-template-columns: 35% 25% 20% 20%; grid-auto-rows: 60px;">
                        <div
                          class="mfd-label"
                          style="align-self: flex-end; padding-left: 60px; padding-bottom: 10px; border-bottom: 1px solid #777777;"
                        >
                          WPT
                        </div>
                        <div
                          class="mfd-label"
                          style="align-self: flex-end; padding-left: 25px; padding-bottom: 10px; border-bottom: 1px solid #777777; border-right: 1px solid #777777;"
                        >
                          ALT
                        </div>
                        <div
                          class="mfd-label"
                          style="align-self: flex-end; padding-left: 30px; padding-bottom: 10px; border-bottom: 1px solid #777777;"
                        >
                          <span style="margin-right: 70px;">DIST</span>
                        </div>
                        <div
                          class="mfd-label"
                          style="align-self: flex-end; padding-left: 30px; padding-bottom: 10px; border-bottom: 1px solid #777777;"
                        >
                          <span>{this.stepAltsTimeHeader}</span>
                        </div>

                        {[0, 1, 2, 3, 4].map((li) => (
                          <>
                            <div class="fc aic jcc">
                              <div style={{ visibility: this.stepAltsLineVisibility[li] }}>
                                <DropdownMenu
                                  idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_stepAltWpt${li}`}
                                  selectedIndex={this.stepAltsWptIndices[li]}
                                  values={this.availableWaypoints}
                                  freeTextAllowed={false}
                                  containerStyle="width: 175px;"
                                  alignLabels="flex-start"
                                  numberOfDigitsForInputField={7}
                                  tmpyActive={this.tmpyActive}
                                  onModified={(newWptIndex) => this.handleCruiseStepWaypointModified(newWptIndex, li)}
                                  hEventConsumer={this.props.mfd.hEventConsumer}
                                  interactionMode={this.props.mfd.interactionMode}
                                />
                              </div>
                            </div>
                            <div class="fc aic jcc" style="border-right: 1px solid #777777;">
                              <div style={{ visibility: this.stepAltsLineVisibility[li] }}>
                                <InputField<number>
                                  dataEntryFormat={new AltitudeOrFlightLevelFormat(this.transitionAltitude)}
                                  value={this.stepAltsAltitude[li]}
                                  containerStyle="width: 150px;"
                                  alignText="center"
                                  tmpyActive={this.tmpyActive}
                                  onModified={(newAltitude) => this.handleCruiseStepAltitudeModified(newAltitude, li)}
                                  errorHandler={(e) =>
                                    this.props.fmcService.master?.showFmsErrorMessage(e.type, e.details)
                                  }
                                  hEventConsumer={this.props.mfd.hEventConsumer}
                                  interactionMode={this.props.mfd.interactionMode}
                                />
                              </div>
                            </div>
                            <div
                              class="fr aic jcc"
                              style={{
                                display: this.stepAltsMessageDisplay[li],
                                'grid-column': 'span 2',
                              }}
                            >
                              <span class="mfd-label">{this.stepAltsMessage[li]}</span>
                            </div>
                            <div
                              class="fr aic jcc"
                              style={{
                                display: this.stepAltsNoMessageDisplay[li],
                                'justify-content': 'flex-end',
                              }}
                            >
                              <div style={{ visibility: this.stepLinesPredictionsVisibility[li] }}>
                                <span class={{ 'mfd-value': true, sec: this.secActive, tmpy: this.tmpyActive }}>
                                  {this.stepAltsDistancesFormatted[li]}
                                </span>
                                <span class="mfd-label-unit mfd-unit-trailing">NM</span>
                              </div>
                            </div>
                            <div class="fr aic jcc" style={{ display: this.stepAltsNoMessageDisplay[li] }}>
                              <span
                                class={{ 'mfd-value': true, sec: this.secActive, tmpy: this.tmpyActive }}
                                style={{ visibility: this.stepLinesPredictionsVisibility[li] }}
                              >
                                {this.stepAltsTimes[li]}
                              </span>
                            </div>
                          </>
                        ))}
                      </div>
                      <div style="flex-grow: 1" />
                      <div class="fr jcc" style="flex: 1;">
                        <span class="mfd-label biggest amber" style={{ visibility: this.stepNotAllowedAtVisibility }}>
                          {this.stepNotAllowedAt}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: row; justify-content: center; align-items: center;">
                    <IconButton
                      icon={'double-down'}
                      containerStyle="padding: 10px; margin-right: 5px;"
                      disabled={this.stepAltsScrollDownDisabled}
                      onClick={() =>
                        this.stepAltsStartAtStepIndex.set(
                          Math.min(this.stepAltsNumberOfCruiseSteps.get(), this.stepAltsStartAtStepIndex.get() + 1),
                        )
                      }
                    />
                    <IconButton
                      icon={'double-up'}
                      containerStyle="padding: 10px"
                      disabled={this.stepAltsScrollUpDisabled}
                      onClick={() =>
                        this.stepAltsStartAtStepIndex.set(Math.max(0, this.stepAltsStartAtStepIndex.get() - 1))
                      }
                    />
                  </div>
                  <div class="fc" style="width: 100%; margin-top: 25px;">
                    <div
                      class="mfd-fms-fpln-labeled-box-container"
                      style="flex-direction: row; justify-content: flex-start; align-items: flex-start;"
                    >
                      <div class="mfd-fms-fpln-labeled-box-label">
                        <span class="mfd-label">OPTIMUM STEP POINT</span>
                      </div>
                      <div class="fr aic" style="margin: 25px 200px 0px 10px;">
                        <span class="mfd-label" style="margin-right: 10px;">
                          TO
                        </span>
                        <span class="mfd-label-unit mfd-unit-leading">FL</span>
                        <span class={{ 'mfd-value': true, sec: this.secActive }}>---</span>
                      </div>
                      <div class="mfd-label" style="margin-top: 60px; margin-bottom: 30px;">
                        NO OPTIMUM STEP FOUND
                      </div>
                    </div>
                  </div>
                </div>
              </TopTabNavigatorPage>
            </TopTabNavigator>
            <div style={{ 'flex-grow': '1', display: this.fillPageDisplay }} />
            <div style="display: flex; flex-direction: row; justify-content: space-between;">
              <div ref={this.returnButtonDiv} style="display: flex; justify-content: flex-end; padding: 2px;">
                <Button
                  label="RETURN"
                  buttonStyle="width: 101px;"
                  onClick={() => {
                    this.props.fmcService.master.resetRevisedWaypoint();
                    this.props.mfd.uiService.navigateTo('back');
                  }}
                />
              </div>
              <div ref={this.tmpyInsertButtonDiv} style="display: flex; justify-content: flex-end; padding: 2px;">
                <Button
                  label="TMPY F-PLN"
                  onClick={() => {
                    this.props.fmcService.master.resetRevisedWaypoint();
                    this.props.mfd.uiService.navigateTo(
                      `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`,
                    );
                  }}
                  buttonStyle="color: yellow"
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
