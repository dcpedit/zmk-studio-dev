import { HidUsageLabel } from "../keyboard/HidUsageLabel";
import { BehaviorBindingParametersSet, BehaviorParameterValueDescription } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { validateValue } from "./parameters";

/**
 * Find the matching parameter set based on param1 value.
 * This is critical for determining param2 type, as param2's type can depend on param1's value.
 */
export function findMatchingParameterSet(
  param1: number | undefined,
  metadata: BehaviorBindingParametersSet[],
  layerIds: number[]
): BehaviorBindingParametersSet | undefined {
  return metadata.find(set => validateValue(layerIds, param1, set.param1));
}

/**
 * Whether a behavior takes any parameters at all (e.g. Bootloader, Transparent don't).
 */
export function behaviorHasParameters(metadata: BehaviorBindingParametersSet[] | undefined): boolean {
  return !!metadata?.some(set =>
    [...set.param1, ...set.param2].some(d => !d.nil)
  );
}

/**
 * Get a readable display for a parameter value based on its metadata.
 * Returns a JSX element, string, number, or null if nothing should be displayed.
 * Returns null when the parameter shouldn't be displayed (empty metadata or nil type).
 */
export function getParameterDisplay(
  value: number,
  paramDescriptions: BehaviorParameterValueDescription[],
  layers?: { id: number; name: string }[]
): JSX.Element | string | number | null {
  // If no parameter descriptions, don't display anything (matches ParameterValuePicker behavior)
  if (!paramDescriptions || paramDescriptions.length === 0) {
    return null;
  }

  // A parameter can accept a mix of value types (e.g. named constants plus a range),
  // so display according to whichever description this value actually matches.
  const layerIds = layers?.map(l => l.id) ?? [];
  const desc = paramDescriptions.find(d => validateValue(layerIds, value, [d]));

  if (!desc) {
    return null;
  }

  if (desc.constant !== undefined) {
    return desc.name || null;
  }

  if (desc.hidUsage) {
    return <HidUsageLabel hid_usage={value}/>;
  }

  if (desc.layerId) {
    // Look up the layer name by ID
    const layer = layers?.find(l => l.id === value);
    return layer?.name || `Layer ${value}`;
  }

  if (desc.range) {
    return value;
  }

  // If it's a nil type or unrecognized, don't display
  return null;
}
