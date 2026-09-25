import { ClockEvents, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import './MfdFmsPositionIrs.scss';
import { AbstractMfdPageProps } from '../../../MFD';
import { Footer } from '../../common/Footer';

import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FmsPage } from '../../common/FmsPage';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../../common/FcomLayout';
import { MfdSimvars } from '../../../shared/MFDSimvarPublisher';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { HeadingFormat } from '../../common/DataEntryFormats';
import { Arinc429Register, Arinc429RegisterSubject, Arinc429Word, coordinateToString } from '@flybywiresim/fbw-sdk';

interface MfdFmsPositionIrsProps extends AbstractMfdPageProps {}

enum IrsDataFor {
  NONE = 0,
  IRS_1 = 1,
  IRS_2 = 2,
  IRS_3 = 3,
}

type IrsStatus = 'NAV' | 'ALIGN' | 'ATT' | 'INVALID' | 'OFF' | '';

export class MfdFmsPositionIrs extends FmsPage<MfdFmsPositionIrsProps> {
  private readonly ir1MaintWord = Arinc429RegisterSubject.createEmpty();

  private readonly ir2MaintWord = Arinc429RegisterSubject.createEmpty();

  private readonly ir3MaintWord = Arinc429RegisterSubject.createEmpty();

  private readonly alignmentLabel = Subject.create<string>('----');

  private readonly alignmentPosition = Subject.create<string>('---');

  private readonly alignOnOtherRefDisabled = Subject.create<boolean>(true);

  private readonly irs1Status = Subject.create<IrsStatus>('');

  private readonly irs1SecondColumn = Subject.create<string>('');

  private readonly irs1ThirdColumn = Subject.create<string>('');

  private readonly irs2Status = Subject.create<IrsStatus>('');

  private readonly irs2SecondColumn = Subject.create<string>('');

  private readonly irs2ThirdColumn = Subject.create<string>('');

  private readonly irs3Status = Subject.create<IrsStatus>('');

  private readonly irs3SecondColumn = Subject.create<string>('');

  private readonly irs3ThirdColumn = Subject.create<string>('');

  private readonly setHdgDivRef = FSComponent.createRef<HTMLDivElement>();

  private readonly setHdgValue = Subject.create<number | null>(null);

  private readonly irsDataRef = FSComponent.createRef<HTMLDivElement>();

  private readonly showIrsDataFor = Subject.create<IrsDataFor>(IrsDataFor.IRS_1);

  private readonly irs1DataVisible = Subject.create<boolean>(false);

  private readonly irs2DataVisible = Subject.create<boolean>(false);

  private readonly irs3DataVisible = Subject.create<boolean>(false);

  /**
   * FCOM DSC-22-FMS-20-30 POSITION / IRS page, FREEZE ALL IRS: freezes the IRS 1(2)(3) data, with the UTC (or flight)
   * time of the freeze; the button then reads UNFREEZE ALL IRS.
   */
  private readonly irsDataFrozen = Subject.create(false);

  // FCOM DSC-22-FMS-20-30 P 284: FREEZE ALL IRS / UNFREEZE ALL IRS
  private readonly irsDataFreezeButtonLabel = this.irsDataFrozen.map((v) =>
    v ? 'UNFREEZE<br />ALL IRS *' : 'FREEZE<br />ALL IRS *',
  );

  private readonly irsDataFrozenTime = this.irsDataFrozen.map((v) =>
    v ? `IRS DATA FROZEN AT ${this.props.fmcService.master.timeKeeper.formatEta(0)}` : '',
  );

  private readonly irsDataPosition = Subject.create<string>('');

  private readonly irsDataTrueTrack = Subject.create<string>('');

  private readonly irsDataGroundSpeed = Subject.create<string>('');

  private readonly irsDataTrueWindDirection = Subject.create<string>('');

  private readonly irsDataTrueWindSpeed = Subject.create<string>('');

  private readonly irsDataTrueHeading = Subject.create<string>('');

  private readonly irsDataMagneticHeading = Subject.create<string>('');

  private readonly irsDataMagneticVariation = Subject.create<string>('');

  private readonly irsDataMagneticVariationUnit = Subject.create<string>('');

  private readonly irsDataGpirsPosition = Subject.create<string>('');

  private readonly irsDataAccuracy = Subject.create<string>('');

  private readonly irsAreAligned = MappedSubject.create(
    ([ir1, ir2, ir3]) => ['NAV', 'ATT'].includes(ir1) && ['NAV', 'ATT'].includes(ir2) && ['NAV', 'ATT'].includes(ir3),
    this.irs1Status,
    this.irs2Status,
    this.irs3Status,
  );

