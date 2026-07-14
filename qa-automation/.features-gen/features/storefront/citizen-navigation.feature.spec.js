/** Generated from: features\storefront\citizen-navigation.feature */
import { test } from "playwright-bdd";

test.describe("Storefront Navigation", () => {

  test("Browse all Storefront pages after login", { tag: ["@storefront", "@navigation", "@smoke"] }, async ({ Given, page, When, And, Then }) => {
    await Given("the citizen is on the Storefront home page", null, { page });
    await When("the citizen clicks on the Log in button", null, { page });
    await And("the citizen logs in with valid credentials", null, { page });
    await And("the user scrolls through the Home page completely", null, { page });
    await And("the user navigates to the Services page and browses through all services", null, { page });
    await And("the user navigates to the About page and scrolls through it", null, { page });
    await And("the user navigates to the Service Requests page clicks reload and scrolls", null, { page });
    await And("the user navigates to the My Projects page clicks reload and scrolls", null, { page });
    await Then("all pages were successfully visited", null, { page });
  });

});

// == technical section ==

test.use({
  $test: ({}, use) => use(test),
  $uri: ({}, use) => use("features\\storefront\\citizen-navigation.feature"),
  $bddFileMeta: ({}, use) => use(bddFileMeta),
});

const bddFileMeta = {
  "Browse all Storefront pages after login": {"pickleLocation":"9:3","tags":["@storefront","@navigation","@smoke"],"ownTags":["@smoke"]},
};