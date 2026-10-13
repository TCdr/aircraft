// Copyright (c) 2021-2024 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  FSComponent,
  DisplayComponent,
  VNode,
  Subject,
  MappedSubject,
  EventBus,
  Subscribable,
} from '@microsoft/msfs-sdk';

import { EfisNdMode, TcasWxrMessage } from '@flybywiresim/fbw-sdk';
import { Layer } from '../MsfsAvionicsCommon/Layer';
import { GenericTcasEvents } from './types/GenericTcasEvents';
import { GenericFcuEvents } from './types/GenericFcuEvents';
import { tcasSettingMessage } from './TcasSettingMessage';

export interface TcasWXMessagesProps {
  bus: EventBus;
  mode: Subscribable<EfisNdMode>;
  /** ND range in NM of each range selector position (-1 for ZOOM) */
  rangeValues: readonly number[];
}

export class TcasWxrMessages extends DisplayComponent<TcasWXMessagesProps> {
  private readonly tcasStateSub = Subject.create(0);

  private readonly onGroundSub = Subject.create(false);

  private readonly rangeSettingSub = Subject.create(0);

  /** TCAS: CHANGE MODE / REDUCE RANGE / INCREASE RANGE, while a TA or RA cannot be seen on this ND */
  private readonly settingMessage = MappedSubject.create(
    ([tcasState, mode, rangeSetting, onGround]) =>
      tcasSettingMessage(
        tcasState,
        mode === EfisNdMode.PLAN,
        mode === EfisNdMode.ROSE_VOR || mode === EfisNdMode.ROSE_ILS,
        this.props.rangeValues[rangeSetting] ?? 0,
        onGround,
      ),
    this.tcasStateSub,
    this.props.mode,
    this.rangeSettingSub,
    this.onGroundSub,
  );

  private readonly taOnlySub = Subject.create(false);

  private readonly tcasModeSub = Subject.create(-1);

  private readonly failSub = Subject.create(false);

  private readonly leftMessage = Subject.create<TcasWxrMessage | undefined>(undefined);

  private readonly rightMessage = Subject.create<TcasWxrMessage | undefined>(undefined);

  private textClassSub = Subject.create('');

  private rectClassSub = Subject.create('');

  private handleClass() {
    const taOnly = this.taOnlySub.get();
    const failed = this.failSub.get();
    const mode = this.tcasModeSub.get();

    if (failed) {
      this.textClassSub.set('Amber TcasMessage');
      this.rectClassSub.set('Grey BackgroundFill');
    } else if (taOnly) {
      this.textClassSub.set('White TcasMessage');
      this.rectClassSub.set('Grey BackgroundFill');
    } else if (mode === 0) {
      this.textClassSub.set('White TcasMessage TcasStandbyMessage');
      this.rectClassSub.set('Grey BackgroundFill TcasStandbyMessage');
    } else {
      this.textClassSub.set('');
      this.rectClassSub.set('');
    }
  }

  private readonly y = this.props.mode.map((mode) =>
    mode === EfisNdMode.ROSE_VOR || mode === EfisNdMode.ROSE_ILS ? 713 : 680,
  );

  private readonly backgroundFillShown = this.props.mode.map(
    (it) => it === EfisNdMode.ARC || it === EfisNdMode.ROSE_NAV,
  );

  private shown = MappedSubject.create(
    ([mode, left, right]) => {
      const improperMode =
        mode !== EfisNdMode.ARC &&
        mode !== EfisNdMode.ROSE_NAV &&
        mode !== EfisNdMode.ROSE_VOR &&
        mode !== EfisNdMode.ROSE_ILS;

      return !improperMode && (left !== undefined || right !== undefined);
    },
    this.props.mode,
    this.leftMessage,
    this.rightMessage,
  );

  onAfterRender(node: VNode) {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<GenericTcasEvents & GenericFcuEvents>();

    sub
      .on('tcasState')
      .whenChanged()
      .handle((value) => this.tcasStateSub.set(value));
    sub
      .on('tcasAircraftOnGround')
      .whenChanged()
      .handle((value) => this.onGroundSub.set(!!value));
    sub
      .on('ndRangeSetting')
      .whenChanged()
      .handle((value) => this.rangeSettingSub.set(value));

    sub
      .on('tcasTaOnly')
      .whenChanged()
      .handle((value) => {
        this.taOnlySub.set(value);
        this.handleClass();
      });
    sub
      .on('tcasFault')
      .whenChanged()
      .handle((value) => {
        this.failSub.set(value);
        this.handleClass();
      });
    sub
      .on('tcasMode')
      .whenChanged()
      .handle((value) => {
        this.tcasModeSub.set(value);
        this.handleClass();
      });

    MappedSubject.create(
      ([taOnly, failed, mode]) => {
        if (failed) {
          this.leftMessage.set({ text: 'TCAS' });
        } else if (taOnly) {
          this.leftMessage.set({ text: 'TA ONLY' });
        } else if (mode === 0) {
          this.leftMessage.set({ text: 'TCAS STBY' });
        } else {
          this.leftMessage.set(undefined);
        }
      },
      this.taOnlySub,
      this.failSub,
      this.tcasModeSub,
    );
  }

  render(): VNode | null {
    return (
      <>
        {/* TCAS setting message in the ND centre, above the ND MODE/RANGE CHANGE line: red for an RA, amber for a TA */}
        <text
          x={384}
          y={285}
          class={this.settingMessage.map(
            (it) => `${it?.isRa ? 'Red' : 'Amber'} FontIntermediate MiddleAlign TextOutline`,
          )}
          visibility={this.settingMessage.map((it) => (it ? 'inherit' : 'hidden'))}
        >
          {this.settingMessage.map((it) => it?.text ?? '')}
        </text>
        {this.renderTcasWxrBox()}
      </>
    );
  }

  private renderTcasWxrBox(): VNode {
    return (
      <Layer x={Subject.create(164)} y={this.y} visible={this.shown}>
        <rect
          visibility={this.backgroundFillShown.map((shown) => (shown ? 'inherit' : 'hidden'))}
          x={0}
          y={0}
          width={440}
          height={88}
          class="BackgroundFill"
          stroke="none"
        />

        <rect x={0} y={0} width={440} height={27} class={this.rectClassSub} stroke-width={1.75} />

        <text x={8} y={25} class={this.textClassSub} text-anchor="start" font-size={27}>
          {this.leftMessage.map((it) => it?.text ?? '')}
        </text>

        <text x={425} y={25} class={this.textClassSub} text-anchor="end" font-size={27}>
          {this.rightMessage.map((it) => it?.text ?? '')}
        </text>
      </Layer>
    );
  }
}
