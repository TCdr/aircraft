// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable no-console */
import React, { useEffect, useRef } from 'react';
import { GPUControlEvents, usePersistentNumberProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import {
  ArchiveFill,
  BoxSeam,
  ConeStriped,
  DoorClosedFill,
  DoorOpenFill,
  Fan,
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
  setCargo1DoorButtonState,
  setBaggageButtonState,
  setCateringButtonState,
  setFuelTruckButtonState,
  setGpuButtonState,
  setJetWayButtonState,
  setStairsButtonState,
  setAsuButtonState,
  useEventBus,
} from '@flybywiresim/flypad';
import { GsxServiceId, GsxServiceLook, gsxServiceLook, useGsxRemote } from '../GsxRemote';
import { gsxServiceStatus, triggerGsxService } from '../GsxServicesPanel';
import { M3Chip, M3Tone } from '../../../../UtilComponents/Material/Material';
import { PlanformTag } from '../FuselagePlanform';
import { doorRow, equipmentRow, SERVICE_LOOKS, ServiceLook, ServicesLayout } from '../ServicesLayout';

enum ServiceButton {
  CabinLeftDoor,
  CabinRightDoor,
  JetBridge,
  Stairs,
  FuelTruck,
  Gpu,
  CargoDoor,
  BaggageTruck,
  AftLeftDoor,
  AftRightDoor,
  CateringTruck,
  AirStarterUnit,
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

export const A320Services: React.FC = () => {
  const dispatch = useAppDispatch();

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
  const gsxStatus = (button: ServiceButton): { text: string; progress: number | null } => {
    const gsxService = gsxReady ? GSX_SERVICE_OF_BUTTON[button] : undefined;
    return gsxService !== undefined
      ? gsxServiceStatus(gsx.services.find((s) => s.id === gsxService))
      : { text: '', progress: null };
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

  // Flight state
  const [simOnGround] = useSimVar('SIM ON GROUND', 'bool', 250);
  const [aircraftIsStationary] = useSimVar('L:A32NX_IS_STATIONARY', 'bool', 250);
  const [pushBackAttached] = useSimVar('Pushback Attached', 'enum', 250);
  const groundServicesAvailable = simOnGround && aircraftIsStationary && !pushBackAttached;

  // Ground Services
  const [cabinLeftDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:0', 'Percent over 100', 100);
  const [cabinRightDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:1', 'Percent over 100', 100);
  const [aftLeftDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:2', 'Percent over 100', 100);
  const [aftRightDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:3', 'Percent over 100', 100);
  const [cargoDoorOpen] = useSimVar('A:INTERACTIVE POINT OPEN:5', 'Percent over 100', 100);
  const [gpuAvail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:1', 'bool', 200);
  const [fuelingActive] = useSimVar('A:INTERACTIVE POINT OPEN:9', 'Percent over 100', 100);
  const [asuActive, setAsuActive] = useSimVar('L:A32NX_ASU_TURNED_ON', 'Bool', 100);

  // Wheel Chocks and Cones
  const [isGroundEquipmentVisible] = useSimVar('L:A32NX_GND_EQP_IS_VISIBLE', 'bool', 500);
  const [wheelChocksEnabled] = useSimVar('L:A32NX_MODEL_WHEELCHOCKS_ENABLED', 'bool', 500);
  const [conesEnabled] = useSimVar('L:A32NX_MODEL_CONES_ENABLED', 'bool', 500);
  const wheelChocksVisible = wheelChocksEnabled && isGroundEquipmentVisible;
  const conesVisible = conesEnabled && isGroundEquipmentVisible;

  // Service events
  const toggleCabinLeftDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 1);
  const toggleCabinRightDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 2);
  const toggleJetBridge = () => SimVar.SetSimVarValue('K:TOGGLE_JETWAY', 'bool', false);
  const toggleStairs = () => SimVar.SetSimVarValue('K:TOGGLE_RAMPTRUCK', 'bool', false);
  const toggleCargoDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 6);
  const toggleBaggageTruck = () => SimVar.SetSimVarValue('K:REQUEST_LUGGAGE', 'bool', true);
  const toggleAftLeftDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 3);
  const toggleAftRightDoor = () => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', 4);
  const toggleCateringTruck = () => SimVar.SetSimVarValue('K:REQUEST_CATERING', 'bool', true);
  const toggleFuelTruck = () => SimVar.SetSimVarValue('K:REQUEST_FUEL_KEY', 'bool', true);
  const toggleGpu = () => pub.pub('gpu_toggle', true, true);
  const toggleAsu = () => setAsuActive(!asuActive);

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
    asuButtonState,
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
      case ServiceButton.CabinLeftDoor:
        handleDoors(boarding1DoorButtonState, setBoarding1DoorButtonState);
        toggleCabinLeftDoor();
        break;
      case ServiceButton.CabinRightDoor:
        handleDoors(boarding2DoorButtonState, setBoarding2DoorButtonState);
        toggleCabinRightDoor();
        break;
      case ServiceButton.CargoDoor:
        handleDoors(cargo1DoorButtonState, setCargo1DoorButtonState);
        toggleCargoDoor();
        break;
      case ServiceButton.AftLeftDoor:
        handleDoors(boarding3DoorButtonState, setBoarding3DoorButtonState);
        toggleAftLeftDoor();
        break;
      case ServiceButton.AftRightDoor:
        handleDoors(serviceDoorButtonState, setServiceDoorButtonState);
        toggleAftRightDoor();
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
          cabinLeftDoorOpen,
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
          cabinLeftDoorOpen,
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
          cargoDoorOpen,
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
          aftRightDoorOpen,
        );
        toggleCateringTruck();
        break;
      case ServiceButton.AirStarterUnit:
        handleSimpleService(ServiceButton.AirStarterUnit, asuButtonState, setAsuButtonState);
        toggleAsu();
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
    simpleServiceListenerHandling(boarding1DoorButtonState, setBoarding1DoorButtonState, cabinLeftDoorOpen);
    simpleServiceListenerHandling(boarding2DoorButtonState, setBoarding2DoorButtonState, cabinRightDoorOpen);
    simpleServiceListenerHandling(boarding3DoorButtonState, setBoarding3DoorButtonState, aftLeftDoorOpen);
    simpleServiceListenerHandling(serviceDoorButtonState, setServiceDoorButtonState, aftRightDoorOpen);
    simpleServiceListenerHandling(cargo1DoorButtonState, setCargo1DoorButtonState, cargoDoorOpen);
  }, [cabinRightDoorOpen, cabinLeftDoorOpen, cargoDoorOpen, aftLeftDoorOpen, aftRightDoorOpen]);

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
      cabinLeftDoorOpen,
    );
  }, [cabinLeftDoorOpen]);

  // Cabin Door listener for Stairs Button
  useEffect(() => {
    complexServiceListenerHandling(
      stairsButtonStateRef,
      setStairsButtonState,
      boarding1DoorButtonState,
      setBoarding1DoorButtonState,
      cabinLeftDoorOpen,
    );
  }, [cabinLeftDoorOpen]);

  // Cargo Door listener for Baggage Button
  useEffect(() => {
    complexServiceListenerHandling(
      baggageButtonStateRef,
      setBaggageButtonState,
      cargo1DoorButtonState,
      setCargo1DoorButtonState,
      cargoDoorOpen,
    );
  }, [cargoDoorOpen]);

  // Aft Cabin Door listener for Catering Button
  useEffect(() => {
    complexServiceListenerHandling(
      cateringButtonStateRef,
      setCateringButtonState,
      serviceDoorButtonState,
      setServiceDoorButtonState,
      aftRightDoorOpen,
    );
  }, [aftRightDoorOpen]);

  // Asu
  useEffect(() => {
    simpleServiceListenerHandling(asuButtonState, setAsuButtonState, asuActive);
  }, [asuActive]);

  // Pushback or movement start --> disable buttons and close doors
  // Enable buttons if all have been disabled before
  useEffect(() => {
    if (!groundServicesAvailable) {
      dispatch(setBoarding1DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setBoarding2DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setJetWayButtonState(ServiceButtonState.DISABLED));
      dispatch(setStairsButtonState(ServiceButtonState.DISABLED));
      dispatch(setFuelTruckButtonState(ServiceButtonState.DISABLED));
      dispatch(setGpuButtonState(ServiceButtonState.DISABLED));
      dispatch(setCargo1DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setBaggageButtonState(ServiceButtonState.DISABLED));
      dispatch(setBoarding3DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setServiceDoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setCateringButtonState(ServiceButtonState.DISABLED));
      dispatch(setAsuButtonState(ServiceButtonState.DISABLED));

      if (cabinLeftDoorOpen === 1) {
        toggleCabinLeftDoor();
      }
      if (cabinRightDoorOpen === 1) {
        toggleCabinRightDoor();
      }
      if (aftLeftDoorOpen === 1) {
        toggleAftLeftDoor();
      }
      if (aftRightDoorOpen === 1) {
        toggleAftRightDoor();
      }
      if (cargoDoorOpen === 1) {
        toggleCargoDoor();
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
        fuelTruckButtonState,
        gpuButtonState,
        baggageButtonState,
        cateringButtonState,
        asuButtonState,
      ].every((buttonState) => buttonState === ServiceButtonState.DISABLED)
    ) {
      dispatch(setBoarding1DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBoarding2DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setJetWayButtonState(ServiceButtonState.INACTIVE));
      dispatch(setFuelTruckButtonState(ServiceButtonState.INACTIVE));
      dispatch(setGpuButtonState(ServiceButtonState.INACTIVE));
      dispatch(setCargo1DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBaggageButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBoarding3DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setServiceDoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setCateringButtonState(ServiceButtonState.INACTIVE));
      dispatch(setAsuButtonState(ServiceButtonState.INACTIVE));
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
      'fwdL',
      t('Ground.Services.DoorFwdL'),
      doorIcon(cabinLeftDoorOpen),
      cabinLeftDoorOpen,
      look(boarding1DoorButtonState),
      click(ServiceButton.CabinLeftDoor),
    ),
    doorRow(
      'fwdR',
      t('Ground.Services.DoorFwdR'),
      doorIcon(cabinRightDoorOpen),
      cabinRightDoorOpen,
      look(boarding2DoorButtonState),
      click(ServiceButton.CabinRightDoor),
    ),
    doorRow(
      'aftL',
      t('Ground.Services.DoorAftL'),
      doorIcon(aftLeftDoorOpen),
      aftLeftDoorOpen,
      look(boarding3DoorButtonState),
      click(ServiceButton.AftLeftDoor),
    ),
    doorRow(
      'aftR',
      t('Ground.Services.DoorAftR'),
      doorIcon(aftRightDoorOpen),
      aftRightDoorOpen,
      look(serviceDoorButtonState),
      click(ServiceButton.AftRightDoor),
    ),
    doorRow(
      'cargoFwd',
      t('Ground.Services.DoorCargoFwd'),
      <BoxSeam size={18} />,
      cargoDoorOpen,
      look(cargo1DoorButtonState),
      click(ServiceButton.CargoDoor),
    ),
  ];
  const equipment = [
    equipmentRow(
      'jetBridge',
      t('Ground.Services.JetBridge'),
      <PersonPlusFill size={18} />,
      shownLook(ServiceButton.JetBridge, jetWayButtonState),
      click(ServiceButton.JetBridge),
      { gsxStatus: gsxOf(ServiceButton.JetBridge).text, progress: gsxOf(ServiceButton.JetBridge).progress },
    ),
    equipmentRow(
      'stairs',
      t('Ground.Services.Stairs'),
      <PersonPlusFill size={18} />,
      shownLook(ServiceButton.Stairs, stairsButtonState),
      click(ServiceButton.Stairs),
      { gsxStatus: gsxOf(ServiceButton.Stairs).text, progress: gsxOf(ServiceButton.Stairs).progress },
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
      },
    ),
    equipmentRow(
      'asu',
      t('Ground.Services.AirStarterUnit'),
      <Fan size={18} />,
      look(asuButtonState),
      click(ServiceButton.AirStarterUnit),
      { activeStatus: t('Ground.Services.Running') },
    ),
    equipmentRow(
      'catering',
      t('Ground.Services.CateringTruck'),
      <ArchiveFill size={18} />,
      shownLook(ServiceButton.CateringTruck, cateringButtonState),
      click(ServiceButton.CateringTruck),
      { gsxStatus: gsxOf(ServiceButton.CateringTruck).text, progress: gsxOf(ServiceButton.CateringTruck).progress },
    ),
    equipmentRow(
      'baggage',
      t('Ground.Services.BaggageTruck'),
      <HandbagFill size={18} />,
      shownLook(ServiceButton.BaggageTruck, baggageButtonState),
      click(ServiceButton.BaggageTruck),
    ),
  ].filter((row) => shownLook(ServiceButton.BaggageTruck, baggageButtonState) !== 'hidden' || row.key !== 'baggage');

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
      at: 40,
    },
    {
      label: t('Ground.Services.TagBridge'),
      tone: toneOf(ServiceButton.JetBridge, jetWayButtonState),
      side: 'L',
      at: 140,
    },
    {
      label: t('Ground.Services.TagStairs'),
      tone: toneOf(ServiceButton.Stairs, stairsButtonState),
      side: 'L',
      at: 200,
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
      at: 140,
    },
    { label: 'ASU', tone: look(asuButtonState) === 'active' ? 'active' : 'idle', side: 'R', at: 230 },
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
      {wheelChocksVisible ? <M3Chip tone="idle">{t('Ground.Services.WheelChocks')}</M3Chip> : null}
      {conesVisible ? (
        <M3Chip tone="idle" icon={<ConeStriped size={14} />}>
          {t('Ground.Services.Cones')}
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
      aircraft="A320-251N"
      variant="a320"
      planformDoors={[
        {
          key: 'fwdL',
          label: '1 L',
          side: 'L',
          at: 110,
          artId: 'FWD_Left_PS_PSS',
          open: cabinLeftDoorOpen,
          disabled: boarding1DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.CabinLeftDoor),
        },
        {
          key: 'fwdR',
          label: '1 R',
          side: 'R',
          at: 110,
          artId: 'FWD_Right_CAT',
          open: cabinRightDoorOpen,
          disabled: boarding2DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.CabinRightDoor),
        },
        {
          key: 'aftL',
          label: '2 L',
          side: 'L',
          at: 642,
          artId: 'AFT_Left_PS_PSS',
          open: aftLeftDoorOpen,
          disabled: boarding3DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.AftLeftDoor),
        },
        {
          key: 'aftR',
          label: '2 R',
          side: 'R',
          at: 642,
          artId: 'AFT_Right_CAT',
          open: aftRightDoorOpen,
          disabled: serviceDoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.AftRightDoor),
        },
      ]}
      planformHolds={[
        {
          key: 'cargoFwd',
          label: 'FWD',
          side: 'C',
          at: 150,
          open: cargoDoorOpen,
          disabled: cargo1DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.CargoDoor),
        },
      ]}
      planformTags={planformTags}
      gsx={gsx}
      gsxLinked={gsxLinked}
      onGsxLinkChange={setGsxLink}
    />
  );
};
