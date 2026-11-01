// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DocumentNode, DocumentTreeIndex, DocumentTreeRow, unitIdOfNoteRow } from '../Pages/FltOps/Shared/DocumentTree';
import { EffColour, FlightFolder } from './FlightFolder';
import { EffNode } from './FlightFolderDocuments';

/** The id of the root of the navigation tree: the folder itself */
export const FLIGHT_FOLDER_ROOT_ID = 'root';

/** A line of the navigation tree of the flight folder */
export interface EffTreeRow extends DocumentTreeRow {
  readonly colour: EffColour;
  /** (NEW): a document not read yet, or a folder holding one */
  readonly isNew: boolean;
  /** The document is the active flight plan: its title has a green background */
  readonly activePlan: boolean;
}

/**
 * @param folder the flight folder
 * @returns the index of its navigation tree, the Recycle Bin last
 */
export function flightFolderIndex(folder: FlightFolder): DocumentTreeIndex {
  const convert = (node: EffNode): DocumentNode => ({
    id: node.id,
    title: node.name,
    kind: node.doc ? 'unit' : 'folder',
    children: node.children?.map(convert),
  });
  return new DocumentTreeIndex({
    id: FLIGHT_FOLDER_ROOT_ID,
    title: folder.label,
    kind: 'folder',
    children: folder.visibleTree().map(convert),
  });
}

/**
 * @param nodes the nodes to search, with their children
 * @param id the id of the node
 * @returns the node, null when it is not in them
 */
function findNode(nodes: readonly EffNode[], id: string): EffNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const inside = findNode(node.children ?? [], id);
    if (inside !== null) {
      return inside;
    }
  }
  return null;
}

/**
 * @param folder the flight folder
 * @param selectedId the selected line of the tree, null for none
 * @param expanded the folders the crew opened
 * @returns the lines of the tree with their colours, (NEW) marks and the active plan
 */
export function flightFolderTreeRows(
  folder: FlightFolder,
  selectedId: string | null,
  expanded: ReadonlySet<string>,
): EffTreeRow[] {
  const tree = folder.visibleTree();
  const activePlanId = folder.selectedPlan();
  const notes = new Set<string>();
  folder.documentOrder().forEach((id) => {
    if (folder.state(id)?.note) {
      notes.add(id);
    }
  });
  // The note line of a document is selected like a document: its folders open, and the line itself is highlighted
  const noteOf = selectedId !== null ? unitIdOfNoteRow(selectedId) : null;
  return flightFolderIndex(folder)
    .rows({ mode: 'tree', expanded, selectedId: noteOf ?? selectedId, notes })
    .map((row) => {
      const node = findNode(tree, row.id);
      const colour = node ? folder.colourOf(node) : 'white';
      const isNew = node ? folder.isNew(node) : false;
      const activePlan = row.id === activePlanId;
      return {
        ...row,
        selected: noteOf !== null ? row.id === selectedId : row.selected,
        colour,
        isNew,
        activePlan,
        // What the shared tree view draws: the note line is just called Note, a folder other than the root is bold
        title: row.kind === 'note' ? 'Note' : row.title,
        titleClass: `${colour}${row.kind === 'folder' && row.id !== FLIGHT_FOLDER_ROOT_ID ? ' folder' : ''}`,
        rowClass: activePlan ? 'active-plan' : undefined,
        badge: isNew ? '(NEW)' : undefined,
      };
    });
}

/**
 * @param folder the flight folder
 * @param selectedId the selected line of the tree
 * @returns the document the document window shows: the selected one, or the one of the selected note line; null when a
 * folder is selected
 */
export function selectedDocumentId(folder: FlightFolder, selectedId: string | null): string | null {
  if (selectedId === null) {
    return null;
  }
  const unit = unitIdOfNoteRow(selectedId) ?? selectedId;
  return folder.document(unit) !== null ? unit : null;
}

/**
 * @param folder the flight folder
 * @param selectedId the selected line of the tree
 * @returns the names and ids of what a selected folder holds, for the document window; empty for a document
 */
export function folderListing(folder: FlightFolder, selectedId: string | null): { id: string; name: string }[] {
  const index = flightFolderIndex(folder);
  const id = selectedId !== null && index.has(selectedId) ? selectedId : FLIGHT_FOLDER_ROOT_ID;
  const node = index.node(id);
  if (!node || node.kind === 'unit') {
    return [];
  }
  return (node.children ?? []).map((child) => ({ id: child.id, name: child.title }));
}
