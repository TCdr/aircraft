import {
  ConsumerSubject,
  DisplayComponent,
  FSComponent,
  SimVarValueType,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';

import './MfdSurvStatusSwitching.scss';

import { MfdSurvEvents } from '../../../MsfsAvionicsCommon/providers/MfdSurvPublisher';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { AbstractMfdPageProps } from '../../MFD';
import { Footer } from '../common/Footer';
import { MfdSimvars } from '../../shared/MFDSimvarPublisher';
import { SurvStatusButton } from '../../../MsfsAvionicsCommon/UiWidgets/SurvStatusButton';
import { SurvStatusItem } from '../../../MsfsAvionicsCommon/UiWidgets/SurvStatusItem';
import { fcomAt, fcomCentre } from '../common/FcomLayout';

interface MfdSurvStatusSwitchingProps extends AbstractMfdPageProps {}

export enum StatusItemState {
  Off = 0,
  On = 1,
  Failed = 2,
}

/** SURV / STATUS & SWITCHING page (A380 FCOM DSC-34-20-60-50 P 6-8), laid out on the FCOM figure */
export class MfdSurvStatusSwitching extends DisplayComponent<MfdSurvStatusSwitchingProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly sub = this.props.bus.getSubscriber<MfdSimvars & MfdSurvEvents>();

  private readonly tcas1Failed = ConsumerSubject.create(this.sub.on('tcasFail'), true);

  private readonly wxr1Failed = ConsumerSubject.create(this.sub.on('wxr1Failed'), false);

  private readonly turb1Failed = Subject.create<boolean>(false);

  private readonly predWs1Failed = Subject.create<boolean>(false);

  private readonly xpdr1Failed = Subject.create<boolean>(false);

  private readonly terr1Failed = ConsumerSubject.create(this.sub.on('terr1Failed'), false);

  private readonly gpws1Failed = ConsumerSubject.create(this.sub.on('gpws1Failed'), false);

  private readonly wxr2Failed = ConsumerSubject.create(this.sub.on('wxr2Failed'), false);

  private readonly turb2Failed = Subject.create<boolean>(false);

  private readonly predWs2Failed = Subject.create<boolean>(false);

  private readonly terr2Failed = ConsumerSubject.create(this.sub.on('terr2Failed'), false);

  private readonly gpws2Failed = ConsumerSubject.create(this.sub.on('gpws2Failed'), false);

  private readonly xpdr2Failed = Subject.create<boolean>(false);

  private readonly tcas2Failed = Subject.create<boolean>(false);

  private readonly activeSystemGroupWxrTaws = ConsumerSubject.create(this.sub.on('wxrTawsSysSelected'), 0);
  private readonly wxrTaws1Active = this.activeSystemGroupWxrTaws.map((s) => s === 1);
  private readonly wxrTaws2Active = this.activeSystemGroupWxrTaws.map((s) => s === 2);

  /** The transponder/TCAS system in use (L:A32NX_TRANSPONDER_SYSTEM: 0 = SYS 1, 1 = SYS 2), also switched on the pedestal. */
  private readonly xpdrSystem = ConsumerSubject.create(this.sub.on('xpdrSystem'), 0);
  private readonly activeSystemGroupXpdrTcas = this.xpdrSystem.map((s) => s + 1);
  private readonly xpdrTcas1Active = this.activeSystemGroupXpdrTcas.map((s) => s === 1);
  private readonly xpdrTcas2Active = this.activeSystemGroupXpdrTcas.map((s) => s === 2);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.tcas1Failed,
      this.wxr1Failed,
      this.wxr2Failed,
      this.terr1Failed,
      this.gpws1Failed,
      this.terr2Failed,
      this.gpws2Failed,
      this.activeSystemGroupWxrTaws,
      this.wxrTaws1Active,
      this.wxrTaws2Active,
      this.xpdrSystem,
      this.activeSystemGroupXpdrTcas,
      this.xpdrTcas1Active,
      this.xpdrTcas2Active,
    );
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }

    super.destroy();
  }

  /** A SYS box of the page: SYS button on top of the frame, then groups of status items (FCOM DSC-34-20-60-50 P 6) */
  private sysBox(
    x: number,
    top: number,
    height: number,
    button: VNode,
    groups: { top: number; height: number; active: Subscribable<boolean>; items: VNode[] }[],
  ): VNode {
    return (
      <>
        <div class="sys-box" style={`left: ${x}px; top: ${top}px; width: 276px; height: ${height}px;`} />
        <div class="mfd-surv-status-button-slot" style={`left: ${x + 89}px; top: ${top - 35}px;`}>
          {button}
        </div>
        {groups.map((g) => (
          <>
            <div
              class={{ 'sys-group': true, active: g.active }}
              style={`left: ${x + 10}px; top: ${g.top}px; width: 258px; height: ${g.height}px;`}
            />
            {g.items}
          </>
        ))}
      </>
    );
  }

  private item(
    y: number,
    x: number,
    label: string,
    sys: '1' | '2',
    active: Subscribable<boolean>,
    failed: Subscribable<boolean>,
    offLabel?: string,
  ) {
    return fcomAt(
      y,
      x + 15,
      <SurvStatusItem label={label} sys={sys} active={active} failed={failed} offLabel={offLabel} />,
    );
  }

  render(): VNode {
    const wxrTaws = (sys: '1' | '2', x: number, active: Subscribable<boolean>) => {
      const one = sys === '1';
      return this.sysBox(
        x,
        67,
        270,
        <SurvStatusButton
          label={`SYS ${sys}`}
          active={active}
          onClick={() =>
            SimVar.SetSimVarValue(
              'L:A32NX_WXR_TAWS_SYS_SELECTED',
              SimVarValueType.Number,
              active.get() ? 0 : one ? 1 : 2,
            )
          }
        />,
        [
          {
            top: 116,
            height: 119,
            active,
            items: [
              this.item(137, x, 'WX DISPLAY', sys, active, one ? this.wxr1Failed : this.wxr2Failed),
              this.item(177, x, 'TURB', sys, active, one ? this.turb1Failed : this.turb2Failed),
              this.item(217, x, 'PRED W/S', sys, active, one ? this.predWs1Failed : this.predWs2Failed),
            ],
          },
          {
            top: 247,
            height: 78,
            active,
            items: [
              this.item(266, x, 'TERR SYS', sys, active, one ? this.terr1Failed : this.terr2Failed),
              this.item(306, x, 'GPWS', sys, active, one ? this.gpws1Failed : this.gpws2Failed),
            ],
          },
        ],
      );
    };
    const xpdrTcas = (sys: '1' | '2', x: number, active: Subscribable<boolean>) => {
      const one = sys === '1';
      return this.sysBox(
        x,
        517,
        144,
        <SurvStatusButton
          label={`SYS ${sys}`}
          active={active}
          onClick={() => SimVar.SetSimVarValue('L:A32NX_TRANSPONDER_SYSTEM', SimVarValueType.Number, one ? 0 : 1)}
        />,
        [
          {
            top: 564,
            height: 41,
            active,
            items: [this.item(585, x, 'XPDR', sys, active, one ? this.xpdr1Failed : this.xpdr2Failed, 'STBY')],
          },
          {
            top: 614,
            height: 41,
            active,
            items: [this.item(635, x, 'TCAS', sys, active, one ? this.tcas1Failed : this.tcas2Failed, 'STBY')],
          },
        ],
      );
    };

    return (
      <>
        <ActivePageTitleBar activePage={Subject.create('STATUS & SWITCHING')} offset={Subject.create('')} />
        {/* begin page content */}
        {/* Positions from the FCOM figure (DSC-34-20-60-50 P 6), page container coordinates (display y - 143) */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-surv-status">
            {wxrTaws('1', 57, this.wxrTaws1Active)}
            {fcomCentre(137, 383, <span class="mfd-label bigger">WXR</span>)}
            {fcomCentre(266, 383, <span class="mfd-label bigger">TAWS</span>)}
            {wxrTaws('2', 440, this.wxrTaws2Active)}

            {xpdrTcas('1', 57, this.xpdrTcas1Active)}
            {fcomCentre(585, 383, <span class="mfd-label bigger">XPDR</span>)}
            {fcomCentre(635, 383, <span class="mfd-label bigger">TCAS</span>)}
            {xpdrTcas('2', 440, this.xpdrTcas2Active)}
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
