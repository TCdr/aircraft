//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  FSComponent,
  MappedSubject,
  MappedSubscribable,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import {
  LogbookStoreTarget,
  ecamAlertAta,
  formatLogbookMinutes,
  itemsIn,
  minutesOfDay,
  validateCabinItem,
} from '../../../System/TechLogbook';
import {
  StandardDefect,
  defectAllocations,
  defectFunctions,
  defectSystems,
  defectsBySystem,
  searchDefects,
} from '../../../System/TechLogbookDefects';
import { LogbookField, LogbookSelectionList, LogbookValueBox } from './LogbookWidgets';
import { LogbookDefectStorePanel } from './LogbookDefectStorePanel';
import { LOGBOOK_URI } from './LogbookFlows';
import { selectionIndex } from './LogbookDrafts';

export type LogbookAssistantKind = 'ecam-alerts' | 'cabin-items' | 'system-function' | 'keyword' | 'free-text';

interface OitAvncsLogbookAssistantProps extends AbstractOitAvncsPageProps {
  readonly kind: LogbookAssistantKind;
}

const TITLES: Record<LogbookAssistantKind, string> = {
  'ecam-alerts': 'LOGBOOK ENTRY / ECAM ALERTS',
  'cabin-items': 'LOGBOOK ENTRY / CABIN ITEMS',
  'system-function': 'LOGBOOK ENTRY / SYSTEM & FUNCTION',
  keyword: 'LOGBOOK ENTRY / KEYWORDS',
  'free-text': 'LOGBOOK ENTRY / FREE TEXT',
};

/** Design choice: the length of a FREE TEXT title, one line of the field */
const FREE_TEXT_TITLE_LENGTH = 60;

/** A defect the ITEM SELECTION list offers */
interface LogbookCandidate {
  readonly text: string;
  readonly title: string;
  readonly ata: string;
  readonly ecamAlertId?: string;
  readonly cabinRef?: string;
  readonly cabinComment?: string;
}

/**
 * The ITEM SELECTION lines of standard defects.
 * @param defects the defects found
 * @returns the lines
 */
function standardCandidates(defects: readonly StandardDefect[]): LogbookCandidate[] {
  return defects.map((d) => ({ text: d.title, title: d.title, ata: d.ata }));
}

/**
 * The defect recording assistants: ECAM ALERTS (the alerts of the flight, newest first, repeated alerts kept), CABIN
 * ITEMS (validate or refuse what the cabin crew submitted), SYSTEM & FUNCTION and KEYWORD (standard defect database)
 * and FREE TEXT.
 */
