import React, { useEffect, useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from 'reactstrap'
import { X } from 'lucide-react'
import './modalComp.css'

export function ModalComp({ modalTitle, modalBody, onAcceptColor, onRefusedColor, onCloseColor, onAcceptText, onRefusedText,
    onCloseText, onAccept, onRefused, onClose, className, modal, size, hideFooterButtons, showCloseIcon }) {

    const [mdl, setModal] = useState(false)

    useEffect(() => {
        if (mdl !== modal) {
            setModal(modal)
        }
    }, [modal, mdl])
 
    return (

        <div onKeyDown={(e) => {
            // Esc closes only the top-most modal: React events bubble through portals, so
            // without this a nested picker's Esc would also close the modal that opened it
            if (e.keyCode === 27 && onClose) { e.stopPropagation(); onClose() }
        }}>
            <Modal size={size ? size : ""}
                isOpen={mdl} className={"reset-modal-style " + className}
                toggle={onClose}
                backdrop="static">
                <ModalHeader
                    id="custom-modal-header"
                    cssModule={{ 'modal-title': 'modal-title flex-grow-1' }}
                    close={showCloseIcon && onClose ? (
                        <button type="button" className="ds-btn ds-btn-icon modal-x-btn" onClick={onClose} aria-label="Close" title="Close">
                            <X size={18} />
                        </button>
                    ) : undefined}
                >
                    {modalTitle}
                </ModalHeader>
                <ModalBody id="custom-modal-body">
                    {modalBody}
                </ModalBody>
                {
                    !hideFooterButtons &&
                    <ModalFooter id="custom-modal-footer">
                        {onAccept &&
                            <Button color={onAcceptColor || "info"} onClick={onAccept}>{onAcceptText || "Save"}</Button>
                        }
                        {onRefused &&
                            <Button color={onRefusedColor || "warning"} onClick={onRefused}>{onRefusedText || "Refused"}</Button>
                        }
                        {onClose &&
                            <Button color={onCloseColor || "danger"} onClick={onClose}>{onCloseText || "Close"}</Button>
                        }
                    </ModalFooter>
                }
            </Modal>
        </div>
    )
}
