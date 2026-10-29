// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A folder or a unit (a page of text) of a document tree: the manuals of the OPS LIBRARY, the FLT FOLDER documents */
export interface DocumentNode {
  /** Unique in the tree and stable between sessions: bookmarks and notes refer to it */
  readonly id: string;
  readonly title: string;
  readonly kind: 'folder' | 'unit';
  readonly children?: readonly DocumentNode[];
}

/** How the navigation tree shows the selection: only its parents (path), or the whole tree with folders to open */
export type DocumentTreeMode = 'path' | 'tree';

/** A line of the navigation tree */
export interface DocumentTreeRow {
  readonly id: string;
  readonly title: string;
  readonly depth: number;
  /** A node of the tree, or the note of a unit (a child line of the unit that has a note) */
  readonly kind: 'folder' | 'unit' | 'note';
  /** A folder with children shows a + or - icon in tree mode */
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly selected: boolean;
  /** The node holds a search hit (green line) */
  readonly hit: boolean;
  /** A style class for the whole line, for a tree that marks some of its lines (the active flight plan) */
  readonly rowClass?: string;
  /** A style class for the title, for a tree that colours its lines by state */
  readonly titleClass?: string;
  /** A short mark before the title, like (NEW) */
  readonly badge?: string;
}

/** What the rows of the tree depend on */
export interface DocumentTreeRowOptions {
  readonly mode: DocumentTreeMode;
  /** The folders open in tree mode */
  readonly expanded: ReadonlySet<string>;
  readonly selectedId: string | null;
  /** The ids that hold a search hit: the units found and their parents */
  readonly hits?: ReadonlySet<string>;
  /** The units that have a note */
  readonly notes?: ReadonlySet<string>;
}

const NOTE_ROW_SUFFIX = '#note';

/**
 * @param unitId a unit
 * @returns the id of the note line under the unit
 */
export function noteRowId(unitId: string): string {
  return `${unitId}${NOTE_ROW_SUFFIX}`;
}

/**
 * @param rowId the id of a line of the tree
 * @returns the unit id of a note line, null when the line is not a note
 */
export function unitIdOfNoteRow(rowId: string): string | null {
  return rowId.endsWith(NOTE_ROW_SUFFIX) ? rowId.substring(0, rowId.length - NOTE_ROW_SUFFIX.length) : null;
}

/** Lookups on a document tree: parents, tree order, neighbours, and the lines of the navigation tree */
export class DocumentTreeIndex {
  private readonly nodes = new Map<string, DocumentNode>();

  private readonly parents = new Map<string, string>();

  private readonly unitOrder: DocumentNode[] = [];

  constructor(public readonly root: DocumentNode) {
    this.add(root, null);
  }

  private add(node: DocumentNode, parentId: string | null): void {
    this.nodes.set(node.id, node);
    if (parentId !== null) {
      this.parents.set(node.id, parentId);
    }
    if (node.kind === 'unit') {
      this.unitOrder.push(node);
    }
    for (const child of node.children ?? []) {
      this.add(child, node.id);
    }
  }

  public node(id: string): DocumentNode | undefined {
    return this.nodes.get(id);
  }

  public has(id: string): boolean {
    return this.nodes.has(id);
  }

  public parentId(id: string): string | null {
    return this.parents.get(id) ?? null;
  }

  /**
   * @param id a node of the tree
   * @returns the nodes from the root down to the node (inclusive); empty for an unknown id
   */
  public pathTo(id: string): DocumentNode[] {
    const path: DocumentNode[] = [];
    let current: string | null = this.nodes.has(id) ? id : null;
    while (current !== null) {
      path.unshift(this.nodes.get(current) as DocumentNode);
      current = this.parentId(current);
    }
    return path;
  }

  /** @returns the units in tree order */
  public units(): readonly DocumentNode[] {
    return this.unitOrder;
  }

  /**
   * @param id a node of the tree
   * @returns the unit after the given one in tree order (across folders), null at the end
   */
  public nextUnit(id: string): DocumentNode | null {
    return this.neighbourUnit(id, 1);
  }

