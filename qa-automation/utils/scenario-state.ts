import { Page } from '@playwright/test';

interface ScenarioState {
  trackingNumber: string;
  assignedReviewers: string[];
}

const stateMap = new WeakMap<Page, ScenarioState>();

export function getScenarioState(page: Page): ScenarioState {
  if (!stateMap.has(page)) {
    stateMap.set(page, {
      trackingNumber: '',
      assignedReviewers: []
    });
  }
  return stateMap.get(page)!;
}
