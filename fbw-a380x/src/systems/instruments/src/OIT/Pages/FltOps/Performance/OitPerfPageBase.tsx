//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  NodeReference,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DataEntryFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { WindEntry, missingParameterErrors } from '../../../System/Performance/PerformanceEntries';
import { OitPerfRunwaySelection } from './OitPerfRunwaySelection';
import './performance.scss';

/** The width an input field takes per digit of its digit count, px */
const FIELD_DIGIT_WIDTH = 18;

/** The arrow of a list and the frames of the list and of its field, px */
const LIST_ARROW_AND_FRAMES_WIDTH = 37;

/** A text box in yellow (a value from another application), and what an entry does instead of setting the value */
interface BoxOptions<T> {
  readonly yellow?: Subscribable<boolean>;
  readonly onModified?: (value: T | null) => void;
}

/**
 * The parts the performance application pages share: labelled rows, text boxes, lists, the airport row, the RESULTS
 * texts and the ERROR list. R is the type of the results of the application.
 */
export abstract class OitPerfPageBase<P extends AbstractOitFltOpsPageProps, R> extends DisplayComponent<P> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  protected readonly subs = [] as Subscription[];

  /** The page name in the ids of its lists */
  protected abstract readonly pageId: string;

  /** The results of the last computation, null before one or after a change of entry */
  protected abstract readonly results: Subscribable<R | null>;

  protected readonly fieldsDisabled = Subject.create(false);

  /**
   * @param subscription a subscription of the page
   * @returns the subscription, destroyed with the page
   */
  protected tracked<S extends Subscription>(subscription: S): S {
    this.subs.push(subscription);
    return subscription;
  }

  protected row(label: string, unit: string | null, field: VNode, after?: VNode, labelClass = ''): VNode {
    return (
      <div class="oit-perf-row">
        <div class={`oit-perf-label ${labelClass}`}>
          {label}
          {unit !== null && <span class="oit-perf-unit">{unit}</span>}
        </div>
        {field}
        {after}
      </div>
    );
  }

  /**
   * @param width the box width, px
   * @param yellow the box shows a value from another application in yellow
   * @returns the props of every text box but its value and format
   */
  private boxProps(width: number, yellow: Subscribable<boolean> | undefined) {
    return {
      tmpyActive: yellow,
      containerStyle: `width: ${width}px;`,
      alignText: 'flex-start' as const,
      disabled: this.fieldsDisabled,
      hEventConsumer: this.props.container.hEventConsumer,
      interactionMode: this.props.container.interactionMode,
      errorHandler: () => {},
    };
  }

  protected numberBox(
    format: DataEntryFormat<number>,
    value: Subject<number | null>,
    width: number,
    options: BoxOptions<number> = {},
  ): VNode {
    return (
      <InputField<number>
        dataEntryFormat={format}
        value={value}
        onModified={options.onModified}
        {...this.boxProps(width, options.yellow)}
      />
    );
  }

  protected stringBox(
    format: DataEntryFormat<string>,
    value: Subject<string | null>,
    width: number,
    options: BoxOptions<string> = {},
  ): VNode {
    return (
      <InputField<string>
        dataEntryFormat={format}
        value={value}
        onModified={options.onModified}
        {...this.boxProps(width, options.yellow)}
      />
    );
  }

  protected windBox(format: DataEntryFormat<WindEntry>, value: Subject<WindEntry | null>, width: number): VNode {
    return <InputField<WindEntry> dataEntryFormat={format} value={value} {...this.boxProps(width, undefined)} />;
  }

  protected list(
    id: string,
    labels: readonly string[],
    selected: Subject<number | null> | Subject<number>,
    width = 230,
    disabled: Subscribable<boolean> = this.fieldsDisabled,
  ): VNode {
    return (
      <DropdownMenu
        idPrefix={`${this.props.uiService.captOrFo}_OIT_${this.pageId}_${id}`}
        values={ArraySubject.create([...labels])}
        selectedIndex={selected as Subject<number | null>}
        freeTextAllowed={false}
        containerStyle={`width: ${width}px;`}
        alignLabels="flex-start"
        // The field of a list without selection shows one dash per digit: as many as the box holds next to its arrow
        numberOfDigitsForInputField={Math.floor((width - LIST_ARROW_AND_FRAMES_WIDTH) / FIELD_DIGIT_WIDTH)}
        hEventConsumer={this.props.container.hEventConsumer}
        interactionMode={this.props.container.interactionMode}
        disabled={disabled}
      />
    );
  }

  protected value(text: Subscribable<string> | string, extraClass = ''): VNode {
    return <span class={`oit-perf-value ${extraClass}`}>{text}</span>;
  }

  /**
   * @param pick the text of the results
   * @returns the text, empty without results
   */
  protected resultText(pick: (results: R) => string): Subscribable<string> {
    return this.tracked(this.results.map((r) => (r !== null ? pick(r) : '')));
  }

  /**
   * The ERROR list: the missing parameters before a computation, then the errors of the computation.
   * @param missingParameters the missing parameters of the entries
   * @param computation the last computation, null before one
   * @returns the lines of the list
   */
  protected errorLinesOf(
    missingParameters: Subscribable<string[]>,
    computation: Subscribable<{ readonly errors: string[] } | null>,
  ): MappedSubject<[string[], { readonly errors: string[] } | null], string[]> {
    return MappedSubject.create(
      ([missing, last]) => (last !== null ? last.errors : missingParameterErrors(missing)),
      missingParameters,
      computation,
    );
  }

  /**
   * Shows the ERROR list, one "***" line per error.
   * @param ref the list element
   * @param lines the errors
   */
  protected showErrorLines(ref: NodeReference<HTMLDivElement>, lines: readonly string[]): void {
    const list = ref.getOrDefault();
    if (!list) {
      return;
    }
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    for (const line of lines) {
      FSComponent.render(
        <div class="oit-perf-error-line">
          <span class="oit-perf-error-stars">***</span>
          <span>{line}</span>
        </div>,
        list,
      );
    }
  }

  /**
   * The first row of the airport panel of T.O PERF and LDG PERF: the airport name, the airport (another one can be
   * entered) and the runway lists.
   * @param selection the airport and runway of the page
   * @param airportFromSts the airport comes from FLT OPS STS (yellow)
   * @param onAirportEntered the crew enters an airport
   * @returns the row
   */
  protected renderAirportRow(
    selection: OitPerfRunwaySelection,
    airportFromSts: Subscribable<boolean>,
    onAirportEntered: (icao: string) => void,
  ): VNode {
    return (
      <div class="oit-perf-row">
        <span class="oit-perf-text" style="width: 270px; font-size: 22px;">
          {this.tracked(selection.airport.map((a) => a?.name ?? ''))}
        </span>
        <DropdownMenu
          idPrefix={`${this.props.uiService.captOrFo}_OIT_${this.pageId}_airport`}
          values={selection.airportIdents}
          selectedIndex={selection.airportIndex}
          freeTextAllowed
          onModified={(index, text) => {
            if (index === -1 && /^[A-Z0-9]{4}$/.test(text)) {
              onAirportEntered(text);
            }
          }}
          containerStyle="width: 150px;"
          alignLabels="flex-start"
          numberOfDigitsForInputField={4}
          tmpyActive={airportFromSts}
          hEventConsumer={this.props.container.hEventConsumer}
          interactionMode={this.props.container.interactionMode}
        />
        <span class="oit-perf-text" style="padding-left: 40px;">
          RWY
        </span>
        <DropdownMenu
          idPrefix={`${this.props.uiService.captOrFo}_OIT_${this.pageId}_runway`}
          values={selection.runwayIdents}
          selectedIndex={selection.runwayIndex}
          freeTextAllowed={false}
          onModified={(index) => selection.selectRunway(index)}
          containerStyle="width: 180px;"
          alignLabels="flex-start"
          numberOfDigitsForInputField={4}
          hEventConsumer={this.props.container.hEventConsumer}
          interactionMode={this.props.container.interactionMode}
        />
      </div>
    );
  }

  /**
   * The page of an application the FLT OPS STS page does not permit to start.
   * @param application the application name
   * @param missingFields the missing FLT OPS STS fields
   * @returns the page
   */
  protected renderNotStarted(application: string, missingFields: readonly string[]): VNode {
    return (
      <div class="oit-perf-page">
        <div class="oit-perf-not-available">
          <div>{application} CANNOT BE STARTED</div>
          <div style="font-size: 22px; padding-top: 16px;">FILL IN ON FLT OPS STS: {missingFields.join(', ')}</div>
        </div>
      </div>
    );
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }

    super.destroy();
  }
}
