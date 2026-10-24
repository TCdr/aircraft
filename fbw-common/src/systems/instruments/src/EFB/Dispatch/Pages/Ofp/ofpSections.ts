// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * SimBrief writes a PDF bookmark comment `<!--BKMK///Title///level-->` at the start of every OFP section (level 0 =
 * section, 1 = sub-section), in every OFP layout. The whole plan sits in one `<pre>`, so the HTML cannot be cut into
 * chunks without breaking its tags: the markers are replaced by empty anchors in place instead.
 */
const BOOKMARK_MARKER = /<!--BKMK\/\/\/(.*?)\/\/\/(\d+)-->/;

/** Zero size and top-aligned, so the anchor's top is the top of its line and it never changes the line height. */
const ANCHOR_STYLE = 'display:inline-block;width:0;height:0;font-size:0;line-height:0;vertical-align:top';

/** In px: an anchor this far below the top of the view still counts as reached, so a jump lands on its section. */
const REACHED_TOLERANCE = 4;

export const OFP_SECTION_ATTRIBUTE = 'data-ofp-section';

export interface OfpSection {
  id: string;
  title: string;
  /** 0 = section, 1 = sub-section of the last section */
  level: number;
}

const sectionId = (index: number) => `ofp-section-${index}`;

const decodeEntities = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/** The OFP's sections in document order; empty when the OFP carries no bookmarks. */
export const ofpSections = (html: string): OfpSection[] => {
  const sections: OfpSection[] = [];
  if (!html) {
    return sections;
  }

  // A global regex of its own per call: a shared one keeps its lastIndex between calls.
  const marker = new RegExp(BOOKMARK_MARKER.source, 'g');
  let match = marker.exec(html);
  while (match !== null) {
    const title = decodeEntities(match[1]);
    if (title) {
      sections.push({ id: sectionId(sections.length), title, level: Math.min(Number(match[2]), 1) });
    }
    match = marker.exec(html);
  }
  return sections;
};

/** The OFP HTML with each bookmark replaced by an anchor carrying the id of the matching {@link ofpSections} entry. */
export const withSectionAnchors = (html: string): string => {
  if (!html) {
    return '';
  }
  let index = 0;
  return html.replace(new RegExp(BOOKMARK_MARKER.source, 'g'), (whole: string, title: string) => {
    if (!decodeEntities(title)) {
      return whole;
    }
    const anchor = `<span ${OFP_SECTION_ATTRIBUTE}="${sectionId(index)}" style="${ANCHOR_STYLE}"></span>`;
    index++;
    return anchor;
  });
};

/**
 * The section the reader is in: the last one whose anchor is at or above the top of the view.
 * @param anchorTops anchor offsets from the top of the scrolled content, in section order
 * @param scrollTop current scroll offset
 */
export const currentSectionIndex = (anchorTops: number[], scrollTop: number): number => {
  let current = anchorTops.length > 0 ? 0 : -1;
  for (let i = 0; i < anchorTops.length; i++) {
    if (anchorTops[i] <= scrollTop + REACHED_TOLERANCE) {
      current = i;
    }
  }
  return current;
};
