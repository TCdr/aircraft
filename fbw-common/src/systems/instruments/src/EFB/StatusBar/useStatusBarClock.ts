// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useSimVar } from '@flybywiresim/fbw-sdk-react';

/** The bar shows hours and minutes only, but the seconds change every frame and would redraw the whole flyPad */
const CLOCK_REFRESH_MS = 1_000;

export const useStatusBarClock = () => {
  const [zuluSeconds] = useSimVar('E:ZULU TIME', 'seconds', CLOCK_REFRESH_MS);
  const [localSeconds] = useSimVar('E:LOCAL TIME', 'seconds', CLOCK_REFRESH_MS);
  const [dayOfWeek] = useSimVar('E:ZULU DAY OF WEEK', 'number', CLOCK_REFRESH_MS);
  const [monthOfYear] = useSimVar('E:ZULU MONTH OF YEAR', 'number', CLOCK_REFRESH_MS);
  const [dayOfMonth] = useSimVar('E:ZULU DAY OF MONTH', 'number', CLOCK_REFRESH_MS);

  return { zuluSeconds, localSeconds, dayOfWeek, monthOfYear, dayOfMonth };
};
