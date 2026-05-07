# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\navigation.spec.ts >> Sidebar Navigation >> should navigate through the portal sidebar @smoke
- Location: tests\navigation.spec.ts:57:7

# Error details

```
Error: locator.click: Element is not visible
Call log:
  - waiting for locator('#desktop-sidebar').locator('a').filter({ hasText: 'Blogs' }).first()
    - locator resolved to <a href="/Cms/Blogs" id="MenuItem_Cms_Blogs" class="lpx-menu-item-link lpx-menu-item  ">…</a>
  - attempting click action
    - scrolling into view if needed

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
              - link [ref=e72]:
                - /url: /
                - generic [ref=e73]: 
            - listitem [ref=e74]:
              - generic [ref=e75]: 
            - listitem [ref=e76] [cursor=pointer]:
              - link "CMS" [ref=e77]:
                - /url: "#"
            - listitem [ref=e78]:
              - generic [ref=e79]: 
            - listitem [ref=e80] [cursor=pointer]:
              - link "Blog posts" [ref=e81]:
                - /url: "#"
        - generic "Current tenant" [ref=e82]:
          - generic [ref=e83]: 
          - generic [ref=e84]: Sandeep
      - generic [ref=e86]:
        - generic [ref=e87]:
          - heading "Blog posts" [level=1] [ref=e89]
          - button "New blog post" [ref=e91] [cursor=pointer]: New blog post
        - generic [ref=e96]:
          - combobox "All posts" [ref=e99] [cursor=pointer]:
            - generic [ref=e100]: All posts
            - generic [ref=e101]: 
          - generic [ref=e104]:
            - textbox "Search" [ref=e105]
            - button [ref=e106] [cursor=pointer]
        - generic [ref=e110]:
          - generic [ref=e111]:
            - status [ref=e112]: Processing...
            - table [ref=e120]:
              - rowgroup [ref=e121]:
                - 'row "Details Blog Title Title: Activate to sort Slug Slug: Activate to sort Creation time Creation time: Activate to remove sorting Status Status: Activate to sort" [ref=e122]':
                  - columnheader "Details" [ref=e123]:
                    - generic [ref=e125]: Details
                  - columnheader "Blog" [ref=e126]:
                    - generic [ref=e128]: Blog
                  - 'columnheader "Title Title: Activate to sort" [ref=e129] [cursor=pointer]':
                    - generic [ref=e130]:
                      - generic [ref=e131]: Title
                      - 'button "Title: Activate to sort" [ref=e132]'
                  - 'columnheader "Slug Slug: Activate to sort" [ref=e133] [cursor=pointer]':
                    - generic [ref=e134]:
                      - generic [ref=e135]: Slug
                      - 'button "Slug: Activate to sort" [ref=e136]'
                  - 'columnheader "Creation time Creation time: Activate to remove sorting" [ref=e137] [cursor=pointer]':
                    - generic [ref=e138]:
                      - generic [ref=e139]: Creation time
                      - 'button "Creation time: Activate to remove sorting" [ref=e140]'
                  - 'columnheader "Status Status: Activate to sort" [ref=e141] [cursor=pointer]':
                    - generic [ref=e142]:
                      - generic [ref=e143]: Status
                      - 'button "Status: Activate to sort" [ref=e144]'
            - table [ref=e146]:
              - rowgroup [ref=e149]:
                - row "Loading..." [ref=e150]:
                  - cell "Loading..." [ref=e151]
            - generic:
              - generic:
                - table
          - generic [ref=e152]:
            - generic [ref=e155]:
              - text: Show
              - combobox "10" [ref=e157] [cursor=pointer]:
                - generic [ref=e158]: "10"
                - generic [ref=e159]: 
              - text: entries
            - status [ref=e161]
            - generic [ref=e162]:
              - generic:
                - navigation "pagination"
      - contentinfo:
        - generic [ref=e164]:
          - generic [ref=e165]: © 2026 TriArch. All rights reserved.
          - generic [ref=e166]:
            - link "About" [ref=e167] [cursor=pointer]:
              - /url: /about
            - link "Privacy" [ref=e168] [cursor=pointer]:
              - /url: /privacy-policy
            - link "Support" [ref=e169] [cursor=pointer]:
              - /url: /support
    - generic:               
    - navigation [ref=e171]:
      - list [ref=e172]:
        - listitem [ref=e173]:
          - link "admin admin" [ref=e174] [cursor=pointer]:
            - /url: "#"
            - img "admin" [ref=e176]
            - generic [ref=e177]: admin
        - listitem
        - listitem [ref=e178]:
          - link "Chat" [ref=e180] [cursor=pointer]:
            - /url: /Chat
        - listitem:
          - generic [ref=e183]:
            - generic [ref=e186] [cursor=pointer]: 
            - generic [ref=e189] [cursor=pointer]: 
            - generic [ref=e191] [cursor=pointer]: 
```

