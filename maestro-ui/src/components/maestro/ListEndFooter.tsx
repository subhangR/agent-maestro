import React from "react";

type ListEndFooterProps = {
  label?: string;
};

export function ListEndFooter({ label = "You've reached the end" }: ListEndFooterProps) {
  return (
    <div className="pn-list-end" aria-hidden="true">
      <span className="pn-list-end__line" />
      <span className="pn-list-end__label">{label}</span>
      <span className="pn-list-end__line" />
    </div>
  );
}
