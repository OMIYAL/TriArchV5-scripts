Feature: Reviewer sends a document review step back for revision and citizen resubmits

  As a Reviewer I want to mark a document review activity as "Needs a revision"
  So that the citizen is prompted to correct and resubmit the document
  And I can then approve the corrected submission to complete the review

  @control-room @smoke @long-flow
  Scenario: Reviewer submits "Needs a revision" on a document step and citizen resubmits corrections

    # --- 1. Reviewer logs in and marks first document step as Needs Revision ---
    Given that the Reviewer is on the Landing page of the portal
    And the Reviewer logs in with valid credentials
    Then the Reviewer gets redirected to home page dashboard
    When the Reviewer navigates to the Service Requests page
    And the Reviewer selects a Service Request and triggers the Document Review revision

    # --- 2. Citizen logs in and resubmits corrections ---
    Given the user session is cleared
    Given the citizen is on the Storefront home page
    When the citizen clicks on the Log in button
    And the citizen logs in with valid credentials
    When the citizen clicks on the My Requests
    And the citizen selects the Service Request for the current tracking ID which is in CORRECTION REQUIRED
    And the citizen selects submits correction
    And the citizen uploads a pdf document for correction
    And the citizen writes the correction notes
    And the citizen submits the correction

    # --- 3. Reviewer logs back in and approves all remaining steps ---
    Given the user session is cleared
    Given that the Reviewer is on the Landing page of the portal
    And the Reviewer logs in with valid credentials
    Then the Reviewer gets redirected to home page dashboard
    When the Reviewer navigates to the Service Requests page
    And the Reviewer selects the Service Request for the current tracking ID which is in "UNDER REVIEW"
    Then the Reviewer gets redirected to the Specific Request
    When the Reviewer processes all active activities
