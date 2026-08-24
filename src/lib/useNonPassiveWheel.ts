import { useEffect, useRef } from "react";

export function useNonPassiveWheel<T extends Element>(handler: (event: WheelEvent) => void) {
  const elementRef = useRef<T>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const listener = (event: Event) => handlerRef.current(event as WheelEvent);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, []);

  return elementRef;
}
