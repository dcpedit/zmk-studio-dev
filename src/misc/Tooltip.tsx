import {
  OverlayArrow,
  TooltipTrigger,
  Tooltip as AriaTooltip,
  TooltipProps as AriaTooltipProps,
} from "react-aria-components";

export interface TooltipProps {
  children: React.ReactNode;
  label: string;
  delay?: number;
  placement?: AriaTooltipProps["placement"];
}

export const Tooltip = ({
  children,
  label,
  delay = 1000,
  placement = "top",
}: TooltipProps) => {
  return (
    <TooltipTrigger delay={delay} closeDelay={500}>
      {children}
      {/* Inverted colors so it stands out from whatever panel it sits over */}
      <AriaTooltip
        offset={8}
        placement={placement}
        className="bg-base-content text-base-100 text-sm px-2 py-1 rounded shadow-lg pointer-events-none"
      >
        {/* The tail points down by default; turn it toward the trigger for other placements */}
        <OverlayArrow className="group">
          <svg
            width={10}
            height={6}
            viewBox="0 0 10 6"
            className="block fill-base-content group-data-[placement=bottom]:rotate-180 group-data-[placement=left]:-rotate-90 group-data-[placement=right]:rotate-90"
          >
            <path d="M0 0 L5 6 L10 0" />
          </svg>
        </OverlayArrow>
        {label}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