  private readonly irsAreAlignedOnRefPos = Subject.create<boolean>(false);

  protected onNewData() {}

  private changeIrsData(showDataFor: IrsDataFor) {
    this.irs1DataVisible.set(showDataFor === IrsDataFor.IRS_1);
    this.irs2DataVisible.set(showDataFor === IrsDataFor.IRS_2);
    this.irs3DataVisible.set(showDataFor === IrsDataFor.IRS_3);
    this.irsDataRef.instance.style.visibility = showDataFor === IrsDataFor.NONE ? 'hidden' : 'visible';
    this.updateIrsData();
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ClockEvents & MfdSimvars>();

    this.subs.push(sub.on('adirs1MaintWord').handle((w) => this.ir1MaintWord.setWord(w)));
    this.subs.push(sub.on('adirs2MaintWord').handle((w) => this.ir2MaintWord.setWord(w)));
    this.subs.push(sub.on('adirs3MaintWord').handle((w) => this.ir3MaintWord.setWord(w)));

    this.subs.push(this.showIrsDataFor.sub((v) => this.changeIrsData(v), true));

    this.subs.push(
      this.irsAreAligned.sub((v) => {
        if (v) {
          if (this.irsAreAlignedOnRefPos.get()) {
            this.alignmentLabel.set('IRS ALIGNED ON REF POS:');
          } else {
            this.alignmentLabel.set('IRS ALIGNED ON GPS POS:');
          }
          this.alignmentPosition.set(
            coordinateToString(this.props.fmcService.master.navigation.getPpos() ?? { lat: 0, long: 0 }, false),
          );
        } else {
          if (this.irsAreAlignedOnRefPos.get()) {
            this.alignmentLabel.set('IRS ALIGNING ON REF POS:');
          } else {
            this.alignmentLabel.set('IRS ALIGNING ON GPS POS:');
          }
          this.alignmentPosition.set(
            coordinateToString(this.props.fmcService.master.navigation.getPpos() ?? { lat: 0, long: 0 }, false),
          );
        }
      }, true),
    );

    this.subs.push(
      this.ir1MaintWord.sub(
        (v) => this.setIrsStatusColumns(1, v, this.irs1Status, this.irs1SecondColumn, this.irs1ThirdColumn),
        true,
      ),
    );
    this.subs.push(
      this.ir2MaintWord.sub(
        (v) => this.setIrsStatusColumns(2, v, this.irs2Status, this.irs2SecondColumn, this.irs2ThirdColumn),
        true,
      ),
    );
    this.subs.push(
      this.ir3MaintWord.sub(
        (v) => this.setIrsStatusColumns(3, v, this.irs3Status, this.irs3SecondColumn, this.irs3ThirdColumn),
        true,
      ),
    );

    this.subs.push(
      sub
        .on('realTime')
        .atFrequency(1)
        .handle((_t) => {
          this.updateIrsData();
        }),
    );

    this.subs.push(this.irsAreAligned, this.irsDataFreezeButtonLabel, this.irsDataFrozenTime);

    this.setHdgDivRef.instance.style.visibility = 'hidden';
  }

  private updateIrsData() {
    const ir = this.showIrsDataFor.get();

    if (ir !== IrsDataFor.NONE && !this.irsDataFrozen.get()) {
      const lat = Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_LATITUDE`);
      const long = Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_LONGITUDE`);

      this.irsDataPosition.set(coordinateToString({ lat: lat.value, long: long.value }, false));
      this.irsDataTrueTrack.set(Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_TRUE_TRACK`).value.toFixed(1));
      this.irsDataGroundSpeed.set(Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_GROUND_SPEED`).value.toFixed(1));
      this.irsDataTrueWindDirection.set(
        Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_WIND_DIRECTION`).value.toFixed(1),
      );
      this.irsDataTrueWindSpeed.set(
        `/${Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_WIND_SPEED`).value.toFixed(1)}`,
      );
      this.irsDataTrueHeading.set(Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_TRUE_HEADING`).value.toFixed(1));
      this.irsDataMagneticHeading.set(Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_HEADING`).value.toFixed(1));

