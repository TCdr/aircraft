// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { createContext, FC, useContext, useState } from 'react';
import { t } from '../../Localization/translation';
import { M3Button } from '../Material/Material';

interface ModalContextInterface {
  showModal: (modal: JSX.Element) => void;
  modal?: JSX.Element;
  popModal: () => void;
}

const ModalContext = createContext<ModalContextInterface>(undefined as any);

export const useModals = () => useContext(ModalContext);

export const ModalProvider: FC = ({ children }) => {
  const [modal, setModal] = useState<JSX.Element | undefined>(undefined);

  const popModal = () => {
    setModal(undefined);
  };

  const showModal = (modal: JSX.Element) => {
    setModal(modal);
  };

  return <ModalContext.Provider value={{ modal, showModal, popModal }}>{children}</ModalContext.Provider>;
};

interface BaseModalProps {
  title: string;
  bodyText: string;
}

interface PromptModalProps extends BaseModalProps {
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

interface AlertModalProps extends BaseModalProps {
  onAcknowledge?: () => void;
  acknowledgeText?: string;
}

/**
 * The dialog surface shared by the prompt and alert modals: a Material card (as M3Card, with an outline to lift it off
 * the dimmed page) holding the title, the body text and a row of buttons. Every text element carries its own size and
 * colour: the flyPad stylesheet gives every p, div and span a 20 px size otherwise.
 */
const ModalSurface: FC<BaseModalProps> = ({ title, bodyText, children }) => (
  <div className="flex w-5/12 flex-col rounded-2xl border border-m3-outline bg-m3-card p-6">
    <h1 className="text-lg font-bold text-m3-text">{title}</h1>
    <p className="mt-2 text-sm text-m3-muted">{bodyText}</p>
    <div className="mt-6 flex flex-row">{children}</div>
  </div>
);

export const PromptModal: FC<PromptModalProps> = ({
  title,
  bodyText,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
}) => {
  const { popModal } = useModals();

  const handleConfirm = () => {
    onConfirm?.();
    popModal();
  };

  const handleCancel = () => {
    onCancel?.();
    popModal();
  };

  return (
    <ModalSurface title={title} bodyText={bodyText}>
      <M3Button tone="outline" className="!h-12 flex-1" onClick={handleCancel}>
        <span className="text-base font-bold text-current">{cancelText ?? t('Modals.Cancel')}</span>
      </M3Button>
      <M3Button tone="primary" className="ml-3 !h-12 flex-1" onClick={handleConfirm}>
        <span className="text-base font-bold text-current">{confirmText ?? t('Modals.Confirm')}</span>
      </M3Button>
    </ModalSurface>
  );
};

export const AlertModal: FC<AlertModalProps> = ({ title, bodyText, onAcknowledge, acknowledgeText }) => {
  const { popModal } = useModals();

  const handleAcknowledge = () => {
    onAcknowledge?.();
    popModal();
  };

  return (
    <ModalSurface title={title} bodyText={bodyText}>
      <M3Button tone="primary" className="!h-12 flex-1" onClick={handleAcknowledge}>
        <span className="text-base font-bold text-current">{acknowledgeText ?? t('Modals.Okay')}</span>
      </M3Button>
    </ModalSurface>
  );
};

export const ModalContainer = () => {
  const { modal } = useModals();

  return (
    <div
      className={`fixed inset-0 z-50 transition duration-200 ${modal ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div className="absolute inset-0 bg-m3-ground opacity-75" />
      <div className="absolute inset-0 flex flex-col items-center justify-center">{modal}</div>
    </div>
  );
};
