/** Generated from: features\storefront\citizen-status.feature */
import { test } from "playwright-bdd";

test.describe("Citizen views and downloads documents from My Requests", () => {

  test("Citizen successfully views status history and downloads documents", { tag: ["@status", "@storefront", "@smoke"] }, async ({ Given, page, When, And, Then }) => {
    await Given("the citizen is on the Storefront home page", null, { page });
    await When("the citizen clicks on the Log in button", null, { page });
    await And("the citizen logs in with valid credentials", null, { page });
    await When("the citizen clicks on the My Requests", null, { page });
    await And("a list of requests appears");
    await When("the citizen selects a closed status service request");
    await Then("the citizen should be redirected to that closed service request");
    await And("the citizen selects view status history");
    await And("the citizen selects Application form");
    await And("the citizen selects Submission checklist");
    await And("the citizen selects Supporting documents");
    await When("the citizen downloads all available documents");
    await Then("all documents should be downloaded successfully");
  });

});

// == technical section ==

test.use({
  $test: ({}, use) => use(test),
  $uri: ({}, use) => use("features\\storefront\\citizen-status.feature"),
  $bddFileMeta: ({}, use) => use(bddFileMeta),
});

const bddFileMeta = {
  "Citizen successfully views status history and downloads documents": {"pickleLocation":"7:3","tags":["@status","@storefront","@smoke"],"ownTags":["@smoke","@storefront","@status"]},
};