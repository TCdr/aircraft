import {
  ComponentProps,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';

import './MfdFmsFplnAirways.scss';
import '../../common/style.scss';
import { AbstractMfdPageProps, MfdDisplayInterface } from '../../../MFD';
import { Footer } from '../../common/Footer';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FmsPage } from '../../common/FmsPage';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { AirwayFormat, WaypointFormat } from '../../common/DataEntryFormats';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';
import { FmcInterface } from '../../../FMC/FmcInterface';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { Airway, Fix } from '@flybywiresim/fbw-sdk';
import { FmsDisplayInterface } from '@fmgc/flightplanning/interface/FmsDisplayInterface';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { PendingAirwayEntry } from '@fmgc/flightplanning/plans/ReadonlyPendingAirways';

interface MfdFmsFplnAirwaysProps extends AbstractMfdPageProps {}

/** FCOM DSC-22-FMS-20-30 AIRWAYS page: up to 31 airway segments, scrolled page by page */
const MAX_AIRWAY_SEGMENTS = 31;

const AIRWAY_LINES_PER_PAGE = 10;

export class MfdFmsFplnAirways extends FmsPage<MfdFmsFplnAirwaysProps> {
  private readonly revisedFixIdent = Subject.create<string>('');

  private readonly airwayLinesRef = FSComponent.createRef<HTMLDivElement>();

  private readonly lines: AirwayLine[] = [];

  private readonly lineCount = Subject.create(0);

  private readonly firstDisplayedLine = Subject.create(0);

  private readonly disabledScrollUp = this.firstDisplayedLine.map((v) => v <= 0);

  private readonly disabledScrollDown = MappedSubject.create(
    ([first, count]) => first + AIRWAY_LINES_PER_PAGE >= count,
    this.firstDisplayedLine,
    this.lineCount,
  );

  private readonly returnButtonDiv = FSComponent.createRef<HTMLDivElement>();

  private readonly tmpyFplnButtonDiv = FSComponent.createRef<HTMLDivElement>();

  protected onNewData(): void {
    const revWpt = this.props.fmcService.master.revisedWaypoint();
    if (revWpt) {
      this.revisedFixIdent.set(revWpt.ident);
    }
  }

  /** The pending airway entry that the line at this index created, if any */
  private pendingElement(lineIndex: number): PendingAirwayEntry | undefined {
    return this.loadedFlightPlan?.pendingAirways?.elements[lineIndex];
  }

  private addLine(fromFix: Fix | undefined): void {
    if (
      !this.airwayLinesRef.getOrDefault() ||
      !this.props.fmcService.master ||
      !this.loadedFlightPlan?.pendingAirways ||
      this.lines.length >= MAX_AIRWAY_SEGMENTS
    ) {
      return;
    }

    const lineIndex = this.lines.length;
    const ref = FSComponent.createRef<AirwayLine>();
    FSComponent.render(
      <AirwayLine
        ref={ref}
        fmc={this.props.fmcService.master}
        mfd={this.props.mfd}
        loadedFlightPlan={() => this.loadedFlightPlan}
        loadedFlightPlanIndex={this.loadedFlightPlanIndex}
        fromFix={fromFix}
        isFirstLine={lineIndex === 0}
        previousPendingElement={() => (lineIndex > 0 ? this.pendingElement(lineIndex - 1) : undefined)}
        onAirwayEntered={() => this.onAirwayEntered(lineIndex)}
        onToEntered={(fix) => this.onToEntered(lineIndex, fix)}
      />,
      this.airwayLinesRef.instance,
    );
    this.lines.push(ref.instance);
    this.lineCount.set(this.lines.length);

    if (lineIndex >= this.firstDisplayedLine.get() + AIRWAY_LINES_PER_PAGE) {
      this.firstDisplayedLine.set(Math.floor(lineIndex / AIRWAY_LINES_PER_PAGE) * AIRWAY_LINES_PER_PAGE);
    } else {
      this.updateLineVisibility();
    }
  }

