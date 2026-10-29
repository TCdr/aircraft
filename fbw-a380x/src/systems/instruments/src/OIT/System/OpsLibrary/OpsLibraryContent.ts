// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DocumentNode, DocumentTreeIndex } from '../../Pages/FltOps/Shared/DocumentTree';
import { SearchableEntry } from '../../Pages/FltOps/Shared/DocumentSearch';

/*
 * The documents of the OPS LIBRARY: the generated manuals (feature manual, simvars), the ECAM PROCEDURES built from the
 * procedures of the FWS, and the MMEL structure. Layers: layer 1 is "need to know", 2 adds "nice to know", 3 adds the
 * details; a block belongs to the lowest layer that shows it.
 */

export type OpsBlockType =
  | 'p'
  | 'ul'
  | 'steps'
  | 'table'
  | 'situations'
  | 'limits'
  | 'note'
  | 'warn'
  | 'tip'
  | 'h4'
  | 'figure';

export type OpsLayer = 1 | 2 | 3;

export const OPS_LAYERS: readonly OpsLayer[] = [1, 2, 3];

export interface OpsBlock {
  readonly t: OpsBlockType;
  readonly layer: OpsLayer;
  readonly text?: string;
  readonly items?: readonly string[];
  readonly head?: readonly string[];
  readonly rows?: readonly (readonly string[])[];
}

/** A folder or unit of a manual; units of generated manuals hold blocks, ECAM and MMEL units hold their key */
export interface OpsNode extends DocumentNode {
  readonly children?: readonly OpsNode[];
  readonly blocks?: readonly OpsBlock[];
  /** The ECAM alert whose procedure the unit shows */
  readonly ecamId?: string;
  /** The MMEL or CDL item reference of an MMEL entry */
  readonly mmelReference?: string;
}

export interface OpsManual {
  readonly id: string;
  readonly title: string;
  /** dd-Mmm-yyyy source of the revision line */
  readonly revision: string;
  /** The number of units, which CHECK compares with the content */
  readonly units: number;
  /** Checksum of the content, empty for a manual built at run time */
  readonly hash: string;
  readonly root: OpsNode;
}

/** The generated content file */
export interface OpsLibraryContentFile {
  readonly version: number;
  readonly generated: string;
  readonly manuals: readonly OpsManual[];
}

export const ECAM_MANUAL_ID = 'ecam';

export const MMEL_MANUAL_ID = 'mmel';

/**
 * The id of the MMEL entry of an ECAM alert or a deferred item reference
 * @param key an ECAM alert id or a deferred item reference
 * @returns the unit id
 */
export function mmelUnitId(key: string): string {
  return `${MMEL_MANUAL_ID}/${key}`;
}

/**
 * The id of the unit of an ECAM alert
 * @param alertId the ECAM alert id
 * @returns the unit id
 */
export function ecamUnitId(alertId: string): string {
  return `${ECAM_MANUAL_ID}/${alertId}`;
}

/** The ATA chapters of the folders of the ECAM PROCEDURES and MMEL manuals */
const ATA_CHAPTER_NAMES: Readonly<Record<string, string>> = {
  '21': 'AIR CONDITIONING',
  '22': 'AUTO FLIGHT',
  '23': 'COMMUNICATIONS',
  '24': 'ELECTRICAL POWER',
  '26': 'FIRE PROTECTION',
  '27': 'FLIGHT CONTROLS',
  '28': 'FUEL',
  '29': 'HYDRAULIC POWER',
  '30': 'ICE AND RAIN PROTECTION',
  '31': 'INDICATING / RECORDING',
  '32': 'LANDING GEAR',
  '33': 'LIGHTS',
  '34': 'NAVIGATION',
  '35': 'OXYGEN',
  '36': 'PNEUMATIC',
  '38': 'WATER / WASTE',
  '42': 'INTEGRATED MODULAR AVIONICS',
  '46': 'INFORMATION SYSTEMS',
  '49': 'AUXILIARY POWER UNIT',
  '52': 'DOORS',
  '56': 'WINDOWS',
  '70': 'ENGINE',
  '71': 'POWER PLANT',
  '72': 'ENGINE',
  '73': 'ENGINE FUEL AND CONTROL',
  '74': 'IGNITION',
  '75': 'AIR',
  '76': 'ENGINE CONTROLS',
  '77': 'ENGINE INDICATING',
  '78': 'EXHAUST',
  '79': 'OIL',
  '80': 'STARTING',
};

