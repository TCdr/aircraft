// @ts-strict-ignore
import React from 'react';
import ReactDOM from 'react-dom';
import { getRootElement } from '@instruments/common/defaults.js';
import { CdsDisplay } from '@shared/CdsReconfiguration';
import { SystemDisplay } from './SystemDisplay';
import { render } from '../Common';
import { renderTarget } from '../util';
import { HostedDisplayGate, hostDisplayUnitOf } from '../MsfsAvionicsCommon/HostedDisplay';
import {
  FADEC_SUPPLY_SAMPLE_INTERVAL_MS,
  updateFadecGroundPowerSupplies,
  writeFadecGroundPowerSupplies,
} from './Pages/Engine/FadecGroundPower';
import { updateWheelIndicationTimers, WHEEL_TIMERS_UPDATE_INTERVAL_MS } from './Pages/Wheel/WheelIndicationTimers';

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

// The FADEC supply timers (15 min at aircraft power-up, 10 min after the FADEC GND PWR pb) run from the instrument
// loop, whatever SD page is shown and also while the gauge is hidden, so that they count from the real power-up and pb
// times. The systems WASM decides with them whether the FADECs are powered.
let lastFadecSupplySampleMs = 0;
getRootElement().addEventListener('update', () => {
  const nowMs = Date.now();
  if (nowMs - lastFadecSupplySampleMs >= FADEC_SUPPLY_SAMPLE_INTERVAL_MS) {
    lastFadecSupplySampleMs = nowMs;
    updateFadecGroundPowerSupplies((name, unit) => SimVar.GetSimVarValue(name, unit));
    writeFadecGroundPowerSupplies((name, value) => SimVar.SetSimVarValue(name, 'bool', value ? 1 : 0));
  }
});

// The WHEEL page timers (L/G CTL, L/G GRVTY EXTN) run here too: the page unmounts on every SD page change.
let lastWheelTimersMs = Date.now();
getRootElement().addEventListener('update', () => {
  const nowMs = Date.now();
  if (nowMs - lastWheelTimersMs >= WHEEL_TIMERS_UPDATE_INTERVAL_MS) {
    updateWheelIndicationTimers((nowMs - lastWheelTimersMs) / 1000, (name) => SimVar.GetSimVarValue(name, 'number'));
    lastWheelTimersMs = nowMs;
  }
});

getRootElement().addEventListener('unload', () => {
  ReactDOM.unmountComponentAtNode(renderTarget ?? document.body);
});
