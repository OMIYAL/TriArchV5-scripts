@citizen @storefront @smoke
Feature: Storefront Citizen Service Request Submission
  Scenario: Citizen selects a service, logs in, creates a project, and submits a service request
    Given the citizen is on the Storefront home page
    When the citizen opens the services listing
    And an available service is listed on the Storefront
    And the citizen navigates to the available service
    And the citizen logs in with valid credentials
    And the citizen creates a new project for the service application
    And the citizen completes all required form steps and checklists
    And the citizen completes the intake fee payment via Stripe if required
    Then the service request should be submitted successfully
    And the system should generate a tracking number
    And the service request state should be set to "Submitted"
