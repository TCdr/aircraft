// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  ComponentProps,
  ConsumerSubject,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { Arinc429WordData, MathUtils, GenericAdirsEvents } from '@flybywiresim/fbw-sdk';

import { RoseMode, RoseModeProps } from './RoseMode';
import { RoseModeUnderlay } from './RoseModeUnderlay';
import { NDControlEvents } from '../../NDControlEvents';
import { IlsInfoIndicator } from './IlsInfoIndicator';
import { GlideSlope } from './Glideslope';
import { GenericDisplayManagementEvents } from '../../types/GenericDisplayManagementEvents';
import { GenericVorEvents } from '../../types/GenericVorEvents';
import { GenericFlightManagementBusEvents } from '../../types/GenericFlightManagementBusEvents';
import { NDSimvars } from '../../NDSimvarPublisher';
import { LowPassFilter } from '../../../Filters';
import {
  roseLsCourse,
  roseLsCourseKnown,
  roseLsCoursePointerVisible,
  roseLsDeviationSource,
  roseLsGlsTopics,
} from './RoseLsInfo';

export interface RoseLsProps<T extends number> extends RoseModeProps<T> {
  index: 1 | 2;
}

export class RoseLSPage<T extends number> extends RoseMode<T, RoseLsProps<T>> {
  private readonly sub = this.props.bus.getSubscriber<
    GenericAdirsEvents &
      GenericDisplayManagementEvents &
      GenericVorEvents &
      GenericFlightManagementBusEvents &
      NDSimvars
  >();

  isVisible = Subject.create(false);

  //  private readonly headingWord = Arinc429ConsumerSubject.create(null);

  private readonly ilsCourseSub = ConsumerSubject.create(null, 0);

  private readonly ilsCourseDeviationSub = ConsumerSubject.create(null, 0);

  private readonly ilsFrequencySub = ConsumerSubject.create(null, 0);

  private readonly localizerValidSub = ConsumerSubject.create(null, false);

  private readonly glideSlopeValidSub = ConsumerSubject.create(null, false);

  private readonly glideSlopeDeviationSub = ConsumerSubject.create(null, 0);

  private readonly glsChannelSub = ConsumerSubject.create(null, 0);

  private readonly glsLocValidSub = ConsumerSubject.create(null, false);

  private readonly glsGsValidSub = ConsumerSubject.create(null, false);

  private readonly glsLocDeviationSub = ConsumerSubject.create(null, 0);

  private readonly glsGsDeviationSub = ConsumerSubject.create(null, 0);

  private readonly glsCourseSub = ConsumerSubject.create(null, -1);

  // Design choice: both NDs take the GLS course from the FMS landing system course, as there is no course L:var per
  // MMR. The FMS tunes both MMRs alike, so the two only differ while one MMR is tuned by hand.
  private readonly courseSub = MappedSubject.create(
    ([glsChannel, glsCourse, ilsCourse]) => roseLsCourse(glsChannel, glsCourse, ilsCourse),
    this.glsChannelSub,
    this.glsCourseSub,
    this.ilsCourseSub,
  );

  private readonly coursePointerVisibleSub = MappedSubject.create(
    ([glsChannel, glsCourse, ilsFrequency]) => roseLsCoursePointerVisible(glsChannel, glsCourse, ilsFrequency),
    this.glsChannelSub,
    this.glsCourseSub,
    this.ilsFrequencySub,
  );

  private readonly courseKnownSub = MappedSubject.create(
    ([glsChannel, glsCourse]) => roseLsCourseKnown(glsChannel, glsCourse),
    this.glsChannelSub,
    this.glsCourseSub,
  );

  private readonly deviationSub = MappedSubject.create(
    ([
      glsChannel,
      ilsLocValid,
      ilsLocDeviation,
      ilsGsValid,
      ilsGsDeviation,
      glsLocDeviation,
      glsGsDeviation,
      glsCourse,
      glsLocValid,
      glsGsValid,
    ]) =>
      roseLsDeviationSource({
        glsChannel,
        ilsLocValid,
        ilsLocDeviation,
        ilsGsValid,
        ilsGsDeviation,
        glsLocDeviation,
        glsGsDeviation,
        glsCourse,
        glsLocValid,
        glsGsValid,
      }),
    this.glsChannelSub,
    this.localizerValidSub,
    this.ilsCourseDeviationSub,
    this.glideSlopeValidSub,
    this.glideSlopeDeviationSub,
    this.glsLocDeviationSub,
    this.glsGsDeviationSub,
    this.glsCourseSub,
    this.glsLocValidSub,
    this.glsGsValidSub,
  );

