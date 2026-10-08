// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable no-console */
import React, { useEffect, useRef } from 'react';
import { GPUControlEvents, usePersistentNumberProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import {
  ArchiveFill,
  BoxSeam,
  DoorClosedFill,
  DoorOpenFill,
  HandbagFill,
  PersonPlusFill,
  PlugFill,
  Truck,
} from 'react-bootstrap-icons';
import { ActionCreatorWithOptionalPayload } from '@reduxjs/toolkit';
import {
  t,
  useAppDispatch,
  useAppSelector,
  setBoarding1DoorButtonState,
  setBoarding2DoorButtonState,
  setBoarding3DoorButtonState,
  setServiceDoorButtonState,
  setBaggageButtonState,
  setCargo1DoorButtonState,
  setCateringButtonState,
  setFuelTruckButtonState,
  setGpuButtonState,
  setJetWayButtonState,
  setStairsButtonState,
  useEventBus,
} from '@flybywiresim/flypad';
import { GsxServiceId, GsxServiceLook, gsxRequestable, gsxServiceLook, useGsxRemote } from '../GsxRemote';
import { gsxServiceStatus, triggerGsxService } from '../GsxServicesPanel';
import { M3Chip, M3Tone } from '../../../../UtilComponents/Material/Material';
import { PlanformTag } from '../FuselagePlanform';
import { doorRow, equipmentRow, SERVICE_LOOKS, ServiceLook, ServicesLayout } from '../ServicesLayout';
import { useRatStowRow } from '../RatStowRow';

enum ServiceButton {
  Main1Left,
  Main2Left,
  Upper1Left,
  JetBridge,
  Stairs,
  FuelTruck,
  Gpu,
  FrontCargoDoor,
  BaggageTruck,
  Main4Right,
  CateringTruck,
}

// Possible states of buttons
// Order is important to allow simpler if-statements to check for button state
enum ServiceButtonState {
  HIDDEN,
  DISABLED,
  INACTIVE,
  CALLED,
  ACTIVE,
  RELEASED,
}

/** The GSX service of a service button, when the page is linked to GSX (GSX Remote API service ids) */
const GSX_SERVICE_OF_BUTTON: Partial<Record<ServiceButton, GsxServiceId>> = {
  [ServiceButton.JetBridge]: GsxServiceId.OperateJetways,
  [ServiceButton.Stairs]: GsxServiceId.OperateStairs,
  [ServiceButton.FuelTruck]: GsxServiceId.Refueling,
  [ServiceButton.Gpu]: GsxServiceId.Gpu,
  [ServiceButton.CateringTruck]: GsxServiceId.Catering,
};

const GSX_LOOK_STATES: Record<GsxServiceLook, ServiceButtonState> = {
  disabled: ServiceButtonState.DISABLED,
  inactive: ServiceButtonState.INACTIVE,
  called: ServiceButtonState.CALLED,
  active: ServiceButtonState.ACTIVE,
  released: ServiceButtonState.RELEASED,
};

export const A380Services: React.FC = () => {
  const dispatch = useAppDispatch();

  // Flight state
  const [simOnGround] = useSimVar('SIM ON GROUND', 'bool', 250);
  const [aircraftIsStationary] = useSimVar('L:A32NX_IS_STATIONARY', 'bool', 250);
  const [pushBackAttached] = useSimVar('Pushback Attached', 'enum', 250);
  const groundServicesAvailable = simOnGround && aircraftIsStationary && !pushBackAttached;

  // Maintenance: RAT stow, on the ground only (the tug does not matter)
  const ratStowRow = useRatStowRow(!!simOnGround && !!aircraftIsStationary);

  // Ground Services
  const [main1LeftDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:0', 'Percent over 100', 200);
  const [main2LeftDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:2', 'Percent over 100', 200);
  const [main4RightDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:9', 'Percent over 100', 200);
  const [upper1LeftDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:10', 'Percent over 100', 200);
  const [frontCargoDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:16', 'Percent over 100', 200);
  const [fuelingActive] = useSimVar('A:INTERACTIVE POINT OPEN:18', 'Percent over 100', 200);
  const [gpu1Avail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:1', 'bool', 200);
  const [gpu2Avail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:2', 'bool', 200);
  const [gpu3Avail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:3', 'bool', 200);
  const [gpu4Avail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:4', 'bool', 200);
  const gpuAvail = gpu1Avail || gpu2Avail || gpu3Avail || gpu4Avail;

  const eventBus = useEventBus();
  const pub = eventBus.getPublisher<GPUControlEvents>();

  // GSX link: the service buttons request the GSX services (GSX Remote API) instead of the sim ground vehicles; GSX
  // loads the baggage with the boarding, on the GSX panel
  const [gsxLinkSetting, setGsxLinkSetting] = usePersistentNumberProperty('GSX_SERVICES_LINK', 0);
  const [, setGsxFuelSync] = usePersistentNumberProperty('GSX_FUEL_SYNC', 0);
  const [, setGsxPayloadSync] = usePersistentNumberProperty('GSX_PAYLOAD_SYNC', 0);
  const gsxLinked = gsxLinkSetting === 1;
  const gsx = useGsxRemote();
  const gsxReady = gsxLinked && gsx.connected && gsx.gsxRunning;
  // Linking also turns on the flyPad's GSX fuel and payload syncs (Settings > 3rd party), so the fuel and the
  // passengers follow the GSX services
  const setGsxLink = (linked: boolean) => {
    setGsxLinkSetting(linked ? 1 : 0);
    if (linked) {
      setGsxFuelSync(1);
      setGsxPayloadSync(1);
    }
  };
  // the status line of a GSX-linked button, and whether it may offer Request (not on a service GSX does not let be
  // triggered, e.g. completed)
  const gsxStatus = (button: ServiceButton): { text: string; progress: number | null; requestable: boolean } => {
    const gsxService = gsxReady ? GSX_SERVICE_OF_BUTTON[button] : undefined;
    if (gsxService === undefined) {
      return { text: '', progress: null, requestable: true };
    }
    const service = gsx.services.find((s) => s.id === gsxService);
    return { ...gsxServiceStatus(service), requestable: gsxRequestable(service) };
  };
  const shownState = (button: ServiceButton, state: ServiceButtonState): ServiceButtonState => {
    if (!gsxReady) {
      return state;
    }
    if (button === ServiceButton.BaggageTruck) {
      return ServiceButtonState.HIDDEN;
    }
    const gsxService = GSX_SERVICE_OF_BUTTON[button];
    if (gsxService === undefined) {
      return state;
    }
    const look = gsxServiceLook(gsx.services.find((s) => s.id === gsxService));
    // GSX is idle on the jet bridge, stairs and GPU once their operation is done: the sim knows whether they are connected
    const connectable =
      button === ServiceButton.JetBridge || button === ServiceButton.Stairs || button === ServiceButton.Gpu;
    if (connectable && (look === 'inactive' || look === 'disabled') && state >= ServiceButtonState.INACTIVE) {
      return state;
    }
    return GSX_LOOK_STATES[look];
  };
  // Wheel Chocks and Cones
  // TODO FIXME: Reenable
  /*
    const [isGroundEquipmentVisible] = useSimVar('L:A32NX_GND_EQP_IS_VISIBLE', 'bool', 500);
    const [wheelChocksEnabled] = useSimVar('L:A32NX_MODEL_WHEELCHOCKS_ENABLED', 'bool', 500);
    const [conesEnabled] = useSimVar('L:A32NX_MODEL_CONES_ENABLED', 'bool', 500);
    const wheelChocksVisible = wheelChocksEnabled && isGroundEquipmentVisible;
    const conesVisible = conesEnabled && isGroundEquipmentVisible;
    */

  // Service events
  const toggleMain1LeftDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 1);
  const toggleMain2LeftDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 3);
  const toggleMain4RightDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 10);
  const toggleUpper1LeftDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 11);
  const toggleJetBridge = () => SimVar.SetSimVarValue('K:TOGGLE_JETWAY', 'bool', false);
  const toggleStairs = () => SimVar.SetSimVarValue('K:TOGGLE_RAMPTRUCK', 'bool', false);
  const toggleFrontCargoDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 17);
  const toggleBaggageTruck = () => SimVar.SetSimVarValue('K:REQUEST_LUGGAGE', 'bool', true);
  const toggleCateringTruck = () => SimVar.SetSimVarValue('K:REQUEST_CATERING', 'bool', true);
  const toggleFuelTruck = () => SimVar.SetSimVarValue('K:REQUEST_FUEL_KEY', 'bool', true);
  const toggleGpu = () => pub.pub('gpu_toggle', true, true);

  // Button states
  const {
    boarding1DoorButtonState,
    boarding2DoorButtonState,
    boarding3DoorButtonState,
    serviceDoorButtonState,
    cargo1DoorButtonState,
    jetWayButtonState,
    stairsButtonState,
    fuelTruckButtonState,
    gpuButtonState,
    baggageButtonState,
    cateringButtonState,
  } = useAppSelector((state) => state.groundServicePage);

  // Required so these can be used inside the useTimeout callback
  const jetWayButtonStateRef = useRef(jetWayButtonState);
  jetWayButtonStateRef.current = jetWayButtonState;
  const stairsButtonStateRef = useRef(stairsButtonState);
  stairsButtonStateRef.current = stairsButtonState;
  const baggageButtonStateRef = useRef(baggageButtonState);
  baggageButtonStateRef.current = baggageButtonState;
  const cateringButtonStateRef = useRef(cateringButtonState);
  cateringButtonStateRef.current = cateringButtonState;

  // handles state changes to complex services: Jetway, Stairs, Baggage, Catering
  const handleComplexService = (
    serviceButton: ServiceButton,
    serviceButtonStateRef: React.MutableRefObject<ServiceButtonState>,
    setButtonState: ActionCreatorWithOptionalPayload<ServiceButtonState, string>,
    doorButtonState: ServiceButtonState,
    setDoorButtonState: ActionCreatorWithOptionalPayload<ServiceButtonState, string>,
    doorOpenState: number,
  ) => {
    // Service Button handling
    if (serviceButtonStateRef.current === ServiceButtonState.INACTIVE) {
      dispatch(setButtonState(ServiceButtonState.CALLED));
      // If door was already open use a timer to set to active
      // as the useEffect will never be called.
      if (doorOpenState === 1) {
        setTimeout(() => {
          dispatch(setButtonState(ServiceButtonState.ACTIVE));
        }, 5000);
      }
    } else if (serviceButtonStateRef.current === ServiceButtonState.CALLED) {
      // When in state CALLED another click on the button cancels the request.
      // This prevents another click after a "called" has been cancelled
      // to avoid state getting out of sync.
      dispatch(setButtonState(ServiceButtonState.DISABLED));
      setTimeout(() => {
        dispatch(setButtonState(ServiceButtonState.INACTIVE));
      }, 5500);
    } else {
      console.assert(
        serviceButtonStateRef.current === ServiceButtonState.ACTIVE,
        'Expected %s to be in state %s but was in state %s',
        ServiceButton[serviceButton],
        ServiceButtonState[ServiceButtonState.ACTIVE],
        ServiceButtonState[serviceButtonStateRef.current],
      );
      dispatch(setButtonState(ServiceButtonState.RELEASED));
      // If there is no service vehicle/jet-bridge available the door would
      // never receive a close event, so we need to set the button state
      // to inactive after a timeout.
      setTimeout(() => {
        if (doorOpenState === 1) {
          dispatch(setButtonState(ServiceButtonState.INACTIVE));
        }
      }, 5000);
    }

    // Door Button: enable door button after a timeout if it was disabled
    if (doorButtonState === ServiceButtonState.DISABLED) {
      setTimeout(() => {
        // service button could have been pressed again in the meantime
        if (serviceButtonStateRef.current < ServiceButtonState.CALLED) {
          if (doorOpenState === 1) {
            dispatch(setDoorButtonState(ServiceButtonState.ACTIVE));
          } else {
            dispatch(setDoorButtonState(ServiceButtonState.INACTIVE));
          }
        }
      }, 5000);
    } else {
      // disable the door button if the service button has been pressed
      dispatch(setDoorButtonState(ServiceButtonState.DISABLED));
    }
  };

  // handles state changes for simple services: fuel, gpu
  const handleSimpleService = (
    button: ServiceButton,
    buttonState: ServiceButtonState,
    setButtonState: ActionCreatorWithOptionalPayload<ServiceButtonState, string>,
  ) => {
    // Toggle called/released
    if (buttonState === ServiceButtonState.INACTIVE) {
      dispatch(setButtonState(ServiceButtonState.CALLED));
    } else if (buttonState === ServiceButtonState.CALLED) {
      dispatch(setButtonState(ServiceButtonState.INACTIVE));
    } else {
      console.assert(
        buttonState === ServiceButtonState.ACTIVE,
        'Expected %s to be in state %s but was in state %s',
        ServiceButton[button],
        ServiceButtonState[ServiceButtonState.ACTIVE],
        ServiceButtonState[buttonState],
      );
      dispatch(setButtonState(ServiceButtonState.RELEASED));
    }
  };

  // handles state changes to doors
  const handleDoors = (
    buttonState: ServiceButtonState,
    setter: ActionCreatorWithOptionalPayload<ServiceButtonState, string>,
  ) => {
    switch (buttonState) {
      case ServiceButtonState.INACTIVE:
        dispatch(setter(ServiceButtonState.CALLED));
        break;
      case ServiceButtonState.CALLED:
      case ServiceButtonState.ACTIVE:
        dispatch(setter(ServiceButtonState.RELEASED));
        break;
      case ServiceButtonState.RELEASED:
        dispatch(setter(ServiceButtonState.CALLED));
        break;
      default:
        break;
    }
  };

  // Centralized handler for managing clicks to any button
  const handleButtonClick = (id: ServiceButton) => {
    const gsxService = gsxReady ? GSX_SERVICE_OF_BUTTON[id] : undefined;
    if (gsxService !== undefined) {
      triggerGsxService(gsxService, gsx.services.find((s) => s.id === gsxService)?.displayName ?? gsxService);
      return;
    }
    switch (id) {
      case ServiceButton.Main1Left:
        handleDoors(boarding1DoorButtonState, setBoarding1DoorButtonState);
        toggleMain1LeftDoor();
        break;
      case ServiceButton.Main2Left:
        handleDoors(boarding2DoorButtonState, setBoarding2DoorButtonState);
        toggleMain2LeftDoor();
        break;
      case ServiceButton.Upper1Left:
        handleDoors(boarding3DoorButtonState, setBoarding3DoorButtonState);
        toggleUpper1LeftDoor();
        break;
      case ServiceButton.Main4Right:
        handleDoors(serviceDoorButtonState, setServiceDoorButtonState);
        toggleMain4RightDoor();
        break;
      case ServiceButton.FrontCargoDoor:
        handleDoors(cargo1DoorButtonState, setCargo1DoorButtonState);
        toggleFrontCargoDoor();
        break;
      case ServiceButton.FuelTruck:
        handleSimpleService(ServiceButton.FuelTruck, fuelTruckButtonState, setFuelTruckButtonState);
        toggleFuelTruck();
        break;
      case ServiceButton.Gpu:
        handleSimpleService(ServiceButton.Gpu, gpuButtonState, setGpuButtonState);
        toggleGpu();
        break;
      case ServiceButton.JetBridge:
        handleComplexService(
          ServiceButton.JetBridge,
          jetWayButtonStateRef,
          setJetWayButtonState,
          boarding1DoorButtonState,
          setBoarding1DoorButtonState,
          main1LeftDoorOpen,
        );
        toggleJetBridge();
        break;
      case ServiceButton.Stairs:
        handleComplexService(
          ServiceButton.Stairs,
          stairsButtonStateRef,
          setStairsButtonState,
          boarding1DoorButtonState,
          setBoarding1DoorButtonState,
          main1LeftDoorOpen,
        );
        toggleStairs();
        break;
      case ServiceButton.BaggageTruck:
        handleComplexService(
          ServiceButton.BaggageTruck,
          baggageButtonStateRef,
          setBaggageButtonState,
          cargo1DoorButtonState,
          setCargo1DoorButtonState,
          frontCargoDoorOpen,
        );
        toggleBaggageTruck();
        break;
      case ServiceButton.CateringTruck:
        handleComplexService(
          ServiceButton.CateringTruck,
          cateringButtonStateRef,
          setCateringButtonState,
          serviceDoorButtonState,
          setServiceDoorButtonState,
          main4RightDoorOpen,
        );
        toggleCateringTruck();
        break;
      default:
        break;
    }
  };

  // Called by useEffect listeners  whenever a specific door state for
  // simple services and doors changes.
  // Determines the state of a door or simple service based on a given
  // door state input. All services are basically active and terminated
  // based on a door state (INTERACTION POINT OPEN)
  const simpleServiceListenerHandling = (
    state: ServiceButtonState,
    setter: ActionCreatorWithOptionalPayload<ServiceButtonState, string>,
    doorState: number,
  ) => {
    if (state <= ServiceButtonState.DISABLED) {
      return;
    }
    switch (doorState) {
      case 0: // closed
        if (state !== ServiceButtonState.CALLED) {
          dispatch(setter(ServiceButtonState.INACTIVE));
        }
        break;
      case 1: // open
        dispatch(setter(ServiceButtonState.ACTIVE));
        break;
      default: // in between
        if (state === ServiceButtonState.ACTIVE) {
          dispatch(setter(ServiceButtonState.RELEASED));
        }
        break;
    }
  };

  // Called by useEffect listeners whenever a specific door state for a complex services changes
  const complexServiceListenerHandling = (
    serviceButtonStateRef: React.MutableRefObject<ServiceButtonState>,
    setterServiceButtonState: ActionCreatorWithOptionalPayload<ServiceButtonState, string>,
    doorButtonState: ServiceButtonState,
    setterDoorButtonState1: ActionCreatorWithOptionalPayload<ServiceButtonState, string>,
    doorState: number,
  ) => {
    switch (serviceButtonStateRef.current) {
      case ServiceButtonState.HIDDEN:
      case ServiceButtonState.DISABLED:
      case ServiceButtonState.INACTIVE:
        break;
      case ServiceButtonState.CALLED:
        if (doorState === 1) dispatch(setterServiceButtonState(ServiceButtonState.ACTIVE));
        if (doorState === 0) dispatch(setterServiceButtonState(ServiceButtonState.INACTIVE));
        break;
      case ServiceButtonState.ACTIVE:
        if (doorState < 1 && doorState > 0) dispatch(setterServiceButtonState(ServiceButtonState.RELEASED));
        if (doorState === 0) dispatch(setterServiceButtonState(ServiceButtonState.INACTIVE));
        break;
      case ServiceButtonState.RELEASED:
        if (doorState === 0) dispatch(setterServiceButtonState(ServiceButtonState.INACTIVE));
        break;
      default:
    }
    // enable door button in case door has been closed by other means (e.g. pushback)
    if (
      doorState < 1 &&
      serviceButtonStateRef.current >= ServiceButtonState.ACTIVE &&
      doorButtonState === ServiceButtonState.DISABLED
    ) {
      setTimeout(() => {
        // double-check as service button could have been pressed again in the meantime
        if (groundServicesAvailable && serviceButtonStateRef.current < ServiceButtonState.CALLED) {
          dispatch(setterDoorButtonState1(ServiceButtonState.INACTIVE));
        }
      }, 5000);
    }
  };

  // Doors
  useEffect(() => {
    simpleServiceListenerHandling(boarding1DoorButtonState, setBoarding1DoorButtonState, main1LeftDoorOpen);
    simpleServiceListenerHandling(boarding2DoorButtonState, setBoarding2DoorButtonState, main2LeftDoorOpen);
    simpleServiceListenerHandling(boarding3DoorButtonState, setBoarding3DoorButtonState, upper1LeftDoorOpen);
    simpleServiceListenerHandling(cargo1DoorButtonState, setCargo1DoorButtonState, frontCargoDoorOpen);
    simpleServiceListenerHandling(serviceDoorButtonState, setServiceDoorButtonState, main4RightDoorOpen);
  }, [main1LeftDoorOpen, main2LeftDoorOpen, main4RightDoorOpen, upper1LeftDoorOpen, frontCargoDoorOpen]);

  // Fuel
  useEffect(() => {
    simpleServiceListenerHandling(fuelTruckButtonState, setFuelTruckButtonState, fuelingActive);
  }, [fuelingActive]);

  // Gpu
  useEffect(() => {
    simpleServiceListenerHandling(gpuButtonState, setGpuButtonState, gpuAvail ? 1 : 0);
  }, [gpuAvail]);

  // Cabin Door listener for JetBridge Button
  useEffect(() => {
    complexServiceListenerHandling(
      jetWayButtonStateRef,
      setJetWayButtonState,
      boarding1DoorButtonState,
      setBoarding1DoorButtonState,
      main1LeftDoorOpen,
    );
  }, [main1LeftDoorOpen]);

  // Cabin Door listener for Stairs Button
  useEffect(() => {
    complexServiceListenerHandling(
      stairsButtonStateRef,
      setStairsButtonState,
      boarding1DoorButtonState,
      setBoarding1DoorButtonState,
      main1LeftDoorOpen,
    );
  }, [main1LeftDoorOpen]);

  // Cargo Door listener for Baggage Button
  useEffect(() => {
    complexServiceListenerHandling(
      baggageButtonStateRef,
      setBaggageButtonState,
      cargo1DoorButtonState,
      setCargo1DoorButtonState,
      frontCargoDoorOpen,
    );
  }, [frontCargoDoorOpen]);

  // Aft Cabin Door listener for Catering Button
  useEffect(() => {
    complexServiceListenerHandling(
      cateringButtonStateRef,
      setCateringButtonState,
      serviceDoorButtonState,
      setServiceDoorButtonState,
      main4RightDoorOpen,
    );
  }, [main4RightDoorOpen]);

  // Pushback or movement start --> disable buttons and close doors
  // Enable buttons if all have been disabled before
  useEffect(() => {
    if (!groundServicesAvailable) {
      dispatch(setBoarding1DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setBoarding2DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setBoarding3DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setServiceDoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setCargo1DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setJetWayButtonState(ServiceButtonState.DISABLED));
      dispatch(setStairsButtonState(ServiceButtonState.DISABLED));
      dispatch(setFuelTruckButtonState(ServiceButtonState.DISABLED));
      dispatch(setGpuButtonState(ServiceButtonState.DISABLED));
      dispatch(setBaggageButtonState(ServiceButtonState.DISABLED));
      dispatch(setCateringButtonState(ServiceButtonState.DISABLED));
      if (main1LeftDoorOpen === 1) {
        toggleMain1LeftDoor();
      }
      if (main2LeftDoorOpen === 1) {
        toggleMain2LeftDoor();
      }
      if (upper1LeftDoorOpen === 1) {
        toggleUpper1LeftDoor();
      }
      if (main4RightDoorOpen === 1) {
        toggleMain4RightDoor();
      }
      if (frontCargoDoorOpen === 1) {
        toggleFrontCargoDoor();
      }
    } else if (
      [
        boarding1DoorButtonState,
        boarding2DoorButtonState,
        boarding3DoorButtonState,
        serviceDoorButtonState,
        cargo1DoorButtonState,
        cateringButtonState,
        jetWayButtonState,
        stairsButtonState,
        fuelTruckButtonState,
        gpuButtonState,
        baggageButtonState,
        cateringButtonState,
      ].every((buttonState) => buttonState === ServiceButtonState.DISABLED)
    ) {
      dispatch(setBoarding1DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBoarding2DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBoarding3DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setServiceDoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setCargo1DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setJetWayButtonState(ServiceButtonState.INACTIVE));
      dispatch(setStairsButtonState(ServiceButtonState.INACTIVE));
      dispatch(setFuelTruckButtonState(ServiceButtonState.INACTIVE));
      dispatch(setGpuButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBaggageButtonState(ServiceButtonState.INACTIVE));
      dispatch(setCateringButtonState(ServiceButtonState.INACTIVE));
    }
  }, [groundServicesAvailable]);

  // ---------------------------------------------------------------- the page (UtilComponents/Material)
  const look = (state: ServiceButtonState): ServiceLook => SERVICE_LOOKS[state];
  const shownLook = (button: ServiceButton, state: ServiceButtonState): ServiceLook =>
    SERVICE_LOOKS[shownState(button, state)];
  const gsxOf = (button: ServiceButton) => gsxStatus(button);
  const doorIcon = (open: number) => (open >= 1 ? <DoorOpenFill size={18} /> : <DoorClosedFill size={18} />);
  const click = (button: ServiceButton) => () => handleButtonClick(button);

  const doors = [
    doorRow(
      'main1L',
      t('Ground.Services.DoorMain1L'),
      doorIcon(main1LeftDoorOpen),
      main1LeftDoorOpen,
      look(boarding1DoorButtonState),
      click(ServiceButton.Main1Left),
    ),
    doorRow(
      'main2L',
      t('Ground.Services.DoorMain2L'),
      doorIcon(main2LeftDoorOpen),
      main2LeftDoorOpen,
      look(boarding2DoorButtonState),
      click(ServiceButton.Main2Left),
    ),
    doorRow(
      'upper1L',
      t('Ground.Services.DoorUpper1L'),
      doorIcon(upper1LeftDoorOpen),
      upper1LeftDoorOpen,
      look(boarding3DoorButtonState),
      click(ServiceButton.Upper1Left),
    ),
    doorRow(
      'main4R',
      t('Ground.Services.DoorMain4R'),
      doorIcon(main4RightDoorOpen),
      main4RightDoorOpen,
      look(serviceDoorButtonState),
      click(ServiceButton.Main4Right),
    ),
    doorRow(
      'cargoFwd',
      t('Ground.Services.DoorCargoFwd'),
      <BoxSeam size={18} />,
      frontCargoDoorOpen,
      look(cargo1DoorButtonState),
      click(ServiceButton.FrontCargoDoor),
    ),
  ];
  const equipment = [
    equipmentRow(
      'jetBridge',
      t('Ground.Services.JetBridge'),
      <PersonPlusFill size={18} />,
      shownLook(ServiceButton.JetBridge, jetWayButtonState),
      click(ServiceButton.JetBridge),
      {
        gsxStatus: gsxOf(ServiceButton.JetBridge).text,
        progress: gsxOf(ServiceButton.JetBridge).progress,
        requestable: gsxOf(ServiceButton.JetBridge).requestable,
      },
    ),
    equipmentRow(
      'stairs',
      t('Ground.Services.Stairs'),
      <PersonPlusFill size={18} />,
      shownLook(ServiceButton.Stairs, stairsButtonState),
      click(ServiceButton.Stairs),
      {
        gsxStatus: gsxOf(ServiceButton.Stairs).text,
        progress: gsxOf(ServiceButton.Stairs).progress,
        requestable: gsxOf(ServiceButton.Stairs).requestable,
      },
    ),
    equipmentRow(
      'fuel',
      t('Ground.Services.FuelTruck'),
      <Truck size={18} />,
      shownLook(ServiceButton.FuelTruck, fuelTruckButtonState),
      click(ServiceButton.FuelTruck),
      {
        activeStatus: t('Ground.Services.Refuelling'),
        gsxStatus: gsxOf(ServiceButton.FuelTruck).text,
        progress: gsxOf(ServiceButton.FuelTruck).progress,
        requestable: gsxOf(ServiceButton.FuelTruck).requestable,
      },
    ),
    equipmentRow(
      'gpu',
      t('Ground.Services.ExternalPower'),
      <PlugFill size={18} />,
      shownLook(ServiceButton.Gpu, gpuButtonState),
      click(ServiceButton.Gpu),
      {
        activeStatus: gpuAvail ? t('Ground.Services.Powered') : t('Ground.Services.Connected'),
        gsxStatus: gsxOf(ServiceButton.Gpu).text,
        progress: gsxOf(ServiceButton.Gpu).progress,
        requestable: gsxOf(ServiceButton.Gpu).requestable,
      },
    ),
    equipmentRow(
      'catering',
      t('Ground.Services.CateringTruck'),
      <ArchiveFill size={18} />,
      shownLook(ServiceButton.CateringTruck, cateringButtonState),
      click(ServiceButton.CateringTruck),
      {
        gsxStatus: gsxOf(ServiceButton.CateringTruck).text,
        progress: gsxOf(ServiceButton.CateringTruck).progress,
        requestable: gsxOf(ServiceButton.CateringTruck).requestable,
      },
    ),
    equipmentRow(
      'baggage',
      t('Ground.Services.BaggageTruck'),
      <HandbagFill size={18} />,
      shownLook(ServiceButton.BaggageTruck, baggageButtonState),
      click(ServiceButton.BaggageTruck),
    ),
  ]
    .filter((row) => shownLook(ServiceButton.BaggageTruck, baggageButtonState) !== 'hidden' || row.key !== 'baggage')
    .concat(ratStowRow ? [ratStowRow] : []);

  const toneOf = (button: ServiceButton, state: ServiceButtonState): M3Tone => {
    const l = shownLook(button, state);
    return l === 'active' ? 'active' : l === 'called' || l === 'released' ? 'busy' : 'idle';
  };
  const fuelProgress = gsxOf(ServiceButton.FuelTruck).progress;
  const planformTags: PlanformTag[] = [
    {
      label: gpuAvail ? t('Ground.Services.TagGpuPowered') : 'GPU',
      tone: gpuAvail ? 'active' : toneOf(ServiceButton.Gpu, gpuButtonState),
      side: 'R',
      at: 30,
    },
    {
      label: t('Ground.Services.TagBridge'),
      tone: toneOf(ServiceButton.JetBridge, jetWayButtonState),
      side: 'L',
      at: 95,
    },
    {
      label: t('Ground.Services.TagStairs'),
      tone: toneOf(ServiceButton.Stairs, stairsButtonState),
      side: 'L',
      at: 205,
    },
    {
      label:
        fuelProgress !== null
          ? `${t('Ground.Services.TagFuel')} ${Math.round(fuelProgress * 100)} %`
          : t('Ground.Services.TagFuel'),
      tone: toneOf(ServiceButton.FuelTruck, fuelTruckButtonState),
      side: 'R',
      at: 330,
    },
    {
      label: t('Ground.Services.TagCatering'),
      tone: toneOf(ServiceButton.CateringTruck, cateringButtonState),
      side: 'R',
      at: 440,
    },
  ];
  if (pushBackAttached) {
    planformTags.push({ label: 'TUG', tone: 'busy', side: 'L', at: 12 });
  }

  const openDoorCount = doors.filter((d) => d.tone === 'active').length;
  const chips = (
    <>
      {gpuAvail ? (
        <M3Chip tone="active" icon={<PlugFill size={14} />}>
          {t('Ground.Services.ChipGpu')}
        </M3Chip>
      ) : null}
      {pushBackAttached ? (
        <M3Chip tone="busy" icon={<Truck size={14} />}>
          {t('Ground.Services.ChipTug')}
        </M3Chip>
      ) : null}
      <M3Chip tone="idle">{`${openDoorCount} ${t(openDoorCount === 1 ? 'Ground.Services.ChipDoorOpen' : 'Ground.Services.ChipDoorsOpen')}`}</M3Chip>
    </>
  );

  return (
    <ServicesLayout
      chips={chips}
      doors={doors}
      equipment={equipment}
      aircraft="A380-842"
      variant="a380"
      planformDoors={[
        {
          key: 'main1L',
          label: '1 L',
          side: 'L',
          at: 70,
          artId: 'FWD_L_Door',
          open: main1LeftDoorOpen,
          disabled: boarding1DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Main1Left),
        },
        {
          key: 'main2L',
          label: '2 L',
          side: 'L',
          at: 176,
          artId: 'MID-FWD_L_Door',
          open: main2LeftDoorOpen,
          disabled: boarding2DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Main2Left),
        },
        {
          key: 'upper1L',
          label: 'U1L',
          side: 'L',
          at: 125,
          open: upper1LeftDoorOpen,
          upperDeck: true,
          disabled: boarding3DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Upper1Left),
        },
        {
          key: 'main4R',
          label: '4 R',
          side: 'R',
          at: 472,
          artId: 'MID-AFT_R_Door',
          open: main4RightDoorOpen,
          disabled: serviceDoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Main4Right),
        },
      ]}
      planformHolds={[
        {
          key: 'cargoFwd',
          label: 'FWD',
          side: 'C',
          at: 150,
          open: frontCargoDoorOpen,
          disabled: cargo1DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.FrontCargoDoor),
        },
      ]}
      planformTags={planformTags}
      gsx={gsx}
      gsxLinked={gsxLinked}
      onGsxLinkChange={setGsxLink}
    />
  );
};
