import { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { behaviorHasParameters, findMatchingParameterSet, getParameterDisplay } from "../behaviors/behaviorBindingUtils";
import BehaviorShortNames from "./behavior-short-names.json";

export interface KeyBinding {
  param1: number;
  param2: number;
}

interface BehaviorShortName {
  short?: string;
  label?: string;
}

const shortNames: Record<string, BehaviorShortName> = BehaviorShortNames;

/**
 * Behaviors without parameters (Bootloader, Transparent, Caps Word...) have nothing
 * but their name to show, so it goes in the body of the key instead of the header.
 */
export const showsNameInBody = (behavior: GetBehaviorDetailsResponse | undefined) =>
  !!behavior && !behaviorHasParameters(behavior.metadata);

export const getBindingChildren = (
  behavior: GetBehaviorDetailsResponse | undefined,
  binding: KeyBinding,
  layers: { id: number; name: string }[] = []
): JSX.Element => {
  if (!behavior) {
    return <div className="relative"></div>;
  }

  if (showsNameInBody(behavior)) {
    const label = shortNames[behavior.displayName]?.label ?? behavior.displayName;
    return (
      <div className="relative text-[0.5rem] leading-tight px-0.5 text-center break-words">
        {label}
      </div>
    );
  }

  // Find the matching parameter set for param1 (critical for getting param2 type)
  const layerIds = layers.map(l => l.id);
  const matchingSet = findMatchingParameterSet(binding.param1, behavior.metadata, layerIds);

  // Get displays for both parameters
  const param1Display = getParameterDisplay(
    binding.param1,
    matchingSet?.param1 ?? behavior.metadata.flatMap(m => m.param1),
    layers
  );

  const param2Display = matchingSet ?
    getParameterDisplay(binding.param2, matchingSet.param2, layers) :
    null;

  // Both parameters present and should be displayed
  if (param1Display !== null && param2Display !== null) {
    // Stack the primary value (e.g. the tap key or profile number) above the
    // secondary one (hold key/layer, command name) so long names don't overflow.
    return (
      <div className="relative flex flex-col items-center leading-none text-center mt-1">
        <div>{param2Display}</div>
        <div className="text-keycap-xs px-0.5 mt-0.5">{param1Display}</div>
      </div>
    );
  }

  // Only param1 should be displayed
  if (param1Display !== null) {
    return (
      <div className={`relative text-center leading-tight ${typeof param1Display === "string" ? "text-[0.5rem] px-0.5 mt-2" : ""}`}>
        {param1Display}
      </div>
    );
  }

  // Only param2 should be displayed (unusual but handle it)
  if (param2Display !== null) {
    return (
      <div className="relative">
        {param2Display}
      </div>
    );
  }

  // Nothing to display
  return <div className="relative"></div>;
};
