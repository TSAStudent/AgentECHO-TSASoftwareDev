import { CommonActions, createNavigationContainerRef } from "@react-navigation/native";

/** Imperative navigation for UI outside the inner navigator (e.g. global ambient alerts). */
export const rootNavigationRef = createNavigationContainerRef();

export function navigateToSafetyTab() {
  if (!rootNavigationRef.isReady()) return;
  rootNavigationRef.dispatch(
    CommonActions.navigate({ name: "Main", params: { screen: "SOS" } }),
  );
}
