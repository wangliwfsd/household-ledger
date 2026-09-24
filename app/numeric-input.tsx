"use client";

import { InputHTMLAttributes, useEffect, useRef, useState } from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: number;
  onValueChange: (value: number) => void;
  scale?: number;
  allowNegative?: boolean;
  integer?: boolean;
};

const displayValue = (value: number, scale: number) =>
  String(Number((value * scale).toFixed(10)));

export function NumericInput({
  value,
  onValueChange,
  scale = 1,
  allowNegative = false,
  integer = false,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const [draft, setDraft] = useState(() => displayValue(value, scale));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(displayValue(value, scale));
  }, [value, scale]);

  const pattern = integer
    ? allowNegative
      ? /^-?\d*$/
      : /^\d*$/
    : allowNegative
      ? /^-?(?:\d*(?:\.\d*)?)?$/
      : /^(?:\d*(?:\.\d*)?)?$/;

  return (
    <input
      {...props}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={draft}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (!pattern.test(next)) return;
        setDraft(next);
        if (next === "" || next === "-" || next === "." || next === "-.")
          return;
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onValueChange(parsed / scale);
      }}
      onBlur={(event) => {
        focused.current = false;
        setDraft(displayValue(value, scale));
        onBlur?.(event);
      }}
    />
  );
}
