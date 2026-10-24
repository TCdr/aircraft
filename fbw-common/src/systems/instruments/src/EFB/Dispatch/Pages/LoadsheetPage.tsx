// @ts-strict-ignore
// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { usePersistentProperty } from '@flybywiresim/fbw-sdk-react';
import { ZoomIn, ZoomOut } from 'react-bootstrap-icons';

import {
  t,
  TooltipWrapper,
  isSimbriefDataLoaded,
  useAppDispatch,
  useAppSelector,
  setOfpScroll,
} from '@flybywiresim/flypad';
import {
  currentSectionIndex,
  OFP_SECTION_ATTRIBUTE,
  OfpSection,
  ofpSections,
  withSectionAnchors,
} from './Ofp/ofpSections';

/** Space kept above a section's first line after a jump, in px. */
const JUMP_MARGIN = 8;

const ZoomButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className="flex h-7 w-9 items-center justify-center rounded-sm border border-m3-outline bg-transparent text-m3-text transition duration-100 hover:bg-m3-card"
  >
    {children}
  </button>
);

const SectionMenu = ({
  sections,
  activeIndex,
  onSelect,
}: {
  sections: OfpSection[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) => {
  const activeParent = useMemo(() => {
    for (let i = activeIndex; i >= 0; i--) {
      if (sections[i].level === 0) {
        return i;
      }
    }
    return -1;
  }, [sections, activeIndex]);

  return (
    <div className="scrollbar flex w-64 shrink-0 flex-col overflow-y-auto border-r border-m3-outline py-2">
      <span className="px-4 pb-2 pt-1 text-xs font-extrabold uppercase tracking-widest text-m3-muted">
        {t('Dispatch.Ofp.Sections')}
      </span>
      {sections.map((section, index) => {
        const active = index === activeIndex;
        const parentOfActive = index === activeParent && !active;
        let colours = 'bg-transparent text-m3-text hover:bg-m3-tile';
        if (active) {
          colours = 'bg-m3-primary-container text-m3-on-primary-container';
        } else if (parentOfActive) {
          colours = 'bg-transparent text-m3-primary hover:bg-m3-tile';
        }
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`flex min-h-[40px] w-full shrink-0 flex-row items-center border-l-4 py-2 pr-3 text-left transition duration-100 ${
              section.level === 0 ? 'pl-3' : 'pl-7'
            } ${active ? 'border-m3-primary' : 'border-transparent'} ${colours}`}
          >
            <span
              className={`text-current ${
                section.level === 0 ? 'text-sm font-extrabold uppercase tracking-wider' : 'text-sm font-semibold'
              }`}
            >
              {section.title}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const LoadSheetWidget = () => {
  const loadsheet = useAppSelector((state) => state.simbrief.data.loadsheet);
  const { airline, flightNum, departingAirport, arrivingAirport } = useAppSelector((state) => state.simbrief.data);
  const { ofpScroll } = useAppSelector((state) => state.dispatchPage);
  const dispatch = useAppDispatch();

  const sections = useMemo(() => ofpSections(loadsheet), [loadsheet]);
  const anchoredHtml = useMemo(() => withSectionAnchors(loadsheet), [loadsheet]);

  const ofpRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollStopTimeout = useRef<ReturnType<typeof setTimeout>>();
  const drag = useRef({ top: 0, y: 0 });
  // A jump to a section near the end cannot bring it to the top: keep it highlighted until the reader scrolls away.
  const jump = useRef<{ index: number; scrollTop: number } | null>(null);

  const [activeIndex, setActiveIndex] = useState(sections.length > 0 ? 0 : -1);

  const [fontSize, setFontSize] = usePersistentProperty('LOADSHEET_FONTSIZE', '14');
  const [imageSize, setImageSize] = useState(60);

  useEffect(() => {
    const pImages = ofpRef.current?.getElementsByTagName('img');

    if (pImages) {
      for (let i = 0; i < pImages.length; i++) {
        pImages[i].style.width = `${imageSize}%`;
      }
    }
  }, [imageSize, anchoredHtml]);

  const anchorTops = (): number[] => {
    const container = scrollRef.current;
    if (!container) {
      return [];
    }
    const containerTop = container.getBoundingClientRect().top;
    const tops: number[] = [];
    for (let i = 0; i < sections.length; i++) {
      const anchor = container.querySelector(`[${OFP_SECTION_ATTRIBUTE}="${sections[i].id}"]`);
      tops.push(anchor ? anchor.getBoundingClientRect().top - containerTop + container.scrollTop : 0);
    }
    return tops;
  };

  const updateActiveSection = () => {
    const container = scrollRef.current;
    if (!container || sections.length === 0) {
      return;
    }
    if (jump.current && Math.abs(container.scrollTop - jump.current.scrollTop) < 2) {
      setActiveIndex(jump.current.index);
      return;
    }
    jump.current = null;
    setActiveIndex(currentSectionIndex(anchorTops(), container.scrollTop + JUMP_MARGIN));
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (container && container.scrollHeight >= ofpScroll) {
      container.scrollTop = ofpScroll;
    }
    jump.current = null;
    updateActiveSection();
  }, [anchoredHtml]);

  // Lines move when the font size changes without a scroll event: the highlighted section and the saved scroll follow.
  useEffect(() => {
    updateActiveSection();
    if (scrollRef.current) {
      dispatch(setOfpScroll(scrollRef.current.scrollTop));
    }
  }, [fontSize]);

  const handleScroll = () => {
    updateActiveSection();
    if (scrollStopTimeout.current) {
      clearTimeout(scrollStopTimeout.current);
    }
    scrollStopTimeout.current = setTimeout(() => {
      if (scrollRef.current) {
        dispatch(setOfpScroll(scrollRef.current.scrollTop));
      }
    }, 100);
  };

  const jumpToSection = (index: number) => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = Math.max(0, anchorTops()[index] - JUMP_MARGIN);
    jump.current = { index, scrollTop: container.scrollTop };
    setActiveIndex(index);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = drag.current.top - (event.clientY - drag.current.y);
    }
  };

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    drag.current = { top: scrollRef.current ? scrollRef.current.scrollTop : 0, y: event.clientY };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(
    () => () => {
      handleMouseUp();
      if (scrollStopTimeout.current) {
        clearTimeout(scrollStopTimeout.current);
      }
    },
    [],
  );

  const changeFontSize = (step: number) => {
    const next = Number(fontSize) + step;
    if (next >= 14 && next <= 26) {
      setFontSize(String(next));
      setImageSize(imageSize + (step > 0 ? 5 : -5));
    }
  };

  const flight = `${airline ?? ''}${flightNum ?? ''}`;
  const route = departingAirport && arrivingAirport ? `${departingAirport} - ${arrivingAirport}` : '';
  const headerInfo = [flight, route].filter((part) => part.length > 0).join('  ·  ');

  if (!isSimbriefDataLoaded()) {
    return (
      <div className="flex h-content-section-reduced w-full flex-col items-center justify-center rounded border border-m3-outline bg-m3-card">
        <h1 className="max-w-4xl text-center text-3xl text-m3-text">
          {t('Dispatch.Ofp.YouHaveNotYetImportedAnySimBriefData')}
        </h1>
      </div>
    );
  }

  return (
    <div className="flex h-content-section-reduced w-full flex-col overflow-hidden rounded border border-m3-outline bg-m3-card">
      <div className="flex h-9 shrink-0 flex-row items-center border-b border-m3-outline bg-m3-tile px-3">
        <span className="text-xs font-extrabold uppercase tracking-widest text-m3-text">{t('Dispatch.Ofp.Title')}</span>
        {headerInfo && <span className="ml-4 font-mono text-sm font-bold text-m3-muted">{headerInfo}</span>}
        <div className="grow" />
        <TooltipWrapper text={t('Dispatch.Ofp.TT.ReduceFontSize')}>
          <div>
            <ZoomButton label="Smaller" onClick={() => changeFontSize(-2)}>
              <ZoomOut size={18} />
            </ZoomButton>
          </div>
        </TooltipWrapper>
        <TooltipWrapper text={t('Dispatch.Ofp.TT.IncreaseFontSize')}>
          <div className="ml-2">
            <ZoomButton label="Larger" onClick={() => changeFontSize(2)}>
              <ZoomIn size={18} />
            </ZoomButton>
          </div>
        </TooltipWrapper>
      </div>
      <div className="flex min-h-0 flex-1 flex-row">
        {sections.length > 0 && <SectionMenu sections={sections} activeIndex={activeIndex} onSelect={jumpToSection} />}
        <div
          ref={scrollRef}
          className="scrollbar grabbable min-w-0 flex-1 overflow-y-auto px-5 py-4"
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
        >
          <div
            ref={ofpRef}
            className="image-theme"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: anchoredHtml }}
          />
        </div>
      </div>
    </div>
  );
};
