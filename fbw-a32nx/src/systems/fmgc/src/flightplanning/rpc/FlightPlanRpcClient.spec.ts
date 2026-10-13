import { afterAll, describe, expect, it, vi } from 'vitest';
import { FlightPlanRemoteClientRpcEvents, FlightPlanRpcClient } from '@fmgc/flightplanning/rpc/FlightPlanRpcClient';
import { testEventBus } from '@fmgc/flightplanning/test/TestEventBus';
import { A320FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/A320FlightPlanPerformanceData';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanServerRpcEvents } from '@fmgc/flightplanning/rpc/FlightPlanRpcServer';
import { HoldData, HoldType } from '@fmgc/flightplanning/data/flightplan';
import { TurnDirection } from '@flybywiresim/fbw-sdk';

describe('FlightPlanRpcClient', () => {
  const client = new FlightPlanRpcClient(testEventBus, new A320FlightPlanPerformanceData(), false);

  afterAll(() => {
    client.destroy();
  });

  it('sends a command to the server correctly', async ({ onTestFinished }) => {
    const handlerFn = vi.fn(
      ([, id]: FlightPlanRemoteClientRpcEvents<A320FlightPlanPerformanceData>['flightPlanRemoteClient_rpcCommand']) => {
        testEventBus.getPublisher<FlightPlanServerRpcEvents>().pub('flightPlanServer_rpcCommandResponse', [id, void 0]);
      },
    );

    const sub = testEventBus
      .getSubscriber<FlightPlanRemoteClientRpcEvents<A320FlightPlanPerformanceData>>()
      .on('flightPlanRemoteClient_rpcCommand')
      .handle(handlerFn);
    onTestFinished(() => sub.destroy());

    await client.newCityPair('ABCD', 'EFGH', undefined, FlightPlanIndex.Active);

    expect(handlerFn).toHaveBeenCalledExactlyOnceWith([
      'newCityPair',
      expect.stringMatching(/\w+/),
      'ABCD',
      'EFGH',
      undefined,
      0,
    ]);
  });

  it('rejects if an error is thrown', async ({ onTestFinished }) => {
    const handlerFn = vi.fn(
      ([, id]: FlightPlanRemoteClientRpcEvents<A320FlightPlanPerformanceData>['flightPlanRemoteClient_rpcCommand']) => {
        testEventBus
          .getPublisher<FlightPlanServerRpcEvents>()
          .pub('flightPlanServer_rpcCommandErrorResponse', [id, 'error']);
      },
    );

    const sub = testEventBus
      .getSubscriber<FlightPlanRemoteClientRpcEvents<A320FlightPlanPerformanceData>>()
      .on('flightPlanRemoteClient_rpcCommand')
      .handle(handlerFn);
    onTestFinished(() => sub.destroy());

    await expect(client.newCityPair('ABCD', 'EFGH', undefined, FlightPlanIndex.Active)).rejects.toThrow('error');

    expect(handlerFn).toHaveBeenCalledExactlyOnceWith([
      'newCityPair',
      expect.stringMatching(/\w+/),
      'ABCD',
      'EFGH',
      undefined,
      0,
    ]);
  });

  /**
   * Stands in for the RPC transport: records every command the client sends and answers it at once,
   * so a test can check which server method was called and with which arguments.
   */
  function recordRpcCommands(onTestFinished: (fn: () => void) => void) {
    const handlerFn = vi.fn(
      ([, id]: FlightPlanRemoteClientRpcEvents<A320FlightPlanPerformanceData>['flightPlanRemoteClient_rpcCommand']) => {
        testEventBus.getPublisher<FlightPlanServerRpcEvents>().pub('flightPlanServer_rpcCommandResponse', [id, true]);
      },
    );

    const sub = testEventBus
      .getSubscriber<FlightPlanRemoteClientRpcEvents<A320FlightPlanPerformanceData>>()
      .on('flightPlanRemoteClient_rpcCommand')
      .handle(handlerFn);
    onTestFinished(() => sub.destroy());

    return handlerFn;
  }

  it('erases the engine-out SID through the erase method of the server, not the activate one', async ({
    onTestFinished,
  }) => {
    const handlerFn = recordRpcCommands(onTestFinished);

    await client.tryEraseEngineOutSid();

    expect(handlerFn).toHaveBeenCalledExactlyOnceWith(['tryEraseEngineOutSid', expect.stringMatching(/\w+/)]);
  });

  it('activates the engine-out SID through the activate method of the server', async ({ onTestFinished }) => {
    const handlerFn = recordRpcCommands(onTestFinished);

    await client.tryActivateEngineOutSid();

    expect(handlerFn).toHaveBeenCalledExactlyOnceWith(['tryActivateEngineOutSid', expect.stringMatching(/\w+/)]);
  });

  it('sends the default hold (not the desired hold) as the default hold of a manual hold', async ({
    onTestFinished,
  }) => {
    const handlerFn = recordRpcCommands(onTestFinished);

    const desiredHold: HoldData = {
      type: HoldType.Pilot,
      inboundMagneticCourse: 90,
      turnDirection: TurnDirection.Left,
    };
    const modifiedHold: HoldData = { type: HoldType.Pilot, time: 1.5 };
    const defaultHold: HoldData = {
      type: HoldType.Computed,
      inboundMagneticCourse: 270,
      turnDirection: TurnDirection.Right,
      time: 1,
    };

    await client.addOrEditManualHold(3, desiredHold, modifiedHold, defaultHold, FlightPlanIndex.Active, false);

    expect(handlerFn).toHaveBeenCalledExactlyOnceWith([
      'addOrEditManualHold',
      expect.stringMatching(/\w+/),
      3,
      desiredHold,
      modifiedHold,
      defaultHold,
      FlightPlanIndex.Active,
      false,
    ]);
  });
});
