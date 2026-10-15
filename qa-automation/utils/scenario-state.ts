import { Page } from '@playwright/test';
import { DynamicProjectData } from './data-generator.helper';

interface ScenarioState {
  trackingNumber: string;
  assignedReviewers: string[];
  targetServiceUrl: string;
  currentProjectData: DynamicProjectData | null;
  downloadedFiles: unknown[];
  /** BuildRoom: catalog part names picked at run time, keyed by feature alias (e.g. "@deviceA"). */
  devices: Record<string, string>;
}

const stateMap = new WeakMap<Page, ScenarioState>();

export function getScenarioState(page: Page): ScenarioState {
  if (!stateMap.has(page)) {
    stateMap.set(page, {
      trackingNumber: '',
      assignedReviewers: [],
      targetServiceUrl: '',
      currentProjectData: null,
      downloadedFiles: [],
      devices: {},
    });
  }
  return stateMap.get(page)!;
}

/** "@deviceA" → name picked from this tenant's catalog; any other text is returned unchanged. */
export function resolveDevice(page: Page, ref: string): string {
  return getScenarioState(page).devices[ref] ?? ref;
}
