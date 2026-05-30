import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Side = "top" | "right" | "bottom" | "left";

export function Hint({
  label,
  side = "top",
  align = "center",
  children,
  className,
  delay,
}: {
  label: React.ReactNode;
  side?: Side;
  align?: "start" | "center" | "end";
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Tooltip delayDuration={delay ?? 200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        className={`max-w-xs text-xs leading-relaxed ${className ?? ""}`}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
