Feature: Citizen creates New Permit Project in the Storefront

  Background:
    Given the citizen is on the Storefront home page
    And the citizen logs in with valid credentials

  @citizen @storefront @smoke
  Scenario: Successfully create a new permit project
    When the citizen navigates to My Projects
    And creates a new permit project
    Then the new project should be created successfully
