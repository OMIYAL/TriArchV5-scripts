Feature: Catalog — Discount Structures

  As a BuildRoom estimator
  I want to create manufacturer/category discount rules that can't touch real price imports
  So that price-file imports net parts correctly without ever touching a real, in-force rule

  @build-room @smoke
  Scenario: Scoping a new rule to a manufacturer shows a preview, then saves it
    Given the Estimator is logged in to BuildRoom
    When the Estimator opens Discount Structures
    And the Estimator opens the New rule panel
    Then the New rule panel shows the expected fields
    When the Estimator scopes the new rule to manufacturer "Acme" at 10 percent off list
    Then the New rule preview reports how many "Acme" parts would net
    When the Estimator sets the new rule's effective window to tomorrow and marks it inactive
    And the Estimator saves the New rule panel
    Then the grid shows the "Acme" rule rated "10% off" and marked "INACTIVE"