/**
 * @param chapter the ATA chapter, two digits
 * @returns the folder title of an ATA chapter
 */
function chapterTitle(chapter: string): string {
  const name = ATA_CHAPTER_NAMES[chapter];
  return name !== undefined ? `ATA ${chapter} ${name}` : `ATA ${chapter}`;
}

/**
 * @param alertId the ECAM alert id
 * @returns the ATA chapter (two digits) at the start of an ECAM alert id, 'XX' when it has none
 */
function ecamChapterOf(alertId: string): string {
  return /^\d{2}/.test(alertId) ? alertId.substring(0, 2) : 'XX';
}

/**
 * The text of an EWD title without its colour codes, on one line
 * @param ewdTitle the EWD title with its colour codes
 * @returns the title
 */
function plainTitle(ewdTitle: string): string {
  return (
    ewdTitle
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[^m]*m/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
  );
}

/**
 * The folders by ATA chapter of keyed units.
 * @param idPrefix the manual id
 * @param units the units with their ids, in the order they are listed
 * @returns the chapter folders, in chapter order
 */
function chapterFolders(idPrefix: string, units: readonly { chapter: string; unit: OpsNode }[]): OpsNode[] {
  const chapters = Array.from(new Set(units.map((u) => u.chapter))).sort();
  return chapters.map((chapter) => ({
    id: `${idPrefix}/chapter-${chapter}`,
    title: chapterTitle(chapter),
    kind: 'folder',
    children: units
      .filter((u) => u.chapter === chapter)
      .map((u) => u.unit)
      .sort((a, b) => a.title.localeCompare(b.title)),
  }));
}

/**
 * The ECAM PROCEDURES manual: one unit per abnormal sensed procedure of the FWS, under its ATA chapter. The unit body is
 * the procedure itself, drawn from the same data as the EWD.
 * @param procedures the abnormal procedures by alert id
 * @param revision the revision line of the manual
 * @returns the manual
 */
export function buildEcamManual(procedures: Readonly<Record<string, { title: string }>>, revision: string): OpsManual {
  const units = Object.keys(procedures).map((alertId) => ({
    chapter: ecamChapterOf(alertId),
    unit: {
      id: ecamUnitId(alertId),
      title: plainTitle(procedures[alertId].title),
      kind: 'unit',
      ecamId: alertId,
    } as OpsNode,
  }));
  return {
    id: ECAM_MANUAL_ID,
    title: 'ECAM PROCEDURES',
    revision,
    units: units.length,
    hash: '',
    root: {
      id: ECAM_MANUAL_ID,
      title: 'ECAM PROCEDURES',
      kind: 'folder',
      children: chapterFolders(ECAM_MANUAL_ID, units),
    },
  };
}

/**
 * The MMEL manual: an empty structure (Design choice: no airline MMEL text is bundled). The chapters of the ATA
 * numbering list the entries; each ECAM alert and each deferred item of the logbook has an entry with its title and
 * reference only.
 * @param ecamAlerts the ECAM alerts that link to an MMEL entry
 * @param references the deferred MEL and CDL references of the logbook, with their titles
 * @param revision the revision line of the manual
 * @returns the manual
 */
export function buildMmelManual(
  ecamAlerts: readonly { id: string; title: string }[],
  references: readonly { reference: string; title: string }[],
  revision: string,
): OpsManual {
  const entries: { chapter: string; unit: OpsNode }[] = [];
  const known = new Set<string>();
  for (const alert of ecamAlerts) {
    known.add(alert.id);
    entries.push({
      chapter: ecamChapterOf(alert.id),
      unit: { id: mmelUnitId(alert.id), title: alert.title, kind: 'unit', ecamId: alert.id, mmelReference: alert.id },
    });
  }
  for (const item of references) {
    if (item.reference === '' || known.has(item.reference)) {
      continue;
    }
    known.add(item.reference);
    const chapter = /^\d{2}/.test(item.reference) ? item.reference.substring(0, 2) : 'XX';
    entries.push({
      chapter,
      unit: {
        id: mmelUnitId(item.reference),
        title: `${item.reference} ${item.title}`.trim(),
        kind: 'unit',
        mmelReference: item.reference,
      },
    });
  }
  return {
    id: MMEL_MANUAL_ID,
    title: 'MMEL',
    revision,
    units: entries.length,
    hash: '',
    root: {
      id: MMEL_MANUAL_ID,
      title: 'MMEL',
      kind: 'folder',
      children: [
        {
          id: `${MMEL_MANUAL_ID}/entries`,
          title: 'MMEL ENTRIES',
          kind: 'folder',
          children: chapterFolders(`${MMEL_MANUAL_ID}/entries`, entries),
        },
      ],
    },
  };
}