      const magVar =
        Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_HEADING`).value -
        Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${ir}_TRUE_HEADING`).value;
      this.irsDataMagneticVariation.set(Math.abs(magVar).toFixed(1));
      this.irsDataMagneticVariationUnit.set(magVar < 0 ? '°W' : '°E');
      this.irsDataGpirsPosition.set(
        coordinateToString(this.props.fmcService.master.navigation.getPpos() ?? { lat: 0, long: 0 }, false),
      );
      // FCOM P 275: GPIRS accuracy in feet (the FMS EPU is in nautical miles)
      const epe = this.props.fmcService.master.navigation.getEpe();
      this.irsDataAccuracy.set(Number.isFinite(epe) ? (epe * 6076.12).toFixed(0) : '----');
    }
  }

  private alignDurationLeft(v: Arinc429Register): string {
    if (v.bitValue(16) && v.bitValue(17) && v.bitValue(18)) {
      return 'AVAIL IN \u003e 7 MIN';
    }
    if (v.bitValue(17) && v.bitValue(18)) {
      return 'AVAIL IN 6 MIN';
    }
    if (v.bitValue(16) && v.bitValue(18)) {
      return 'AVAIL IN 5 MIN';
    }
    if (v.bitValue(18)) {
      return 'AVAIL IN 4 MIN';
    }
    if (v.bitValue(16) && v.bitValue(17)) {
      return 'AVAIL IN 3 MIN';
    }
    if (v.bitValue(17)) {
      return 'AVAIL IN 2 MIN';
    }
    if (v.bitValue(16)) {
      return 'AVAIL IN 1 MIN';
    }
    return '';
  }

  private setIrsStatusColumns(
    ir: number,
    v: Arinc429Register,
    first: Subject<IrsStatus>,
    second: Subject<string>,
    third: Subject<string>,
  ) {
    const knob: number = SimVar.GetSimVarValue(`L:A32NX_OVHD_ADIRS_IR_${ir}_MODE_SELECTOR_KNOB`, 'Enum');

    if (knob === 1 || knob === 2) {
      if (v.bitValue(1)) {
        first.set('ALIGN');
        second.set(this.alignDurationLeft(v));
      } else if (v.bitValue(2)) {
        first.set('ATT');
      } else if (v.bitValue(3)) {
        first.set('NAV');
      } else {
        first.set('INVALID');
      }

      // Third column
      if (v.bitValue(4)) {
        third.set('ENTER HDG');
      }

      if (v.bitValue(9) || v.bitValue(14)) {
        third.set('IR FAULT');
      } else if (v.bitValue(4)) {
        third.set('ENTER HDG');
      } else if (v.bitValue(13)) {
        third.set('EXCESS MOTION');
      } else if (v.bitValue(8)) {
        third.set('SWITCH ADR');
      } else {
        third.set('');
      }
    } else {
      first.set('OFF');
    }
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 275), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomAt(22, 19, <span class="mfd-label amber">{this.alignmentLabel}</span>)}
            {fcomAt(22, 394, <span class="mfd-value bigger">{this.alignmentPosition}</span>)}
            {fcomAt(
              89.5,
              2,
              <Button
                disabled={this.alignOnOtherRefDisabled}
                label="ALIGN ON<br />OTHER REF"
                onClick={() => {}}
                buttonStyle="width: 124px; height: 41px;"
              />,
            )}
            {fcomLine(140, 2, 756)}

            <div class="mfd-position-irs-table-column" style="left: 91px;" />
            <div class="mfd-position-irs-table-column" style="left: 237px;" />
            <div class="mfd-position-irs-table-column" style="left: 500px;" />
            {fcomLine(226, 0, 729)}
            {fcomLine(267, 0, 729)}
            {fcomAt(203, 12, <span class="mfd-label">IRS 1</span>)}
            {fcomCentre(203, 163, <span class="mfd-value bigger">{this.irs1Status}</span>)}
            {fcomAt(203, 257, <span class="mfd-value">{this.irs1SecondColumn}</span>)}
            {fcomAt(203, 522, <span class="mfd-value">{this.irs1ThirdColumn}</span>)}
            {fcomAt(245, 12, <span class="mfd-label">IRS 2</span>)}
            {fcomCentre(245, 163, <span class="mfd-value bigger">{this.irs2Status}</span>)}
            {fcomAt(245, 257, <span class="mfd-value">{this.irs2SecondColumn}</span>)}
            {fcomAt(245, 522, <span class="mfd-value">{this.irs2ThirdColumn}</span>)}
            {fcomAt(286, 12, <span class="mfd-label">IRS 3</span>)}
            {fcomCentre(286, 163, <span class="mfd-value bigger">{this.irs3Status}</span>)}
            {fcomAt(286, 257, <span class="mfd-value">{this.irs3SecondColumn}</span>)}
            {fcomAt(286, 522, <span class="mfd-value">{this.irs3ThirdColumn}</span>)}

            <div ref={this.setHdgDivRef}>
              {fcomRight(340, 572, <span class="mfd-label">SET HDG</span>)}
              {fcomAt(
                340,
                584,
                <InputField<number>
                  dataEntryFormat={new HeadingFormat()}
                  value={this.setHdgValue}
                  mandatory={Subject.create(true)}
                  alignText="flex-end"
                  containerStyle="width: 138px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
            </div>

            {fcomAt(
              397,
              147,
              <Button
                label="IRS1"
                onClick={() => this.showIrsDataFor.set(this.irs1DataVisible.get() ? IrsDataFor.NONE : IrsDataFor.IRS_1)}
                selected={this.irs1DataVisible}
                buttonStyle="width: 124px;"
              />,
            )}
            {fcomAt(
              397,
              303,
              <Button
                label="IRS2"
                onClick={() => this.showIrsDataFor.set(this.irs2DataVisible.get() ? IrsDataFor.NONE : IrsDataFor.IRS_2)}
                selected={this.irs2DataVisible}
                buttonStyle="width: 124px;"
              />,
            )}
            {fcomAt(
              397,
              459,
              <Button
                label="IRS3"
                onClick={() => this.showIrsDataFor.set(this.irs3DataVisible.get() ? IrsDataFor.NONE : IrsDataFor.IRS_3)}
                selected={this.irs3DataVisible}
                buttonStyle="width: 124px;"
              />,
            )}

            <div ref={this.irsDataRef}>
              <div class="mfd-position-irs-data-box" />
              {fcomAt(
                457.5,
                9,
                <Button
                  label={this.irsDataFreezeButtonLabel}
                  selected={this.irsDataFrozen}
                  onClick={() => this.irsDataFrozen.set(!this.irsDataFrozen.get())}
                  buttonStyle="width: 132px; height: 42px;"
                />,
              )}
              {fcomAt(457.5, 186, <span class="mfd-label">{this.irsDataFrozenTime}</span>)}
              {fcomRight(493, 364, <span class="mfd-label">POSITION</span>)}
              {fcomAt(493, 384, <span class="mfd-value bigger">{this.irsDataPosition}</span>)}

              {fcomRight(540, 144, <span class="mfd-label">T.TRK</span>)}
              {fcomRight(540, 342, <span class="mfd-value bigger">{this.irsDataTrueTrack}</span>)}
              {fcomAt(540, 345, <span class="mfd-label-unit">°T</span>)}
              {fcomRight(540, 566, <span class="mfd-label">T.HDG</span>)}
              {fcomRight(540, 691, <span class="mfd-value bigger">{this.irsDataTrueHeading}</span>)}
              {fcomAt(540, 695, <span class="mfd-label-unit">°T</span>)}

              {fcomRight(584, 144, <span class="mfd-label">GND SPD</span>)}
              {fcomRight(584, 342, <span class="mfd-value bigger">{this.irsDataGroundSpeed}</span>)}
              {fcomAt(584, 345, <span class="mfd-label-unit">KT</span>)}
              {fcomRight(584, 566, <span class="mfd-label">MAG HDG</span>)}
              {fcomRight(584, 691, <span class="mfd-value bigger">{this.irsDataMagneticHeading}</span>)}
              {fcomAt(584, 695, <span class="mfd-label-unit">°</span>)}

              {fcomRight(630, 144, <span class="mfd-label">T.WIND</span>)}
              {fcomRight(630, 223, <span class="mfd-value bigger">{this.irsDataTrueWindDirection}</span>)}
              {fcomAt(630, 227, <span class="mfd-label-unit">°</span>)}
              {fcomRight(630, 342, <span class="mfd-value bigger">{this.irsDataTrueWindSpeed}</span>)}
              {fcomAt(630, 345, <span class="mfd-label-unit">KT</span>)}
              {fcomRight(630, 566, <span class="mfd-label">MAG VAR</span>)}
              {fcomRight(630, 691, <span class="mfd-value bigger">{this.irsDataMagneticVariation}</span>)}
              {fcomAt(630, 695, <span class="mfd-label-unit">{this.irsDataMagneticVariationUnit}</span>)}
              {fcomLine(654, 4, 739)}

              {fcomRight(695, 364, <span class="mfd-label">GPIRS POSITION</span>)}
              {fcomAt(695, 384, <span class="mfd-value bigger">{this.irsDataGpirsPosition}</span>)}
              {fcomRight(740, 364, <span class="mfd-label">ACCURACY</span>)}
              {fcomRight(740, 478, <span class="mfd-value bigger">{this.irsDataAccuracy}</span>)}
              {fcomAt(740, 482, <span class="mfd-label-unit">FT</span>)}
            </div>

            {fcomAt(
              797,
              2,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="width: 100px;"
              />,
            )}
          </div>
        </div>
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
