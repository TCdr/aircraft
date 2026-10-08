// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, EventBus, DisplayComponent, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { EwdSimvars } from './shared/EwdSimvarPublisher';
import { Layer } from '../MsfsAvionicsCommon/Layer';
import { ExceedanceMemory, N2_RED_LIMIT_PERCENT, isGroundStartSequence, n2Color } from '@shared/EngineLimits';

import './style.scss';

interface N2Props {
  bus: EventBus;
  x: number;
  y: number;
  engine: 1 | 2;
}
export class N2 extends DisplayComponent<N2Props> {
  private inactiveVisibility = Subject.create('hidden');

  private activeVisibility = Subject.create('hidden');

  private starting = Subject.create('hidden');

  private n2: number = 0;

  private n2Int = Subject.create('');

  private n2Fract = Subject.create('');

  private state: number = 0;

  private onGround = false;

  /** FCOM DSC-70-90-40 (see shared/EngineLimits): red above the N2 red limit, with a red cross that stays */
  private readonly n2Color = Subject.create('Green');

  private readonly n2Exceedance = new ExceedanceMemory(N2_RED_LIMIT_PERCENT);

  private readonly redCrossVisibility = Subject.create('hidden');

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ClockEvents & EwdSimvars>();

    sub
      .on(`engine${this.props.engine}Fadec`)
      .whenChanged()
      .handle((f) => {
        this.inactiveVisibility.set(f ? 'hidden' : 'visible');
        this.activeVisibility.set(f ? 'visible' : 'hidden');
      });

    sub
      .on(`engine${this.props.engine}N2`)
      .whenChanged()
      .handle((n2) => {
        const n2Parts = n2.toFixed(1).split('.', 2);
        this.n2 = n2;
        this.n2Int.set(n2Parts[0]);
        this.n2Fract.set(n2Parts[1]);
      });

    sub
      .on(`engine${this.props.engine}State`)
      .whenChanged()
      .handle((s) => {
        this.state = s;
      });

    sub
      .on('left1LandingGear')
      .whenChanged()
      .handle((onGround) => {
        this.onGround = onGround;
      });

    sub
      .on('realTime')
      .atFrequency(2)
      .handle((_t) => {
        this.starting.set(this.n2 < 58.5 && (this.state === 2 || this.state === 3) ? 'visible' : 'hidden');
        this.n2Color.set(n2Color(this.n2));
        this.n2Exceedance.update(this.n2, isGroundStartSequence(this.state, this.onGround));
        this.redCrossVisibility.set(this.n2Exceedance.exceeded ? 'visible' : 'hidden');
      });
  }

  render(): VNode {
    return (
      <Layer x={this.props.x} y={this.props.y}>
        <g visibility={this.inactiveVisibility}>
          <text class="Large End Amber" x={60} y={45}>
            XX
          </text>
        </g>
        <g visibility={this.activeVisibility}>
          <rect x={-9} y={22} width={80} height={25} class="LightGreyBox" visibility={this.starting} />
          <text class={this.n2Color.map((color) => `Large End ${color}`)} x={42} y={45}>
            {this.n2Int}
          </text>
          <text class={this.n2Color.map((color) => `Large End ${color}`)} x={54} y={45}>
            .
          </text>
          <text class={this.n2Color.map((color) => `Medium End ${color}`)} x={70} y={45}>
            {this.n2Fract}
          </text>
          <g visibility={this.redCrossVisibility}>
            <path class="RedLine" d="M -4 28 l 12 12 m 0 -12 l -12 12" />
          </g>
        </g>
      </Layer>
    );
  }
}
