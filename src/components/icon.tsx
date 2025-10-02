import { forwardRef } from "react";
import type { ComponentProps, ReactElement, SVGProps } from "react";

type SvgFactory = (props: SVGProps<SVGSVGElement>) => ReactElement;

const baseSvgProps: Pick<SVGProps<SVGSVGElement>, "fill" | "stroke" | "strokeWidth" | "strokeLinecap" | "strokeLinejoin"> = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const icons = {
  plus: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  ),
  minus: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M5 12h14" />
    </svg>
  ),
  check: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  ),
  x: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  ),
  upload: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M4 17v3h16v-3" />
      <path d="M12 3v14" />
      <path d="M7 8l5-5 5 5" />
    </svg>
  ),
  image: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 13l-2 2" />
      <path d="M21 15l-3-3-4 4" />
      <circle cx="8" cy="9" r="1.5" />
    </svg>
  ),
  edit: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  trash: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
      <path d="M9 7V4h6v3" />
    </svg>
  ),
  chevronRight: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  ),
  chevronLeft: props => (
    <svg viewBox="0 0 24 24" {...baseSvgProps} {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
} satisfies Record<string, SvgFactory>;

export type IconName = keyof typeof icons;

export type IconProps = {
  name: IconName;
} & Omit<ComponentProps<"svg">, "children">;

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ name, width = 24, height = 24, ...props }, ref): ReactElement | null => {
    const IconComponent = icons[name];
    if (!IconComponent) {
      return null;
    }
    return IconComponent({ width, height, ref, ...props });
  }
);

Icon.displayName = "Icon";

export const availableIcons = Object.freeze(Object.keys(icons)) as ReadonlyArray<IconName>;

