import { ArraySubject, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import './MfdFmsFplnDirectTo.scss';
import { AbstractMfdPageProps } from '../../../MFD';
import { Footer } from '../../common/Footer';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FmsPage } from '../../common/FmsPage';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { FlightPlanLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { RadioButtonColor, RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { ADIRS } from '../../../shared/Adirs';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { DirectToInterceptCourse } from '@fmgc/flightplanning/plans/DirectTo';
import { Fix, MagVar } from '@flybywiresim/fbw-sdk';
import { bearingTo } from 'msfs-geo';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DirectToCourseFormat } from '../../common/DataEntryFormats';

interface MfdFmsFplnDirectToProps extends AbstractMfdPageProps {}

enum DirectToOption {
  DIRECT = 0,
  DIRECT_WITH_ABEAM = 1,
  CRS_IN = 2,
  CRS_OUT = 3,
}

export class MfdFmsFplnDirectTo extends FmsPage<MfdFmsFplnDirectToProps> {
  private readonly dropdownMenuRef = FSComponent.createRef<DropdownMenu>();

  private readonly availableWaypoints = ArraySubject.create<string>([]);

  private availableWaypointsToLegIndex: number[] = [];

  private readonly selectedWaypointIndex = Subject.create<number | null>(null);

  private manualWptIdent: string | null = '';

  private readonly utcEta = Subject.create<string>('--:--');

  private readonly distToWpt = Subject.create<string>('---');

  readonly directToOption = Subject.create<DirectToOption | null>(DirectToOption.DIRECT);

  /** CRS IN / CRS OUT course, magnetic unless {@link courseIsTrue} (FCOM DSC-22-FMS-20-30 P 131, CRS entry field) */
  private readonly course = Subject.create<number | null>(null);

  private readonly courseIsTrue = Subject.create(false);

  /** The DIR TO target: a leg of the active flight plan, or another waypoint */
  private target: { legIndex: number } | { fix: Fix } | null = null;

  private readonly courseFieldVisibility = this.directToOption.map((o) =>
    o === DirectToOption.CRS_IN || o === DirectToOption.CRS_OUT ? 'inherit' : 'hidden',
  );

  /** The CRS field is next to the selected CRS IN or CRS OUT option (FCOM figure) */
  private readonly courseFieldTop = this.directToOption.map((o) => (o === DirectToOption.CRS_OUT ? '209px' : '166px'));

  private readonly eraseButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly returnButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly tmpyInsertButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly directOptionRadioColor = this.tmpyActive.map((it) =>
    it ? RadioButtonColor.Yellow : RadioButtonColor.Cyan,
  );

  protected onNewData(): void {
    // Use active FPLN for building the list (page only works for active anyways)
    const activeFpln = this.props.flightPlanInterface.active;
    if (activeFpln) {
      this.availableWaypointsToLegIndex = [];
      const wpt = activeFpln.allLegs
        .slice(activeFpln.activeLegIndex, activeFpln.firstMissedApproachLegIndex)
        .map((el, idx) => {
          if (el instanceof FlightPlanLeg && el.isXF()) {
            this.availableWaypointsToLegIndex.push(idx + activeFpln.activeLegIndex);
            return el.ident;
          }
          return null;
        })
        .filter((el) => el !== null) as readonly string[];
      if (wpt) {
        this.availableWaypoints.set(wpt);
      }
    }

    // Existance of TMPY fpln is indicator for pending direct to revision
    if (this.loadedFlightPlanIndex.get() === FlightPlanIndex.Temporary) {
      // If waypoint was revised, select revised wpt
      const revWpt = this.props.fmcService.master.revisedWaypoint();
      if (revWpt) {
        const selectedLegIndex = this.availableWaypoints.getArray().findIndex((it) => it === revWpt.ident);
        if (selectedLegIndex !== -1) {
          this.selectedWaypointIndex.set(selectedLegIndex);
          // DIR TO created from the waypoint revisions menu: the target of the options
          if (this.target === null) {
            this.target = { legIndex: this.availableWaypointsToLegIndex[selectedLegIndex] };
          }
        }
      }

      // Manual waypoint was entered. In this case, force dropdown field to display wpt ident without selecting it
      if (this.manualWptIdent) {
        this.selectedWaypointIndex.set(null);
        this.dropdownMenuRef.instance.forceLabel(this.manualWptIdent);
      }

      // TODO Display ETA; target waypoint is now activeLeg termination in temporary fpln
      if (this.loadedFlightPlan?.activeLeg instanceof FlightPlanLeg) {
        // No predictions for temporary fpln atm, so only distance is displayed
        this.distToWpt.set(this.loadedFlightPlan?.activeLeg?.calculated?.cumulativeDistance?.toFixed(0) ?? '---');
      }
    }
  }

  private async onDropdownModified(idx: number, text: string): Promise<void> {
    if (idx >= 0) {
      const legIndex = this.availableWaypointsToLegIndex[idx];
      if (legIndex !== undefined) {
        this.selectedWaypointIndex.set(idx);
        this.manualWptIdent = null;
        this.target = { legIndex };
      }
    } else if (this.props.fmcService.master && text !== null) {
      const wpt = await WaypointEntryUtils.getOrCreateWaypoint(this.props.fmcService.master, text, true, undefined);
      if (wpt) {
        this.manualWptIdent = wpt.ident;
        this.target = { fix: wpt };
      }
    }
    this.setDefaultCourse();
    await this.buildDirectTo();
  }

  private async onOptionModified(option: DirectToOption): Promise<void> {
    this.directToOption.set(option);
    this.setDefaultCourse();
    await this.buildDirectTo();
  }

  /**
   * FCOM DSC-22-FMS-20-30 P 131: for a flight plan target waypoint, the default CRS IN is the course from the preceding
   * flight plan waypoint to the target, and the default CRS OUT the course from the target to the following waypoint.
   */
  private setDefaultCourse(): void {
    this.courseIsTrue.set(false);
    const option = this.directToOption.get();
    const plan = this.props.flightPlanInterface.active;
    if ((option !== DirectToOption.CRS_IN && option !== DirectToOption.CRS_OUT) || !this.target || !plan) {
      this.course.set(null);
      return;
    }
    const legs = plan.allLegs;
    const targetIndex =
      'legIndex' in this.target
        ? this.target.legIndex
        : legs.findIndex(
            (it) => it instanceof FlightPlanLeg && it.terminationWaypoint()?.ident === this.manualWptIdent,
          );
    const targetFix =
      legs[targetIndex] instanceof FlightPlanLeg ? (legs[targetIndex] as FlightPlanLeg).terminationWaypoint() : null;
    const fixAt = (index: number) => {
      const leg = legs[index];
      return leg instanceof FlightPlanLeg ? leg.terminationWaypoint() : null;
    };
    const otherFix = option === DirectToOption.CRS_IN ? fixAt(targetIndex - 1) : fixAt(targetIndex + 1);
    if (targetIndex < 0 || !targetFix || !otherFix) {
      this.course.set(null);
      return;
    }
    const trueCourse =
      option === DirectToOption.CRS_IN
        ? (bearingTo(targetFix.location, otherFix.location) + 180) % 360
        : bearingTo(targetFix.location, otherFix.location);
    const magVar = MagVar.getForFix(targetFix);
    const course = magVar !== null ? MagVar.trueToMagnetic(trueCourse, magVar) : trueCourse;
    this.courseIsTrue.set(magVar === null);
    this.course.set(Math.round(course) % 360);
  }

  /** Builds the temporary flight plan of the DIR TO with the selected option (a new one when the options change) */
  private async buildDirectTo(): Promise<void> {
    if (this.props.flightPlanInterface.hasTemporary) {
      await this.props.flightPlanInterface.temporaryDelete();
      this.props.fmcService.master.resetRevisedWaypoint();
    }
    const target = this.target;
    const option = this.directToOption.get();
    if (!target) {
      return;
    }

    let interceptCourse: DirectToInterceptCourse | undefined;
    if (option === DirectToOption.CRS_IN || option === DirectToOption.CRS_OUT) {
      const course = this.course.get();
      if (course === null) {
        // No DIR TO until the flight crew enters the course
        return;
      }
      interceptCourse = { course, isTrue: this.courseIsTrue.get(), inbound: option === DirectToOption.CRS_IN };
    }
    const withAbeam = option === DirectToOption.DIRECT_WITH_ABEAM;
    const ppos = this.props.fmcService.master.navigation.getPpos() ?? { lat: 0, long: 0 };

    if ('legIndex' in target) {
      this.props.fmcService.master.setRevisedWaypoint(target.legIndex, FlightPlanIndex.Active, false);
      const trueTrack = ADIRS.getTrueTrack();
      await this.props.flightPlanInterface.directToLeg(
        ppos,
        trueTrack?.isNormalOperation() ? trueTrack.value : 0,
        target.legIndex,
        withAbeam,
        FlightPlanIndex.Active,
        interceptCourse,
      );
    } else {
      await this.props.flightPlanInterface.directToWaypoint(
        ppos,
        SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', 'degree'),
        target.fix,
        withAbeam,
        FlightPlanIndex.Active,
        interceptCourse,
      );
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.onNewData();

    this.subs.push(
      this.tmpyActive.sub((v) => {
        if (
          this.eraseButtonDiv.getOrDefault() &&
          this.returnButtonDiv.getOrDefault() &&
          this.tmpyInsertButtonDiv.getOrDefault()
        ) {
          this.eraseButtonDiv.instance.style.display = v ? 'block' : 'none';
          this.returnButtonDiv.instance.style.display = v ? 'none' : 'block';
          this.tmpyInsertButtonDiv.instance.style.visibility = v ? 'visible' : 'hidden';
        }
      }, true),
    );

    this.subs.push(this.directOptionRadioColor, this.courseFieldVisibility, this.courseFieldTop);
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="fr">
          <div style="flex: 1">
            <div class="fc">
              <div class="mfd-fms-direct-to-wpt-row">
                <span class="mfd-label">DIRECT TO</span>
                <div class="mfd-fms-direct-to-dropdown-div">
                  <DropdownMenu
                    ref={this.dropdownMenuRef}
                    idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_directToDropdown`}
                    selectedIndex={this.selectedWaypointIndex}
                    values={this.availableWaypoints}
                    freeTextAllowed
                    containerStyle="width: 180px;"
                    alignLabels="flex-start"
                    onModified={(i, text) => {
                      if (i !== null) {
                        this.onDropdownModified(i, text);
                      }
                    }}
                    numberOfDigitsForInputField={7}
                    tmpyActive={this.tmpyActive}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />
                </div>
              </div>
              <div class="mfd-fms-direct-to-wpt-info">
                <div class="mfd-fms-direct-to-utc-label">
                  <span class="mfd-label">UTC</span>
                </div>
                <div class="mfd-fms-direct-to-utc-value">
                  <span
                    class={{
                      'mfd-value': true,
                      bigger: true,
                      'mfd-fms-yellow-text': this.tmpyActive,
                    }}
                  >
                    {this.utcEta}
                  </span>
                </div>
                <div />
                <div class="mfd-fms-direct-to-utc-label">
                  <span class="mfd-label">DIST</span>
                </div>
                <div class="mfd-fms-direct-to-utc-value">
                  <span
                    class={{
                      'mfd-value': true,
                      bigger: true,
                      'mfd-fms-yellow-text': this.tmpyActive,
                    }}
                  >
                    {this.distToWpt}
                  </span>
                </div>
                <div>
                  <span class="mfd-label-unit mfd-unit-trailing">NM</span>
                </div>
              </div>
            </div>
          </div>
          <div style="flex: 1">
            <div class="mfd-fms-direct-to-options-box">
              <span class="mfd-label">OPTIONS</span>
              <div class="mfd-fms-direct-to-options">
                <RadioButtonGroup
                  idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_directToOptionsRadio`}
                  values={['DIRECT', 'DIRECT WITH ABEAM', 'CRS IN', 'CRS OUT']}
                  valuesDisabled={Subject.create([false, false, false, false])}
                  selectedIndex={this.directToOption}
                  onModified={(option) => this.onOptionModified(option)}
                  color={this.directOptionRadioColor}
                />
              </div>
              {/* FCOM DSC-22-FMS-20-30 P 131: CRS entry field of the selected CRS IN or CRS OUT option */}
              <div
                class="mfd-fms-direct-to-course-field"
                style={{ visibility: this.courseFieldVisibility, top: this.courseFieldTop }}
              >
                <InputField<number>
                  dataEntryFormat={
                    new DirectToCourseFormat(this.courseIsTrue, (isTrue) => this.courseIsTrue.set(isTrue))
                  }
                  value={this.course}
                  onModified={async (course) => {
                    this.course.set(course);
                    await this.buildDirectTo();
                  }}
                  mandatory={Subject.create(true)}
                  tmpyActive={this.tmpyActive}
                  alignText="flex-end"
                  containerStyle="width: 95px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />
              </div>
            </div>
          </div>
        </div>
        <div style="flex-grow: 1;" />
        <div class="mfd-fms-bottom-button-row">
          <div ref={this.eraseButtonDiv} class="mfd-fms-direct-to-erase-return-btn">
            <Button
              label="ERASE<br />DIR TO*"
              onClick={async () => {
                await this.props.flightPlanInterface.temporaryDelete();
                this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`);
              }}
              buttonStyle="color: #e68000;"
            />
          </div>
          <div ref={this.returnButtonDiv} class="mfd-fms-direct-to-erase-return-btn">
            <Button
              label="RETURN"
              buttonStyle="min-width: 129px;"
              onClick={() =>
                this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`)
              }
            />
          </div>
          <div ref={this.tmpyInsertButtonDiv} class="mfd-fms-direct-to-erase-return-btn">
            <Button
              label="INSERT<br />DIR TO*"
              onClick={async () => {
                SimVar.SetSimVarValue('K:A32NX.FMGC_DIR_TO_TRIGGER', 'number', 0);
                this.props.flightPlanInterface.temporaryInsert();
                this.props.fmcService.master.guidanceController?.vnavDriver?.invalidateFlightPlanProfile();
                this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`);
              }}
              buttonStyle="color: #e68000;"
            />
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
