import type { ReactNode } from "react";
import { IC } from "../lib/icons";
import "./shared.css";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: Props) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal glass pop-in">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            {IC.close}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