/**
 * The blocks a layer shows: layer 2 adds to layer 1 and layer 3 adds to both.
 * @param blocks the blocks of a unit
 * @param layer the layer chosen by the crew
 * @returns the blocks to draw
 */
export function blocksOfLayer(blocks: readonly OpsBlock[], layer: OpsLayer): OpsBlock[] {
  const shown = effectiveLayer(blocks, layer);
  return blocks.filter((block) => block.layer <= shown);
}

/**
 * @param blocks the blocks of a unit
 * @returns the highest layer a unit has blocks for
 */
export function highestLayer(blocks: readonly OpsBlock[]): OpsLayer {
  return blocks.reduce<OpsLayer>((highest, block) => (block.layer > highest ? block.layer : highest), 1);
}

/**
 * @param blocks the blocks of a unit
 * @returns the lowest layer a unit has blocks for, 3 for a unit without blocks
 */
export function lowestLayer(blocks: readonly OpsBlock[]): OpsLayer {
  return blocks.reduce<OpsLayer>((lowest, block) => (block.layer < lowest ? block.layer : lowest), 3);
}

/**
 * A layer the unit does not have shows the nearest one it has: the highest above it, the lowest below it (a unit whose
 * text is all "nice to know" is not empty at layer 1).
 * @param blocks the blocks of a unit
 * @param layer the layer chosen by the crew
 * @returns the layer shown
 */
export function effectiveLayer(blocks: readonly OpsBlock[], layer: OpsLayer): OpsLayer {
  if (blocks.length === 0) {
    return layer;
  }
  const lowest = lowestLayer(blocks);
  const highest = highestLayer(blocks);
  return layer > highest ? highest : layer < lowest ? lowest : layer;
}

/** The chapters of a unit that SUB-TOPICS lists */
export interface OpsSubTopic {
  readonly title: string;
  /** Index in the blocks of the unit */
  readonly blockIndex: number;
}

/**
 * @param blocks the blocks of a unit
 * @returns the h4 headings of the unit, which SUB-TOPICS lists
 */
export function subTopics(blocks: readonly OpsBlock[]): OpsSubTopic[] {
  const topics: OpsSubTopic[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.t === 'h4' && block.text !== undefined) {
      topics.push({ title: block.text, blockIndex });
    }
  });
  return topics;
}

/**
 * @param block a block
 * @returns the text of a block as one string, for the search and PRINT
 */
function blockPlainText(block: OpsBlock): string {
  const parts: string[] = [];
  if (block.text !== undefined) {
    parts.push(block.text);
  }
  if (block.head !== undefined) {
    parts.push(block.head.join(' | '));
  }
  parts.push(...(block.items ?? []));
  for (const row of block.rows ?? []) {
    parts.push(row.join(' | '));
  }
  return parts.join('\n');
}

/**
 * @param node a node of a manual
 * @returns the text of a unit for the search and PRINT
 */
function unitPlainText(node: OpsNode): string {
  return (node.blocks ?? []).map(blockPlainText).join('\n');
}

/**
 * The page the PRINT function sends to the printer.
 * @param unit the displayed unit
 * @param layer the layer chosen by the crew
 * @param bodyLines the lines of a unit without blocks (an ECAM procedure), else empty
 * @returns the title and the text of the printout
 */
export function unitPrintout(
  unit: OpsNode,
  layer: OpsLayer,
  bodyLines: readonly string[],
): { title: string; text: string } {
  const text = [unit.title, '', ...blocksOfLayer(unit.blocks ?? [], layer).map(blockPlainText), ...bodyLines].join(
    '\n',
  );
  return { title: 'OPS LIBRARY', text };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @param isoDate a revision date, yyyy-mm-dd
 * @returns the date as the LIBRARY list shows it, e.g. 29-Oct-2026; the text itself when it is not a date
 */
export function revisionDateText(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null || Number(match[2]) < 1 || Number(match[2]) > 12) {
    return isoDate;
  }
  return `${match[3]}-${MONTH_NAMES[Number(match[2]) - 1]}-${match[1]}`;
}

