Feature: Storefront Citizen Service Request Submission
  @citizen @storefront @smoke
  Scenario: Citizen selects a service, logs in, creates a project, and submits a service request
    Given Mimik recording is started
    And the citizen is on the Storefront home page
    And the citizen navigates to an available service
    When the citizen logs in with valid credentials
    And creates a new project for the service application
    And completes all required form steps and checklists
    And completes the intake fee payment via Stripe if required
    Then the service request should be submitted successfully
    And the tracking number and service request state should be saved
    And Mimik recording is stopped
    And the Mimik guide is opened from the side panel
    And the Mimik guide is exported as PDF
