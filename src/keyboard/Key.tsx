import { PropsWithChildren } from "react";
import BehaviorShortNames from "./behavior-short-names.json";

// Which part of the keycap colorway a key takes, like alphas/mods/accents on a keycap set
export type KeyKind = "alpha" | "mod" | "accent";

interface KeyProps {
  selected?: boolean;
  kind?: KeyKind;
  width: number;
  height: number;
  oneU: number;
  header?: string;
  onClick?: () => void;
}

interface BehaviorShortName {
  short?: string;
}

const MAX_HEADER_LENGTH = 9;
const shortNames: Record<string, BehaviorShortName> = BehaviorShortNames;

const shortenHeader = (header: string | undefined) => {
  if(typeof header === "undefined"){
    return "";
  }
  // Empty string is a valid header for behaviors where we don't want to see a header, which is falsy
  // So we use an undefined check here
  if(typeof shortNames[header]?.short !== "undefined"){
    return shortNames[header].short;
  } else if(header.length > MAX_HEADER_LENGTH){
    const words = header.split(/[\s,-]+/);
    const lettersPerWord = Math.trunc(MAX_HEADER_LENGTH / words.length);
    return words.map((word) => (word.substring(0,lettersPerWord))).join("");
  } else {
    return header;
  }
}

export const Key = ({
  selected = false,
  kind = "alpha",
  width,
  height,
  oneU,
  header,
  onClick,
  children,
}: PropsWithChildren<KeyProps>) => {
  const pixelWidth = width * oneU - 2;
  const pixelHeight = height * oneU - 2;

  return (
    <button
      className="keycap group relative flex justify-center items-center cursor-pointer transition-all hover:scale-125"
      data-kind={kind}
      data-selected={selected || undefined}
      style={{
        width: `${pixelWidth}px`,
        height: `${pixelHeight}px`,
        lineHeight: 1,
      }}
      onClick={onClick}
    >
      <div className="absolute text-keycap-xs opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center">{shortenHeader(header)}</div>
      {children}
    </button>
  );
};
