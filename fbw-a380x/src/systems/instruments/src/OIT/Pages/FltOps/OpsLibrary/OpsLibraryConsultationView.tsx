//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { DocumentTreeRow, unitIdOfNoteRow } from '../Shared/DocumentTree';
import { DocumentTreeView } from '../Shared/DocumentTreeView';
import { WordSearchBox } from '../Shared/WordSearchBox';
import { SearchQuery } from '../Shared/DocumentSearch';
import { DocumentNoteField } from '../Shared/DocumentNoteField';
import {
  OPS_LAYERS,
  OpsLayer,
  effectiveLayer,
  highestLayer,
  lowestLayer,
  subTopics,
} from '../../../System/OpsLibrary/OpsLibraryContent';
import { OpsLibraryUnitView } from './OpsLibraryUnitView';
import { OpsLibraryViewProps } from './OpsLibraryContext';
import './ops-library.scss';

/** The small toolbar buttons of the line 2 */
const TOOLBAR_BUTTON_STYLE = 'padding: 0 8px; font-size: 20px; min-width: 0;';

/**
 * The consultation of a manual: the toolbar of the second line, the navigation tree on the left, the unit on the right
 * with the optional search area and note field.
 */
export class OpsLibraryConsultationView extends DestroyableComponent<OpsLibraryViewProps> {
  private readonly session = this.props.ctx.session;

  private readonly consultation = this.session.consultation;

  private readonly catalog = this.session.catalog;

  private readonly userData = this.session.userData;

  private readonly unitViewRef = FSComponent.createRef<OpsLibraryUnitView>();

  private readonly breadcrumbRef = FSComponent.createRef<HTMLDivElement>();

  private readonly docRefShown = Subject.create(false);

  private readonly searchStatus = Subject.create('');

  private readonly manual = this.consultation.manualId.map((id) => (id !== null ? this.catalog.manual(id) : undefined));

  private readonly manualTitle = this.manual.map((m) => m?.title ?? '');

  private readonly manualRevision = this.manual.map((m) => (m !== undefined ? `Revision : ${m.revision}` : ''));

  private readonly treeModeIndex = this.consultation.treeMode.map((mode) => (mode === 'path' ? 0 : 1));

  private readonly treeToggleLabel = this.consultation.treeHidden.map((hidden) => (hidden ? 'SHOW TREE' : 'HIDE TREE'));

  private readonly searchAreaHidden = this.consultation.searchAreaShown.map((shown) => !shown);

  private readonly noteUnitId = MappedSubject.create(
    ([nodeId, noteShown]) => {
      const node = nodeId !== null ? this.catalog.find(nodeId)?.unit : undefined;
      return noteShown && node?.kind === 'unit' ? node.id : null;
    },
    this.consultation.nodeId,
    this.consultation.noteShown,
  );

  private readonly noteHidden = this.noteUnitId.map((id) => id === null);

  /** The unit open now, folders count as none */
  private readonly openUnit = MappedSubject.create(([nodeId]) => {
    const node = nodeId !== null ? this.catalog.find(nodeId)?.unit : undefined;
    return node?.kind === 'unit' ? node : undefined;
  }, this.consultation.nodeId);

  private readonly noUnitOpen = this.openUnit.map((unit) => unit === undefined);

  private readonly previousUnitDisabled = MappedSubject.create(
    () => !this.consultation.hasPreviousUnit(),
    this.consultation.nodeId,
  );

  private readonly nextUnitDisabled = MappedSubject.create(
    () => !this.consultation.hasNextUnit(),
    this.consultation.nodeId,
  );

  private readonly backDisabled = this.consultation.canGoBack.map((can) => !can);

  private readonly forwardDisabled = this.consultation.canGoForward.map((can) => !can);

  private readonly subTopicItems = MappedSubject.create(
    ([unit, layer]): ButtonMenuItem[] => {
      const blocks = unit?.blocks ?? [];
      const shownLayer = effectiveLayer(blocks, layer);
      return subTopics(blocks)
        .filter((topic) => blocks[topic.blockIndex].layer <= shownLayer)
        .map((topic) => ({
          label: topic.title,
          action: () => this.unitViewRef.instance.scrollToBlock(topic.blockIndex),
        }));
    },
    this.openUnit,
    this.consultation.layer,
  );

  private readonly subTopicsDisabled = this.subTopicItems.map((items) => items.length === 0);

