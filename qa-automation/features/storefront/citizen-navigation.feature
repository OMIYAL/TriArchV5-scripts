@storefront @navigation
Feature: Storefront Navigation

  As a storefront user
  I want to browse through all Storefront pages
  So that I can verify each section is accessible

  @smoke
  Scenario: Browse all Storefront pages after login
    Given the citizen is on the Storefront home page
    When the citizen clicks on the Log in button
    And the citizen logs in with valid credentials
    And the user scrolls through the Home page completely
    And the user navigates to the Services page and browses through all services
    And the user navigates to the About page and scrolls through it
    And the user navigates to the Service Requests page clicks reload and scrolls
    And the user navigates to the My Projects page clicks reload and scrolls
    Then all pages were successfully visited
