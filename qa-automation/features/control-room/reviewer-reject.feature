Feature: Reviewer reviews the service request activity successfully

  As a reviewer I want to review all the activity steps of a service request that has been assigned to me
  So the decision can be submitted successfully

  @control-room @smoke
  Scenario: Reviewer successfully rejects the activity steps decision

    # --- Login & navigation — reuses reviewer.steps.ts ---
    Given that the Reviewer is on the Landing page of the portal
    And the Reviewer logs in with valid credentials
    Then the Reviewer gets redirected to home page dashboard
    When the Reviewer navigates to the Service Requests page

    # --- Reject flow — single new step delegates to ActivityRevisionPage ---
    When the Reviewer selects a Service Request and triggers the Document Review rejection

    # --- Assertions — reviewer-reject.steps.ts ---
    Then the activity status should be rejected
    And the request status should be rejected