  private onAirwayEntered(lineIndex: number): void {
    // Two consecutive airways: the TO field of the previous line displays their common waypoint
    const previousLine = lineIndex > 0 ? this.lines[lineIndex - 1] : undefined;
    const connectingFix = this.pendingElement(lineIndex - 1)?.to;
    if (previousLine && !previousLine.hasToWaypoint() && connectingFix) {
      previousLine.setAutoConnectedTo(connectingFix);
    }

    // The next VIA can be an airway connecting automatically to this one, so it is offered right away
    if (lineIndex === this.lines.length - 1) {
      this.addLine(undefined);
    }
  }

  private onToEntered(lineIndex: number, fix: Fix): void {
    const nextLine = this.lines[lineIndex + 1];
    if (nextLine) {
      nextLine.setFromFix(fix);
    } else {
      this.addLine(fix);
    }
  }

  private scrollPage(down: boolean): void {
    const first = this.firstDisplayedLine.get() + (down ? AIRWAY_LINES_PER_PAGE : -AIRWAY_LINES_PER_PAGE);
    this.firstDisplayedLine.set(Math.max(0, Math.min(first, this.lines.length - 1)));
  }

  private updateLineVisibility(): void {
    const first = this.firstDisplayedLine.get();
    this.lines.forEach((line, i) => line.setVisible(i >= first && i < first + AIRWAY_LINES_PER_PAGE));
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.tmpyActive.sub((v) => {
        if (this.returnButtonDiv.getOrDefault() && this.tmpyFplnButtonDiv.getOrDefault()) {
          this.returnButtonDiv.instance.style.visibility = v ? 'hidden' : 'visible';
          this.tmpyFplnButtonDiv.instance.style.visibility = v ? 'visible' : 'hidden';
        }
      }, true),
      this.firstDisplayedLine.sub(() => this.updateLineVisibility()),
      this.disabledScrollUp,
      this.disabledScrollDown,
    );

    const revWpt = this.props.fmcService.master.revisedWaypoint();
    if (revWpt) {
      this.addLine(revWpt);
    }
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="fc" style="margin-top: 2px;">
          <div class="fr aic" style="height: 36px;">
            <span class="mfd-label" style="margin-left: 9px;">
              AIRWAYS FROM
            </span>
            <span
              class={{
                'mfd-value': true,
                bigger: true,
                'mfd-fms-yellow-text': this.tmpyActive,
              }}
              style="margin-left: 20px;"
            >
              {this.revisedFixIdent}
            </span>
          </div>
          <div ref={this.airwayLinesRef} class="mfd-fms-fpln-awy-awy-container" />
        </div>
        <div class="fr" style="margin-left: 307px;">
          <IconButton
            icon="double-up"
            onClick={() => this.scrollPage(false)}
            disabled={this.disabledScrollUp}
            containerStyle="width: 61px; height: 58px; margin-right: 8px;"
          />
          <IconButton
            icon="double-down"
            onClick={() => this.scrollPage(true)}
            disabled={this.disabledScrollDown}
            containerStyle="width: 61px; height: 58px;"
          />
        </div>
        <div style="flex-grow: 1" />
        <div class="mfd-fms-bottom-button-row">
          <div ref={this.returnButtonDiv} class="mfd-fms-direct-to-erase-return-btn">
            <Button
              label="RETURN"
              buttonStyle="width: 101px;"
              onClick={async () => {
                if (this.loadedFlightPlanIndex.get() >= FlightPlanIndex.FirstSecondary) {
                  await this.props.flightPlanInterface.finaliseAirwayEntry(
                    this.loadedFlightPlanIndex.get(),
                    this.props.fmcService.master.revisedLegIsAltn.get() ?? false,
                  );
                }
                this.props.fmcService.master.resetRevisedWaypoint();
                this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`);
              }}
            />
          </div>
          <div ref={this.tmpyFplnButtonDiv} class="mfd-fms-direct-to-erase-return-btn">
            <Button
              label="TMPY F-PLN"
              onClick={async () => {
                if (this.loadedFlightPlan) {
                  await this.props.flightPlanInterface.finaliseAirwayEntry(
                    this.loadedFlightPlanIndex.get(),
                    this.props.fmcService.master.revisedLegIsAltn.get() ?? false,
                  );
                  this.props.fmcService.master.resetRevisedWaypoint();
                  this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`);
                }
              }}
              buttonStyle="color: #ffff00;"
            />
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

