import { Page } from '@playwright/test';
import { DynamicProjectData } from './data-generator.helper';

interface ScenarioState {
  trackingNumber: string;
  assignedReviewers: string[];
  targetServiceUrl: string;
  currentProjectData: DynamicProjectData | null;
  downloadedFiles: unknown[];
  /** BuildRoom: the Estimate's direct cost just before a cost line is added. */
  directCostBeforeLine: number | null;
  /** BuildRoom: the Estimate's bid price, noted before the estimate is locked. */
  estimateBid: number | null;
  /** BuildRoom: the catalog part last opened, so a step can reopen it after the panel closes. */
  openedPart: string | null;
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
      directCostBeforeLine: null,
      estimateBid: null,
      openedPart: null,
    });
  }
  return stateMap.get(page)!;
}
