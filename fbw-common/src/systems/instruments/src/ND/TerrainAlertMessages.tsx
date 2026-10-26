// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { EfisNdMode } from '@flybywiresim/fbw-sdk';

import { GenericTawsEvents, TerrainAheadAlert } from './types/GenericTawsEvents';
import { GenericFcuEvents } from './types/GenericFcuEvents';
import { flashRestartsOn, terrainSettingMessage } from './TerrainAlertMessage';

export interface TerrainAlertMessagesProps {
  bus: EventBus;
  mode: Subscribable<EfisNdMode>;
  /** ND range in NM of each range selector position (-1 for ZOOM) */
  rangeValues: readonly number[];
}

/** TERR AHEAD in the place of the TERR label, and the TERR setting message in the ND centre */
export class TerrainAlertMessages extends DisplayComponent<TerrainAlertMessagesProps> {
  private readonly sub = this.props.bus.getSubscriber<GenericTawsEvents & GenericFcuEvents>();

  private readonly alert = ConsumerSubject.create(this.sub.on('egpwc.terrAhead').whenChanged(), TerrainAheadAlert.None);

  private readonly rangeSetting = ConsumerSubject.create(this.sub.on('ndRangeSetting').whenChanged(), 0);

  private readonly settingMessage = MappedSubject.create(
    ([alert, mode, rangeSetting]) =>
      terrainSettingMessage(alert, mode === EfisNdMode.PLAN, this.props.rangeValues[rangeSetting] ?? 0),
    this.alert,
    this.props.mode,
    this.rangeSetting,
  );

  private readonly terrAheadRef = FSComponent.createRef<SVGTextElement>();

  private previousAlert = TerrainAheadAlert.None;

  onAfterRender(node: VNode) {
    super.onAfterRender(node);

    this.alert.sub((alert) => {
      const text = this.terrAheadRef.instance;
      // classList rather than a class binding, which would overwrite the flashing class
      text.classList.toggle('Red', alert === TerrainAheadAlert.Warning);
      text.classList.toggle('Amber', alert !== TerrainAheadAlert.Warning);
      const flashRestarts = flashRestartsOn(this.previousAlert, alert);
      if (alert === TerrainAheadAlert.None || flashRestarts) {
        text.classList.remove('Blink9Seconds');
      }
      if (flashRestarts) {
        // added back a frame later, after the removal was drawn, otherwise the animation does not start again
        requestAnimationFrame(() => text.classList.add('Blink9Seconds'));
      }
      this.previousAlert = alert;
    }, true);
  }

  render(): VNode | null {
    return (
      <>
        <text
          ref={this.terrAheadRef}
          x={754}
          y={612}
          font-size={23}
          text-anchor="end"
          visibility={this.alert.map((it) => (it !== TerrainAheadAlert.None ? 'inherit' : 'hidden'))}
        >
          TERR AHEAD
        </text>
        {/* above the TCAS setting message, which can be there at the same time */}
        <text
          x={384}
          y={255}
          class={this.settingMessage.map(
            (it) => `${it?.isWarning ? 'Red' : 'Amber'} FontIntermediate MiddleAlign TextOutline`,
          )}
          visibility={this.settingMessage.map((it) => (it ? 'inherit' : 'hidden'))}
        >
          {this.settingMessage.map((it) => it?.text ?? '')}
        </text>
      </>
    );
  }
}
