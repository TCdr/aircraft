import React from 'react';
import { useSimVar } from '@instruments/common/simVars';
import { usePersistentSetting, NXUnits } from '@flybywiresim/fbw-sdk-react';
import { PageTitle } from '../Generic/PageTitle';
import EngineColumn from './elements/EngineColumn';

import '../../../index.scss';

export const EngPage = () => {
  // const sdacDatum = true;
  const [useMetric] = usePersistentSetting('CONFIG_USING_METRIC_UNIT');
  const [engSelectorPosition] = useSimVar('L:XMLVAR_ENG_MODE_SEL', 'Enum', 1000);

  return (
    <>
      <PageTitle x={6} y={29}>
        ENGINE
      </PageTitle>

      <EngineColumn x={67} y={68} engine={1} ignition={engSelectorPosition === 2} useMetric={useMetric} />
      <EngineColumn x={230} y={68} engine={2} ignition={engSelectorPosition === 2} useMetric={useMetric} />
      <EngineColumn x={543} y={68} engine={3} ignition={engSelectorPosition === 2} useMetric={useMetric} />
      <EngineColumn x={701} y={68} engine={4} ignition={engSelectorPosition === 2} useMetric={useMetric} />

      {/* labels */}
      <text x={388} y={68} className="F25 EndAlign White">
        N2
      </text>
      <text x={414} y={68} className="F25 EndAlign Cyan">
        %
      </text>
      <text x={388} y={108} className="F25 EndAlign White">
        N3
      </text>
      <text x={414} y={108} className="F25 EndAlign Cyan">
        %
      </text>
      <text x={388} y={148} className="F25 EndAlign White">
        FF
      </text>
      <text x={410} y={182} className="F25 EndAlign Cyan">
        {NXUnits.userWeightUnit()}/H
      </text>

      <text x={410} y={240} className="F25 EndAlign White">
        OIL
      </text>
      <text x={398} y={276} className="F25 EndAlign Cyan">
        QT
      </text>
      <text x={398} y={316} className="F25 EndAlign Cyan">
        °C
      </text>

      <text x={410} y={386} className="F25 EndAlign Cyan">
        PSI
      </text>

      <text x={388} y={452} className="F25 EndAlign White">
        VIB
      </text>
      <text x={428} y={452} className="F25 EndAlign White">
        N1
      </text>
      <text x={428} y={486} className="F25 EndAlign White">
        N2
      </text>
      <text x={428} y={520} className="F25 EndAlign White">
        N3
      </text>
    </>
  );
};