/** The documents of the OPS LIBRARY with their lookups */
export class OpsLibraryCatalog {
  private readonly indexes = new Map<string, DocumentTreeIndex>();

  private mmelReferences: readonly { reference: string; title: string }[] = [];

  private mmel: OpsManual;

  private readonly ecam: OpsManual;

  private readonly ecamAlertTitles: readonly { id: string; title: string }[];

  /**
   * @param generated the generated content file
   * @param ecamProcedures the abnormal sensed procedures of the FWS
   */
  constructor(
    private readonly generated: OpsLibraryContentFile,
    ecamProcedures: Readonly<Record<string, { title: string }>>,
  ) {
    this.ecam = buildEcamManual(ecamProcedures, generated.generated);
    this.ecamAlertTitles = Object.keys(ecamProcedures).map((id) => ({
      id,
      title: plainTitle(ecamProcedures[id].title),
    }));
    this.mmel = buildMmelManual(this.ecamAlertTitles, [], generated.generated);
  }

  /**
   * The deferred items of the logbook become MMEL entries.
   * @param references the MEL and CDL references with their titles
   */
  public setMmelReferences(references: readonly { reference: string; title: string }[]): void {
    const key = (list: readonly { reference: string; title: string }[]) =>
      list.map((item) => `${item.reference}|${item.title}`).join('\n');
    if (key(references) === key(this.mmelReferences)) {
      return;
    }
    this.mmelReferences = references;
    this.mmel = buildMmelManual(this.ecamAlertTitles, references, this.generated.generated);
    this.indexes.delete(MMEL_MANUAL_ID);
  }

  /** @returns the manuals in the order of the LIBRARY list */
  public manuals(): readonly OpsManual[] {
    return [...this.generated.manuals, this.ecam, this.mmel];
  }

  public manual(id: string): OpsManual | undefined {
    return this.manuals().find((manual) => manual.id === id);
  }

  /**
   * @param manualId the manual id
   * @returns the lookups of a manual tree
   */
  public index(manualId: string): DocumentTreeIndex | undefined {
    let index = this.indexes.get(manualId);
    if (index === undefined) {
      const manual = this.manual(manualId);
      if (manual === undefined) {
        return undefined;
      }
      index = new DocumentTreeIndex(manual.root);
      this.indexes.set(manualId, index);
    }
    return index;
  }

  /**
   * @param unitId the id of a unit of any manual
   * @returns the manual id and the unit, undefined when no manual has it
   */
  public find(unitId: string): { manualId: string; unit: OpsNode } | undefined {
    for (const manual of this.manuals()) {
      const node = this.index(manual.id)?.node(unitId);
      if (node !== undefined) {
        return { manualId: manual.id, unit: node as OpsNode };
      }
    }
    return undefined;
  }

  /** @returns the units of the manuals for the word search */
  public searchEntries(): SearchableEntry[] {
    const entries: SearchableEntry[] = [];
    for (const manual of this.manuals()) {
      // The MMEL entries only repeat the ECAM alerts and the logbook items: they have no text to search
      if (manual.id === MMEL_MANUAL_ID) {
        continue;
      }
      const index = this.index(manual.id);
      for (const unit of index?.units() ?? []) {
        const node = unit as OpsNode;
        const text = node.ecamId !== undefined ? node.ecamId : node.mmelReference ?? unitPlainText(node);
        const parentId = index?.parentId(node.id);
        entries.push({
          id: node.id,
          group: manual.title,
          title: node.title,
          context: parentId !== null && parentId !== undefined ? index?.node(parentId)?.title : undefined,
          text,
        });
      }
    }
    return entries;
  }
}

/**
 * Checksum of the content of a manual (FNV-1a over the UTF-16 units of its JSON), which CHECK compares with the one the
 * content generator stored.
 * @param root the root of a manual
 * @returns eight hex digits
 */
export function manualHash(root: OpsNode): string {
  const text = JSON.stringify(root);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * @param node a node of a manual
 * @returns the number of units under a node
 */
export function countUnits(node: OpsNode): number {
  return node.kind === 'unit' ? 1 : (node.children ?? []).reduce((sum, child) => sum + countUnits(child), 0);
}
