// Flat icons for media and display keys, drawn in currentColor so they pick
// up the keycap or theme colors. Ids come from the "icon" field in
// hid-usage-metadata.json.

const speaker = <path d="M3 9h4l5-4v14l-5-4H3z" />;

const sun = (rayLength: number) => (
  <>
    <circle cx="12" cy="12" r="4" />
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <line
          key={angle}
          x1="12"
          y1="5.5"
          x2="12"
          y2={5.5 - rayLength}
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
    </g>
  </>
);

const wave = (d: string) => (
  <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
);

export const ICONS: Record<string, JSX.Element> = {
  "volume-up": (
    <>
      {speaker}
      {wave("M15.5 9a4 4 0 0 1 0 6")}
      {wave("M18.5 6a8 8 0 0 1 0 12")}
    </>
  ),
  "volume-down": (
    <>
      {speaker}
      {wave("M15.5 9a4 4 0 0 1 0 6")}
    </>
  ),
  mute: (
    <>
      {speaker}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="15.5" y1="9.5" x2="20.5" y2="14.5" />
        <line x1="20.5" y1="9.5" x2="15.5" y2="14.5" />
      </g>
    </>
  ),
  "brightness-up": sun(3),
  "brightness-down": sun(1),
  "play-pause": (
    <>
      <path d="M2.5 5.5v13l9-6.5z" />
      <rect x="14" y="5.5" width="3" height="13" rx="0.75" />
      <rect x="19" y="5.5" width="3" height="13" rx="0.75" />
    </>
  ),
  "next-track": (
    <>
      <path d="M3 5.5v13l8-6.5z" />
      <path d="M10.5 5.5v13l8-6.5z" />
      <rect x="18.5" y="5.5" width="2.5" height="13" rx="0.75" />
    </>
  ),
  "previous-track": (
    <>
      <rect x="3" y="5.5" width="2.5" height="13" rx="0.75" />
      <path d="M13.5 5.5v13l-8-6.5z" />
      <path d="M21 5.5v13l-8-6.5z" />
    </>
  ),
};

export const hasUsageIcon = (icon?: string): icon is string =>
  !!icon && icon in ICONS;