  private readonly infoItems = this.docRefShown.map((shown): ButtonMenuItem[] => [
    { label: `${shown ? '[X]' : '[ ]'} DOC REF`, action: () => this.docRefShown.set(!this.docRefShown.get()) },
    { label: '[ ] REV MARKS', action: () => {}, disabled: true },
    { label: '[ ] CRM', action: () => {}, disabled: true },
  ]);

  private readonly bookmarkItems = MappedSubject.create(
    ([unit]): ButtonMenuItem[] => [
      {
        label: 'ADD TO LIST',
        disabled: unit === undefined,
        action: () => unit !== undefined && this.userData.addBookmark(unit.id),
      },
      { label: 'ORGANIZE', action: () => this.session.showBookmarksTab() },
      ...this.userData.bookmarkIds().map((id): ButtonMenuItem => {
        const found = this.catalog.find(id);
        return {
          label: found?.unit.title ?? '(not found)',
          disabled: found === undefined,
          action: () => this.consultation.openUnit(id),
        };
      }),
    ],
    this.openUnit,
    this.userData.version,
  );

  private readonly layerSelected = OPS_LAYERS.map((layer) => this.consultation.layer.map((chosen) => chosen === layer));

  private readonly layerDisabled = OPS_LAYERS.map((layer) =>
    this.openUnit.map(
      (unit) =>
        unit !== undefined &&
        (unit.blocks ?? []).length > 0 &&
        (layer > highestLayer(unit.blocks ?? []) || layer < lowestLayer(unit.blocks ?? [])),
    ),
  );

  private readonly ecamListItems = this.openUnit.map((unit): ButtonMenuItem[] => {
    // The ECAM alerts linked to an MMEL item
    const alertId = unit?.id.startsWith('mmel/') ? unit.ecamId : undefined;
    const procedure = alertId !== undefined ? this.catalog.find(`ecam/${alertId}`) : undefined;
    return procedure !== undefined
      ? [{ label: procedure.unit.title, action: () => this.consultation.openUnit(procedure.unit.id) }]
      : [];
  });

  private readonly ecamListDisabled = this.ecamListItems.map((items) => items.length === 0);

  private onTreeSelect(row: DocumentTreeRow): void {
    const noteUnit = unitIdOfNoteRow(row.id);
    if (noteUnit !== null) {
      this.consultation.select(noteUnit);
      this.consultation.noteShown.set(true);
      return;
    }
    this.consultation.select(row.id);
  }

  private showSearchHits(hits: readonly { id: string }[], query: SearchQuery): void {
    const count = this.consultation.showSearchHitsInManual(hits, query);
    this.searchStatus.set(`${count} HIT${count === 1 ? '' : 'S'} IN THIS MANUAL`);
  }