  private readonly locValidSub = this.deviationSub.map((deviation) => deviation.locValid);

  private readonly locDeviationSub = this.deviationSub.map((deviation) => deviation.locDeviation);

  private readonly gsValidSub = this.deviationSub.map((deviation) => deviation.gsValid);

  private readonly gsDeviationSub = this.deviationSub.map((deviation) => deviation.gsDeviation);

  private readonly backbeam = ConsumerSubject.create(this.sub.on('fm.1.backbeam'), false);

  onShow() {
    super.onShow();

    const publisher = this.props.bus.getPublisher<NDControlEvents>();

    const index: 3 | 4 = (this.props.index + 2) as 3 | 4;

    this.ilsCourseSub.setConsumer(this.sub.on(`nav${index}Obs`).whenChanged());
    this.ilsCourseDeviationSub.setConsumer(this.sub.on(`nav${index}RadialError`).whenChanged());
    this.ilsFrequencySub.setConsumer(this.sub.on(`nav${index}Frequency`).whenChanged());
    this.localizerValidSub.setConsumer(this.sub.on('localizerValid').whenChanged());
    this.glideSlopeValidSub.setConsumer(this.sub.on('glideSlopeValid').whenChanged());
    this.glideSlopeDeviationSub.setConsumer(this.sub.on('glideSlopeDeviation').whenChanged());

    const glsTopics = roseLsGlsTopics(this.props.index);
    this.glsChannelSub.setConsumer(this.sub.on(glsTopics.channel).whenChanged());
    this.glsLocValidSub.setConsumer(this.sub.on(glsTopics.locValid).whenChanged());
    this.glsGsValidSub.setConsumer(this.sub.on(glsTopics.gsValid).whenChanged());
    this.glsLocDeviationSub.setConsumer(this.sub.on('glsLocDeviation').whenChanged());
    this.glsGsDeviationSub.setConsumer(this.sub.on('glsGsDeviation').whenChanged());
    this.glsCourseSub.setConsumer(this.sub.on('ilsCourse').whenChanged());

    publisher.pub('set_show_map', false);
  }

  render(): VNode | null {
    return (
      <g visibility={this.isVisible.map((v) => (v ? 'visible' : 'hidden'))}>
        {/* inverted map overlays for terrain map in WASM module  */}
        <path
          name="rose-mode-bottom-left-map-area"
          d="M45,625 L122,625 L174,683 L174,768 L0,768 L0,0 L45,0L45,625"
          class="nd-inverted-map-area"
        />
        <path
          name="rose-mode-bottom-right-map-area"
          d="M591,768 L591,626 L648,562 L723,562 L723,0 L768,0 L768,768 L591,769"
          class="nd-inverted-map-area"
        />
        <path
          name="rose-mode-top-map-area"
          d="M45,0 L45,155, L282,155 a250,250 0 0 1 204,0 L723,155 L723,0 L45,0"
          class="nd-inverted-map-area"
        />

        <IlsInfoIndicator bus={this.props.bus} index={this.props.index} />

        <GlideSlope
          bus={this.props.bus}
          instrument={this.props.instrument}
          backbeam={this.backbeam}
          valid={this.gsValidSub}
          deviation={this.gsDeviationSub}
        />

        <RoseModeUnderlay
          bus={this.props.bus}
          heading={this.props.headingWord}
          visible={this.isVisible}
          rangeValues={this.props.rangeValues}
        />

        <IlsCaptureOverlay
          bus={this.props.bus}
          instrument={this.props.instrument}
          heading={this.props.headingWord}
          course={this.courseSub}
          courseDeviation={this.locDeviationSub}
          backbeam={this.backbeam}
          available={this.locValidSub}
          pointerVisible={this.coursePointerVisibleSub}
          scaleVisible={this.courseKnownSub}
        />
      </g>
    );
  }
}

