// popover="auto" 팝업 1개입니다. 여는 버튼은 popoverTarget 에 id 를 지정합니다.
// 경로가 바뀌면 usePopoverRouteClose 가 팝업을 닫습니다.

import type { ReactNode } from "react";

import { usePopoverRouteClose } from "./hooks";

/** onOpenChange 는 열리면 true, 닫히면 false 를 받습니다. */
export function Popover({ id, label, role = "dialog", className, onOpenChange, children }: {
  id: string;
  label: string;
  role?: "dialog" | "group";
  className: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  usePopoverRouteClose(id);
  return (
    <div
      id={id}
      popover="auto"
      className={className}
      role={role}
      aria-label={label}
      onToggle={(event) => onOpenChange(event.newState === "open")}
    >
      {children}
    </div>
  );
}
