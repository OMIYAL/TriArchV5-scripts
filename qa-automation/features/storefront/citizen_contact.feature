Feature: Storefront Citizen Contact
  As a citizen
  I want to be able to use the contact page
  So that I can send inquiries or messages

  @contact @storefront @smoke
  Scenario: Citizen successfully submits a contact request
    Given the citizen is on the Storefront home page
    When the citizen clicks on the Log in button
    And the citizen logs in with valid credentials
    And the user navigates to the Contact page
    And the user fills in all contact form fields
    And the user clicks the "Send message" button
    Then the contact request is submitted successfully
