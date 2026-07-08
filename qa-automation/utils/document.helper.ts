import fs from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';

const DEFAULT_FIXTURES_DIR = path.resolve(__dirname, '../fixtures/documents');
const DEFAULT_PDF = process.env.TEST_DEFAULT_PDF || 'Human Trafficking Post - revised 070118.pdf';

export const DOCUMENT_TITLE_OPTIONS = [
  'Plan Set',
  'Scope of Work Letter',
  'Technical Data Sheets',
  'Contractor License',
  'Insurance Certificate',
  'Response Letter',
  'Hydraulic Calculations',
  'Water Flow Test',
  'Battery Calculations',
  'Voltage Drop Calculations',
  'Sequence of Operations',
  'Fire Alarm Riser Diagram',
  'Underground Plan',
  'Underground Material Data',
  'Fire Pump Data',
  'Fire Pump Calculations',
  'Other Supporting Documents',
] as const;

export function getTestDocumentsDir(): string {
  const fromEnv = process.env.TEST_DOCUMENTS_DIR?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return DEFAULT_FIXTURES_DIR;
}

export function listTestPdfFiles(): string[] {
  const dir = getTestDocumentsDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith('.pdf'))
    .map((file) => path.join(dir, file));
}

export function getTestPdfPath(fileName: string = DEFAULT_PDF): string {
  const fullPath = path.join(getTestDocumentsDir(), fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Test PDF not found: ${fullPath}`);
  }
  return fullPath;
}

export function getDefaultTestPdf(): string {
  return getTestPdfPath(DEFAULT_PDF);
}

export function getRandomTestPdf(): string {
  const pdfs = listTestPdfFiles();
  if (pdfs.length === 0) {
    return getDefaultTestPdf();
  }
  return faker.helpers.arrayElement(pdfs);
}

export function getRandomDocumentTitle(): string {
  return faker.helpers.arrayElement([...DOCUMENT_TITLE_OPTIONS]);
}

export function pdfBaseName(filePath: string): string {
  return path.basename(filePath);
}
