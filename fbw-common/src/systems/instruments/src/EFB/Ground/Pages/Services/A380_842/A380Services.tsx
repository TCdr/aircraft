// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable no-console */
import React, { useEffect, useRef } from 'react';
import { GPUControlEvents, useSimVar } from '@flybywiresim/fbw-sdk-react';
import {
  ArchiveFill,
  BoxSeam,
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
  setServiceDoor2ButtonState,
  setBaggageButtonState,
  setCargo1DoorButtonState,
  setCateringButtonState,
  setFuelTruckButtonState,
  setGpuButtonState,
  setJetWayButtonState,
  setStairsButtonState,
  setAsuButtonState,
  useEventBus,
} from '@flybywiresim/flypad';
import { GsxServiceId } from '../GsxRemote';
import { M3Chip, M3Switch, M3Tone } from '../../../../UtilComponents/Material/Material';
import { PlanformTag } from '../FuselagePlanform';
import { A380_FWD_CARGO_DOOR, A380_SERVICE_DOORS } from './A380ServiceDoors';
import { doorRow, equipmentRow, SERVICE_LOOKS, ServiceLook, ServicesLayout } from '../ServicesLayout';
import { useRatStowRow } from '../RatStowRow';
import { GsxButtonLinks, useGsxServiceLink } from '../useGsxServiceLink';
import {
  AFT_CARGO_DOOR_LOCKED_VAR,
  AFT_CARGO_DOOR_POSITION_VAR,
  CARGO_DOOR_OPERATION_INHIBITED_VAR,
  CargoDoorState,
  FWD_CARGO_DOOR_LOCKED_VAR,
  FWD_CARGO_DOOR_POSITION_VAR,
  cargoDoorCanToggle,
  cargoDoorOpening,
  cargoDoorStatusKey,
  cargoDoorTone,
  combineCargoDoors,
} from '../cargoDoor';

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
  Main5Right,
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

