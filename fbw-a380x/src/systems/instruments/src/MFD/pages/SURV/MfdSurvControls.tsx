import {
  ConsumerSubject,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  SimVarValueType,
  Subject,
  Subscribable,
  SubscribableMapFunctions,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';

import './MfdSurvControls.scss';

import { MfdSurvEvents } from '../../../MsfsAvionicsCommon/providers/MfdSurvPublisher';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { AbstractMfdPageProps } from '../../MFD';
import { Footer } from '../common/Footer';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { SquawkFormat, WxrElevationFormat, WxrGainFormat, WxrTiltFormat } from '../common/DataEntryFormats';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { RadioButtonColor, RadioButtonGroup } from '../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { MfdSimvars } from '../../shared/MFDSimvarPublisher';
import { SurvButton } from '../../../MsfsAvionicsCommon/UiWidgets/SurvButton';
import { ConfirmationDialog } from '../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import { NXSystemMessages } from '../../shared/NXSystemMessages';
import { FmsErrorType } from '@fmgc/FmsError';
import { fcomAt, fcomCentre } from '../common/FcomLayout';

interface MfdSurvControlsProps extends AbstractMfdPageProps {}

export enum TransponderState {
  Off = 0,
  Standby = 1,
  Test = 2,
  ModeA = 3,
  ModeC = 4,
  ModeS = 5,
}

/** ELEVN/TILT option list (A380 FCOM DSC-34-20-30-20, L:A380X_WXR_ELEVN_TILT_MODE) */
enum WxrElevnTiltMode {
  Auto = 0,
  Elevn = 1,
  Tilt = 2,
}

/** Value of the ELEVN, TILT and GAIN LVars while nothing is entered */
const NO_ENTRY = -9999;

/**
 * SURV / CONTROLS page (A380 FCOM DSC-34-20-60-50 P 4-5), laid out on the FCOM figure, with the rules of the XPDR
 * (DSC-34-20-40), TCAS (DSC-34-20-50), WXR (DSC-34-20-30-20) and TAWS (DSC-34-20-10) sections of the page.
 */
export class MfdSurvControls extends DisplayComponent<MfdSurvControlsProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly sub = this.props.bus.getSubscriber<MfdSimvars & MfdSurvEvents>();

  private readonly xpdrFailed = Subject.create<boolean>(false);

  private readonly squawkCode = Subject.create<number | null>(null);

  private readonly xpdrAltRptgAvailable = Subject.create<boolean>(true);

  private readonly xpdrSetAltReportingRequest = ConsumerSubject.create(this.sub.on('mfd_xpdr_set_alt_reporting'), true);

  private readonly xpdrOnRequest = ConsumerSubject.create(this.sub.on('mfd_xpdr_set_on'), false);

  private readonly xpdrState = ConsumerSubject.create(this.sub.on('xpdrState'), TransponderState.Off);

  private readonly xpdrAltRptgOn = Subject.create<boolean>(true);
  private readonly xpdrAltRptgDisabled = MappedSubject.create(
    ([failed, avail]) => failed || !avail,
    this.xpdrFailed,
    this.xpdrAltRptgAvailable,
  );

  /** XPDR mode option list: 0 = AUTO, 1 = ON, 2 = STBY */
  private readonly xpdrStatusSelectedIndex = Subject.create<number | null>(0);
  private readonly xpdrStatusRadioColor = this.xpdrStatusSelectedIndex.map((it) =>
    it === 0 ? RadioButtonColor.Green : RadioButtonColor.White,
  );

  private readonly tcasFailed = ConsumerSubject.create(this.sub.on('tcasFail'), true);

  /** FCOM: the TCAS option lists are not available with the XPDR on standby or failed, or with ALT RPTG OFF */
  private readonly tcasRadioGroupDisabled = MappedSubject.create(
    ([tcasFailed, xpdrState, altRptgOn]) =>
      Array(3).fill(
        tcasFailed || xpdrState === TransponderState.Off || xpdrState === TransponderState.Standby || !altRptgOn,
      ),
    this.tcasFailed,
    this.xpdrState,
    this.xpdrAltRptgOn,
  );

  private readonly tcasTaraSelectedIndex = Subject.create<number | null>(2);
  private readonly tcasTaraRadioColor = this.tcasTaraSelectedIndex.map((it) =>
    it === 0 ? RadioButtonColor.Green : RadioButtonColor.White,
  );

  private readonly tcasNormAbvBlwSelectedIndex = Subject.create<number | null>(0);
  private readonly tcasNormAbvBlwRadioColor = this.tcasNormAbvBlwSelectedIndex.map((it) =>
    it === 0 ? RadioButtonColor.Green : RadioButtonColor.Cyan,
  );

  private readonly activeSystemGroupWxrTaws = ConsumerSubject.create(this.sub.on('wxrTawsSysSelected'), 0);
  private readonly wxr1Failed = ConsumerSubject.create(this.sub.on('wxr1Failed'), false);
  private readonly wxr2Failed = ConsumerSubject.create(this.sub.on('wxr2Failed'), false);

  private readonly wxrFailed = MappedSubject.create(
    ([selected, f1, f2]) => (selected === 1 ? f1 : selected === 2 ? f2 : true),
    this.activeSystemGroupWxrTaws,
    this.wxr1Failed,
    this.wxr2Failed,
  );

  // WXR, TURB and MODE drive the ND weather radar, WX ON VD the VD's "NO TERR AND WX DATA" message. PRED W/S, GAIN and
  // ELEVN/TILT only keep their state so far. All start at the page's default settings.
  private readonly wxrAuto = Subject.create<boolean>(true);

  private readonly wxrPredWsAuto = Subject.create<boolean>(true);

  private readonly wxrTurbAuto = Subject.create<boolean>(true);

  private readonly wxrGainAuto = Subject.create<boolean>(true);

  private readonly wxrModeWx = Subject.create<boolean>(true);

  private readonly wxrOnVd = Subject.create<boolean>(true);

  private readonly wxrElevnTiltMode = Subject.create<number | null>(WxrElevnTiltMode.Auto);

  private readonly wxrElevation = Subject.create<number | null>(null);

  private readonly wxrTilt = Subject.create<number | null>(null);

  private readonly wxrGain = Subject.create<number | null>(null);

  private readonly baroIsStd = ConsumerSubject.create(
    this.props.mfd.uiService.captOrFo === 'CAPT' ? this.sub.on('baroStdL') : this.sub.on('baroStdR'),
    false,
  );

  private readonly wxrElevationFormat = new WxrElevationFormat(this.baroIsStd);

  /** FCOM: PRED W/S and TURB are inhibited while the WXR is off */
  private readonly wxrOffOrFailed = MappedSubject.create(
    ([auto, failed]) => !auto || failed,
    this.wxrAuto,
    this.wxrFailed,
  );

  /** FCOM: the ELEVN/TILT option list is inhibited with the WXR off, and not available in MAP mode */
  private readonly wxrElevnTiltDisabled = MappedSubject.create(
    ([offOrFailed, modeWx]) => Array(3).fill(offOrFailed || !modeWx),
    this.wxrOffOrFailed,
    this.wxrModeWx,
  );

  private readonly wxrElevationVisible = MappedSubject.create(
    ([mode, disabled]) => mode === WxrElevnTiltMode.Elevn && !disabled[0],
    this.wxrElevnTiltMode,
    this.wxrElevnTiltDisabled,
  );

  private readonly wxrTiltVisible = MappedSubject.create(
    ([mode, disabled]) => mode === WxrElevnTiltMode.Tilt && !disabled[0],
    this.wxrElevnTiltMode,
    this.wxrElevnTiltDisabled,
  );

  /** FCOM: GAIN MAN displays an entry field below the GAIN button */
  private readonly wxrGainFieldVisible = MappedSubject.create(
    ([gainAuto, offOrFailed]) => !gainAuto && !offOrFailed,
    this.wxrGainAuto,
    this.wxrOffOrFailed,
  );

  private readonly wxrConfirmationVisible = Subject.create(false);

  private readonly defaultSettingsConfirmationVisible = Subject.create(false);

  private readonly terr1Failed = ConsumerSubject.create(this.sub.on('terr1Failed'), false);
  private readonly gpws1Failed = ConsumerSubject.create(this.sub.on('gpws1Failed'), false);
  private readonly terr2Failed = ConsumerSubject.create(this.sub.on('terr2Failed'), false);
  private readonly gpws2Failed = ConsumerSubject.create(this.sub.on('gpws2Failed'), false);

  private readonly tawsTerrFailed = MappedSubject.create(
    ([selected, f1, f2]) => (selected === 1 ? f1 : selected === 2 ? f2 : true),
    this.activeSystemGroupWxrTaws,
    this.terr1Failed,
    this.terr2Failed,
  );

  private readonly tawsGpwsFailed = MappedSubject.create(
    ([selected, f1, f2]) => (selected === 1 ? f1 : selected === 2 ? f2 : true),
    this.activeSystemGroupWxrTaws,
    this.gpws1Failed,
    this.gpws2Failed,
  );

  private readonly allTawsFailed = MappedSubject.create(
    SubscribableMapFunctions.and(),
    this.tawsTerrFailed,
    this.tawsGpwsFailed,
  );

  private readonly tawsTerrSysOn = Subject.create<boolean>(true);

  private readonly tawsGpwsOn = Subject.create<boolean>(true);

  private readonly tawsGsModeOn = Subject.create<boolean>(true);

  private readonly tawsFlapModeOn = Subject.create<boolean>(true);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<MfdSimvars & MfdSurvEvents>();

    this.subs.push(
      sub
        .on('xpdrCode')
        .whenChanged()
        .handle((code) => {
          this.squawkCode.set(code);
        }),
    );

    this.subs.push(this.xpdrState.sub(() => this.xpdrStatusChanged(), true));
    this.subs.push(this.xpdrSetAltReportingRequest.sub(() => this.xpdrStatusChanged(), true));
    this.subs.push(this.xpdrOnRequest.sub(() => this.xpdrStatusChanged(), true));

    this.subs.push(sub.on('mfd_tcas_alert_level').handle((val) => this.tcasTaraSelectedIndex.set(2 - val)));

    this.subs.push(sub.on('mfd_tcas_alt_select').handle((val) => this.tcasNormAbvBlwSelectedIndex.set(val)));

    const onOff = (topic: keyof MfdSimvars, target: Subject<boolean>) =>
      sub
        .on(topic)
        .whenChanged()
        .handle((it) => target.set(!it));

    this.subs.push(
      onOff('gpwsTerrOff', this.tawsTerrSysOn),
      onOff('gpwsSysOff', this.tawsGpwsOn),
      onOff('gpwsGsInhibit', this.tawsGsModeOn),
      onOff('gpwsFlapsInhibit', this.tawsFlapModeOn),
      onOff('wxrOff', this.wxrAuto),
      onOff('wxrTurbOff', this.wxrTurbAuto),
      onOff('wxrModeMap', this.wxrModeWx),
      onOff('wxrPredWsOff', this.wxrPredWsAuto),
      onOff('wxrGainMan', this.wxrGainAuto),
      onOff('wxrVdOff', this.wxrOnVd),
    );

    const entry = (v: number) => (v === NO_ENTRY ? null : v);
    this.subs.push(
      sub
        .on('wxrElevnTiltMode')
        .whenChanged()
        .handle((v) => this.wxrElevnTiltMode.set(v)),
      sub
        .on('wxrElevn')
        .whenChanged()
        .handle((v) => this.wxrElevation.set(entry(v))),
      sub
        .on('wxrTilt')
        .whenChanged()
        .handle((v) => this.wxrTilt.set(entry(v))),
      sub
        .on('wxrGain')
        .whenChanged()
        .handle((v) => this.wxrGain.set(entry(v))),
    );

    this.subs.push(
      this.xpdrSetAltReportingRequest,
      this.xpdrOnRequest,
      this.xpdrState,
      this.xpdrAltRptgDisabled,
      this.xpdrStatusRadioColor,
      this.tcasTaraRadioColor,
      this.tcasNormAbvBlwRadioColor,
      this.tcasFailed,
      this.tcasRadioGroupDisabled,
      this.activeSystemGroupWxrTaws,
      this.wxr1Failed,
      this.wxr2Failed,
      this.wxrFailed,
      this.baroIsStd,
      this.wxrOffOrFailed,
      this.wxrElevnTiltDisabled,
      this.wxrElevationVisible,
      this.wxrTiltVisible,
      this.wxrGainFieldVisible,
      this.terr1Failed,
      this.terr2Failed,
      this.gpws1Failed,
      this.gpws2Failed,
      this.tawsTerrFailed,
      this.tawsGpwsFailed,
      this.allTawsFailed,
    );
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }
    this.wxrElevationFormat.destroy();

    super.destroy();
  }

  private xpdrStatusChanged() {
    const state = this.xpdrState.get();
    const isOnGround = this.props.fmcService.master.fmgc.isOnGround();
    const isOn =
      state === TransponderState.ModeA || state === TransponderState.ModeC || state === TransponderState.ModeS;

    this.xpdrStatusSelectedIndex.set(isOn ? (this.xpdrOnRequest.get() ? 1 : 0) : 2);

    // On ground, Mode C is inhibited, we can only update from transponder state once we're in the air
    this.xpdrAltRptgOn.set(
      isOnGround && !this.xpdrOnRequest.get()
        ? this.xpdrSetAltReportingRequest.get()
        : state === TransponderState.ModeC || state === TransponderState.ModeS,
    );
    this.xpdrAltRptgAvailable.set(isOn);
  }

  private setXpdrMode(index: number) {
    const publisher = this.props.bus.getPublisher<MfdSurvEvents>();
    publisher.pub('mfd_xpdr_set_auto', index !== 2, true);
    publisher.pub('mfd_xpdr_set_on', index === 1, true);
  }

  /** FCOM DSC-34-20-40 ALT RPTG button: ON selects TA/RA and NORM */
  private setAltReporting(on: boolean) {
    const publisher = this.props.bus.getPublisher<MfdSurvEvents>();
    publisher.pub('mfd_xpdr_set_alt_reporting', on, true);
    if (on && !this.tcasFailed.get()) {
      publisher.pub('mfd_tcas_alert_level', 2, true); // TA/RA
      publisher.pub('mfd_tcas_alt_select', 0, true); // NORM
    }
  }

  /**
   * FCOM DSC-34-20-30-20 WXR button (after the confirmation): AUTO sets PRED W/S, TURB, ELEVN/TILT, GAIN, MODE and WX ON
   * VD to their automatic positions; OFF sets PRED W/S, TURB and WX ON VD to OFF and deselects ELEVN/TILT.
   */
  private setWxr(auto: boolean) {
    SimVar.SetSimVarValue('L:A380X_WXR_OFF', SimVarValueType.Bool, !auto);
    SimVar.SetSimVarValue('L:A380X_WXR_PRED_WS_OFF', SimVarValueType.Bool, !auto);
    SimVar.SetSimVarValue('L:A380X_WXR_TURB_OFF', SimVarValueType.Bool, !auto);
    SimVar.SetSimVarValue('L:A380X_WXR_VD_OFF', SimVarValueType.Bool, !auto);
    if (auto) {
      SimVar.SetSimVarValue('L:A380X_WXR_ELEVN_TILT_MODE', SimVarValueType.Enum, WxrElevnTiltMode.Auto);
      SimVar.SetSimVarValue('L:A380X_WXR_GAIN_MAN', SimVarValueType.Bool, false);
      SimVar.SetSimVarValue('L:A380X_WXR_MODE_MAP', SimVarValueType.Bool, false);
    } else {
      this.wxrElevnTiltMode.set(null);
    }
  }

  private setDefaultSettings() {
    if (!this.xpdrFailed.get()) {
      this.setXpdrMode(0);
      this.props.bus.getPublisher<MfdSurvEvents>().pub('mfd_xpdr_set_alt_reporting', true, true);
    }

    if (!this.tcasFailed.get()) {
      this.props.bus.getPublisher<MfdSurvEvents>().pub('mfd_tcas_alert_level', 2, true); // TA/RA
      this.props.bus.getPublisher<MfdSurvEvents>().pub('mfd_tcas_alt_select', 0, true); // NORM
    }

    if (!this.wxrFailed.get()) {
      this.setWxr(true);
    }

    if (!this.tawsTerrFailed.get()) {
      SimVar.SetSimVarValue('L:A32NX_GPWS_TERR_OFF', SimVarValueType.Bool, false);
    }

    if (!this.tawsGpwsFailed.get()) {
      SimVar.SetSimVarValue('L:A32NX_GPWS_SYS_OFF', SimVarValueType.Bool, false);
      SimVar.SetSimVarValue('L:A32NX_GPWS_GS_OFF', SimVarValueType.Bool, false);
      SimVar.SetSimVarValue('L:A32NX_GPWS_FLAPS_OFF', SimVarValueType.Bool, false);
    }
  }

  private visibleIf(visible: Subscribable<boolean>) {
    return { visibility: visible.map((v) => (v ? 'inherit' : 'hidden')) };
  }

  private survButton(
    y: number,
    x: number,
    state: Subject<boolean>,
    disabled: Subscribable<boolean>,
    labelTrue: string,
    labelFalse: string,
    onChanged: (v: boolean) => void,
  ): VNode {
    return fcomAt(
      y,
      x,
      <SurvButton
        state={state}
        disabled={disabled}
        labelFalse={labelFalse}
        labelTrue={labelTrue}
        onChanged={onChanged}
      />,
    );
  }

  render(): VNode {
    const errorHandler = (e: { type: FmsErrorType; details?: string }) =>
      this.props.fmcService.master.showFmsErrorMessage(e.type, e.details);
    return (
      <>
        <ActivePageTitleBar activePage={Subject.create('CONTROLS')} offset={Subject.create('')} />
        {/* begin page content */}
        {/* Positions from the FCOM figure (DSC-34-20-60-50 P 4), page container coordinates (display y - 143) */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-surv-controls">
            {/* XPDR area */}
            <div class="mfd-surv-area" style="left: 2px; top: 0px; width: 320px; height: 265px;" />
            {fcomCentre(23, 165, <span class={{ 'mfd-surv-heading': true, failed: this.xpdrFailed }}>XPDR</span>)}
            {fcomCentre(30, 66, <span class="mfd-label">SQWK</span>)}
            {fcomAt(
              66,
              7,
              <InputField<number>
                dataEntryFormat={new SquawkFormat()}
                dataHandlerDuringValidation={async (v) =>
                  v ? SimVar.SetSimVarValue('K:XPNDR_SET', 'number', parseInt(v.toString(), 16)) : false
                }
                value={this.squawkCode}
                containerStyle="width: 108px;"
                errorHandler={(e) => {
                  if (e.type == FmsErrorType.FormatError) {
                    this.props.fmcService.master.addMessageToQueue(
                      NXSystemMessages.sqwkCodeNotValid,
                      undefined,
                      undefined,
                    );
                  } else {
                    this.props.fmcService.master.showFmsErrorMessage(e.type, e.details);
                  }
                }}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
                alignText={'center'}
              />,
            )}
            {fcomAt(
              114,
              7,
              <Button
                label={'IDENT'}
                onClick={() => SimVar.SetSimVarValue('K:XPNDR_IDENT_ON', SimVarValueType.Bool, true)}
                buttonStyle="width: 90px; height: 22px;"
              />,
            )}
            {fcomAt(170, 8, <span class="mfd-label">ALT RPTG</span>)}
            {this.survButton(227, 7, this.xpdrAltRptgOn, this.xpdrAltRptgDisabled, 'ON', 'OFF', (v) =>
              this.setAltReporting(v),
            )}
            {fcomAt(
              147,
              142,
              <RadioButtonGroup
                values={['AUTO', 'ON', 'STBY']}
                onModified={(val) => this.setXpdrMode(val)}
                selectedIndex={this.xpdrStatusSelectedIndex}
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_survControlsXpdrStatus`}
                additionalVerticalSpacing={7}
                color={this.xpdrStatusRadioColor}
              />,
            )}

            {/* TCAS area */}
            <div class="mfd-surv-area" style="left: 330px; top: 0px; width: 436px; height: 265px;" />
            {fcomCentre(23, 480, <span class={{ 'mfd-surv-heading': true, failed: this.tcasFailed }}>TCAS</span>)}
            {fcomAt(
              147,
              332,
              <RadioButtonGroup
                values={['TA/RA', 'TA ONLY', 'STBY']}
                onModified={(val) =>
                  this.props.bus.getPublisher<MfdSurvEvents>().pub('mfd_tcas_alert_level', 2 - val, true)
                }
                selectedIndex={this.tcasTaraSelectedIndex}
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_survControlsTcasTara`}
                additionalVerticalSpacing={7}
                valuesDisabled={this.tcasRadioGroupDisabled}
                color={this.tcasTaraRadioColor}
              />,
            )}
            <div class="mfd-surv-vline" style="left: 535px; top: 87px; height: 125px;" />
            {fcomAt(
              147,
              532,
              <RadioButtonGroup
                values={['NORM', 'ABV', 'BLW']}
                selectedIndex={this.tcasNormAbvBlwSelectedIndex}
                onModified={(val) => this.props.bus.getPublisher<MfdSurvEvents>().pub('mfd_tcas_alt_select', val, true)}
                valuesDisabled={this.tcasRadioGroupDisabled}
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_survControlsTcasNormAbvBlw`}
                additionalVerticalSpacing={7}
                color={this.tcasNormAbvBlwRadioColor}
              />,
            )}

            {/* WXR area */}
            <div class="mfd-surv-area" style="left: 2px; top: 279px; width: 764px; height: 336px;" />
            {fcomCentre(309, 167, <span class={{ 'mfd-surv-heading': true, failed: this.wxrFailed }}>WXR</span>)}
            <div class="mfd-surv-area mfd-surv-titled" style="left: 220px; top: 325px; width: 137px; height: 107px;" />
            {fcomCentre(325, 289, <span class="mfd-label mfd-surv-frame-title">WXR</span>)}
            {this.survButton(383, 229, this.wxrAuto, this.wxrFailed, 'AUTO', 'OFF', () =>
              this.wxrConfirmationVisible.set(true),
            )}
            {fcomCentre(325, 475, <span class="mfd-label">PRED W/S</span>)}
            {this.survButton(383, 415, this.wxrPredWsAuto, this.wxrOffOrFailed, 'AUTO', 'OFF', (v) =>
              SimVar.SetSimVarValue('L:A380X_WXR_PRED_WS_OFF', SimVarValueType.Bool, !v),
            )}
            {fcomCentre(325, 662, <span class="mfd-label">TURB</span>)}
            {this.survButton(383, 602, this.wxrTurbAuto, this.wxrOffOrFailed, 'AUTO', 'OFF', (v) =>
              SimVar.SetSimVarValue('L:A380X_WXR_TURB_OFF', SimVarValueType.Bool, !v),
            )}
            {/* The WXR button sets PRED W/S and TURB with it */}
            <svg class="mfd-surv-links" width="768" height="700">
              <polyline points="289,432 289,440 662,440" />
              <polyline points="475,440 475,425" />
              <polyline points="662,440 662,425" />
              <polyline points="471,429 475,424 479,429" />
              <polyline points="658,429 662,424 666,429" />
            </svg>

            {fcomAt(425, 12, <span class="mfd-label">ELEVN/TILT</span>)}
            {fcomAt(
              502,
              2,
              <RadioButtonGroup
                values={['AUTO', 'ELEVN', 'TILT']}
                selectedIndex={this.wxrElevnTiltMode}
                onModified={(val) =>
                  SimVar.SetSimVarValue('L:A380X_WXR_ELEVN_TILT_MODE', SimVarValueType.Enum, val as WxrElevnTiltMode)
                }
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_survControlswxrElevnTilt`}
                additionalVerticalSpacing={7}
                color={Subject.create(RadioButtonColor.Green)}
                valuesDisabled={this.wxrElevnTiltDisabled}
              />,
            )}
            {/* FCOM: ELEVN or TILT displays an entry field below the option list */}
            <div style={this.visibleIf(this.wxrElevationVisible)}>
              {fcomAt(
                588,
                12,
                <InputField<number>
                  dataEntryFormat={this.wxrElevationFormat}
                  value={this.wxrElevation}
                  dataHandlerDuringValidation={async (v) =>
                    SimVar.SetSimVarValue('L:A380X_WXR_ELEVN', SimVarValueType.Number, v ?? NO_ENTRY)
                  }
                  containerStyle="width: 142px;"
                  alignText="center"
                  errorHandler={errorHandler}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
            </div>
            <div style={this.visibleIf(this.wxrTiltVisible)}>
              {fcomAt(
                588,
                12,
                <InputField<number>
                  dataEntryFormat={new WxrTiltFormat()}
                  value={this.wxrTilt}
                  dataHandlerDuringValidation={async (v) =>
                    SimVar.SetSimVarValue('L:A380X_WXR_TILT', SimVarValueType.Number, v ?? NO_ENTRY)
                  }
                  containerStyle="width: 128px;"
                  alignText="center"
                  errorHandler={errorHandler}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
            </div>

            {/* FCOM: GAIN and MODE are not displayed while the WXR is off */}
            <div style={{ visibility: this.wxrAuto.map((v) => (v ? 'inherit' : 'hidden')) }}>
              {fcomCentre(470, 289, <span class="mfd-label">GAIN</span>)}
              {this.survButton(528, 229, this.wxrGainAuto, this.wxrFailed, 'AUTO', 'MAN', (v) =>
                SimVar.SetSimVarValue('L:A380X_WXR_GAIN_MAN', SimVarValueType.Bool, !v),
              )}
              {fcomCentre(470, 475, <span class="mfd-label">MODE</span>)}
              {this.survButton(528, 415, this.wxrModeWx, this.wxrFailed, 'WX', 'MAP', (v) =>
                SimVar.SetSimVarValue('L:A380X_WXR_MODE_MAP', SimVarValueType.Bool, !v),
              )}
            </div>
            <div style={this.visibleIf(this.wxrGainFieldVisible)}>
              {fcomAt(
                591,
                229,
                <InputField<number>
                  dataEntryFormat={new WxrGainFormat()}
                  value={this.wxrGain}
                  dataHandlerDuringValidation={async (v) =>
                    SimVar.SetSimVarValue('L:A380X_WXR_GAIN', SimVarValueType.Number, v ?? NO_ENTRY)
                  }
                  containerStyle="width: 112px;"
                  alignText="center"
                  errorHandler={errorHandler}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
            </div>
            {fcomCentre(470, 662, <span class="mfd-label">WX ON VD</span>)}
            {this.survButton(528, 602, this.wxrOnVd, this.wxrFailed, 'AUTO', 'OFF', (v) =>
              SimVar.SetSimVarValue('L:A380X_WXR_VD_OFF', SimVarValueType.Bool, !v),
            )}

            {/* TAWS area */}
            <div class="mfd-surv-area" style="left: 2px; top: 629px; width: 580px; height: 186px;" />
            {fcomCentre(647, 167, <span class={{ 'mfd-surv-heading': true, failed: this.allTawsFailed }}>TAWS</span>)}
            {fcomCentre(693, 67, <span class="mfd-label mfd-surv-two-lines">{'TERR\nSYS'}</span>)}
            {this.survButton(763, 7, this.tawsTerrSysOn, this.tawsTerrFailed, 'ON', 'OFF', (v) =>
              SimVar.SetSimVarValue('L:A32NX_GPWS_TERR_OFF', SimVarValueType.Bool, !v),
            )}
            {fcomCentre(707, 238, <span class="mfd-label">GPWS</span>)}
            {this.survButton(763, 178, this.tawsGpwsOn, this.tawsGpwsFailed, 'ON', 'OFF', (v) =>
              SimVar.SetSimVarValue('L:A32NX_GPWS_SYS_OFF', SimVarValueType.Bool, !v),
            )}
            {fcomCentre(693, 369, <span class="mfd-label mfd-surv-two-lines">{'G/S\nMODE'}</span>)}
            {this.survButton(763, 309, this.tawsGsModeOn, this.tawsGpwsFailed, 'ON', 'OFF', (v) =>
              SimVar.SetSimVarValue('L:A32NX_GPWS_GS_OFF', SimVarValueType.Bool, !v),
            )}
            {fcomCentre(693, 501, <span class="mfd-label mfd-surv-two-lines">{'FLAP\nMODE'}</span>)}
            {this.survButton(763, 441, this.tawsFlapModeOn, this.tawsGpwsFailed, 'ON', 'OFF', (v) =>
              SimVar.SetSimVarValue('L:A32NX_GPWS_FLAPS_OFF', SimVarValueType.Bool, !v),
            )}
            {/* The GPWS button sets G/S MODE and FLAP MODE with it */}
            <svg class="mfd-surv-links" width="768" height="840">
              <polyline points="238,802 238,811 501,811" />
              <polyline points="369,811 369,805" />
              <polyline points="501,811 501,805" />
              <polyline points="365,810 369,805 373,810" />
              <polyline points="497,810 501,805 505,810" />
            </svg>

            {/* DEFAULT SETTINGS */}
            <div class="mfd-surv-area" style="left: 590px; top: 629px; width: 176px; height: 186px;" />
            <div class="mfd-surv-area mfd-surv-titled" style="left: 594px; top: 707px; width: 166px; height: 86px;" />
            {fcomCentre(707, 677, <span class="mfd-label mfd-surv-frame-title">SURV</span>)}
            {fcomAt(
              751,
              605,
              <Button
                label={'DEFAULT\nSETTINGS'}
                onClick={() => this.defaultSettingsConfirmationVisible.set(true)}
                buttonStyle="width: 122px; height: 42px; white-space: pre;"
              />,
            )}

            <div class="mfd-surv-dialogs">
              <ConfirmationDialog
                visible={this.wxrConfirmationVisible}
                cancelAction={() => this.wxrConfirmationVisible.set(false)}
                confirmAction={() => {
                  this.wxrConfirmationVisible.set(false);
                  this.setWxr(!this.wxrAuto.get());
                }}
                contentContainerStyle="width: 360px; height: 165px; transform: translateX(-50%);"
              >
                {this.wxrAuto.map((auto) => (auto ? 'WXR OFF ?' : 'WXR AUTO ?'))}
              </ConfirmationDialog>
              <ConfirmationDialog
                visible={this.defaultSettingsConfirmationVisible}
                cancelAction={() => this.defaultSettingsConfirmationVisible.set(false)}
                confirmAction={() => {
                  this.defaultSettingsConfirmationVisible.set(false);
                  this.setDefaultSettings();
                }}
                contentContainerStyle="width: 420px; height: 165px; transform: translateX(-50%);"
              >
                SET DEFAULT SETTINGS ?
              </ConfirmationDialog>
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