interface AirwayLineProps extends ComponentProps {
  fmc: FmcInterface;
  mfd: FmsDisplayInterface & MfdDisplayInterface;
  loadedFlightPlan: () => ReadonlyFlightPlan | null;
  loadedFlightPlanIndex: Subscribable<FlightPlanIndex>;
  /** The start fix of this line: the revised waypoint, or the TO waypoint of the previous line */
  fromFix: Fix | undefined;
  isFirstLine: boolean;
  /** The pending entry of the previous line, to connect two consecutive airways */
  previousPendingElement: () => PendingAirwayEntry | undefined;
  onAirwayEntered: () => void;
  onToEntered: (fix: Fix) => void;
}

class AirwayLine extends DisplayComponent<AirwayLineProps> {
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  private fromFix = this.props.fromFix;

  public readonly viaField = Subject.create<string | null>(null);

  private readonly viaFieldDisabled = Subject.create(false);

  public readonly toField = Subject.create<string | null>(null);

  private readonly toFieldDisabled = Subject.create(false);

  public setVisible(visible: boolean): void {
    this.rootRef.instance.style.display = visible ? 'flex' : 'none';
  }

  public setFromFix(fix: Fix): void {
    this.fromFix = fix;
  }

  public hasToWaypoint(): boolean {
    return this.toField.get() !== null;
  }

  public setAutoConnectedTo(fix: Fix): void {
    this.toField.set(fix.ident);
    this.toFieldDisabled.set(true);
  }

  private get isAltn(): boolean {
    return this.props.fmc.revisedLegIsAltn.get() ?? false;
  }

  /** The airway named ident, that contains the start fix of this line */
  private async airwayFromFix(ident: string, fromFix: Fix): Promise<Airway | null> {
    const airways = await NavigationDatabaseService.activeDatabase.searchAirway(ident, fromFix);
    if (airways.length === 0) {
      this.props.fmc.showFmsErrorMessage(FmsErrorType.NotInDatabase);
      return null;
    }
    const airway = airways.find((a) =>
      a.fixes.some((f) => f.ident === fromFix.ident && f.icaoCode === fromFix.icaoCode),
    );
    if (!airway) {
      // FCOM DSC-22-FMS-20-30 AIRWAYS page: the TO waypoint before the airway is not part of it
      this.props.fmc.addMessageToQueue(NXSystemMessages.awyWptDisagree, undefined, undefined);
      return null;
    }
    return airway;
  }

  /** The airway named ident that intersects the previous airway, searched outwards from its start fix */
  private async airwayIntersecting(ident: string, previous: PendingAirwayEntry): Promise<Airway | null> {
    const fixes = previous.airway?.fixes ?? [];
    const start = Math.max(0, previous.fromIndex ?? 0);
    const searchOrder = [start];
    for (let i = 1; i < fixes.length; i++) {
      searchOrder.push(start + i, start - i);
    }
    for (const index of searchOrder) {
      const fix = fixes[index];
      if (fix === undefined) {
        continue;
      }
      const airways = await NavigationDatabaseService.activeDatabase.searchAirway(ident, fix);
      const airway = airways.find((a) => a.fixes.some((f) => f.databaseId === fix.databaseId));
      if (airway) {
        return airway;
      }
    }
    this.props.fmc.addMessageToQueue(NXSystemMessages.noIntersectionFound, undefined, undefined);
    return null;
  }

