import { useEffect } from "react";

/** Calls `onTrigger` when the user presses Cmd/Ctrl+K. */
export const useSearchHotkey = (onTrigger: () => void) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onTrigger();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onTrigger]);
};
