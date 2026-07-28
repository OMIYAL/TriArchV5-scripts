import { Page } from '@playwright/test';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { SRDetailPage } from '../pages/sr-detail.page';

interface ScenarioState {
  trackingNumber: string;
  assignedReviewers: string[];
  targetServiceUrl: string;
  currentProjectData: unknown;
  myRequestsPage: MyRequestsPage | null;
  srDetailPage: SRDetailPage | null;
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
      myRequestsPage: null,
      srDetailPage: null,
      downloadedFiles: [],
    });
  }
  return stateMap.get(page)!;
}
