"use client";

import { useEffect } from "react";

export function ForceDarkTheme() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
  }, []);
  return null;
}
