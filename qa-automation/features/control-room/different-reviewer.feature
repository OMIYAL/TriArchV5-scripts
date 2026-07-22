Feature: Dual-reviewer workflow where two reviewers split the activity steps

  As a system with two reviewers assigned to the same Service Request
  So that each reviewer processes only their assigned steps
  Reviewer 1 handles the first 3 activity steps and Reviewer 2 completes the rest

  Scenario: Two reviewers collaboratively process a Service Request
    Given that the Reviewer is on the Landing page of the portal
    And Reviewer 1 logs in with Reviewer 1 credentials
    Then the Reviewer gets redirected to home page dashboard
    When the Reviewer navigates to the Service Requests page
    And the Reviewer selects a multi-reviewer Service Request which is UNDER REVIEW
    Then the Reviewer gets redirected to the Specific Request
    When Reviewer 1 processes the first 3 activity steps and captures the tracking number

    When Reviewer 2 logs in to the portal
    And Reviewer 2 navigates to the captured Service Request
    And Reviewer 2 processes the remaining activity steps