  /**
   * @param id a node of the tree
   * @returns the unit before the given one in tree order, null at the start
   */
  public previousUnit(id: string): DocumentNode | null {
    return this.neighbourUnit(id, -1);
  }

  /**
   * The first unit at or under a node.
   * @param id a folder or a unit
   * @returns the unit, null for an empty folder
   */
  public firstUnitOf(id: string): DocumentNode | null {
    return this.unitsUnder(id)[0] ?? null;
  }

  /**
   * The units under a folder, or the unit itself.
   * @param id a node
   * @returns the units in tree order
   */
  public unitsUnder(id: string): DocumentNode[] {
    const node = this.nodes.get(id);
    if (node === undefined) {
      return [];
    }
    if (node.kind === 'unit') {
      return [node];
    }
    return (node.children ?? []).reduce<DocumentNode[]>((all, child) => all.concat(this.unitsUnder(child.id)), []);
  }

  /**
   * The folders to open so that a node is visible in tree mode.
   * @param id a node
   * @returns the parents of the node
   */
  public parentsOf(id: string): string[] {
    return this.pathTo(id)
      .map((node) => node.id)
      .filter((parent) => parent !== id);
  }

  /**
   * @param unitIds the units that hold a search hit
   * @returns the units and their parents: the green lines of a search in the tree
   */
  public hitSet(unitIds: readonly string[]): Set<string> {
    const hits = new Set<string>();
    for (const id of unitIds) {
      for (const node of this.pathTo(id)) {
        hits.add(node.id);
      }
    }
    return hits;
  }

  /**
   * The lines of the navigation tree.
   * Path mode: the parents of the selection down to it, and the contents of a selected folder. Tree mode: the root and
   * the contents of every open folder (the parents of the selection are open).
   * @param options mode, open folders, selection, hits and notes
   * @returns the lines, top down
   */
  public rows(options: DocumentTreeRowOptions): DocumentTreeRow[] {
    const rows: DocumentTreeRow[] = [];
    const selected = options.selectedId !== null && this.has(options.selectedId) ? options.selectedId : null;
    const open = new Set(options.expanded);
    open.add(this.root.id);
    if (selected !== null) {
      for (const parent of this.parentsOf(selected)) {
        open.add(parent);
      }
    }
    // Without a selection the path mode shows the contents of the root
    const focus = selected ?? this.root.id;
    const onPath = new Set(this.pathTo(focus).map((node) => node.id));

    const addRows = (node: DocumentNode, depth: number): void => {
      const children = node.children ?? [];
      const expandable = options.mode === 'tree' && node.kind === 'folder' && children.length > 0;
      const expanded = expandable && open.has(node.id);
      rows.push({
        id: node.id,
        title: node.title,
        depth,
        kind: node.kind,
        expandable,
        expanded,
        selected: node.id === selected,
        hit: options.hits?.has(node.id) ?? false,
      });
      if (node.kind === 'unit' && options.notes?.has(node.id)) {
        rows.push({
          id: noteRowId(node.id),
          title: node.title,
          depth: depth + 1,
          kind: 'note',
          expandable: false,
          expanded: false,
          selected: false,
          hit: false,
        });
      }
      if (options.mode === 'tree') {
        if (expanded) {
          children.forEach((child) => addRows(child, depth + 1));
        }
        return;
      }
      const next = children.find((child) => onPath.has(child.id));
      if (next !== undefined) {
        addRows(next, depth + 1);
      } else if (node.id === focus) {
        children.forEach((child) => addRows(child, depth + 1));
      }
    };
    addRows(this.root, 0);
    return rows;
  }

  private neighbourUnit(id: string, step: 1 | -1): DocumentNode | null {
    const index = this.unitOrder.findIndex((unit) => unit.id === id);
    if (index < 0) {
      return null;
    }
    return this.unitOrder[index + step] ?? null;
  }
}
