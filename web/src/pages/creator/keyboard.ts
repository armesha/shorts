import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export function handleRovingTabKey(
  event: ReactKeyboardEvent<HTMLElement>,
  activeIndex: number,
  count: number,
  activate: (index: number) => void,
): void {
  const key = event.key;
  const last = count - 1;
  let nextIndex = activeIndex;
  if (key === "ArrowRight" || key === "ArrowDown") nextIndex = activeIndex >= last ? 0 : activeIndex + 1;
  else if (key === "ArrowLeft" || key === "ArrowUp") nextIndex = activeIndex <= 0 ? last : activeIndex - 1;
  else if (key === "Home") nextIndex = 0;
  else if (key === "End") nextIndex = last;
  else return;

  event.preventDefault();
  const tablist = event.currentTarget;
  activate(nextIndex);
  window.requestAnimationFrame(() => {
    const tabs = tablist.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs[nextIndex]?.focus();
  });
}
