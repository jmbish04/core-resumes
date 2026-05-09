import { useState, useEffect, useCallback } from "react";

/**
 * A custom hook to synchronize state with the URL query parameters.
 * Uses `pushState` to ensure standard browser back/forward navigation
 * works as expected when switching tabs or filters.
 */
export function useQueryParam(key: string, defaultValue: string) {
  // Always initialize with default value to match SSR and prevent hydration mismatches
  const [value, setValue] = useState(defaultValue);

  // Sync state from URL on initial client mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramVal = params.get(key);
    if (paramVal && paramVal !== defaultValue) {
      setValue(paramVal);
    }
  }, [key, defaultValue]);

  // Update URL when value changes
  const setParam = useCallback(
    (newValue: string) => {
      setValue(newValue);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (newValue === defaultValue) {
          url.searchParams.delete(key);
        } else {
          url.searchParams.set(key, newValue);
        }
        window.history.pushState({}, "", url.toString());
      }
    },
    [key, defaultValue],
  );

  // Sync state if URL changes (e.g., when the user clicks the browser Back button)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setValue(params.get(key) || defaultValue);
    };

    // Add event listener
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [key, defaultValue]);

  return [value, setParam] as const;
}
