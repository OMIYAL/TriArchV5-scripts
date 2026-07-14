/** Generated from: features\storefront\citizen_contact.feature */
import { test } from "playwright-bdd";

test.describe("Storefront Citizen Contact", () => {

  test("Citizen successfully submits a contact request", { tag: ["@contact", "@storefront", "@smoke"] }, async ({ Given, page, When, And, Then }) => {
    await Given("the citizen is on the Storefront home page", null, { page });
    await When("the citizen clicks on the Log in button", null, { page });
    await And("the citizen logs in with valid credentials", null, { page });
    await And("the user navigates to the Contact page", null, { page });
    await And("the user fills in all contact form fields", null, { page });
    await And("the user clicks the \"Send message\" button", null, { page });
    await Then("the contact request is submitted successfully", null, { page });
  });

});

// == technical section ==

test.use({
  $test: ({}, use) => use(test),
  $uri: ({}, use) => use("features\\storefront\\citizen_contact.feature"),
  $bddFileMeta: ({}, use) => use(bddFileMeta),
});

const bddFileMeta = {
  "Citizen successfully submits a contact request": {"pickleLocation":"7:3","tags":["@contact","@storefront","@smoke"],"ownTags":["@smoke","@storefront","@contact"]},
};