# Test source

```ts
  1  | import { test, expect, Page } from '@playwright/test';
  2  | import { ensureAuthenticated } from '../utils/AuthHelper';
  3  | 
  4  | /**
  5  |  * Navigation Test
  6  |  *
  7  |  * Single test that navigates through the entire sidebar in sequence:
  8  |  *   1. Dashboard
  9  |  *   2. StoreFront Settings → all 15 sub-pages (expand before each)
  10 |  *
  11 |  * Key facts from DOM inspection:
  12 |  *   - Sidebar container: #desktop-sidebar
  13 |  *   - All sidebar links: <a class="lpx-menu-item-link lpx-menu-item">
  14 |  *   - Text spans have class "hidden-in-hover-trigger" → same issue as theme
  15 |  *   - Fix: scope to #desktop-sidebar, filter by hasText (works on DOM text
  16 |  *     regardless of CSS visibility), then click({ force: true })
  17 |  *
  18 |  * "Saas" is NOT in this tenant's sidebar — removed from the test.
  19 |  */
  20 | 
  21 | // ─── Helper ──────────────────────────────────────────────────────────────────
  22 | 
  23 | /**
  24 |  * Clicks a sidebar link by text using force:true to bypass hidden-in-hover-trigger.
  25 |  * Scoped to #desktop-sidebar to avoid matching content-area links.
  26 |  */
  27 | async function clickSidebarLink(page: Page, linkText: string) {
  28 |   const sidebar = page.locator('#desktop-sidebar');
  29 | 
  30 |   // filter({ hasText }) matches text content regardless of CSS visibility
  31 |   const link = sidebar.locator('a').filter({ hasText: linkText }).first();
  32 | 
  33 |   await link.waitFor({ state: 'attached', timeout: 15000 });
> 34 |   await link.click({ force: true }); // force: bypasses hidden-in-hover-trigger on the span
     |              ^ Error: locator.click: Element is not visible
  35 | 
  36 |   // domcontentloaded is reliable; networkidle is not (portal has background polling)
  37 |   await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  38 |   await page.waitForTimeout(600); // brief settle for Angular to render
  39 | 
  40 |   console.log(`✅ Navigated to "${linkText}"`);
  41 | }
  42 | 
  43 | // ─── Test Suite ───────────────────────────────────────────────────────────────
  44 | 
  45 | test.describe('Sidebar Navigation', () => {
  46 | 
  47 |   test.setTimeout(180000); // 3 min for 15+ pages
  48 | 
  49 |   test.beforeEach(async ({ page }) => {
  50 |     await ensureAuthenticated(page);
  51 |   });
  52 | 
  53 |   /**
  54 |    * Single navigation test: visits Dashboard then all StoreFront Settings pages.
  55 |    * This keeps the count at 2 (1 setup + 1 test).
  56 |    */
  57 |   test('should navigate through the portal sidebar @smoke', async ({ page }) => {
  58 | 
  59 |     // ── 1. Dashboard ──────────────────────────────────────────────────────────
  60 |     await clickSidebarLink(page, 'Dashboard');
  61 |     await expect(page).toHaveURL(/stg-portal\.triarch\.ai/, { timeout: 10000 });
  62 |     console.log('📌 Dashboard: ✅');
  63 | 
  64 |     // ── 2. StoreFront Settings sub-pages ──────────────────────────────────────
  65 |     const storefrontPages = [
  66 |       'Blog posts',
  67 |       'Blogs',
  68 |       'Comments',
  69 |       'FAQ',
  70 |       'Global resources',
  71 |       'Menus',
  72 |       'Newsletter users',
  73 |       'Page feedbacks',
  74 |       'Pages',
  75 |       'Polls',
  76 |       'Tags',
  77 |       'Url forwarding',
  78 |       'TriArchEvents',
  79 |       'Branding',
  80 |       'Forms',
  81 |     ];
  82 | 
  83 |     for (const pageName of storefrontPages) {
  84 |       // Expand "StoreFront Settings" each time — it may collapse after navigation
  85 |       await clickSidebarLink(page, 'StoreFront Settings');
  86 | 
  87 |       // Now click the sub-page link
  88 |       await clickSidebarLink(page, pageName);
  89 | 
  90 |       // Verify still on the portal (not an error page)
  91 |       await expect(page).toHaveURL(/stg-portal\.triarch\.ai/, { timeout: 10000 });
  92 |       console.log(`📌 StoreFront → ${pageName}: ✅`);
  93 |     }
  94 | 
  95 |     console.log(`\n🎉 All ${storefrontPages.length + 1} navigation items verified.`);
  96 |   });
  97 | 
  98 | });
```