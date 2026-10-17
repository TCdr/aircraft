import {
  ClockEvents,
  FSComponent,
  MappedSubject,
  NumberFormatter,
  NumberUnitSubject,
  Subject,
  UnitType,
  VNode,
} from '@microsoft/msfs-sdk';

import './MfdFmsFpln.scss';
import './MfdFmsFplnHold.scss';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../../common/FcomLayout';
import { AbstractMfdPageProps } from '../../../MFD';
import { Footer } from '../../common/Footer';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FmsFlightPlanPage } from '../../common/FmsFlightPlanPage';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { HoldDistFormat, HoldTimeFormat, InboundCourseFormat } from '../../common/DataEntryFormats';
import { RadioButtonColor, RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { HoldData, HoldType } from '@fmgc/flightplanning/data/flightplan';
import { NXDataStore, TurnDirection } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { findDatabaseHold } from '@fmgc/flightplanning/plans/DatabaseHold';
import { holdEntryPrediction, holdLastExit } from '@fmgc/flightplanning/fuel/HoldLastExit';
import { FinalHoldingPredictor } from '../../../FMC/FinalHoldingPredictor';
import { holdRevisionTarget, holdTypeLabel } from './HoldTypeLabel';

interface MfdFmsFplnHoldProps extends AbstractMfdPageProps {}

/** Pounds per kilogram (the VNAV predictions give the EFOB in pounds) */
const POUNDS_PER_KG = 2.204_622_6;

export class MfdFmsFplnHold extends FmsFlightPlanPage<MfdFmsFplnHoldProps> {
  private readonly weightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((v) =>
    v ? UnitType.KILOGRAM : UnitType.POUND,
  );
  private readonly weightUnitText = this.weightUnit.map((v) => (v === UnitType.KILOGRAM ? 'T' : 'KLB'));

  private readonly weightFormatter = NumberFormatter.create({
    nanString: '---.-',
    precision: 0.1,
  });

  private readonly holdType = Subject.create<string>('MODIFIED HOLD AT');

  private readonly waypointIdent = Subject.create<string>('WAYPOINT');

  private readonly inboundCourse = Subject.create<number | null>(null);

  private readonly turnSelectedIndex = Subject.create<number | null>(null);

  private readonly legDefiningParameterSelectedIndex = Subject.create<number | null>(null);

  private readonly legTime = Subject.create<number | null>(null);

  private readonly legTimeRef = FSComponent.createRef<HTMLDivElement>();

  private readonly legDistance = Subject.create<number | null>(null);

  private readonly legDistanceRef = FSComponent.createRef<HTMLDivElement>();

  private readonly lastExitUtc = Subject.create<string | null>(null);

  private readonly lastExitEfob = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly lastExitEfobText = MappedSubject.create(
    ([value, weightUnit]) => this.weightFormatter(value.asUnit(weightUnit) / 1000),
    this.lastExitEfob,
    this.weightUnit,
  );

  private readonly returnButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly tmpyInsertButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly radioButtonColor = this.tmpyActive.map((it) =>
    it ? RadioButtonColor.Yellow : RadioButtonColor.Cyan,
  );

  private readonly isActiveOrTmpy = this.loadedFlightPlanIndex.map(
    (idx) => idx === FlightPlanIndex.Active || idx === FlightPlanIndex.Temporary,
  );

  /**
   * True while the entry fields are filled from the flight plan: these updates are not flight crew changes, and must
   * not turn the hold into a modified hold (only a flight crew change of a parameter of a database or computed
   * hold makes it a modified hold).
   */
  private fillingFromFlightPlan = false;

  /** The database hold of the revised waypoint, null when the database has none (DATABASE button disabled) */
  private readonly databaseHold = Subject.create<HoldData | null>(null);

  private readonly databaseButtonDisabled = this.databaseHold.map((hold) => hold === null);

  /** The hold fix (plan, leg, database id) whose database hold was looked up last */
  private databaseHoldLookupKey: string | null = null;

  protected onNewData(): void {
    const revWptIdx = this.props.fmcService.master.revisedLegIndex.get();
    if (this.props.fmcService.master.revisedWaypoint() && revWptIdx) {
      const leg = this.loadedFlightPlan?.legElementAt(revWptIdx);
      const hold = leg?.modifiedHold !== undefined ? leg.modifiedHold : leg?.defaultHold;
      if (leg && hold) {
        this.holdType.set(holdTypeLabel(leg.modifiedHold, leg.defaultHold));
        this.fillingFromFlightPlan = true;
        this.waypointIdent.set(leg.ident ?? '');
        this.inboundCourse.set(hold.inboundMagneticCourse ?? null);
        this.turnSelectedIndex.set(hold.turnDirection === TurnDirection.Left ? 0 : 1);
        this.legDefiningParameterSelectedIndex.set(hold.time !== undefined ? 0 : 1);
        this.legTime.set(hold.time ?? null);
        this.legDistance.set(hold.distance ?? null);
        this.fillingFromFlightPlan = false;

        this.lookUpDatabaseHold(revWptIdx, leg.defaultHold?.inboundMagneticCourse ?? hold.inboundMagneticCourse ?? 0);
      }
    }
    this.updateLastExit();
  }

  /**
   * Looks up the database hold of the revised waypoint once per hold fix (the DATABASE button cannot be selected
   * when the selected waypoint has no database hold).
   * @param holdLegIndex the index of the hold leg
   * @param inboundCourse the course to the hold fix, to pick between several database holds
   */
  private lookUpDatabaseHold(holdLegIndex: number, inboundCourse: number): void {
    const plan = this.loadedFlightPlan;
    const leg = plan?.legElementAt(holdLegIndex);
    const fix = leg?.terminationWaypoint();
    if (!plan || !fix) {
      this.databaseHoldLookupKey = null;
      this.databaseHold.set(null);
      return;
    }
    const key = `${plan.index}:${holdLegIndex}:${fix.databaseId}`;
    if (key === this.databaseHoldLookupKey) {
      return;
    }
    this.databaseHoldLookupKey = key;
    this.databaseHold.set(null);

    // the database hold that suits the predicted altitude at the hold fix (else the aircraft altitude)
    const predictedAltitude =
      plan.index === FlightPlanIndex.Active || plan.index === FlightPlanIndex.Temporary
        ? this.props.fmcService.master.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions?.get(
            holdLegIndex - 1,
          )?.altitude
        : undefined;
    const altitude: number = predictedAltitude ?? SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet');

    findDatabaseHold(fix, plan.originAirport?.ident, plan.destinationAirport?.ident, altitude, inboundCourse)
      .then((hold) => {
        if (this.databaseHoldLookupKey === key) {
          this.databaseHold.set(hold ?? null);
        }
      })
      .catch((e) => console.error(e));
  }

  /** DATABASE button: the database hold replaces the displayed one in the temporary F-PLN */
  private async selectDatabaseHold(): Promise<void> {
    const databaseHold = this.databaseHold.get();
    const revWptIdx = this.props.fmcService.master.revisedLegIndex.get();
    const revPlanIdx = this.props.fmcService.master.revisedLegPlanIndex.get();
    if (!databaseHold || revWptIdx === null || revPlanIdx === null || !this.props.fmcService.master.revisedWaypoint()) {
      return;
    }
    const leg = this.loadedFlightPlan?.legElementAt(revWptIdx);
    await this.props.flightPlanInterface.addOrEditManualHold(
      revWptIdx,
      { ...databaseHold },
      { ...databaseHold },
      leg?.defaultHold ?? { ...databaseHold },
      revPlanIdx,
      this.props.fmcService.master.revisedLegIsAltn.get() ?? false,
    );
    this.onNewData();
  }

  /**
   * LAST EXIT time and EFOB (see HoldLastExit.ts): the EXTRA fuel of the FUEL&LOAD page burnt in
   * the hold, from the arrival at the hold fix (or now, in the hold), at the holding fuel flow of the FINAL fuel
   * (FinalHoldingPredictor). Design choice: dashes for a hold of the temporary, secondary or alternate flight plan,
   * whose fuel predictions the FMS does not compute.
   */
  private updateLastExit(): void {
    const fmc = this.props.fmcService.master;
    const holdLegIndex = fmc?.revisedLegIndex.get() ?? null;
    const plan = this.loadedFlightPlan;
    if (
      !fmc ||
      !plan ||
      holdLegIndex === null ||
      this.loadedFlightPlanIndex.get() !== FlightPlanIndex.Active ||
      fmc.revisedLegIsAltn.get()
    ) {
      this.lastExitUtc.set('--:--');
      this.lastExitEfob.set(NaN);
      return;
    }

    const profile = fmc.guidanceController?.vnavDriver?.mcduProfile;
    const holdFix = profile?.isReadyToDisplay ? profile.waypointPredictions.get(holdLegIndex - 1) : undefined;
    const entry = holdEntryPrediction(
      holdLegIndex,
      plan.activeLegIndex,
      fmc.fmgc.getFOB(),
      holdFix
        ? {
            secondsFromPresent: holdFix.secondsFromPresent,
            fuelOnBoard: holdFix.estimatedFuelOnBoard / POUNDS_PER_KG / 1000,
          }
        : undefined,
    );

    // EXTRA fuel in tonnes, and the time it lasts in this hold: the hold ends at the ZFW plus the fuel left at the exit
    const extraKg = fmc.getExtraFuel(FlightPlanIndex.Active);
    const extraFuel = extraKg !== null ? extraKg / 1000 : null;
    const zfw = plan.performanceData.zeroFuelWeight.get();
    const heldFuel = extraFuel !== null ? Math.max(0, extraFuel) : null;
    const extraMinutes =
      entry !== null && heldFuel !== null
        ? FinalHoldingPredictor.timeForFuel(zfw !== null ? zfw + entry.fuelOnBoard - heldFuel : null, heldFuel)
        : null;

    const lastExit = holdLastExit(entry, extraFuel, extraMinutes);
    this.lastExitUtc.set(lastExit !== null ? fmc.timeKeeper.formatEta(lastExit.secondsFromPresent) : '--:--');
    this.lastExitEfob.set(lastExit !== null ? lastExit.fuelOnBoard * 1000 : NaN);
  }

  /** The revised hold leg and flight plan the buttons and entries act on */
  private revisionTarget() {
    return holdRevisionTarget(
      this.props.fmcService.master.revisedLegIndex.get(),
      this.props.fmcService.master.revisedLegPlanIndex.get(),
      !!this.props.fmcService.master.revisedWaypoint(),
    );
  }

  private async modifyHold() {
    const target = this.revisionTarget();
    if (target) {
      const revWptIdx = target.legIndex;
      const revPlanIdx = target.planIndex;
      const desiredHold: HoldData = {
        type: HoldType.Pilot,
        distance: this.legDefiningParameterSelectedIndex.get() === 0 ? undefined : this.legDistance.get() ?? undefined,
        time: this.legDefiningParameterSelectedIndex.get() === 0 ? this.legTime.get() ?? undefined : undefined,
        inboundMagneticCourse: this.inboundCourse.get() ?? undefined,
        turnDirection: this.turnSelectedIndex.get() === 0 ? TurnDirection.Left : TurnDirection.Right,
      };

      const fallbackDefaultHold: HoldData = {
        type: HoldType.Database,
        distance: 1,
        time: 1,
        inboundMagneticCourse: 0,
        turnDirection: TurnDirection.Right,
      };

      await this.props.flightPlanInterface.addOrEditManualHold(
        revWptIdx,
        { ...desiredHold },
        desiredHold,
        this.loadedFlightPlan?.legElementAt(revWptIdx).defaultHold ?? fallbackDefaultHold,
        revPlanIdx,
        this.props.fmcService.master.revisedLegIsAltn.get() ?? false,
      );
      this.onNewData();
    }
  }

  private showTimeOrDist() {
    switch (this.legDefiningParameterSelectedIndex.get()) {
      case 0: // TIME
        this.legTimeRef.instance.style.visibility = 'visible';
        this.legDistanceRef.instance.style.visibility = 'hidden';
        break;
      case 1: // DIST
        this.legTimeRef.instance.style.visibility = 'hidden';
        this.legDistanceRef.instance.style.visibility = 'visible';
        break;
      default:
        this.legTimeRef.instance.style.visibility = 'hidden';
        this.legDistanceRef.instance.style.visibility = 'hidden';
        break;
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.tmpyActive.sub((v) => {
        if (this.returnButtonDiv.getOrDefault() && this.tmpyInsertButtonDiv.getOrDefault()) {
          this.returnButtonDiv.instance.style.visibility = v ? 'hidden' : 'visible';
          this.tmpyInsertButtonDiv.instance.style.visibility = v ? 'visible' : 'hidden';
        }
      }, true),
      this.isActiveOrTmpy,
    );

    // A flight crew change of a parameter makes a modified hold; the filling from the flight plan does not
    const onCrewChange = () => {
      if (!this.fillingFromFlightPlan) {
        this.modifyHold();
      }
    };
    this.subs.push(
      this.legDefiningParameterSelectedIndex.sub(() => {
        this.showTimeOrDist();
        onCrewChange();
      }),
    );

    this.subs.push(this.inboundCourse.sub(onCrewChange));
    this.subs.push(this.turnSelectedIndex.sub(onCrewChange));
    this.subs.push(this.legTime.sub(onCrewChange));
    this.subs.push(this.legDistance.sub(onCrewChange));

    this.subs.push(this.weightUnit, this.weightUnitText, this.lastExitEfobText, this.databaseButtonDisabled);

    // the LAST EXIT moves with the predictions: refreshed every second
    this.subs.push(
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(1)
        .handle(() => this.updateLastExit()),
    );

    this.showTimeOrDist();
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        {/* Positions measured on the reference figure of the page, in page container coordinates */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-fpln-hold-canvas">
            <div class="mfd-fpln-hold-frame" />
            {fcomAt(
              42,
              32,
              <span class="mfd-label mfd-fms-fpln-proc-frame-title">
                {this.holdType}{' '}
                <span class={{ 'mfd-label': true, green: this.isActiveOrTmpy, bigger: true }}>
                  {this.waypointIdent}
                </span>
              </span>,
            )}
            {fcomAt(118, 25, <span class="mfd-label">INBOUND CRS</span>)}
            {fcomAt(
              172,
              108,
              <InputField<number>
                value={this.inboundCourse}
                dataEntryFormat={new InboundCourseFormat()}
                tmpyActive={this.tmpyActive}
                containerStyle="width: 94px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(250, 25, <span class="mfd-label">TURN</span>)}
            {fcomAt(
              306,
              110,
              <RadioButtonGroup
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_holdTurnRadio`}
                selectedIndex={this.turnSelectedIndex}
                values={['LEFT', 'RIGHT']}
                color={this.radioButtonColor}
                additionalVerticalSpacing={9}
              />,
            )}
            {fcomAt(414, 25, <span class="mfd-label">LEG DEFINING PARAMETER</span>)}
            {fcomAt(
              484,
              110,
              <RadioButtonGroup
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_holdDefiningParameterRadio`}
                selectedIndex={this.legDefiningParameterSelectedIndex}
                values={['TIME', 'DIST']}
                color={this.radioButtonColor}
                additionalVerticalSpacing={9}
              />,
            )}
            {fcomAt(
              467,
              230,
              <div ref={this.legTimeRef}>
                <InputField<number>
                  dataEntryFormat={new HoldTimeFormat()}
                  value={this.legTime}
                  tmpyActive={this.tmpyActive}
                  containerStyle="width: 119px;"
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />
              </div>,
            )}
            {fcomAt(
              511,
              230,
              <div ref={this.legDistanceRef}>
                <InputField<number>
                  dataEntryFormat={new HoldDistFormat()}
                  value={this.legDistance}
                  tmpyActive={this.tmpyActive}
                  containerStyle="width: 119px;"
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />
              </div>,
            )}
            {fcomLine(559, 18, 590)}
            {fcomAt(617, 25, <span class="mfd-label">LAST EXIT (FOR EXTRA FUEL = 0 AT ALTN)</span>)}
            {fcomCentre(667, 135, <span class="mfd-label">AT</span>)}
            {fcomCentre(667, 247, <span class="mfd-label">UTC</span>)}
            {fcomCentre(667, 430, <span class="mfd-label">EFOB</span>)}
            {fcomCentre(
              713,
              246,
              <span class={{ 'mfd-value': true, bigger: true, magenta: this.isActiveOrTmpy }}>{this.lastExitUtc}</span>,
            )}
            {fcomRight(713, 512, [
              <span class={{ 'mfd-value': true, bigger: true, magenta: this.isActiveOrTmpy }}>
                {this.lastExitEfobText}
              </span>,
              <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
            ])}
            {fcomAt(
              140,
              608,
              <Button
                label="DATABASE"
                onClick={() => {
                  void this.selectDatabaseHold();
                }}
                buttonStyle="min-width: 150px; min-height: 59px;"
                disabled={this.databaseButtonDisabled}
              />,
            )}
            {fcomAt(
              209,
              608,
              <Button
                label="COMPUTED"
                onClick={() => {
                  const target = this.revisionTarget();
                  if (target) {
                    this.props.flightPlanInterface.revertHoldToComputed(
                      target.legIndex,
                      target.planIndex,
                      this.props.fmcService.master.revisedLegIsAltn.get() ?? false,
                    );
                  }
                }}
                buttonStyle="min-width: 150px; min-height: 59px;"
              />,
            )}
            <div ref={this.returnButtonDiv}>
              {fcomAt(
                788,
                5,
                <Button
                  label="RETURN"
                  buttonStyle="min-width: 129px;"
                  onClick={() => {
                    // RETURN displays the F-PLN page
                    this.props.fmcService.master.resetRevisedWaypoint();
                    this.props.mfd.uiService.navigateTo(
                      `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`,
                    );
                  }}
                />,
              )}
            </div>
            <div ref={this.tmpyInsertButtonDiv}>
              {fcomAt(
                788,
                599,
                <Button
                  label="TMPY F-PLN"
                  onClick={() => {
                    this.props.fmcService.master.resetRevisedWaypoint();
                    this.props.mfd.uiService.navigateTo(
                      `fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`,
                    );
                  }}
                  buttonStyle="color: yellow; min-width: 162px;"
                />,
              )}
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
    );
  }
}
