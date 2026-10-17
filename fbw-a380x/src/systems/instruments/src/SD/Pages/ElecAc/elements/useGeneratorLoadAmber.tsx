// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useRef, useState } from 'react';
import { useUpdate } from '@instruments/common/hooks';
import { isGeneratorLoadAmber, nextGeneratorOverloadDurationMs } from '../GeneratorIndications';

/**
 * A generator load is amber once it has been above 108 % for more than 10 s. The confirmation runs on every
 * instrument update, so it also elapses while the load value does not change.
 * @param load the generator load in percent
 * @returns whether the load is amber
 */
export const useGeneratorLoadAmber = (load: number): boolean => {
  const overloadDurationMs = useRef(0);
  const lastUpdateMs = useRef(Date.now());
  const [amber, setAmber] = useState(false);

  useUpdate(() => {
    const now = Date.now();
    overloadDurationMs.current = nextGeneratorOverloadDurationMs(
      overloadDurationMs.current,
      load,
      now - lastUpdateMs.current,
    );
    lastUpdateMs.current = now;
    const loadAmber = isGeneratorLoadAmber(overloadDurationMs.current);
    if (loadAmber !== amber) {
      setAmber(loadAmber);
    }
  });

  return amber;
};
