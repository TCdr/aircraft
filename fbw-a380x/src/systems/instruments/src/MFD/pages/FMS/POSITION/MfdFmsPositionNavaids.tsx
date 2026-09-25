import { AbstractMfdPageProps } from '../../../MFD';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import {
  FrequencyADFFormat,
  FrequencyILSFormat,
  FrequencyVORDMEFormat,
  InboundCourseFormat,
  LsCourseFormat,
  NavaidIdentFormat,
} from '../../common/DataEntryFormats';
import { FmsPage } from '../../common/FmsPage';
import { fcomAt, fcomCentre, fcomLine, fcomRight, fcomTabBar } from '../../common/FcomLayout';
import { RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { Footer } from '../../common/Footer';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';
import { MfdSimvars } from '../../../shared/MFDSimvarPublisher';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';

import { coordinateToString, NavaidSubsectionCode } from '@flybywiresim/fbw-sdk';
import { NavRadioTuningStatus } from '@fmgc/navigation/NavaidTuner';
import { ClockEvents, FSComponent, SimVarValueType, Subject, VNode } from '@microsoft/msfs-sdk';

import './MfdFmsPositionNavaids.scss';
import { SelectedNavaidType } from '@fmgc/navigation/Navigation';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';

interface MfdFmsPositionNavaidsProps extends AbstractMfdPageProps {}

interface SelectedNavaid {
  ident: Subject<string>;
  frequencyOrChannel: Subject<string>;
  class: Subject<string>;
}

const NAVAID_TYPE_STRINGS: Record<SelectedNavaidType, string> = {
  [SelectedNavaidType.None]: '',
  [SelectedNavaidType.Dme]: 'DME',
  [SelectedNavaidType.Vor]: 'VOR',
  [SelectedNavaidType.VorDme]: 'VOR/DME',
  [SelectedNavaidType.VorTac]: 'VOR/TAC',
  [SelectedNavaidType.Tacan]: 'TACAN',
  [SelectedNavaidType.Ils]: 'ILS/DME',
  [SelectedNavaidType.Gls]: 'GLS',
  [SelectedNavaidType.Mls]: 'MLS',
};

export class MfdFmsPositionNavaids extends FmsPage<MfdFmsPositionNavaidsProps> {
  public static readonly selectedForFmsNavExtra = 'nav';

  private readonly navaidsSelectedPageIndex = Subject.create<number>(
    this.props.mfd.uiService.activeUri.get().extra === MfdFmsPositionNavaids.selectedForFmsNavExtra ? 1 : 0,
  );

  private readonly vor1Ident = Subject.create<string | null>(null);

  private readonly vor1IdentEnteredByPilot = Subject.create<boolean>(false);

  private readonly vor1Freq = Subject.create<number | null>(null);

  private readonly vor1FreqEnteredByPilot = Subject.create<boolean>(false);

  private readonly vor1Course = Subject.create<number | null>(null);

  private readonly vor1Class = Subject.create<string | null>(null);

  private readonly vor2Ident = Subject.create<string | null>(null);

  private readonly vor2IdentEnteredByPilot = Subject.create<boolean>(false);

  private readonly vor2Freq = Subject.create<number | null>(null);

  private readonly vor2FreqEnteredByPilot = Subject.create<boolean>(false);

  private readonly vor2Course = Subject.create<number | null>(null);

  private readonly vor2Class = Subject.create<string | null>(null);

  private readonly adf1Ident = Subject.create<string | null>(null);

  private readonly adf1IdentEnteredByPilot = Subject.create<boolean>(false);

  private readonly adf1Freq = Subject.create<number | null>(null);

  private readonly adf1FreqEnteredByPilot = Subject.create<boolean>(false);

  private readonly adf1Bfo = Subject.create(false);

  private readonly lsIdent = Subject.create<string | null>(null);

  private readonly lsFreq = Subject.create<number | null>(null);

  private readonly lsCourse = Subject.create<number | null>(null);

  private readonly lsSlope = Subject.create<string | null>(null);

  private readonly lsClass = Subject.create<string | null>(null);

  private readonly lsIdentEnteredByPilot = Subject.create<boolean>(false);

  private readonly lsFrequencyEnteredByPilot = Subject.create<boolean>(false);

  private readonly lsCourseEnteredByPilot = Subject.create<boolean>(false);

  private readonly selectedNavaids: SelectedNavaid[] = Array.from({ length: 3 }, () => ({
    ident: Subject.create(''),
    frequencyOrChannel: Subject.create(''),
    class: Subject.create(''),
  }));

  private readonly radioNavMode = Subject.create('');

  private readonly radioNavPosition = Subject.create('');

  private readonly deselectedNavaids = [
    Subject.create<string | null>(null),
    Subject.create<string | null>(null),
    Subject.create<string | null>(null),
    Subject.create<string | null>(null),
    Subject.create<string | null>(null),
    Subject.create<string | null>(null),
  ];

  private readonly navaidDetailsButtonInvisible = Array.from(Array(3), (_, x) =>
    this.selectedNavaids[x].ident.map((v) => v.length === 0),
  );

  private readonly deselectedNavaidIsEmpty = Array.from(Array(5), (_, x) =>
    this.deselectedNavaids[x].map((it) => it === null),
  );

  private static isNavRadioIdentManual(navStatus?: NavRadioTuningStatus): boolean {
    return !!(navStatus?.manual && navStatus?.facility !== undefined);
  }

  private static isNavRadioFreqManual(navStatus?: NavRadioTuningStatus): boolean {
    return !!(navStatus?.manual && navStatus?.facility === undefined);
  }

  protected onNewData() {
    if (!this.props.fmcService.master) {
      return;
    }

    const vor1 = this.props.fmcService.master.navaidTuner.getVorRadioTuningStatus(1);
    this.vor1Ident.set(vor1.ident ?? null);
    this.vor1Freq.set(vor1.frequency ?? null);
    this.vor1Course.set(vor1.course ?? null);
    const class1 = vor1.dmeOnly ? 'DME' : 'VOR/DME';
    this.vor1Class.set(vor1.ident ? class1 : '');
    this.vor1IdentEnteredByPilot.set(MfdFmsPositionNavaids.isNavRadioIdentManual(vor1));
    this.vor1FreqEnteredByPilot.set(MfdFmsPositionNavaids.isNavRadioFreqManual(vor1));

    const vor2 = this.props.fmcService.master.navaidTuner.getVorRadioTuningStatus(2);
    this.vor2Ident.set(vor2.ident ?? null);
    this.vor2Freq.set(vor2.frequency ?? null);
    this.vor2Course.set(vor2.course ?? null);
    const class2 = vor2.dmeOnly ? 'DME' : 'VOR/DME';
    this.vor2Class.set(vor2.ident ? class2 : '');
    this.vor2IdentEnteredByPilot.set(MfdFmsPositionNavaids.isNavRadioIdentManual(vor2));
    this.vor2FreqEnteredByPilot.set(MfdFmsPositionNavaids.isNavRadioFreqManual(vor2));

    const adf1 = this.props.fmcService.master.navaidTuner.getAdfRadioTuningStatus(1);
    this.adf1Ident.set(adf1.ident ?? null);
    this.adf1Freq.set(adf1.frequency ?? null);
    this.adf1Bfo.set(adf1.bfo);
    this.adf1IdentEnteredByPilot.set(MfdFmsPositionNavaids.isNavRadioIdentManual(adf1));
    this.adf1FreqEnteredByPilot.set(MfdFmsPositionNavaids.isNavRadioFreqManual(adf1));

    const mmr = this.props.fmcService.master.navaidTuner.getMmrRadioTuningStatus(1);
    this.lsIdent.set(mmr.ident ?? null);
    this.lsFreq.set(mmr.frequency ?? null);
    this.lsCourse.set(mmr.course ?? null);
    this.lsSlope.set(mmr.slope ? mmr.slope.toFixed(1) : '---');
    this.lsClass.set(mmr.ident ? 'ILS/DME' : '');
    this.lsIdentEnteredByPilot.set(MfdFmsPositionNavaids.isNavRadioIdentManual(mmr));
    this.lsFrequencyEnteredByPilot.set(MfdFmsPositionNavaids.isNavRadioFreqManual(mmr));
    this.lsCourseEnteredByPilot.set(mmr.courseManual);

    this.deselectedNavaids.forEach((v, i) => {
      if (this.props.fmcService.master.navaidTuner.deselectedNavaids[i]) {
        // FIXME pass full navaid objects to deselected navaids so we can get the ident.
        // Taking it from the databaseId is not safe but all we can do for now.
        v.set(this.props.fmcService.master.navaidTuner.deselectedNavaids[i].substring(7).trim());
      } else {
        v.set(null);
      }
    });

    const selectedNavaids = this.props.fmcService.master.navigation.getSelectedNavaids();

    if (selectedNavaids) {
      for (const [i, navaid] of selectedNavaids.entries()) {
        if (i === 0) {
          // display vor is not shown on this page on A380
          continue;
        }
        this.selectedNavaids[i - 1].ident.set(navaid.ident ?? '');
        this.selectedNavaids[i - 1].frequencyOrChannel.set(
          navaid.facility === null || navaid.frequency === null ? '' : navaid.frequency.toFixed(2),
        );
        this.selectedNavaids[i - 1].class.set(navaid.facility !== null ? NAVAID_TYPE_STRINGS[navaid.type] : '');
      }
      // fake it until we make it
      if (selectedNavaids[1].facility !== null && selectedNavaids[2].facility !== null) {
        this.radioNavMode.set('DME/DME');
        this.radioNavPosition.set(
          coordinateToString(
            SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
            SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree),
            false,
          ),
        );
      } else if (selectedNavaids[1].facility !== null) {
        this.radioNavMode.set('VOR/DME');
        this.radioNavPosition.set(
          coordinateToString(
            SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
            SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree),
            false,
          ),
        );
      } else {
        this.radioNavMode.set('');
      }
    } else {
      for (const sel of this.selectedNavaids) {
        sel.ident.set('');
        sel.frequencyOrChannel.set('');
        sel.class.set('');
      }
      this.radioNavMode.set('');
      this.radioNavPosition.set('');
    }
  }

  private async parseNavaid(navaid: string, onlyVor = false) {
    const navaids = await (onlyVor
      ? NavigationDatabaseService.activeDatabase.searchVor(navaid)
      : NavigationDatabaseService.activeDatabase.searchAllNavaid(navaid));

    return this.props.mfd.deduplicateFacilities(navaids);
  }

  private deselectGlide() {
    // TODO
  }

  private async handleVorIdent(index: 1 | 2, ident: string | null) {
    if (ident === null || ident === '') {
      const vor = this.props.fmcService.master.navaidTuner.getVorRadioTuningStatus(index);
      if (MfdFmsPositionNavaids.isNavRadioIdentManual(vor)) {
        this.props.fmcService.master.navaidTuner.setManualVor(index, null);
      } else {
        this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      }
    } else {
      const navaid = await this.parseNavaid(ident, true);

      if (navaid && navaid.subSectionCode === NavaidSubsectionCode.VhfNavaid) {
        if (
          this.props.fmcService.master.navaidTuner.deselectedNavaids.find(
            (databaseId) => databaseId === navaid.databaseId,
          )
        ) {
          this.props.fmcService.master.addMessageToQueue(
            NXSystemMessages.xxxIsDeselected.getModifiedMessage(navaid.ident),
            undefined,
            undefined,
          );
        } else {
          this.props.fmcService.master.navaidTuner.setManualVor(index, navaid);
        }
      }
    }
    this.onNewData();
  }

  private async handleVorFreq(index: 1 | 2, freq: number | null) {
    if (freq === null) {
      const vor = this.props.fmcService.master.navaidTuner.getVorRadioTuningStatus(index);
      if (MfdFmsPositionNavaids.isNavRadioFreqManual(vor)) {
        this.props.fmcService.master.navaidTuner.setManualVor(index, null);
      } else {
        this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      }
    } else {
      this.props.fmcService.master.navaidTuner.setManualVor(index, freq);
    }
    this.onNewData();
  }

  private async handleAdfIdent(ident: string | null) {
    if (ident === null || ident === '') {
      const adf = this.props.fmcService.master.navaidTuner.getAdfRadioTuningStatus(1);
      if (MfdFmsPositionNavaids.isNavRadioIdentManual(adf)) {
        this.props.fmcService.master.navaidTuner.setManualAdf(1, null);
      } else {
        this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      }
    } else {
      const ndbs = await NavigationDatabaseService.activeDatabase.searchNdb(ident);
      const ndb = await this.props.mfd.deduplicateFacilities(ndbs);
      if (ndb) {
        this.props.fmcService.master.navaidTuner.setManualAdf(1, ndb);
      }
    }
    this.onNewData();
  }

  private async handleAdfFreq(freq: number | null) {
    if (freq === null) {
      const adf = this.props.fmcService.master.navaidTuner.getAdfRadioTuningStatus(1);
      if (MfdFmsPositionNavaids.isNavRadioFreqManual(adf)) {
        this.props.fmcService.master.navaidTuner.setManualAdf(1, null);
      } else {
        this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      }
    } else {
      this.props.fmcService.master.navaidTuner.setManualAdf(1, freq);
    }
    this.onNewData();
  }

  /** FCOM P 296: the BFO option of the tuned ADF */
  private toggleBfo(): void {
    const adf = this.props.fmcService.master.navaidTuner.getAdfRadioTuningStatus(1);
    adf.bfo = !adf.bfo;
    this.adf1Bfo.set(adf.bfo);
  }

  private async handleIlsIdent(ident: string | null) {
    if (this.props.fmcService.master.navaidTuner.isMmrTuningLocked()) {
      this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
    }

    if (ident === null || ident === '') {
      const mmr = this.props.fmcService.master.navaidTuner.getMmrRadioTuningStatus(1);
      if (MfdFmsPositionNavaids.isNavRadioIdentManual(mmr)) {
        this.props.fmcService.master.navaidTuner.setManualIls(null);
      } else {
        this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      }
    } else {
      const ils = await NavigationDatabaseService.activeDatabase.backendDatabase.getILSs([ident]);
      const deduplicatedIls = await this.props.mfd.deduplicateFacilities(ils);
      if (deduplicatedIls) {
        await this.props.fmcService.master.navaidTuner.setManualIls(deduplicatedIls);
      }
    }
    this.onNewData();
  }

  private async handleIlsFreq(freq: number | null) {
    if (freq === null) {
      const ils = this.props.fmcService.master.navaidTuner.getMmrRadioTuningStatus(1);
      if (MfdFmsPositionNavaids.isNavRadioFreqManual(ils)) {
        this.props.fmcService.master.navaidTuner.setManualIls(null);
      } else {
        this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      }
    } else {
      this.props.fmcService.master.navaidTuner.setManualIls(freq);
    }
    this.onNewData();
  }

  async deselectionHandler(nV: string | null, oV: string | null | undefined) {
    if (nV) {
      const navaid = await this.parseNavaid(nV);
      if (navaid) {
        this.props.fmcService.master.navaidTuner.deselectNavaid(navaid.databaseId);
      }
    } else if (oV) {
      const navaid = await this.parseNavaid(oV);
      if (navaid) {
        this.props.fmcService.master.navaidTuner.reselectNavaid(navaid.databaseId);
      }
    }
    this.onNewData();
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ClockEvents & MfdSimvars>();
    this.subs.push(
      sub
        .on('realTime')
        .atFrequency(1)
        .handle((_t) => {
          this.onNewData();
        }),
    );
  }

  public destroy(): void {
    for (const s of this.navaidDetailsButtonInvisible) {
      this.subs.push(s);
    }

    for (const s of this.deselectedNavaidIsEmpty) {
      this.subs.push(s);
    }

    super.destroy();
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        {/* Positions from the FCOM figures (DSC-22-FMS-20-30 P 64 and P 296): the TUNED FOR DISPLAY and SELECTED FOR
            FMS NAV panels end at y = 650, the LS data and RETURN are below them */}
        <div class="mfd-page-container" style="position: relative;">
          <TopTabNavigator
            pageTitles={Subject.create(['TUNED FOR DISPLAY', 'SELECTED FOR FMS NAV'])}
            selectedPageIndex={this.navaidsSelectedPageIndex}
            pageChangeCallback={(val) => this.navaidsSelectedPageIndex.set(val)}
            selectedTabTextColor="white"
            {...fcomTabBar}
          >
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; height: 438px;">
              {/* TUNED FOR DISPLAY (panel coordinates) */}
              <div class="mfd-fcom-canvas">
                {fcomCentre(20, 195, <span class="mfd-label">VOR 1</span>)}
                {fcomCentre(20, 516, <span class="mfd-label">VOR 2</span>)}
                {fcomAt(
                  65.5,
                  129,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat()}
                    dataHandlerDuringValidation={async (v) => this.handleVorIdent(1, v)}
                    mandatory={Subject.create(false)}
                    enteredByPilot={this.vor1IdentEnteredByPilot}
                    value={this.vor1Ident}
                    containerStyle="width: 128px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  113,
                  129,
                  <InputField<number>
                    dataEntryFormat={new FrequencyVORDMEFormat()}
                    dataHandlerDuringValidation={async (v) => this.handleVorFreq(1, v)}
                    mandatory={Subject.create(false)}
                    enteredByPilot={this.vor1FreqEnteredByPilot}
                    value={this.vor1Freq}
                    containerStyle="width: 128px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  161,
                  129,
                  <InputField<number>
                    dataEntryFormat={new InboundCourseFormat()}
                    dataHandlerDuringValidation={async (v) => {
                      this.props.fmcService.master.navaidTuner.setVorCourse(1, v || null);
                    }}
                    mandatory={Subject.create(false)}
                    value={this.vor1Course}
                    containerStyle="width: 128px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomCentre(208, 195, <span class="mfd-value bigger">{this.vor1Class}</span>)}
                {fcomAt(
                  65.5,
                  449,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat()}
                    dataHandlerDuringValidation={async (v) => this.handleVorIdent(2, v)}
                    mandatory={Subject.create(false)}
                    enteredByPilot={this.vor2IdentEnteredByPilot}
                    value={this.vor2Ident}
                    containerStyle="width: 128px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  113,
                  449,
                  <InputField<number>
                    dataEntryFormat={new FrequencyVORDMEFormat()}
                    dataHandlerDuringValidation={async (v) => this.handleVorFreq(2, v)}
                    mandatory={Subject.create(false)}
                    enteredByPilot={this.vor2FreqEnteredByPilot}
                    value={this.vor2Freq}
                    containerStyle="width: 128px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  161,
                  449,
                  <InputField<number>
                    dataEntryFormat={new InboundCourseFormat()}
                    dataHandlerDuringValidation={async (v) => {
                      this.props.fmcService.master.navaidTuner.setVorCourse(2, v || null);
                    }}
                    mandatory={Subject.create(false)}
                    value={this.vor2Course}
                    containerStyle="width: 128px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomCentre(208, 516, <span class="mfd-value bigger">{this.vor2Class}</span>)}
                {fcomCentre(65.5, 347, <span class="mfd-label">IDENT</span>)}
                {fcomCentre(113, 347, <span class="mfd-label">FREQ</span>)}
                {fcomCentre(161, 347, <span class="mfd-label">CRS</span>)}
                {fcomCentre(208, 347, <span class="mfd-label">CLASS</span>)}
                {fcomCentre(314, 347, <span class="mfd-label">IDENT</span>)}
                {fcomCentre(362, 347, <span class="mfd-label">FREQ</span>)}
                {fcomLine(245, 8, 696)}
                {fcomCentre(268, 195, <span class="mfd-label">ADF 1</span>)}
                {fcomAt(
                  314,
                  129,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat()}
                    dataHandlerDuringValidation={async (v) => this.handleAdfIdent(v)}
                    mandatory={Subject.create(false)}
                    enteredByPilot={this.adf1IdentEnteredByPilot}
                    value={this.adf1Ident}
                    containerStyle="width: 128px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  362,
                  129,
                  <InputField<number>
                    dataEntryFormat={new FrequencyADFFormat()}
                    dataHandlerDuringValidation={async (v) => this.handleAdfFreq(v)}
                    mandatory={Subject.create(false)}
                    enteredByPilot={this.adf1FreqEnteredByPilot}
                    value={this.adf1Freq}
                    containerStyle="width: 128px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  410,
                  129,
                  <div class="mfd-position-navaids-bfo" onClick={() => this.toggleBfo()}>
                    <div class={{ 'mfd-position-navaids-bfo-box': true, checked: this.adf1Bfo }} />
                    <span class="mfd-label">BFO</span>
                  </div>,
                )}
              </div>
            </TopTabNavigatorPage>
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; height: 438px;">
              {/* SELECTED FOR FMS NAV (panel coordinates) */}
              <div class="mfd-fcom-canvas">
                {fcomCentre(29, 92, <span class="mfd-label">IDENT</span>)}
                {fcomCentre(29, 303, <span class="mfd-label">FREQ/CHAN</span>)}
                {fcomCentre(29, 565, <span class="mfd-label">CLASS</span>)}
                {fcomLine(46, 28, 691)}
                <div class="mfd-position-navaids-column" style="left: 165px;" />
                <div class="mfd-position-navaids-column" style="left: 441px;" />
                <div class={{ invisible: this.navaidDetailsButtonInvisible[0] }}>
                  {fcomAt(
                    74,
                    39,
                    <Button
                      label={this.selectedNavaids[0].ident}
                      onClick={() => {}}
                      showArrow
                      menuItems={Subject.create([{ label: 'DATA NAVAID', action: () => {} }])}
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataNavaid0`}
                      disabled={true}
                      buttonStyle="min-width: 108px; min-height: 35px;"
                    />,
                  )}
                </div>
                {fcomCentre(
                  74,
                  303,
                  <span class="mfd-value bigger">{this.selectedNavaids[0].frequencyOrChannel}</span>,
                )}
                {fcomCentre(74, 565, <span class="mfd-value bigger">{this.selectedNavaids[0].class}</span>)}
                <div class={{ invisible: this.navaidDetailsButtonInvisible[1] }}>
                  {fcomAt(
                    120,
                    39,
                    <Button
                      label={this.selectedNavaids[1].ident}
                      onClick={() => {}}
                      showArrow
                      menuItems={Subject.create([{ label: 'DATA NAVAID', action: () => {} }])}
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataNavaid1`}
                      disabled={true}
                      buttonStyle="min-width: 108px; min-height: 35px;"
                    />,
                  )}
                </div>
                {fcomCentre(
                  120,
                  303,
                  <span class="mfd-value bigger">{this.selectedNavaids[1].frequencyOrChannel}</span>,
                )}
                {fcomCentre(120, 565, <span class="mfd-value bigger">{this.selectedNavaids[1].class}</span>)}
                <div class={{ invisible: this.navaidDetailsButtonInvisible[2] }}>
                  {fcomAt(
                    166,
                    39,
                    <Button
                      label={this.selectedNavaids[2].ident}
                      onClick={() => {}}
                      showArrow
                      menuItems={Subject.create([{ label: 'DATA NAVAID', action: () => {} }])}
                      idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataNavaid2`}
                      disabled={true}
                      buttonStyle="min-width: 108px; min-height: 35px;"
                    />,
                  )}
                </div>
                {fcomCentre(
                  166,
                  303,
                  <span class="mfd-value bigger">{this.selectedNavaids[2].frequencyOrChannel}</span>,
                )}
                {fcomCentre(166, 565, <span class="mfd-value bigger">{this.selectedNavaids[2].class}</span>)}
                {fcomRight(217, 255, <span class="mfd-label">RADIO NAV MODE</span>)}
                {fcomAt(217, 288, <span class="mfd-value bigger">{this.radioNavMode}</span>)}
                {fcomRight(262, 255, <span class="mfd-label">RADIO POSITION</span>)}
                {fcomAt(262, 288, <span class="mfd-value bigger">{this.radioNavPosition}</span>)}
                {fcomLine(290, -7, 723)}
                {fcomAt(326, 28, <span class="mfd-label">LIST OF DESELECTED NAVAIDS</span>)}
                {fcomAt(
                  363.5,
                  21,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat('-')}
                    dataHandlerDuringValidation={this.deselectionHandler.bind(this)}
                    value={this.deselectedNavaids[0]}
                    containerStyle="width: 89px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  363.5,
                  162,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat('-')}
                    dataHandlerDuringValidation={this.deselectionHandler.bind(this)}
                    value={this.deselectedNavaids[1]}
                    containerStyle="width: 89px;"
                    alignText="center"
                    disabled={this.deselectedNavaidIsEmpty[0]}
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  363.5,
                  303,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat('-')}
                    dataHandlerDuringValidation={this.deselectionHandler.bind(this)}
                    value={this.deselectedNavaids[2]}
                    containerStyle="width: 89px;"
                    alignText="center"
                    disabled={this.deselectedNavaidIsEmpty[1]}
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  413,
                  21,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat('-')}
                    dataHandlerDuringValidation={this.deselectionHandler.bind(this)}
                    value={this.deselectedNavaids[3]}
                    containerStyle="width: 89px;"
                    alignText="center"
                    disabled={this.deselectedNavaidIsEmpty[2]}
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  413,
                  162,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat('-')}
                    dataHandlerDuringValidation={this.deselectionHandler.bind(this)}
                    value={this.deselectedNavaids[4]}
                    containerStyle="width: 89px;"
                    alignText="center"
                    disabled={this.deselectedNavaidIsEmpty[3]}
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                {fcomAt(
                  413,
                  303,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat('-')}
                    dataHandlerDuringValidation={this.deselectionHandler.bind(this)}
                    value={this.deselectedNavaids[5]}
                    containerStyle="width: 89px;"
                    alignText="center"
                    disabled={this.deselectedNavaidIsEmpty[4]}
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                <div class="mfd-position-navaids-column" style="left: 441px; top: 307px; height: 127px;" />
                {fcomAt(326, 476, <span class="mfd-label">GPS</span>)}
                {fcomAt(
                  389,
                  463,
                  <RadioButtonGroup
                    values={['SELECTED', 'DESELECTED']}
                    valuesDisabled={Subject.create([true, true])} // GPS deselection is not modelled
                    selectedIndex={Subject.create(0)}
                    idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_positionNavaidsGps`}
                  />,
                )}
              </div>
            </TopTabNavigatorPage>
          </TopTabNavigator>
          <div class="mfd-fcom-overlay">
            {fcomCentre(523, 377, <span class="mfd-label">LS</span>)}
            {fcomRight(565, 295, <span class="mfd-label">IDENT</span>)}
            {fcomAt(
              565,
              314,
              <InputField<string>
                dataEntryFormat={new NavaidIdentFormat()}
                dataHandlerDuringValidation={async (v) => (v ? this.handleIlsIdent(v) : false)}
                mandatory={Subject.create(false)}
                enteredByPilot={this.lsIdentEnteredByPilot}
                value={this.lsIdent}
                containerStyle="width: 128px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomRight(611, 295, <span class="mfd-label">FREQ/CHAN</span>)}
            {fcomAt(
              611,
              314,
              <InputField<number>
                dataEntryFormat={new FrequencyILSFormat()}
                dataHandlerDuringValidation={async (v) => (v ? this.handleIlsFreq(v) : false)}
                mandatory={Subject.create(false)}
                enteredByPilot={this.lsFrequencyEnteredByPilot}
                value={this.lsFreq}
                containerStyle="width: 128px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomRight(657, 295, <span class="mfd-label">CRS</span>)}
            {fcomAt(
              657,
              314,
              <InputField<number>
                dataEntryFormat={new LsCourseFormat()}
                dataHandlerDuringValidation={async (v) => {
                  this.props.fmcService.master.navaidTuner.setIlsCourse(
                    v !== null ? Math.abs(v) : null,
                    v && v < 0 ? true : false,
                  );
                }}
                mandatory={Subject.create(false)}
                enteredByPilot={this.lsCourseEnteredByPilot}
                value={this.lsCourse}
                containerStyle="width: 128px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomRight(702, 295, <span class="mfd-label">SLOPE</span>)}
            {fcomRight(702, 440, <span class="mfd-value bigger">{this.lsSlope}</span>)}
            {fcomAt(702, 444, <span class="mfd-label-unit">°</span>)}
            {fcomRight(748, 295, <span class="mfd-label">CLASS</span>)}
            {fcomAt(748, 314, <span class="mfd-value bigger">{this.lsClass}</span>)}
            {fcomAt(
              658.5,
              469,
              <Button
                label="DESELECT<br />GLIDE *"
                disabled={true} // not modelled
                onClick={() => this.deselectGlide()}
                buttonStyle="min-width: 220px; min-height: 57px;"
              />,
            )}
            {fcomAt(
              791.5,
              3,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="min-width: 129px;"
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
