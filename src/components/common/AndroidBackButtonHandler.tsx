import { useAndroidBackButton } from "@/hooks/useAndroidBackButton";

/**
 * Global Android back button handler component.
 * Must be rendered inside BrowserRouter.
 */
export function AndroidBackButtonHandler() {
  useAndroidBackButton();
  return null;
}