  private rebuildBreadcrumb(): void {
    const container = this.breadcrumbRef.instance;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    const manualId = this.consultation.manualId.get();
    const nodeId = this.consultation.nodeId.get();
    const index = manualId !== null ? this.catalog.index(manualId) : undefined;
    if (index === undefined || nodeId === null) {
      return;
    }
    container.appendChild(document.createTextNode('Path : '));
    index.pathTo(nodeId).forEach((node, position) => {
      if (position > 0) {
        container.appendChild(document.createTextNode(' > '));
      }
      const link = document.createElement('span');
      link.className = 'oit-ops-link';
      link.textContent = node.title;
      link.addEventListener('click', () => this.consultation.select(node.id));
      container.appendChild(link);
    });
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.manual,
      this.manualTitle,
      this.manualRevision,
      this.treeModeIndex,
      this.treeToggleLabel,
      this.searchAreaHidden,
      this.noteUnitId,
      this.noteHidden,
      this.openUnit,
      this.noUnitOpen,
      this.previousUnitDisabled,
      this.nextUnitDisabled,
      this.backDisabled,
      this.forwardDisabled,
      this.subTopicItems,
      this.subTopicsDisabled,
      this.infoItems,
      this.bookmarkItems,
      this.ecamListItems,
      this.ecamListDisabled,
      ...this.layerSelected,
      ...this.layerDisabled,
      this.consultation.nodeId.sub(() => this.rebuildBreadcrumb(), true),
      this.consultation.manualId.sub(() => this.rebuildBreadcrumb()),
    );
  }

  private layerButton(layer: OpsLayer): VNode {
    const position = OPS_LAYERS.indexOf(layer);
    return (
      <Button
        label={layer.toFixed(0)}
        selected={this.layerSelected[position]}
        disabled={this.layerDisabled[position]}
        onClick={() => this.consultation.setLayer(layer)}
        buttonStyle={TOOLBAR_BUTTON_STYLE}
      />
    );
  }

  render(): VNode {
    return (
      <div class="oit-ops-consult">
        <div class="oit-ops-toolbar">
          <Button
            label="←"
            disabled={this.backDisabled}
            onClick={() => this.consultation.back()}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label="→"
            disabled={this.forwardDisabled}
            onClick={() => this.consultation.forward()}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label={this.treeToggleLabel}
            onClick={() => this.consultation.treeHidden.set(!this.consultation.treeHidden.get())}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label="<<"
            disabled={this.previousUnitDisabled}
            onClick={() => this.consultation.previousUnit()}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label=">>"
            disabled={this.nextUnitDisabled}
            onClick={() => this.consultation.nextUnit()}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label="SUB-TOPICS"
            idPrefix="ops-sub-topics"
            menuItems={this.subTopicItems}
            disabled={this.subTopicsDisabled}
            onClick={() => {}}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label="INFO"
            idPrefix="ops-info"
            menuItems={this.infoItems}
            disabled={this.noUnitOpen}
            onClick={() => {}}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          {OPS_LAYERS.map((layer) => this.layerButton(layer))}
          <Button
            label="BOOKMARKS"
            idPrefix="ops-bookmarks"
            menuItems={this.bookmarkItems}
            onClick={() => {}}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label="NOTE"
            disabled={this.noUnitOpen}
            onClick={() => this.consultation.noteShown.set(!this.consultation.noteShown.get())}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label="WHAT IF?"
            idPrefix="ops-what-if"
            menuItems={Subject.create<ButtonMenuItem[]>([])}
            disabled={true}
            onClick={() => {}}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label="ECAM LIST"
            idPrefix="ops-ecam-list"
            menuItems={this.ecamListItems}
            disabled={this.ecamListDisabled}
            onClick={() => {}}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
          <Button
            label="SEARCH"
            onClick={() => this.consultation.searchAreaShown.set(!this.consultation.searchAreaShown.get())}
            buttonStyle={TOOLBAR_BUTTON_STYLE}
          />
        </div>
        <div class="oit-ops-body">
          <div class={{ 'oit-ops-left': true, hidden: this.consultation.treeHidden }}>
            <div class="oit-ops-manual-title">{this.manualTitle}</div>
            <div class="oit-ops-revision">{this.manualRevision}</div>
            <DocumentTreeView
              rows={this.consultation.rows}
              onSelect={(row) => this.onTreeSelect(row)}
              onToggle={(row) => this.consultation.toggleFolder(row.id)}
            />
            <div class="oit-ops-tree-mode">
              <RadioButtonGroup
                values={['Path', 'Tree']}
                selectedIndex={this.treeModeIndex}
                idPrefix="ops-tree-mode"
                onModified={(index) => this.consultation.treeMode.set(index === 0 ? 'path' : 'tree')}
              />
            </div>
          </div>
          <div class="oit-ops-right">
            <div class={{ 'oit-ops-search-area': true, hidden: this.searchAreaHidden }}>
              <WordSearchBox
                container={this.props.ctx.fields}
                title="WORD SEARCH"
                search={(query) => this.session.wordSearchIndex().search(query)}
                onResults={(result, query) => this.showSearchHits(result.hits, query)}
              />
              <Button
                label="×"
                onClick={() => {
                  this.consultation.closeSearch();
                  this.consultation.searchAreaShown.set(false);
                  this.searchStatus.set('');
                }}
                buttonStyle={TOOLBAR_BUTTON_STYLE}
              />
            </div>
            <div class="oit-ops-small-text">{this.searchStatus}</div>
            <div ref={this.breadcrumbRef} class="oit-ops-breadcrumb" />
            <OpsLibraryUnitView
              ref={this.unitViewRef}
              session={this.session}
              aircraftStatus={this.props.ctx.aircraftStatus}
              logbookRows={this.props.ctx.logbookRows}
              docRefShown={this.docRefShown}
            />
            <div class={{ hidden: this.noteHidden }}>
              <DocumentNoteField
                container={this.props.ctx.fields}
                notes={this.userData.notes}
                unitId={this.noteUnitId}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}