export class OitAvncsLogbookAssistant extends DestroyableComponent<OitAvncsLogbookAssistantProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly idPrefix = `${this.props.uiService.captOrFo}_logbook_${this.props.kind}`;

  /** What the crew typed and selected stays until the LOGBOOK application closes */
  private readonly drafts = this.props.container.ansu.pageDrafts;
  private readonly draftsPage = `${LOGBOOK_URI.entry}/${this.props.kind}`;

  private readonly pilotComment = this.drafts.field<string | null>(this.draftsPage, 'pilotComment', null);
  private readonly storeTarget = this.drafts.field<number | null>(this.draftsPage, 'storeTarget', null);

  // SYSTEM & FUNCTION
  private readonly systems = defectSystems();
  private readonly systemIndex = this.drafts.field<number | null>(this.draftsPage, 'systemIndex', null);
  private readonly functionIndex = this.drafts.field<number | null>(this.draftsPage, 'functionIndex', null);
  private readonly allocationIndex = this.drafts.field<number | null>(this.draftsPage, 'allocationIndex', null);
  private readonly functionValues = ArraySubject.create<string>(this.functionsOf(this.systemIndex.get()));
  private readonly allocationValues = ArraySubject.create<string>(
    this.allocationsOf(this.systemIndex.get(), this.functionIndex.get()),
  );
  private readonly functionDisabled = this.systemIndex.map((i) => i === null);
  private readonly allocationDisabled = this.functionIndex.map((i) => i === null);

  // KEYWORD
  private readonly keywords = this.drafts.field<string | null>(this.draftsPage, 'keywords', null);
  private readonly searchedKeywords = this.drafts.field<string | null>(this.draftsPage, 'searchedKeywords', null);

  // FREE TEXT
  private readonly freeTextTitle = this.drafts.field<string | null>(this.draftsPage, 'freeTextTitle', null);

  private readonly candidates = this.candidatesOf(this.props.kind);

  private readonly candidateTexts = this.candidates.map((c) => c.map((x) => x.text));

  /** The ITEM SELECTION, kept by its text: the line moves when an ECAM alert or a cabin item arrives meanwhile */
  private readonly selectedItem = this.drafts.field<string | null>(this.draftsPage, 'selectedItem', null);
  private readonly selectedIndex = Subject.create<number | null>(
    selectionIndex(this.candidateTexts.get(), this.selectedItem.get()),
  );

  private readonly resultsText = MappedSubject.create(
    ([candidates, searched]) => (searched === null ? '' : `${candidates.length}`),
    this.candidates,
    this.searchedKeywords,
  );

  private readonly selected = MappedSubject.create(
    ([candidates, index]) => (index !== null ? candidates[index] ?? null : null),
    this.candidates,
    this.selectedIndex,
  );

  private readonly cabinCommentText = this.selected.map((c) => c?.cabinComment ?? '');

  private readonly hasDefect = MappedSubject.create(
    ([selected, title]) => (this.props.kind === 'free-text' ? !!title && title.trim() !== '' : selected !== null),
    this.selected,
    this.freeTextTitle,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.candidates,
      this.functionDisabled,
      this.allocationDisabled,
      this.candidateTexts,
      this.resultsText,
      this.selected,
      this.cabinCommentText,
      this.hasDefect,
      this.selected.sub((candidate) => this.selectedItem.set(candidate?.text ?? null)),
      this.systemIndex.sub((i) => {
        this.functionIndex.set(null);
        this.functionValues.set(this.functionsOf(i));
      }),
      this.functionIndex.sub((i) => {
        this.allocationIndex.set(null);
        this.allocationValues.set(this.allocationsOf(this.systemIndex.get(), i));
      }),
    );
  }

  private functionsOf(system: number | null): string[] {
    return system === null ? [] : defectFunctions(this.systems[system]);
  }

  private allocationsOf(system: number | null, fn: number | null): string[] {
    if (system === null || fn === null) {
      return [];
    }
    const functions = this.functionsOf(system);
    return fn < functions.length ? defectAllocations(this.systems[system], functions[fn]) : [];
  }

  private candidatesOf(kind: LogbookAssistantKind): MappedSubscribable<readonly LogbookCandidate[]> {
    switch (kind) {
      case 'ecam-alerts':
        return this.store.ecamAlerts.map((alerts) =>
          alerts.map((a) => ({
            text: `${formatLogbookMinutes(minutesOfDay(a.time))}  ${a.title}`,
            title: a.title,
            ata: ecamAlertAta(a.id),
            ecamAlertId: a.id,
          })),
        );
      case 'cabin-items':
        return this.store.state.map((s) =>
          itemsIn(s, 'cabin-submitted').map((i) => ({
            text: i.title,
            title: i.title,
            ata: i.ata,
            cabinRef: i.ref,
            cabinComment: i.cabinComment,
          })),
        );
      case 'system-function':
        return MappedSubject.create(
          ([system, fn, allocation]) =>
            standardCandidates(
              defectsBySystem(
                system !== null ? this.systems[system] : null,
                fn !== null ? this.functionValues.tryGet(fn) ?? null : null,
                allocation !== null ? this.allocationValues.tryGet(allocation) ?? null : null,
              ),
            ),
          this.systemIndex,
          this.functionIndex,
          this.allocationIndex,
        );
      case 'keyword':
        return this.searchedKeywords.map((k) => standardCandidates(k ? searchDefects(k) : []));
      case 'free-text':
        // FREE TEXT has no ITEM SELECTION list
        return this.freeTextTitle.map((): readonly LogbookCandidate[] => []);
    }
  }

  private onStore(target: LogbookStoreTarget): void {
    const comment = this.pilotComment.get() ?? '';
    const defectTarget = target === 'temporary' ? 'temporary' : 'open';
    if (this.props.kind === 'free-text') {
      this.store.recordDefect({ title: this.freeTextTitle.get() ?? '', ata: '', pilotComment: comment }, defectTarget);
      this.freeTextTitle.set(null);
      return;
    }
    const candidate = this.selected.get();
    if (!candidate) {
      return;
    }
    if (candidate.cabinRef !== undefined) {
      const ref = candidate.cabinRef;
      this.store.change((s) => validateCabinItem(s, ref, target === 'cabin-open' ? 'cabin-open' : 'open', comment));
    } else {
      this.store.recordDefect(
        {
          title: candidate.title,
          ata: candidate.ata,
          pilotComment: comment,
          ecamAlertId: candidate.ecamAlertId ?? null,
        },
        defectTarget,
      );
    }
    this.selectedIndex.set(null);
  }

  private dropdown(
    label: string,
    values: ArraySubject<string>,
    index: Subject<number | null>,
    suffix: string,
    disabled?: Subscribable<boolean>,
  ): VNode {
    return (
      <>
        <div class="oit-logbook-label" style="width: 170px;">
          {label}
        </div>
        <DropdownMenu
          values={values}
          selectedIndex={index}
          idPrefix={`${this.idPrefix}_${suffix}`}
          freeTextAllowed={false}
          disabled={disabled}
          containerStyle="width: 360px;"
          hEventConsumer={this.props.container.hEventConsumer}
          interactionMode={this.props.container.interactionMode}
        />
      </>
    );
  }

  render(): VNode {
    const kind = this.props.kind;
    return (
      <div class="oit-logbook-frame">
        <span class="oit-logbook-frame-title">{TITLES[kind]}</span>
        {kind === 'system-function' && (
          <div class="oit-logbook-column">
            <div class="oit-logbook-row">
              {this.dropdown('SYSTEM', ArraySubject.create(this.systems), this.systemIndex, 'system')}
              {this.dropdown('FUNCTION', this.functionValues, this.functionIndex, 'function', this.functionDisabled)}
            </div>
            <div class="oit-logbook-row" style="margin-top: 10px;">
              {this.dropdown(
                'ALLOCATION',
                this.allocationValues,
                this.allocationIndex,
                'allocation',
                this.allocationDisabled,
              )}
            </div>
          </div>
        )}
        {kind === 'keyword' && (
          <div class="oit-logbook-column">
            <div class="oit-logbook-row">
              <div class="oit-logbook-label" style="width: 230px;">
                KEYWORD(S)
              </div>
              <LogbookField<string>
                container={this.props.container}
                format={new FreeTextFormat(40)}
                value={this.keywords}
                onModified={(v) => this.keywords.set(v)}
                width={740}
                alignText="flex-start"
              />
              <Button
                label="SEARCH"
                onClick={() => {
                  this.selectedIndex.set(null);
                  this.searchedKeywords.set(this.keywords.get() ?? '');
                }}
                containerStyle="margin-left: 12px;"
              />
            </div>
            <div class="oit-logbook-row" style="margin-top: 10px;">
              <div class="oit-logbook-label" style="width: 230px;">
                RESULTS:
              </div>
              <span>{this.resultsText}</span>
            </div>
          </div>
        )}
        {kind === 'free-text' ? (
          <div class="oit-logbook-row" style="margin-top: 10px;">
            <div class="oit-logbook-label" style="width: 230px;">
              TITLE
            </div>
            <LogbookField<string>
              container={this.props.container}
              format={new FreeTextFormat(FREE_TEXT_TITLE_LENGTH)}
              value={this.freeTextTitle}
              onModified={(v) => this.freeTextTitle.set(v)}
              width={900}
              alignText="flex-start"
            />
          </div>
        ) : (
          <div class="oit-logbook-row" style="margin-top: 16px; align-items: flex-start;">
            <div class="oit-logbook-label" style="width: 230px;">
              ITEM SELECTION
            </div>
            <LogbookSelectionList
              items={this.candidateTexts}
              selectedIndex={this.selectedIndex}
              style="width: 900px; height: 230px;"
            />
          </div>
        )}
        {kind === 'cabin-items' && (
          <div class="oit-logbook-row" style="margin-top: 16px; align-items: flex-start;">
            <div class="oit-logbook-label" style="width: 230px;">
              CABIN COMMENT
            </div>
            <LogbookValueBox value={this.cabinCommentText} width="900px" multiline />
          </div>
        )}
        <LogbookDefectStorePanel
          container={this.props.container}
          idPrefix={`${this.idPrefix}_store`}
          targets={kind === 'cabin-items' ? ['open', 'cabin-open'] : ['open', 'temporary']}
          target={this.storeTarget}
          pilotComment={this.pilotComment}
          hasDefect={this.hasDefect}
          onStore={(target) => this.onStore(target)}
        />
        <div style="flex: 1;" />
        <div class="oit-logbook-bottom-buttons">
          <Button label="RETURN" onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.entry)} />
          <Button
            label="STATUS"
            onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)}
            buttonStyle="margin-left: 10px;"
          />
        </div>
      </div>
    );
  }
}
