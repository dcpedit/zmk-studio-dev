import { SVGProps } from "react";
import { ICONS } from "./usageIcons";

export interface UsageIconProps extends SVGProps<SVGSVGElement> {
  icon: string;
  label: string;
}

export const UsageIcon = ({ icon, label, ...props }: UsageIconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    role="img"
    aria-label={label}
    {...props}
  >
    {ICONS[icon]}
  </svg>
);
