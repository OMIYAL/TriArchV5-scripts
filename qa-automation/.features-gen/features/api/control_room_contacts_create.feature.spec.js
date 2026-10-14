/** Generated from: features\api\control_room_contacts_create.feature */
import { test } from "playwright-bdd";

test.describe("TriArch Control Room Contacts (slice)", () => {

  test("Create Control Room contact leading to 200", { tag: ["@contact", "@api", "@control-room", "@smoke"] }, async ({ Given, And, When, request, Then }) => {
    await Given("the API base URL is configured");
    await And("a valid Authorization bearer token is configured");
    await And("request body is the OpenAPI example for this operation");
    await When("request operation is \"POST\"");
    await And("request path is \"/api/control-room/contacts\"");
    await And("the request is sent", null, { request });
    await Then("response status is 200");
    await And("response JSON has non-empty field \"id\"");
    await And("response JSON field \"firstName\" equals the prepared request field \"firstName\"");
    await And("response JSON field \"email\" equals the prepared request field \"email\"");
  });

  test("Create Control Room contact missing email leading to 400", { tag: ["@contact", "@api", "@control-room"] }, async ({ Given, And, When, request, Then }) => {
    await Given("the API base URL is configured");
    await And("a valid Authorization bearer token is configured");
    await And("request body is the OpenAPI example without field \"email\"");
    await When("request operation is \"POST\"");
    await And("request path is \"/api/control-room/contacts\"");
    await And("the request is sent", null, { request });
    await Then("response status is 400");
  });

  test("Create Control Room contact without token leading to 401 or 403", { tag: ["@contact", "@api", "@control-room"] }, async ({ Given, And, When, request, Then }) => {
    await Given("the API base URL is configured");
    await And("no Authorization bearer token");
    await And("request body is the OpenAPI example for this operation");
    await When("request operation is \"POST\"");
    await And("request path is \"/api/control-room/contacts\"");
    await And("the request is sent", null, { request });
    await Then("response status is 401 or 403 or 404");
  });

});

// == technical section ==

test.use({
  $test: ({}, use) => use(test),
  $uri: ({}, use) => use("features\\api\\control_room_contacts_create.feature"),
  $bddFileMeta: ({}, use) => use(bddFileMeta),
});

const bddFileMeta = {
  "Create Control Room contact leading to 200": {"pickleLocation":"6:3","tags":["@contact","@api","@control-room","@smoke"],"ownTags":["@smoke","@control-room","@api","@contact"]},
  "Create Control Room contact missing email leading to 400": {"pickleLocation":"20:3","tags":["@contact","@api","@control-room"],"ownTags":["@control-room","@api","@contact"]},
  "Create Control Room contact without token leading to 401 or 403": {"pickleLocation":"30:3","tags":["@contact","@api","@control-room"],"ownTags":["@control-room","@api","@contact"]},
};