/** Generated from: features\storefront\citizen_submit_sr.feature */
import { test } from "../../../fixtures/mimik.fixture.ts";

test.describe("Storefront Citizen Service Request Submission", () => {

  test("Citizen selects a service, logs in, creates a project, and submits a service request", { tag: ["@citizen", "@storefront", "@smoke"] }, async ({ Given, page, context, And, When, Then }) => {
    await Given("Mimik recording is started", null, { page, context });
    await And("the citizen is on the Storefront home page", null, { page });
    await And("the citizen navigates to an available service", null, { page });
    await When("the citizen logs in with valid credentials", null, { page });
    await And("creates a new project for the service application", null, { page });
    await And("completes all required form steps and checklists", null, { page });
    await And("completes the intake fee payment via Stripe if required", null, { page });
    await Then("the service request should be submitted successfully", null, { page });
    await And("the tracking number and service request state should be saved", null, { page });
    await And("Mimik recording is stopped and the guide is exported", null, { page, context });
  });

});

// == technical section ==

test.use({
  $test: ({}, use) => use(test),
  $uri: ({}, use) => use("features\\storefront\\citizen_submit_sr.feature"),
  $bddFileMeta: ({}, use) => use(bddFileMeta),
});

const bddFileMeta = {
  "Citizen selects a service, logs in, creates a project, and submits a service request": {"pickleLocation":"3:3","tags":["@citizen","@storefront","@smoke"],"ownTags":["@smoke","@storefront","@citizen"]},
};