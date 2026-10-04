// @ts-strict-ignore
import React from 'react';
import ReactDOM from 'react-dom';
import { getRootElement } from '@instruments/common/defaults.js';
import { CdsDisplay } from '@shared/CdsReconfiguration';
import { SystemDisplay } from './SystemDisplay';
import { render } from '../Common';
import { renderTarget } from '../util';
import { HostedDisplayGate, hostDisplayUnitOf } from '../MsfsAvionicsCommon/HostedDisplay';

/** The DU this gauge draws on when it is the SD drawn on an ND DU (CDS reconfiguration, panel.cfg hostDu), else null */
const hostDisplayUnit = hostDisplayUnitOf('SD');

if (renderTarget) {
  if (hostDisplayUnit === null) {
    render(<SystemDisplay />);
  } else {
    // The hosted SD renders only while the SD is shown on its DU and is unmounted otherwise: its hooks would else read
    // their SimVars on every frame of the DU. The gate reads one L:var per frame.
    const gate = new HostedDisplayGate(
      hostDisplayUnit,
      CdsDisplay.Sd,
      renderTarget.id,
      () => render(<SystemDisplay hostDisplayUnitId={hostDisplayUnit} />),
      () => ReactDOM.unmountComponentAtNode(renderTarget),
    );
    gate.update();
    getRootElement().addEventListener('update', () => gate.update());
  }
}

getRootElement().addEventListener('unload', () => {
  ReactDOM.unmountComponentAtNode(renderTarget ?? document.body);
});
