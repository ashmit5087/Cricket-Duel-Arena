import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Scrolls the window back to the top whenever the route changes.
 *
 * Without this, SPA navigations preserve the previous page's scroll offset,
 * so users land mid-page (or at the bottom) of the next page — e.g. entering
 * the Kohli Shrine halfway down instead of at the hero.
 *
 * Note: transitions that happen *within* a single route (like Battle Arena's
 * picker → result view) don't change the location, so those views must scroll
 * to top on mount themselves.
 */
export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}
