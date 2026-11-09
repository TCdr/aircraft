// @ts-strict-ignore
// Copyright (c) 2021-2024 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  FSComponent,
  DisplayComponent,
  VNode,
  Subject,
  EventBus,
  ConsumerSubject,
  MappedSubject,
} from '@microsoft/msfs-sdk';
import { Arinc429RegisterSubject } from '@flybywiresim/fbw-sdk';

import { GenericVorEvents } from '../../types/GenericVorEvents';
import { GenericFlightManagementBusEvents } from '../../types/GenericFlightManagementBusEvents';
import { NDSimvars } from '../../NDSimvarPublisher';
import { Layer } from '../../../MsfsAvionicsCommon/Layer';
import { roseLsGlsTopics, roseLsInfo } from './RoseLsInfo';

export interface IlsInfoIndicatorProps {
  bus: EventBus;
  index: 1 | 2;
}

export class IlsInfoIndicator extends DisplayComponent<IlsInfoIndicatorProps> {
  private readonly ilsIdent = ConsumerSubject.create(null, '');

  private readonly ilsFrequency = ConsumerSubject.create(null, -1);

  private readonly ilsCourse = ConsumerSubject.create(null, -1);

  private readonly glsChannel = ConsumerSubject.create(null, 0);

  private readonly glsReceived = ConsumerSubject.create(null, false);

  private readonly glsIdentWord = ConsumerSubject.create(null, 0);

  private readonly glsCourse = ConsumerSubject.create(null, -1);

  private readonly lsInfo = MappedSubject.create(
    ([ilsIdent, ilsFrequency, ilsCourse, glsChannel, glsReceived, glsIdentWord, glsCourse]) =>
      roseLsInfo({
        index: this.props.index,
        glsChannel,
        glsReceived,
        glsIdentWord,
        glsCourse,
        ilsIdent,
        ilsFrequency,
        ilsCourse,
      }),
    this.ilsIdent,
    this.ilsFrequency,
    this.ilsCourse,
    this.glsChannel,
    this.glsReceived,
    this.glsIdentWord,
    this.glsCourse,
  );

  private readonly fm1Healthy = Subject.create(false);

  private readonly fm2Healthy = Subject.create(false);

  private readonly fm1NavTuningWord = Arinc429RegisterSubject.createEmpty();

  private readonly fm2NavTuningWord = Arinc429RegisterSubject.createEmpty();

  private readonly tuningMode = MappedSubject.create(
    ([fm1Healthy, fm2Healthy, fm1NavTuningWord, fm2NavTuningWord]) => {
      const bitIndex = 14 + this.props.index;

      if (
        (!fm1Healthy && !fm2Healthy) ||
        (!fm1NavTuningWord.isNormalOperation() && !fm2NavTuningWord.isNormalOperation())
      ) {
        return 'R';
      }

      if (fm1NavTuningWord.bitValueOr(bitIndex, false) || fm2NavTuningWord.bitValueOr(bitIndex, false)) {
        return 'M';
      }

      return '';
    },
    this.fm1Healthy,
    this.fm2Healthy,
    this.fm1NavTuningWord,
    this.fm2NavTuningWord,
  );

  onAfterRender(node: VNode) {
    super.onAfterRender(node);

    const subs = this.props.bus.getSubscriber<GenericVorEvents & GenericFlightManagementBusEvents & NDSimvars>();

    // TODO select correct MMR
    // Fixed now??
    const index = (this.props.index + 2) as 3 | 4;

    this.ilsIdent.setConsumer(subs.on(`nav${index}Ident`).whenChanged());

    this.ilsFrequency.setConsumer(subs.on(`nav${index}Frequency`).whenChanged());

    this.ilsCourse.setConsumer(subs.on(`nav${index}Obs`).whenChanged());

    const glsTopics = roseLsGlsTopics(this.props.index);
    this.glsChannel.setConsumer(subs.on(glsTopics.channel).whenChanged());
    this.glsReceived.setConsumer(subs.on(glsTopics.locValid).whenChanged());
    this.glsIdentWord.setConsumer(subs.on('gbasIdent').whenChanged());
    this.glsCourse.setConsumer(subs.on('ilsCourse').whenChanged());

    subs
      .on('fm.1.healthy_discrete')
      .whenChanged()
      .handle((healthy) => this.fm1Healthy.set(healthy));

    subs
      .on('fm.2.healthy_discrete')
      .whenChanged()
      .handle((healthy) => this.fm2Healthy.set(healthy));

    subs
      .on('fm.1.tuning_discrete_word')
      .whenChanged()
      .handle((word) => this.fm1NavTuningWord.setWord(word));

    subs
      .on('fm.2.tuning_discrete_word')
      .whenChanged()
      .handle((word) => this.fm2NavTuningWord.setWord(word));
  }

  private readonly visibilityFn = (v) => (v ? 'inherit' : 'hidden');

  render(): VNode | null {
    return (
      <Layer x={748} y={28}>
        <text x={-102} y={0} font-size={25} class="White" text-anchor="end">
          {this.lsInfo.map((info) => info.label)}
        </text>

        <g>
          <text x={0} y={0} font-size={25} class="Magenta" text-anchor="end">
            {this.lsInfo.map((info) => info.frequencyMain)}
            <tspan font-size={20}>
              {this.lsInfo.map((info) => (info.frequencyDecimal ? `.${info.frequencyDecimal}` : ''))}
            </tspan>
          </text>
        </g>

        <text x={-56} y={30} font-size={25} class="White" text-anchor="end">
          CRS
        </text>
        <text x={20} y={30} font-size={25} text-anchor="end">
          <tspan class="Magenta">{this.lsInfo.map((info) => info.course)}</tspan>
          <tspan class="Cyan">&deg;</tspan>
        </text>

        <g
          visibility={MappedSubject.create(
            ([frequency, channel]) => frequency > 0 || channel > 0,
            this.ilsFrequency,
            this.glsChannel,
          ).map(this.visibilityFn)}
        >
          <text x={-80} y={58} font-size={20} class="White" text-anchor="end" text-decoration="underline">
            {this.tuningMode}
          </text>
        </g>

        <text x={0} y={60} font-size={25} class="Magenta" text-anchor="end">
          {this.lsInfo.map((info) => info.ident)}
        </text>
      </Layer>
    );
  }
}
