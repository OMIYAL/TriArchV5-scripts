Feature: Grand End-to-End Service Request Workflow
  
  @e2e @smoke
  Scenario: Citizen submits SR, Coordinator dynamically assigns, Reviewer(s) process
    # --- Citizen Flow ---
    Given the citizen is on the Storefront home page
    And the citizen navigates to an available service
    When the citizen logs in with valid credentials
    And creates a new project for the service application
    And completes all required form steps and checklists
    And completes the intake fee payment via Stripe if required
    Then the service request should be submitted successfully
    And the tracking number and service request state should be saved

    # --- Coordinator Flow ---
    Given the Coordinator is logged in to the portal
    When the Coordinator opens the newly created Service Request
    Then the Coordinator randomly assigns activity steps to reviewers
    And the Coordinator launches the review
    And the Service Request moves to Under Review

    # --- Reviewer Flow ---
    # This step dynamically logs in as each assigned reviewer and processes their activities
    Then the assigned Reviewers sequentially process all active activities
