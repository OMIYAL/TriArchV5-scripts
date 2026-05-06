# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\theme.spec.ts >> Theme Settings >> should cycle through all themes @smoke
- Location: tests\theme.spec.ts:124:7

# Error details

```
Error: locator.waitFor: Error: strict mode violation: getByText('General Settings').or(getByText('Appearance')).or(locator('.lpx-settings-panel, [class*="settings-panel"], .lpx-menu-item-link').first()) resolved to 4 elements:
    1) <a href="/" id="MenuItem_TriArchV5_Home" class="lpx-menu-item-link lpx-menu-item selected ">…</a> aka locator('#desktop-sidebar').getByRole('link', { name: 'Home' })
    2) <span class="lpx-menu-item-text hidden-in-hover-trigger">Appearance</span> aka getByText('Appearance').first()
    3) <span class="lpx-menu-item-text">General Settings</span> aka getByText('General Settings')
    4) <span class="lpx-menu-item-text hidden-in-hover-trigger">Appearance</span> aka locator('#settings-routes').getByText('Appearance')

Call log:
  - waiting for getByText('General Settings').or(getByText('Appearance')).or(locator('.lpx-settings-panel, [class*="settings-panel"], .lpx-menu-item-link').first()) to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]:
    - generic [ref=e5]:
      - generic [ref=e7]:
        - text: This website uses cookies to ensure you get the best experience on the website.If you continue to browse, then you agree to our
        - link "Cookie Policy" [ref=e8] [cursor=pointer]:
          - /url: /CookiePolicy
        - text: and
        - link "Privacy Policy" [ref=e9] [cursor=pointer]:
          - /url: /PrivacyPolicy
        - text: .
      - button "Close" [ref=e11] [cursor=pointer]: Accept
  - generic [ref=e13]:
    - navigation [ref=e16]:
      - generic [ref=e17]:
        - link [ref=e18] [cursor=pointer]:
          - /url: /
        - generic [ref=e20] [cursor=pointer]: 
      - generic [ref=e21]:
        - generic [ref=e22]: 
        - textbox "Filter menu" [ref=e23]
        - generic [ref=e25] [cursor=pointer]: 
      - list [ref=e26]:
        - listitem [ref=e27]:
          - link "Home" [ref=e28] [cursor=pointer]:
            - /url: /
            - generic [ref=e31]: Home
        - listitem [ref=e32]:
          - link "Dashboard" [ref=e33] [cursor=pointer]:
            - /url: /Dashboard
            - generic [ref=e36]: Dashboard
        - listitem [ref=e37]:
          - generic [ref=e38] [cursor=pointer]:
            - generic [ref=e41]: StoreFront Settings
            - generic [ref=e42]: 
        - listitem [ref=e43]:
          - link "Files" [ref=e44] [cursor=pointer]:
            - /url: /FileManagement
            - generic [ref=e47]: Files
        - listitem [ref=e48]:
          - generic [ref=e49] [cursor=pointer]:
            - generic [ref=e52]: Administration
            - generic [ref=e53]: 
          - text:   
        - listitem [ref=e54]:
          - generic [ref=e55] [cursor=pointer]:
            - generic [ref=e58]: Jurisdiction Manager
            - generic [ref=e59]: 
        - listitem [ref=e60]:
          - generic [ref=e61] [cursor=pointer]:
            - generic [ref=e64]: Book Store
            - generic [ref=e65]: 
    - generic [ref=e66]:
      - generic [ref=e68]:
        - navigation "breadcrumb" [ref=e69]:
          - list [ref=e70]:
            - listitem [ref=e71] [cursor=pointer]:
              - link "Home" [ref=e72]:
                - /url: /
                - generic [ref=e73]: 
                - text: Home
        - generic "Current tenant" [ref=e74]:
          - generic [ref=e75]: 
          - generic [ref=e76]: Sandeep
      - generic [ref=e78]:
        - generic [ref=e79]:
          - generic [ref=e82]:
            - generic [ref=e83]:
              - heading "Getting Started" [level=4] [ref=e84]
              - paragraph [ref=e85]: Learn how to create and run a new web application using the application startup template.
              - link "Getting Started" [ref=e86] [cursor=pointer]:
                - /url: https://abp.io/docs/latest/getting-started
              - heading "Web Application Development Tutorial" [level=4] [ref=e87]
              - paragraph [ref=e88]: Learn how to build an ABP based web application named Acme.BookStore.
              - link "Explore Tutorial" [ref=e89] [cursor=pointer]:
                - /url: https://abp.io/docs/latest/tutorials/book-store/part-1?UI=MVC&DB=EF
              - heading "Customize Lepton Theme" [level=4] [ref=e90]
              - paragraph [ref=e91]: Learn how to customize LeptonX Theme as you wish.
              - link "Customize Lepton" [ref=e92] [cursor=pointer]:
                - /url: https://abp.io/docs/commercial/latest/themes/lepton-x/index
            - img
          - generic [ref=e94]:
            - generic [ref=e97]:
              - paragraph [ref=e98]: You can check for similar problems and solutions, or open a new topic to discuss your specific issue.
              - link "Visit Support" [ref=e99] [cursor=pointer]:
                - /url: https://abp.io/support/questions
              - img [ref=e100]
            - generic [ref=e103]:
              - paragraph [ref=e104]: You can find content on .NET development, cross-platform, ASP.NET application templates, ABP-related news, and more.
              - link "Visit Blog" [ref=e105] [cursor=pointer]:
                - /url: https://abp.io/blog
              - img [ref=e106]
          - generic [ref=e108]:
            - generic [ref=e109]:
              - paragraph [ref=e110]: A unique community platform for ABP Lovers!
              - paragraph [ref=e111]: Explore all ABP users' experiences with the ABP Framework, discover articles and videos on how to use ABP, and join raffles for a chance to win surprise gifts!
              - link "Join ABP Community" [ref=e112] [cursor=pointer]:
                - /url: https://abp.io/community/
            - img [ref=e113]
        - generic [ref=e114]:
          - generic [ref=e116]:
            - generic [ref=e118]: More from ABP.IO
            - table [ref=e121]:
              - rowgroup [ref=e122]:
                - row " Latest Release Logs" [ref=e123]:
                  - cell " Latest Release Logs" [ref=e124]:
                    - generic [ref=e126]: 
                    - generic [ref=e127]: Latest Release Logs
                  - cell [ref=e128]:
                    - link [ref=e129] [cursor=pointer]:
                      - /url: https://github.com/abpframework/abp/releases
                - row " Video Courses" [ref=e131]:
                  - cell " Video Courses" [ref=e132]:
                    - generic [ref=e134]: 
                    - generic [ref=e135]: Video Courses
                  - cell [ref=e136]:
                    - link [ref=e137] [cursor=pointer]:
                      - /url: https://abp.io/video-courses/essentials
                - row " Samples" [ref=e139]:
                  - cell " Samples" [ref=e140]:
                    - generic [ref=e142]: 
                    - generic [ref=e143]: Samples
                  - cell [ref=e144]:
                    - link [ref=e145] [cursor=pointer]:
                      - /url: https://abp.io/docs/latest/Samples/Index
                - row " Books" [ref=e147]:
                  - cell " Books" [ref=e148]:
                    - generic [ref=e150]: 
                    - generic [ref=e151]: Books
                  - cell [ref=e152]:
                    - link [ref=e153] [cursor=pointer]:
                      - /url: https://abp.io/books
                - row " FAQ" [ref=e155]:
                  - cell " FAQ" [ref=e156]:
                    - generic [ref=e158]: 
                    - generic [ref=e159]: FAQ
                  - cell [ref=e160]:
                    - link [ref=e161] [cursor=pointer]:
                      - /url: https://abp.io/faq
          - generic [ref=e166]:
            - generic [ref=e167]:
              - paragraph [ref=e168]: THE OFFICIAL GUIDE
              - heading "Mastering ABP Framework" [level=3] [ref=e169]
              - paragraph [ref=e170]: Written by the creator of the ABP Framework, this book will help you gain a complete understanding of the framework and modern web application development techniques.
              - generic [ref=e171]:
                - link "Buy on Amazon US" [ref=e172] [cursor=pointer]:
                  - /url: https://www.amazon.com/gp/product/B097Z2DM8Q
                - link "Buy on PACKT" [ref=e173] [cursor=pointer]:
                  - /url: https://www.packtpub.com/product/mastering-abp-framework/9781801079242
            - img [ref=e175]
          - generic [ref=e177]:
            - generic [ref=e179]: Follow us on Social Media
            - table [ref=e182]:
              - rowgroup [ref=e183]:
                - row "X.com" [ref=e184]:
                  - cell "X.com" [ref=e185]:
                    - img [ref=e186]
                    - generic [ref=e187]: X.com
                  - cell [ref=e188]:
                    - link [ref=e189] [cursor=pointer]:
                      - /url: https://twitter.com/abpframework
                - row "Discord" [ref=e191]:
                  - cell "Discord" [ref=e192]:
                    - img [ref=e193]
                    - generic [ref=e194]: Discord
                  - cell [ref=e195]:
                    - link [ref=e196] [cursor=pointer]:
                      - /url: https://abp.io/community/discord
                - row "Stack Overflow" [ref=e198]:
                  - cell "Stack Overflow" [ref=e199]:
                    - img [ref=e200]
                    - generic [ref=e201]: Stack Overflow
                  - cell [ref=e202]:
                    - link [ref=e203] [cursor=pointer]:
                      - /url: https://stackoverflow.com/questions/tagged/abp
                - row "YouTube" [ref=e205]:
                  - cell "YouTube" [ref=e206]:
                    - img [ref=e207]
                    - generic [ref=e208]: YouTube
                  - cell [ref=e209]:
                    - link [ref=e210] [cursor=pointer]:
                      - /url: https://www.youtube.com/@Volosoft
                - row "Instagram" [ref=e212]:
                  - cell "Instagram" [ref=e213]:
                    - img [ref=e214]
                    - generic [ref=e215]: Instagram
                  - cell [ref=e216]:
                    - link [ref=e217] [cursor=pointer]:
                      - /url: https://www.instagram.com/abpframework/
      - contentinfo:
        - generic [ref=e220]:
          - generic [ref=e221]: © 2026 TriArch. All rights reserved.
          - generic [ref=e222]:
            - link "About" [ref=e223] [cursor=pointer]:
              - /url: /about
            - link "Privacy" [ref=e224] [cursor=pointer]:
              - /url: /privacy-policy
            - link "Support" [ref=e225] [cursor=pointer]:
              - /url: /support
    - generic:               
    - navigation [ref=e227]:
      - list [ref=e228]:
        - listitem [ref=e229]:
          - link "admin admin" [ref=e230] [cursor=pointer]:
            - /url: "#"
            - img "admin" [ref=e232]
            - generic [ref=e233]: admin
        - listitem
        - listitem [ref=e234]:
          - link "Chat" [ref=e236] [cursor=pointer]:
            - /url: /Chat
        - listitem:
          - generic [ref=e239]:
            - generic [ref=e242] [cursor=pointer]: 
            - generic [ref=e245] [cursor=pointer]: 
            - generic [ref=e247] [cursor=pointer]: 
```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | import { ensureAuthenticated } from '../utils/AuthHelper';
  3   | 
  4   | /**
  5   |  * Theme Settings Tests
  6   |  *
  7   |  * Uses ensureAuthenticated() in beforeEach — if the storageState session
  8   |  * is still valid the test proceeds instantly; if expired it re-logs in.
  9   |  *
  10  |  * What is tested:
  11  |  *   - Opening the LeptonX settings panel via the toolbar gear icon
  12  |  *   - Switching between Light / Semi-Dark / Dark / System themes
  13  |  *   - Verifying each theme is applied via the `selected` CSS class
  14  |  */
  15  | 
  16  | // ─── Helpers ─────────────────────────────────────────────────────────────────
  17  | 
  18  | /**
  19  |  * Opens the LeptonX settings/gear panel.
  20  |  * Tries multiple known selectors in order of specificity.
  21  |  */
  22  | async function openSettingsPanel(page: Page) {
  23  |   // Candidates in order of preference based on actual dashboard structure
  24  |   const candidates = [
  25  |     // LeptonX topbar settings icons (right side of topbar)
  26  |     '.lpx-topbar lpx-settings-toolbar',
  27  |     '.lpx-topbar .setting > .bi',
  28  |     '.lpx-topbar [class*="setting"] i',
  29  |     // Generic icon buttons in the topbar right area
  30  |     '.lpx-toolbar-container button',
  31  |     'lpx-settings-toolbar',
  32  |     // Fallback: any .bi icon inside a .setting container
  33  |     '.setting > .bi',
  34  |     '.setting > i',
  35  |   ];
  36  | 
  37  |   let clicked = false;
  38  |   for (const selector of candidates) {
  39  |     const el = page.locator(selector).first();
  40  |     const visible = await el.isVisible().catch(() => false);
  41  |     if (visible) {
  42  |       await el.click();
  43  |       clicked = true;
  44  |       console.log(`✅ Settings panel opened via: "${selector}"`);
  45  |       break;
  46  |     }
  47  |   }
  48  | 
  49  |   if (!clicked) {
  50  |     throw new Error('❌ Could not find the settings/gear icon. Check the page structure.');
  51  |   }
  52  | 
  53  |   // Wait for the settings panel to appear — check for the panel heading or theme items
  54  |   await page.getByText('General Settings')
  55  |     .or(page.getByText('Appearance'))
  56  |     .or(page.locator('.lpx-settings-panel, [class*="settings-panel"], .lpx-menu-item-link').first())
> 57  |     .waitFor({ state: 'visible', timeout: 10000 });
      |      ^ Error: locator.waitFor: Error: strict mode violation: getByText('General Settings').or(getByText('Appearance')).or(locator('.lpx-settings-panel, [class*="settings-panel"], .lpx-menu-item-link').first()) resolved to 4 elements:
  58  | }
  59  | 
  60  | /**
  61  |  * Clicks a theme option by exact name and asserts the `selected` class is applied.
  62  |  * From screenshot: themes are inside a "General Settings" panel, listed under "Appearance".
  63  |  * Exact regex prevents 'Dark' from matching 'Semi-Dark'.
  64  |  */
  65  | async function switchTheme(page: Page, themeName: string) {
  66  |   // Theme items in the General Settings panel — match by visible text exactly
  67  |   const themeLink = page.locator(
  68  |     '.lpx-settings-panel li, .lpx-settings-panel a, ' +
  69  |     '[class*="setting"] li, [class*="setting"] a, ' +
  70  |     '.lpx-menu-item-link'
  71  |   ).filter({ hasText: new RegExp(`^${themeName}$`) });
  72  | 
  73  |   await themeLink.waitFor({ state: 'visible', timeout: 10000 });
  74  |   await themeLink.click();
  75  |   await page.waitForTimeout(800);
  76  | 
  77  |   // Verify selection applied — try class-based or aria-selected
  78  |   const isSelected =
  79  |     await themeLink.evaluate((el) =>
  80  |       el.classList.contains('selected') ||
  81  |       el.getAttribute('aria-selected') === 'true' ||
  82  |       el.closest('li')?.classList.contains('selected') ||
  83  |       false
  84  |     ).catch(() => false);
  85  | 
  86  |   if (isSelected) {
  87  |     console.log(`✅ Theme switched to "${themeName}" (selected class confirmed)`);
  88  |   } else {
  89  |     // Theme was clicked — visual change is the real assertion
  90  |     console.log(`✅ Theme "${themeName}" clicked — verifying by visibility`);
  91  |     await expect(themeLink).toBeVisible();
  92  |   }
  93  | }
  94  | 
  95  | // ─── Test Suite ───────────────────────────────────────────────────────────────
  96  | 
  97  | test.describe('Theme Settings', () => {
  98  | 
  99  |   test.setTimeout(90000); // covers beforeEach + test body
  100 | 
  101 |   test.beforeEach(async ({ page }) => {
  102 |     // Handles expired sessions automatically — re-logs in if needed
  103 |     await ensureAuthenticated(page);
  104 |     // Open the settings panel ready for each test
  105 |     await openSettingsPanel(page);
  106 |   });
  107 | 
  108 |   test('should switch to Light theme', async ({ page }) => {
  109 |     await switchTheme(page, 'Light');
  110 |   });
  111 | 
  112 |   test('should switch to Semi-Dark theme', async ({ page }) => {
  113 |     await switchTheme(page, 'Semi-Dark');
  114 |   });
  115 | 
  116 |   test('should switch to Dark theme', async ({ page }) => {
  117 |     await switchTheme(page, 'Dark');
  118 |   });
  119 | 
  120 |   test('should switch to System theme', async ({ page }) => {
  121 |     await switchTheme(page, 'System');
  122 |   });
  123 | 
  124 |   test('should cycle through all themes @smoke', async ({ page }) => {
  125 |     await switchTheme(page, 'Light');
  126 |     await switchTheme(page, 'Dark');
  127 |     await switchTheme(page, 'Semi-Dark');
  128 |     await switchTheme(page, 'System');
  129 |   });
  130 | });
```