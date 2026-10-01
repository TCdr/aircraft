// @ts-strict-ignore
// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useRef, useState, useEffect } from 'react';
import { usePersistentProperty } from '@flybywiresim/fbw-sdk-react';
import { ZoomIn, ZoomOut } from 'react-bootstrap-icons';
import { M3Card, M3IconButton } from '../../UtilComponents/Material/Material';

import {
  t,
  TooltipWrapper,
  ScrollableContainer,
  isSimbriefDataLoaded,
  useAppDispatch,
  useAppSelector,
  setOfpScroll,
} from '@flybywiresim/flypad';

export const LoadSheetWidget = () => {
  const loadsheet = useAppSelector((state) => state.simbrief.data.loadsheet);

  const ref = useRef<HTMLDivElement>(null);

  const [fontSize, setFontSize] = usePersistentProperty('LOADSHEET_FONTSIZE', '14');

  const [imageSize, setImageSize] = useState(60);

  const dispatch = useAppDispatch();

  useEffect(() => {
    const pImages = ref.current?.getElementsByTagName('img');

    if (pImages) {
      for (let i = 0; i < pImages.length; i++) {
        pImages[i].style.width = `${imageSize}%`;
      }
    }
  }, [imageSize]);

  const [loadSheetStyle, setLoadSheetStyle] = useState({});

  useEffect(
    () =>
      setLoadSheetStyle({
        fontSize: `${fontSize}px`,
        lineHeight: `${fontSize}px`,
      }),
    [fontSize],
  );

  function handleFontIncrease() {
    let cFontSize = Number(fontSize);
    let cImageSize = imageSize;

    if (cFontSize < 26) {
      cFontSize += 2;
      cImageSize += 5;
      handleScaling(cFontSize, cImageSize);
    }
  }

  function handleFontDecrease() {
    let cFontSize = Number(fontSize);
    let cImageSize = imageSize;

    if (cFontSize > 14) {
      cFontSize -= 2;
      cImageSize -= 5;
      handleScaling(cFontSize, cImageSize);
    }
  }

  const handleScaling = (cFontSize, cImageSize) => {
    setFontSize(String(cFontSize));
    setImageSize(cImageSize);
  };

  const { ofpScroll } = useAppSelector((state) => state.dispatchPage);

  return (
    <M3Card low className="relative h-content-section-reduced w-full p-6">
      {isSimbriefDataLoaded() ? (
        <>
          <div className="absolute right-16 top-6 z-20 flex flex-row">
            <TooltipWrapper text={t('Dispatch.Ofp.TT.ReduceFontSize')}>
              <div>
                <M3IconButton
                  aria-label="Smaller"
                  className="w-12 !flex-none !bg-m3-ground"
                  onClick={handleFontDecrease}
                >
                  <ZoomOut size={22} />
                </M3IconButton>
              </div>
            </TooltipWrapper>
            <TooltipWrapper text={t('Dispatch.Ofp.TT.IncreaseFontSize')}>
              <div>
                <M3IconButton
                  aria-label="Larger"
                  className="ml-2 w-12 !flex-none !bg-m3-ground"
                  onClick={handleFontIncrease}
                >
                  <ZoomIn size={22} />
                </M3IconButton>
              </div>
            </TooltipWrapper>
          </div>
          <ScrollableContainer
            height={51}
            onScrollStop={(scroll) => dispatch(setOfpScroll(scroll))}
            initialScroll={ofpScroll}
            scrollButtons
          >
            <div
              ref={ref}
              className="image-theme"
              style={loadSheetStyle}
              dangerouslySetInnerHTML={{ __html: loadsheet }}
            />
          </ScrollableContainer>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center space-y-8">
          <h1 className="max-w-4xl text-center">{t('Dispatch.Ofp.YouHaveNotYetImportedAnySimBriefData')}</h1>
        </div>
      )}
    </M3Card>
  );
};
