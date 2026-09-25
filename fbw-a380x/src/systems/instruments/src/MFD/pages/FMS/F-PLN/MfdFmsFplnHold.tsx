import {
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
import { FmsPage } from '../../common/FmsPage';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { HoldDistFormat, HoldTimeFormat, InboundCourseFormat } from '../../common/DataEntryFormats';
import { RadioButtonColor, RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { HoldData, HoldType } from '@fmgc/flightplanning/data/flightplan';
import { NXDataStore, TurnDirection } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';

interface MfdFmsFplnHoldProps extends AbstractMfdPageProps {}

export class MfdFmsFplnHold extends FmsPage<MfdFmsFplnHoldProps> {
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

  protected onNewData(): void {
    const revWptIdx = this.props.fmcService.master.revisedLegIndex.get();
    if (this.props.fmcService.master.revisedWaypoint() && revWptIdx) {
      const leg = this.loadedFlightPlan?.legElementAt(revWptIdx);
      const hold = leg?.modifiedHold !== undefined ? leg.modifiedHold : leg?.defaultHold;
      if (hold) {
        switch (hold.type) {
          case HoldType.Computed:
            this.holdType.set('COMPUTED HOLD AT ');
            break;
          case HoldType.Pilot:
            this.holdType.set('MODIFIED HOLD AT ');
            break;
          default:
            this.holdType.set('');
            break;
        }
        this.waypointIdent.set(leg?.ident ?? '');
        this.inboundCourse.set(hold.inboundMagneticCourse ?? null);
        this.turnSelectedIndex.set(hold?.turnDirection === TurnDirection.Left ? 0 : 1);
        this.legDefiningParameterSelectedIndex.set(hold?.time !== undefined ? 0 : 1);
        this.legTime.set(hold?.time ?? null);
        this.legDistance.set(hold?.distance ?? null);

        this.lastExitUtc.set('--:--');
        this.lastExitEfob.set(NaN);
      }
    }
  }

  private async modifyHold() {
    const revWptIdx = this.props.fmcService.master.revisedLegIndex.get();
    const revPlanIdx = this.props.fmcService.master.revisedLegPlanIndex.get();
    if (revWptIdx && revPlanIdx && this.props.fmcService.master.revisedWaypoint()) {
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

    this.subs.push(
      this.legDefiningParameterSelectedIndex.sub(() => {
        this.showTimeOrDist();
        this.modifyHold();
      }),
    );

    this.subs.push(this.inboundCourse.sub(() => this.modifyHold()));
    this.subs.push(this.turnSelectedIndex.sub(() => this.modifyHold()));
    this.subs.push(this.legTime.sub(() => this.modifyHold()));
    this.subs.push(this.legDistance.sub(() => this.modifyHold()));

    this.subs.push(this.weightUnit, this.weightUnitText, this.lastExitEfobText);

    this.showTimeOrDist();
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 186), page container coordinates */}
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
                onClick={() => console.warn('DATABASE HOLD NOT IMPLEMENTED')}
                buttonStyle="width: 122px; height: 41px;"
                disabled={true}
              />,
            )}
            {fcomAt(
              209,
              608,
              <Button
                label="COMPUTED"
                onClick={() => {
                  const revWptIdx = this.props.fmcService.master.revisedLegIndex.get();
                  const revPlanIdx = this.props.fmcService.master.revisedLegPlanIndex.get();
                  if (revWptIdx && revPlanIdx && this.props.fmcService.master.revisedWaypoint()) {
                    this.props.flightPlanInterface.revertHoldToComputed(
                      revWptIdx,
                      revPlanIdx,
                      this.props.fmcService.master.revisedLegIsAltn.get() ?? false,
                    );
                  }
                }}
                buttonStyle="width: 122px; height: 41px;"
              />,
            )}
            <div ref={this.returnButtonDiv}>
              {fcomAt(
                788,
                5,
                <Button
                  label="RETURN"
                  buttonStyle="width: 101px;"
                  onClick={() => {
                    // FCOM DSC-22-FMS-20-30 HOLD page: RETURN displays the F-PLN page
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
                  buttonStyle="color: yellow; width: 134px;"
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