interface IlsCaptureOverlayProps extends ComponentProps {
  bus: EventBus;
  instrument: BaseInstrument;
  heading: Subscribable<Arinc429WordData>;
  course: Subscribable<number>;
  courseDeviation: Subscribable<number>;
  backbeam: Subscribable<boolean>;
  available: Subscribable<boolean>;
  pointerVisible: Subscribable<boolean>;
  scaleVisible: Subscribable<boolean>;
}

class IlsCaptureOverlay extends DisplayComponent<IlsCaptureOverlayProps> {
  private readonly sub = this.props.bus.getSubscriber<ClockEvents>();

  private readonly lagFilter = new LowPassFilter(1.5);

  private readonly pointerVisibilitySub = this.props.pointerVisible.map((visible) => (visible ? 'inherit' : 'hidden'));

  private readonly scaleVisibilitySub = this.props.scaleVisible.map((visible) => (visible ? 'inherit' : 'hidden'));

  private readonly visible = MappedSubject.create(([heading]) => {
    return heading.isNormalOperation();
  }, this.props.heading);

  private readonly rotation = MappedSubject.create(
    ([heading, course]) => {
      if (heading.isNormalOperation()) {
        return course - heading.value;
      }
      return 0;
    },
    this.props.heading,
    this.props.course,
  );

  private readonly deviation = Subject.create(0);

  // FIXME hook up when MMR ready
  private readonly mixLocVnav = Subject.create(false);

  private readonly locBcReminderText = MappedSubject.create(
    ([backbeam, mixLocVnav]) => (backbeam ? 'B/C' : mixLocVnav ? 'LOC' : ''),
    this.props.backbeam,
    this.mixLocVnav,
  );

  private handleNavRadialError(): void {
    const radialError = MathUtils.correctMsfsLocaliserError(this.props.courseDeviation.get());
    const deviation = this.lagFilter.step(radialError, this.props.instrument.deltaTime / 1000);
    const dots = (this.props.backbeam.get() ? -1 : 1) * Math.max(-2, Math.min(2, deviation / 0.8));

    this.deviation.set(dots * 74);
  }

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // The MMR outputs the localizer deviation at a rate of 20 Hz
    const lagFilterSub = this.sub.on('realTime').atFrequency(20).handle(this.handleNavRadialError.bind(this), true);

    this.props.available.sub((hasLoc) => {
      if (hasLoc) {
        lagFilterSub.resume(true);
      } else {
        lagFilterSub.pause();
        this.lagFilter.reset();
      }
    });
  }

  render(): VNode {
    return (
      <g
        visibility={this.visible.map((visible) => (visible ? 'inherit' : 'hidden'))}
        transform={this.rotation.map((deg) => `rotate(${deg} 384 384)`)}
        stroke="white"
        strokeWidth={3}
        fill="none"
      >
        <g id="loc-bc-reminder">
          {/* FIXME don't have a good reference for the position of this. Only doc illustrations. */}
          <text x={202} y={416} class="FontSmall Magenta">
            {this.locBcReminderText}
          </text>
        </g>

        <g id="ils-deviation-scale" visibility={this.scaleVisibilitySub}>
          <circle cx={236} cy={384} r={5} />
          <circle cx={310} cy={384} r={5} />
          <circle cx={458} cy={384} r={5} />
          <circle cx={532} cy={384} r={5} />
        </g>

        <g visibility={this.pointerVisibilitySub}>
          <path
            d="M352,256 L416,256 M384,134 L384,294 M384,474 L384,634"
            class="rounded shadow"
            id="ils-course-pointer-shadow"
            stroke-width={4.5}
          />
          <path
            d="M352,256 L416,256 M384,134 L384,294 M384,474 L384,634"
            class="Magenta rounded"
            id="ils-course-pointer"
            stroke-width={4}
          />
        </g>

        <g visibility={this.props.available.map((a) => (a ? 'inherit' : 'hidden'))}>
          <path
            d="M384,304 L384,464"
            class="rounded shadow"
            transform={this.deviation.map((cdiPx) => `translate(${cdiPx}, 0)`)}
            id="ils-deviation-shadow"
            stroke-width={4.5}
          />
          <path
            d="M384,304 L384,464"
            class="Magenta rounded"
            transform={this.deviation.map((cdiPx) => `translate(${cdiPx}, 0)`)}
            id="ils-deviation"
            stroke-width={4}
          />
        </g>
      </g>
    );
  }
}
