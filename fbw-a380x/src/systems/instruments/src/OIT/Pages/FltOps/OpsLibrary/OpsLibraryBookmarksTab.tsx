//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DocumentTreeRow } from '../Shared/DocumentTree';
import { DocumentTreeView } from '../Shared/DocumentTreeView';
import { OpsLibraryViewProps } from './OpsLibraryContext';
import './ops-library.scss';

const FOLDER_PREFIX = 'folder:';

/** The BOOKMARKS tab: the Trace, Interruption, Airline and Pilot folders; CONSULT, DELETE and CLEAR */
export class OpsLibraryBookmarksTab extends DestroyableComponent<OpsLibraryViewProps> {
  private readonly session = this.props.ctx.session;

  private readonly selectedId = Subject.create<string | null>(null);

  /** The folders expand to their units; every line id is the folder and unit it shows */
  private readonly rows = MappedSubject.create(
    ([selected]): DocumentTreeRow[] => {
      const rows: DocumentTreeRow[] = [];
      for (const folder of this.session.userData.folders()) {
        const folderId = `${FOLDER_PREFIX}${folder.name}`;
        rows.push({
          id: folderId,
          title: folder.name,
          depth: 0,
          kind: 'folder',
          expandable: false,
          expanded: true,
          selected: selected === folderId,
          hit: false,
        });
        for (const unitId of folder.unitIds) {
          const rowId = `${folder.name}|${unitId}`;
          const found = this.session.catalog.find(unitId);
          rows.push({
            id: rowId,
            title: found !== undefined ? this.titleWithContext(found.manualId, found.unit.id) : `${unitId} (not found)`,
            depth: 1,
            kind: 'unit',
            expandable: false,
            expanded: false,
            selected: selected === rowId,
            hit: false,
          });
        }
      }
      return rows;
    },
    this.selectedId,
    this.session.userData.version,
  );

  /**
   * Several units share a title ("What it is for"): the folder they are in tells them apart
   * @param manualId the manual of the unit
   * @param unitId the unit
   * @returns the title with its folder
   */
  private titleWithContext(manualId: string, unitId: string): string {
    const index = this.session.catalog.index(manualId);
    const parentId = index?.parentId(unitId);
    const parentTitle = parentId !== null && parentId !== undefined ? index?.node(parentId)?.title : undefined;
    const title = index?.node(unitId)?.title ?? unitId;
    return parentTitle !== undefined ? `${title}  (${parentTitle})` : title;
  }

  private static unitIdOfRow(rowId: string | null): string | null {
    return rowId !== null && rowId.indexOf('|') > 0 ? rowId.substring(rowId.indexOf('|') + 1) : null;
  }

  private static folderOfRow(rowId: string | null): string | null {
    if (rowId === null) {
      return null;
    }
    return rowId.startsWith(FOLDER_PREFIX)
      ? rowId.substring(FOLDER_PREFIX.length)
      : rowId.substring(0, rowId.indexOf('|'));
  }

  private readonly consultDisabled = MappedSubject.create(
    ([selected]) => {
      const unitId = OpsLibraryBookmarksTab.unitIdOfRow(selected);
      return unitId === null || this.session.catalog.find(unitId) === undefined;
    },
    this.selectedId,
    this.session.userData.version,
  );

  private readonly deleteDisabled = this.selectedId.map(
    (selected) =>
      OpsLibraryBookmarksTab.unitIdOfRow(selected) === null || OpsLibraryBookmarksTab.folderOfRow(selected) !== 'Pilot',
  );

  private readonly clearDisabled = this.selectedId.map(
    (selected) => OpsLibraryBookmarksTab.folderOfRow(selected) !== 'Pilot',
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(this.rows, this.consultDisabled, this.deleteDisabled, this.clearDisabled);
  }

  private consult(): void {
    const unitId = OpsLibraryBookmarksTab.unitIdOfRow(this.selectedId.get());
    if (unitId !== null) {
      this.session.consultation.openUnit(unitId);
    }
  }

  private deleteSelected(): void {
    const unitId = OpsLibraryBookmarksTab.unitIdOfRow(this.selectedId.get());
    if (unitId !== null) {
      this.session.userData.deleteBookmark(unitId);
      this.selectedId.set(null);
    }
  }

  render(): VNode {
    return (
      <div class="oit-ops-tab">
        <div class="oit-ops-bookmarks">
          <div class="oit-ops-bookmarks-tree">
            <DocumentTreeView rows={this.rows} onSelect={(row) => this.selectedId.set(row.id)} onToggle={() => {}} />
          </div>
          <div class="oit-ops-bookmarks-buttons">
            <Button label="CONSULT" disabled={this.consultDisabled} onClick={() => this.consult()} />
            <Button label="DELETE" disabled={this.deleteDisabled} onClick={() => this.deleteSelected()} />
            <Button
              label="CLEAR"
              disabled={this.clearDisabled}
              onClick={() => {
                this.session.userData.clearBookmarks();
                this.selectedId.set(null);
              }}
            />
          </div>
        </div>
      </div>
    );
  }
}
