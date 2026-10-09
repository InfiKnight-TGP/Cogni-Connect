"use client";

import { useEffect, useState } from "react";

const KEY = "caregiver";

/** Caregiver mode for this browser session. */
export function useCaregiver(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(sessionStorage.getItem(KEY) === "1");
    } catch {}
  }, []);
  const set = (value: boolean) => {
    try {
      if (value) sessionStorage.setItem(KEY, "1");
      else sessionStorage.removeItem(KEY);
    } catch {}
    setOn(value);
  };
  return [on, set];
}
