import type { ComponentProps, SVGProps } from "react";

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

type IconName =
  | "arrow-left"
  | "arrow-right"
  | "check-circle"
  | "clipboard-list"
  | "cogs"
  | "envelope"
  | "exclamation-circle"
  | "exclamation-triangle"
  | "id-card"
  | "inbox"
  | "list-check"
  | "lock"
  | "plus"
  | "save"
  | "search"
  | "sign-in"
  | "sign-out"
  | "spinner"
  | "times"
  | "tools"
  | "tractor"
  | "user"
  | "user-cog"
  | "user-plus"
  | "user-shield"
  | "users"
  | "users-cog";

type IconProps = {
  name: IconName;
  className?: string;
  spin?: boolean;
} & Omit<ComponentProps<"span">, "children">;

type SvgFactory = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const createSvg = (factory: SvgFactory) =>
  (props: SVGProps<SVGSVGElement>) =>
    factory({
      role: "img",
      focusable: "false",
      "aria-hidden": "true",
      ...props,
    });

const baseSvgProps: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const icons: Record<IconName, SvgFactory> = {
  "arrow-left": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M19 12H7" />
      <path d="M11 7 6 12l5 5" />
    </svg>
  )),
  "arrow-right": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M5 12h12" />
      <path d="m13 7 5 5-5 5" />
    </svg>
  )),
  "check-circle": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )),
  "clipboard-list": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M9 4h6a2 2 0 0 1 2 2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1a2 2 0 0 1 2-2Z" />
      <path d="M9 4v2h6V4" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
      <path d="M7 11h.01" />
      <path d="M7 15h.01" />
    </svg>
  )),
  cogs: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 4v2" />
      <path d="M12 18v2" />
      <path d="M4.93 5.93 6.34 7.34" />
      <path d="M17.66 18.07 19.07 19.5" />
      <path d="M4 12h2" />
      <path d="M18 12h2" />
      <path d="M5.93 18.07 7.34 16.66" />
      <path d="M16.66 7.34 18.07 5.93" />
    </svg>
  )),
  envelope: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M4 6h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 18H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 6Z" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )),
  "exclamation-circle": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 8v4" />
      <circle cx={12} cy={16} r={0.8} fill="currentColor" stroke="none" />
    </svg>
  )),
  "exclamation-triangle": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M12 5.5 4 19h16L12 5.5Z" />
      <path d="M12 10v4" />
      <circle cx={12} cy={17} r={0.8} fill="currentColor" stroke="none" />
    </svg>
  )),
  "id-card": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <rect x={3.5} y={6} width={17} height={12} rx={2} />
      <circle cx={8.5} cy={11} r={2} />
      <path d="M6.5 16c0-1.66 1.34-3 3-3s3 1.34 3 3" />
      <path d="M14 11h4" />
      <path d="M14 15h3" />
    </svg>
  )),
  inbox: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M4 6h16l2 10h-6a3 3 0 0 1-6 0H2L4 6Z" />
      <path d="M22 16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2" />
    </svg>
  )),
  "list-check": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M4 7h8" />
      <path d="M4 12h8" />
      <path d="M4 17h8" />
      <path d="m14.5 10.5 2 2 3.5-3.5" />
      <path d="m14.5 15.5 2 2 3.5-3.5" />
    </svg>
  )),
  lock: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <rect x={5} y={11} width={14} height={9} rx={2} />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <circle cx={12} cy={15} r={1} />
    </svg>
  )),
  plus: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )),
  save: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M5 5h12l2 2v12H5V5Z" />
      <path d="M9 5v5h6V5" />
      <path d="M12 14v3" />
      <path d="M10 17h4" />
    </svg>
  )),
  search: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={11} cy={11} r={6} />
      <path d="m15.5 15.5 4 4" />
    </svg>
  )),
  "sign-in": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M11 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
      <path d="m15 8 4 4-4 4" />
      <path d="M9 12h10" />
    </svg>
  )),
  "sign-out": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M13 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
      <path d="m9 8-4 4 4 4" />
      <path d="M5 12h10" />
    </svg>
  )),
  spinner: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={12} cy={12} r={9} strokeOpacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  )),
  times: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="m6 6 12 12" />
      <path d="m6 18 12-12" />
    </svg>
  )),
  tools: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <path d="M11 4a4 4 0 0 0 4 4l1.5-1.5 3 3L16 13l-3-3-5.5 5.5a3 3 0 0 1-4.24 0l-.26-.26a3 3 0 0 1 0-4.24L8 6l2.29 2.29" />
      <path d="M7 17l-2 2" />
    </svg>
  )),
  tractor: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={8} cy={17} r={3} />
      <circle cx={18} cy={18} r={2} />
      <path d="M3 11h6l2 3h4l1-3h3" />
      <path d="M5 11V7h5l1 4" />
    </svg>
  )),
  user: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={12} cy={9} r={3} />
      <path d="M6 19a6 6 0 0 1 12 0" />
    </svg>
  )),
  "user-cog": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={9} cy={9} r={3} />
      <path d="M3.5 19a6 6 0 0 1 11 0" />
      <circle cx={18} cy={13} r={2.2} />
      <path d="M18 9.5v1" />
      <path d="M18 15.5v1" />
      <path d="M15.46 10.54 16.2 11.3" />
      <path d="M19.8 14.7l.74.76" />
      <path d="M14.5 13H13" />
      <path d="M23 13h-1.5" />
      <path d="M15.46 15.46 16.2 14.7" />
      <path d="M19.8 11.3l.74-.76" />
    </svg>
  )),
  "user-plus": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={11} cy={8} r={3} />
      <path d="M5 18a6 6 0 0 1 12 0" />
      <path d="M18 9v6" />
      <path d="M21 12h-6" />
    </svg>
  )),
  "user-shield": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={9} cy={9} r={3} />
      <path d="M3.5 19a6 6 0 0 1 9 0" />
      <path d="M13.5 7.5 19 9.5v4c0 3-2 5.5-5.5 7-3.5-1.5-5.5-4-5.5-7v-4l5.5-2Z" />
    </svg>
  )),
  users: createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={8} cy={9} r={2.5} />
      <circle cx={16} cy={10} r={2.5} />
      <path d="M3 19a5 5 0 0 1 10 0" />
      <path d="M12 18a4 4 0 0 1 8 0" />
    </svg>
  )),
  "users-cog": createSvg(props => (
    <svg {...baseSvgProps} {...props}>
      <circle cx={7.5} cy={9} r={2.5} />
      <path d="M2.5 18.5a5 5 0 0 1 10 0" />
      <circle cx={17} cy={12} r={2.2} />
      <path d="M17 8.5v1" />
      <path d="M17 14.5v1" />
      <path d="M14.46 9.54l.74.76" />
      <path d="M18.8 13.88l.74.76" />
      <path d="M13.5 12H12" />
      <path d="M22 12h-1.5" />
      <path d="M14.46 14.46l.74-.76" />
      <path d="M18.8 10.12l.74-.76" />
    </svg>
  )),
};

export function Icon({ name, className, spin = false, ...rest }: IconProps) {
  const Svg = icons[name];

  return (
    <span
      {...rest}
      className={cx("inline-flex items-center justify-center leading-none", spin && "animate-spin", className)}
      aria-hidden={rest["aria-label"] ? undefined : "true"}
      role={rest["aria-label"] ? "img" : undefined}
    >
      <Svg className="h-[1em] w-[1em]" />
    </span>
  );
}

