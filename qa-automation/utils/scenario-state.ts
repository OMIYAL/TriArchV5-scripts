import { Page } from '@playwright/test';
import { DynamicProjectData } from './data-generator.helper';

interface ScenarioState {
  trackingNumber: string;
  assignedReviewers: string[];
  targetServiceUrl: string;
  currentProjectData: DynamicProjectData | null;
  downloadedFiles: unknown[];
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
    });
  }
  return stateMap.get(page)!;
}