/** The buttons GSX serves when the page is linked to GSX (useGsxServiceLink) */
const GSX_LINKS: GsxButtonLinks<ServiceButton> = {
  serviceOf: {
    [ServiceButton.JetBridge]: GsxServiceId.OperateJetways,
    [ServiceButton.Stairs]: GsxServiceId.OperateStairs,
    [ServiceButton.FuelTruck]: GsxServiceId.Refueling,
    [ServiceButton.Gpu]: GsxServiceId.Gpu,
    [ServiceButton.CateringTruck]: GsxServiceId.Catering,
  },
  releaseRowOf: {
    [ServiceButton.JetBridge]: 'jetBridge',
    [ServiceButton.Stairs]: 'stairs',
    [ServiceButton.Gpu]: 'gpu',
  },
  connectable: [ServiceButton.JetBridge, ServiceButton.Stairs, ServiceButton.Gpu],
  baggage: ServiceButton.BaggageTruck,
  gpu: ServiceButton.Gpu,
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

  // Ground Services: the doors' interactive points and exits are in A380ServiceDoors.ts
  const doorOpenVar = (door: { interactivePoint: number }) => `A:INTERACTIVE POINT OPEN:${door.interactivePoint}`;
  const [main1LeftDoorOpen] = useSimVar(doorOpenVar(A380_SERVICE_DOORS.main1L), 'Percent over 100', 200);
  const [main2LeftDoorOpen] = useSimVar(doorOpenVar(A380_SERVICE_DOORS.main2L), 'Percent over 100', 200);
  const [main4RightDoorOpen] = useSimVar(doorOpenVar(A380_SERVICE_DOORS.main4R), 'Percent over 100', 200);
  const [main5RightDoorOpen] = useSimVar(doorOpenVar(A380_SERVICE_DOORS.main5R), 'Percent over 100', 200);
  const [upper1LeftDoorOpen] = useSimVar(doorOpenVar(A380_SERVICE_DOORS.upper1L), 'Percent over 100', 200);
  // The ground crew request of the cargo doors: it opens both the forward and the aft door (systems WASM)
  const [frontCargoDoorOpen] = useSimVar(doorOpenVar(A380_FWD_CARGO_DOOR), 'Percent over 100', 200);
  // The hydraulic cargo doors themselves, which follow the request only when their actuation has hydraulic power
  const [fwdCargoDoorPosition] = useSimVar(FWD_CARGO_DOOR_POSITION_VAR, 'number', 200);
  const [fwdCargoDoorLocked] = useSimVar(FWD_CARGO_DOOR_LOCKED_VAR, 'bool', 200);
  const [aftCargoDoorPosition] = useSimVar(AFT_CARGO_DOOR_POSITION_VAR, 'number', 200);
  const [aftCargoDoorLocked] = useSimVar(AFT_CARGO_DOOR_LOCKED_VAR, 'bool', 200);
  const [cargoDoorOperationInhibited] = useSimVar(CARGO_DOOR_OPERATION_INHIBITED_VAR, 'bool', 200);
  const cargoDoorOf = (positionPercent: number, locked: number): CargoDoorState => ({
    positionPercent,
    locked: !!locked,
    operationInhibited: !!cargoDoorOperationInhibited,
    requestedOpen: frontCargoDoorOpen >= 0.5,
  });
  const fwdCargoDoor = cargoDoorOf(fwdCargoDoorPosition, fwdCargoDoorLocked);
  const aftCargoDoor = cargoDoorOf(aftCargoDoorPosition, aftCargoDoorLocked);
  const cargoDoors = combineCargoDoors(fwdCargoDoor, aftCargoDoor);
  const [fuelingActive] = useSimVar('A:INTERACTIVE POINT OPEN:18', 'Percent over 100', 200);
  const [gpu1Avail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:1', 'bool', 200);
  const [gpu2Avail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:2', 'bool', 200);
  const [gpu3Avail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:3', 'bool', 200);
  const [gpu4Avail] = useSimVar('L:A32NX_EXT_PWR_AVAIL:4', 'bool', 200);
  const gpuAvail = gpu1Avail || gpu2Avail || gpu3Avail || gpu4Avail;
  // The HP ground air cart on the HP ground connectors: the systems model (a380_systems
  // pneumatic.rs) feeds its air into the bleed ducts, as the A32NX air starter unit
  const [asuActive, setAsuActive] = useSimVar('L:A32NX_ASU_TURNED_ON', 'Bool', 100);

  const eventBus = useEventBus();
  const pub = eventBus.getPublisher<GPUControlEvents>();
  // GSX link: the service buttons request the GSX services (GSX Remote API) instead of the sim ground vehicles; GSX
  // loads the baggage with the boarding, on the GSX panel
  const gsxLink = useGsxServiceLink(GSX_LINKS, !!gpuAvail);
  const { gsx, gsxLinked, setGsxLink } = gsxLink;

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
  const toggleDoor = (door: { exit: number }) => SimVar.SetSimVarValue('K:TOGGLE_AIRCRAFT_EXIT', 'enum', door.exit);
  const toggleMain1LeftDoor = () => toggleDoor(A380_SERVICE_DOORS.main1L);
  const toggleMain2LeftDoor = () => toggleDoor(A380_SERVICE_DOORS.main2L);
  const toggleMain4RightDoor = () => toggleDoor(A380_SERVICE_DOORS.main4R);
  const toggleMain5RightDoor = () => toggleDoor(A380_SERVICE_DOORS.main5R);
  const toggleUpper1LeftDoor = () => toggleDoor(A380_SERVICE_DOORS.upper1L);
  const toggleJetBridge = () => SimVar.SetSimVarValue('K:TOGGLE_JETWAY', 'bool', false);
  const toggleStairs = () => SimVar.SetSimVarValue('K:TOGGLE_RAMPTRUCK', 'bool', false);
  const toggleFrontCargoDoor = () => toggleDoor(A380_FWD_CARGO_DOOR);
  const toggleBaggageTruck = () => SimVar.SetSimVarValue('K:REQUEST_LUGGAGE', 'bool', true);
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
    serviceDoor2ButtonState,
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
    if (gsxLink.requestService(id)) {
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
      // MAIN 4R only opens and closes: the catering truck is served at MAIN 5R
      case ServiceButton.Main4Right:
        handleDoors(serviceDoor2ButtonState, setServiceDoor2ButtonState);
        toggleMain4RightDoor();
        break;
      case ServiceButton.Main5Right:
        handleDoors(serviceDoorButtonState, setServiceDoorButtonState);
        toggleMain5RightDoor();
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
          main5RightDoorOpen,
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
    simpleServiceListenerHandling(boarding1DoorButtonState, setBoarding1DoorButtonState, main1LeftDoorOpen);
    simpleServiceListenerHandling(boarding2DoorButtonState, setBoarding2DoorButtonState, main2LeftDoorOpen);
    simpleServiceListenerHandling(boarding3DoorButtonState, setBoarding3DoorButtonState, upper1LeftDoorOpen);
    simpleServiceListenerHandling(cargo1DoorButtonState, setCargo1DoorButtonState, frontCargoDoorOpen);
    simpleServiceListenerHandling(serviceDoor2ButtonState, setServiceDoor2ButtonState, main4RightDoorOpen);
    simpleServiceListenerHandling(serviceDoorButtonState, setServiceDoorButtonState, main5RightDoorOpen);
  }, [
    main1LeftDoorOpen,
    main2LeftDoorOpen,
    main4RightDoorOpen,
    main5RightDoorOpen,
    upper1LeftDoorOpen,
    frontCargoDoorOpen,
  ]);

  // Fuel
  useEffect(() => {
    simpleServiceListenerHandling(fuelTruckButtonState, setFuelTruckButtonState, fuelingActive);
  }, [fuelingActive]);

  // Gpu
  useEffect(() => {
    simpleServiceListenerHandling(gpuButtonState, setGpuButtonState, gpuAvail ? 1 : 0);
  }, [gpuAvail]);

  useEffect(() => {
    simpleServiceListenerHandling(asuButtonState, setAsuButtonState, asuActive);
  }, [asuActive]);

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
      main5RightDoorOpen,
    );
  }, [main5RightDoorOpen]);

  // Pushback or movement start --> disable buttons and close doors
  // Enable buttons if all have been disabled before
  useEffect(() => {
    if (!groundServicesAvailable) {
      dispatch(setBoarding1DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setBoarding2DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setBoarding3DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setServiceDoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setServiceDoor2ButtonState(ServiceButtonState.DISABLED));
      dispatch(setCargo1DoorButtonState(ServiceButtonState.DISABLED));
      dispatch(setJetWayButtonState(ServiceButtonState.DISABLED));
      dispatch(setStairsButtonState(ServiceButtonState.DISABLED));
      dispatch(setFuelTruckButtonState(ServiceButtonState.DISABLED));
      dispatch(setGpuButtonState(ServiceButtonState.DISABLED));
      dispatch(setBaggageButtonState(ServiceButtonState.DISABLED));
      dispatch(setCateringButtonState(ServiceButtonState.DISABLED));
      dispatch(setAsuButtonState(ServiceButtonState.DISABLED));
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
      if (main5RightDoorOpen === 1) {
        toggleMain5RightDoor();
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
        serviceDoor2ButtonState,
        cargo1DoorButtonState,
        cateringButtonState,
        jetWayButtonState,
        stairsButtonState,
        fuelTruckButtonState,
        gpuButtonState,
        baggageButtonState,
        cateringButtonState,
        asuButtonState,
      ].every((buttonState) => buttonState === ServiceButtonState.DISABLED)
    ) {
      dispatch(setBoarding1DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBoarding2DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBoarding3DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setServiceDoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setServiceDoor2ButtonState(ServiceButtonState.INACTIVE));
      dispatch(setCargo1DoorButtonState(ServiceButtonState.INACTIVE));
      dispatch(setJetWayButtonState(ServiceButtonState.INACTIVE));
      dispatch(setStairsButtonState(ServiceButtonState.INACTIVE));
      dispatch(setFuelTruckButtonState(ServiceButtonState.INACTIVE));
      dispatch(setGpuButtonState(ServiceButtonState.INACTIVE));
      dispatch(setBaggageButtonState(ServiceButtonState.INACTIVE));
      dispatch(setCateringButtonState(ServiceButtonState.INACTIVE));
      dispatch(setAsuButtonState(ServiceButtonState.INACTIVE));
    }
  }, [groundServicesAvailable]);

  // ---------------------------------------------------------------- the page (UtilComponents/Material)
  const look = (state: ServiceButtonState): ServiceLook => SERVICE_LOOKS[state];
  const shownLook = (button: ServiceButton, state: ServiceButtonState): ServiceLook =>
    gsxLink.shownLook(button, SERVICE_LOOKS[state]);
  const gsxOf = (button: ServiceButton) => gsxLink.gsxStatus(button);
  const doorIcon = (open: number) => (open >= 1 ? <DoorOpenFill size={18} /> : <DoorClosedFill size={18} />);
  const click = (button: ServiceButton) => () => handleButtonClick(button);

  // Released ground equipment (releasePending): the row shows 'released' from the Release press until the equipment
  // is gone (useGsxServiceLink)
  const equipmentLook = (button: ServiceButton, state: ServiceButtonState): ServiceLook =>
    gsxLink.equipmentLook(button, SERVICE_LOOKS[state]);
  const equipmentGsxOf = (button: ServiceButton, state: ServiceButtonState) =>
    gsxLink.equipmentGsxStatus(button, SERVICE_LOOKS[state]);
  // a Release press is remembered (a Request is not), then handled as usual
  const equipmentClick = (button: ServiceButton, state: ServiceButtonState) => () => {
    gsxLink.rememberRelease(button, SERVICE_LOOKS[state]);
    handleButtonClick(button);
  };
  // the releases that are over are forgotten, so that a later Request and connection show normally
  useEffect(() =>
    gsxLink.settleReleases([
      [ServiceButton.JetBridge, SERVICE_LOOKS[jetWayButtonState]],
      [ServiceButton.Stairs, SERVICE_LOOKS[stairsButtonState]],
      [ServiceButton.Gpu, SERVICE_LOOKS[gpuButtonState]],
    ]),
  );
  const jetBridgeGsx = equipmentGsxOf(ServiceButton.JetBridge, jetWayButtonState);
  const stairsGsx = equipmentGsxOf(ServiceButton.Stairs, stairsButtonState);
  const gpuGsx = equipmentGsxOf(ServiceButton.Gpu, gpuButtonState);

  // The cargo doors row shows the hydraulic doors (both moved by the same request), not the request: its switch is
  // the request, greyed out when a locked door cannot be opened for lack of hydraulic power
  const cargoDoorsDisabled = cargo1DoorButtonState <= ServiceButtonState.DISABLED || !cargoDoorCanToggle(cargoDoors);
  const cargoDoorsOpening = cargoDoorOpening(cargoDoors);
  const cargoDoorsName = t('Ground.Services.DoorCargoFwdAft');
  const cargoDoorsRow = {
    ...doorRow(
      'cargoFwd',
      cargoDoorsName,
      <BoxSeam size={18} />,
      cargoDoorsOpening,
      cargoDoorsDisabled ? 'disabled' : look(cargo1DoorButtonState),
      click(ServiceButton.FrontCargoDoor),
    ),
    tone: cargoDoorTone(cargoDoors),
    status: t(cargoDoorStatusKey(cargoDoors)),
    progress: cargoDoorsOpening > 0 && cargoDoorsOpening < 1 ? cargoDoorsOpening : null,
    trailing: (
      <M3Switch
        value={cargoDoors.requestedOpen}
        onToggle={click(ServiceButton.FrontCargoDoor)}
        disabled={cargoDoorsDisabled}
        aria-label={cargoDoorsName}
      />
    ),
  };

  const doors = [
    doorRow(
      'main1L',
      t(A380_SERVICE_DOORS.main1L.labelKey),
      doorIcon(main1LeftDoorOpen),
      main1LeftDoorOpen,
      look(boarding1DoorButtonState),
      click(ServiceButton.Main1Left),
    ),
    doorRow(
      'main2L',
      t(A380_SERVICE_DOORS.main2L.labelKey),
      doorIcon(main2LeftDoorOpen),
      main2LeftDoorOpen,
      look(boarding2DoorButtonState),
      click(ServiceButton.Main2Left),
    ),
    doorRow(
      'upper1L',
      t(A380_SERVICE_DOORS.upper1L.labelKey),
      doorIcon(upper1LeftDoorOpen),
      upper1LeftDoorOpen,
      look(boarding3DoorButtonState),
      click(ServiceButton.Upper1Left),
    ),
    doorRow(
      'main4R',
      t(A380_SERVICE_DOORS.main4R.labelKey),
      doorIcon(main4RightDoorOpen),
      main4RightDoorOpen,
      look(serviceDoor2ButtonState),
      click(ServiceButton.Main4Right),
    ),
    doorRow(
      'main5R',
      t(A380_SERVICE_DOORS.main5R.labelKey),
      doorIcon(main5RightDoorOpen),
      main5RightDoorOpen,
      look(serviceDoorButtonState),
      click(ServiceButton.Main5Right),
    ),
    cargoDoorsRow,
  ];
  const equipment = [
    equipmentRow(
      'jetBridge',
      t('Ground.Services.JetBridge'),
      <PersonPlusFill size={18} />,
      equipmentLook(ServiceButton.JetBridge, jetWayButtonState),
      equipmentClick(ServiceButton.JetBridge, jetWayButtonState),
      {
        gsxStatus: jetBridgeGsx.text,
        progress: jetBridgeGsx.progress,
        requestable: jetBridgeGsx.requestable,
      },
    ),
    equipmentRow(
      'stairs',
      t('Ground.Services.Stairs'),
      <PersonPlusFill size={18} />,
      equipmentLook(ServiceButton.Stairs, stairsButtonState),
      equipmentClick(ServiceButton.Stairs, stairsButtonState),
      {
        gsxStatus: stairsGsx.text,
        progress: stairsGsx.progress,
        requestable: stairsGsx.requestable,
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
      equipmentLook(ServiceButton.Gpu, gpuButtonState),
      equipmentClick(ServiceButton.Gpu, gpuButtonState),
      {
        activeStatus: gpuAvail ? t('Ground.Services.Powered') : t('Ground.Services.Connected'),
        gsxStatus: gpuGsx.text,
        progress: gpuGsx.progress,
        requestable: gpuGsx.requestable,
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
    const l = equipmentLook(button, state);
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
      // just forward of the 5 R marker: the catering truck is served at MAIN 5R (clear of the 4 R marker)
      at: 545,
    },
    // The HP ground connectors are on the belly fairing
    { label: 'ASU', tone: look(asuButtonState) === 'active' ? 'active' : 'idle', side: 'L', at: 300 },
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
          label: A380_SERVICE_DOORS.main1L.planformLabel,
          side: 'L',
          at: A380_SERVICE_DOORS.main1L.planformAt,
          artId: A380_SERVICE_DOORS.main1L.planformArtId,
          open: main1LeftDoorOpen,
          disabled: boarding1DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Main1Left),
        },
        {
          key: 'main2L',
          label: A380_SERVICE_DOORS.main2L.planformLabel,
          side: 'L',
          at: A380_SERVICE_DOORS.main2L.planformAt,
          artId: A380_SERVICE_DOORS.main2L.planformArtId,
          open: main2LeftDoorOpen,
          disabled: boarding2DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Main2Left),
        },
        {
          key: 'upper1L',
          label: A380_SERVICE_DOORS.upper1L.planformLabel,
          side: 'L',
          at: A380_SERVICE_DOORS.upper1L.planformAt,
          open: upper1LeftDoorOpen,
          upperDeck: true,
          disabled: boarding3DoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Upper1Left),
        },
        {
          key: 'main4R',
          label: A380_SERVICE_DOORS.main4R.planformLabel,
          side: 'R',
          at: A380_SERVICE_DOORS.main4R.planformAt,
          artId: A380_SERVICE_DOORS.main4R.planformArtId,
          open: main4RightDoorOpen,
          disabled: serviceDoor2ButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Main4Right),
        },
        {
          key: 'main5R',
          label: A380_SERVICE_DOORS.main5R.planformLabel,
          side: 'R',
          at: A380_SERVICE_DOORS.main5R.planformAt,
          artId: A380_SERVICE_DOORS.main5R.planformArtId,
          open: main5RightDoorOpen,
          disabled: serviceDoorButtonState === ServiceButtonState.DISABLED,
          onClick: click(ServiceButton.Main5Right),
        },
      ]}
      planformHolds={[
        {
          key: 'cargoFwd',
          label: 'FWD',
          side: 'C',
          at: 150,
          open: cargoDoorOpening(fwdCargoDoor),
          disabled: cargoDoorsDisabled,
          onClick: click(ServiceButton.FrontCargoDoor),
        },
        {
          key: 'cargoAft',
          label: 'AFT',
          side: 'C',
          at: 490,
          open: cargoDoorOpening(aftCargoDoor),
          disabled: cargoDoorsDisabled,
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
