Feature: Citizen views and downloads documents from My Requests
  As a citizen
  I want to download my documents from a closed service request
  So that I can view my report and certificate

  @status @storefront @smoke
  Scenario: Citizen successfully views status history and downloads documents
    Given the citizen is on the Storefront home page
    When the citizen clicks on the Log in button
    And the citizen logs in with valid credentials
    When the citizen clicks on the My Requests
    And a list of requests appears
    When the citizen selects a closed status service request
    Then the citizen should be redirected to that closed service request
    And the citizen selects view status history
    And the citizen selects Application form
    And the citizen selects Submission checklist
    And the citizen selects Supporting documents
    When the citizen downloads all available documents
    Then all documents should be downloaded successfully