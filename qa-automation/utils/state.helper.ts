import fs from 'fs';
import path from 'path';

/**
 * State files directory
 */
const STATE_DIR = path.join(__dirname, '../test-results/state');

/**
 * Ensure state directory exists
 */
function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

/**
 * Citizen SR State - Output of citizen module
 */
export interface CitizenSRState {
  serviceRequestId: string;
  projectId: string;
  projectName: string;
  serviceName: string;
  serviceDefinitionId: string;
  submittedAt: string;
  paymentStatus: string;
  status: string;
}

/**
 * Assignment State - Output of coordinator module
 */
export interface AssignmentState {
  serviceRequestId: string;
  reviewerUsername: string;
  assignedAt: string;
  reviewTaskId: string;
}

/**
 * Review State - Output of reviewer module
 */
export interface ReviewState {
  serviceRequestId: string;
  reviewTaskId: string;
  reviewResult: 'approved' | 'rejected';
  reviewedAt: string;
  comments: string;
}

/**
 * Certificate State - Output of certificate module
 */
export interface CertificateState {
  serviceRequestId: string;
  certificateNumber: string;
  certificateType: string;
  issuedAt: string;
  downloadUrl?: string;
}

/**
 * Save state to JSON file
 */
export function saveState<T>(filename: string, data: T): void {
  ensureStateDir();
  const filePath = path.join(STATE_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`💾 State saved: ${filename}`);
}

/**
 * Load state from JSON file
 */
export function loadState<T>(filename: string): T | null {
  const filePath = path.join(STATE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ State file not found: ${filename}`);
    return null;
  }
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data) as T;
}

/**
 * Clear all state files
 */
export function clearAllState(): void {
  if (fs.existsSync(STATE_DIR)) {
    fs.rmSync(STATE_DIR, { recursive: true, force: true });
    console.log('🗑️ All state files cleared');
  }
}

// State file names
export const STATE_FILES = {
  citizenSR: 'citizen-sr-state.json',
  assignment: 'assignment-state.json',
  review: 'review-state.json',
  certificate: 'certificate-state.json',
} as const;