  private async onViaEntered(v: string | null): Promise<boolean> {
    if (!v || this.viaFieldDisabled.get()) {
      return false;
    }

    const previous = this.props.previousPendingElement();
    const previousAirwayOpen = !this.fromFix && previous?.airway !== undefined && previous.to === undefined;

    if (v === 'DCT') {
      if (!this.fromFix) {
        // A direct needs a start waypoint: the previous airway has no TO waypoint yet
        this.props.fmc.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
        return false;
      }
      this.viaFieldDisabled.set(!this.props.isFirstLine);
      this.toFieldDisabled.set(false);
      return true;
    }

    let airway: Airway | null = null;
    if (this.fromFix) {
      airway = await this.airwayFromFix(v, this.fromFix);
    } else if (previousAirwayOpen && previous) {
      airway = await this.airwayIntersecting(v, previous);
    }
    if (!airway) {
      return false;
    }

    const success = await this.props.fmc.flightPlanInterface.continueAirwayEntryViaAirway(
      airway,
      this.props.loadedFlightPlanIndex.get(),
      this.isAltn,
    );
    if (success) {
      this.viaFieldDisabled.set(true);
      this.toFieldDisabled.set(false);
      this.props.onAirwayEntered();
    } else {
      this.props.fmc.addMessageToQueue(
        previousAirwayOpen ? NXSystemMessages.noIntersectionFound : NXSystemMessages.notAllowed,
        undefined,
        undefined,
      );
    }
    return success;
  }

  private async onToEnteredInField(v: string | null): Promise<boolean> {
    if (!v || this.toFieldDisabled.get()) {
      return false;
    }

    if (this.viaField.get() === null) {
      if (!this.fromFix) {
        this.props.fmc.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
        return false;
      }
      this.viaField.set('DCT');
    }

    let chosenFix: Fix | undefined = undefined;
    const isDct = this.viaField.get() === 'DCT';

    if (!isDct) {
      try {
        chosenFix = this.props.loadedFlightPlan()?.pendingAirways?.fixAlongTailAirway(v);
      } catch (msg: unknown) {
        if (msg instanceof FmsError) {
          this.props.fmc.showFmsErrorMessage(msg.type);
        }
        return false;
      }
    } else {
      this.viaFieldDisabled.set(true);
      const fixes = await NavigationDatabaseService.activeDatabase.searchAllFix(v);
      if (fixes.length === 0) {
        this.props.fmc.showFmsErrorMessage(FmsErrorType.NotInDatabase);
        return false;
      }

      if (fixes.length > 1) {
        const dedup = await this.props.fmc.deduplicateFacilities(fixes);
        if (dedup !== undefined) {
          chosenFix = dedup;
        }
      } else {
        chosenFix = fixes[0];
      }
    }

    if (!chosenFix) {
      return false;
    }

    const success = await this.props.fmc.flightPlanInterface.continueAirwayEntryToFix(
      chosenFix,
      isDct,
      this.props.loadedFlightPlanIndex.get(),
      this.isAltn,
    );
    if (success) {
      this.toFieldDisabled.set(true);
      this.props.onToEntered(chosenFix);
    } else {
      this.props.fmc.addMessageToQueue(NXSystemMessages.noIntersectionFound, undefined, undefined);
    }
    return success;
  }

  render(): VNode {
    return (
      <div ref={this.rootRef} class="fr mfd-fms-awy-line-container">
        <div class="fr aic">
          <div class="mfd-label" style="margin-right: 5px;">
            VIA
          </div>
          <InputField<string>
            dataEntryFormat={new AirwayFormat()}
            dataHandlerDuringValidation={(v) => this.onViaEntered(v)}
            canBeCleared={Subject.create(false)}
            value={this.viaField}
            alignText="center"
            class="yellow-when-disabled"
            disabled={this.viaFieldDisabled}
            errorHandler={(e) => this.props.fmc.showFmsErrorMessage(e.type)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />
        </div>
        <div class="fr aic">
          <div class="mfd-label" style="margin-right: 5px;">
            TO
          </div>
          <InputField<string>
            dataEntryFormat={new WaypointFormat()}
            dataHandlerDuringValidation={(v) => this.onToEnteredInField(v)}
            canBeCleared={Subject.create(false)}
            value={this.toField}
            alignText="center"
            class="yellow-when-disabled"
            disabled={this.toFieldDisabled}
            errorHandler={(e) => this.props.fmc.showFmsErrorMessage(e.type)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />
        </div>
      </div>
    );
  }
}
