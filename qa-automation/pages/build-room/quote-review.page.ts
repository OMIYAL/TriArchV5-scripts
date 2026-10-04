import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/** The parts of the Syncfusion document editor used to read the quote. */
interface DocumentEditorInstance {
  pageCount: number;
  selection: { selectAll(): void; text: string; moveToDocumentStart(): void };
}
type EditorHost = { ej2_instances?: DocumentEditorInstance[] };

const EDITOR_ID = 'QuoteEditor_editor';

/**
 * Quote review stage (`...&stage=quote`): the proposal document, a read-only pricing table and
 * "Send for approval". The document is a canvas editor, so its text is read through the editor.
 */
export class QuoteReviewPage extends BuildRoomBasePage {
  private readonly sendForApprovalButton: Locator;
  readonly quoteDocumentViewer: Locator;

  constructor(page: Page) {
    super(page);
    this.sendForApprovalButton = page.locator('#QuoteSendBtn');
    this.quoteDocumentViewer = page.locator('text=QUOTE DOCUMENT').locator('xpath=..');
  }

  /** The proposal's lines of text; empty until the document has loaded. */
  async documentLines(): Promise<string[]> {
    const text = await this.page.evaluate((id) => {
      const editor = (document.getElementById(id) as unknown as EditorHost | null)?.ej2_instances?.[0];
      if (!editor || editor.pageCount === 0) return '';
      editor.selection.selectAll();
      const all = editor.selection.text;
      editor.selection.moveToDocumentStart();
      return all;
    }, EDITOR_ID);
    return text.split('\r').filter(Boolean);
  }

  /** The project number in the page header, . */
  async projectNumber(): Promise<string> {
    return (await this.page.getByText(/^BR-\d{4}-\d{5}$/).first().innerText()).trim();
  }

  /** The project name, taken from the page title. */
  async projectName(): Promise<string> {
    return (await this.page.title()).split('|')[0].trim();
  }

  /** The figure under the proposal's "Total Price" heading. */
  totalPrice(lines: string[]): number {
    const heading = lines.indexOf('Total Price');
    const amount = lines.slice(heading + 1).find((line) => /^\$[\d,]+/.test(line));
    if (heading < 0 || !amount) throw new Error('The quote has no "Total Price" amount.');
    return this.parseMoney(amount);
  }

  /** The amount of each priced scope line, e.g. "Parts & Smarts — $20,234". */
  itemisedAmounts(lines: string[]): number[] {
    return lines.filter((line) => /—\s*\$[\d,]+(\.\d+)?\s*$/.test(line)).map((line) => this.parseMoney(line));
  }

  /** Saves and goes straight to Approval — no confirm dialog. */
  async sendForApproval(): Promise<void> {
    await this.sendForApprovalButton.click();
    await this.waitForStage('approval');
  }
}
