Feature: Coordinator assigns all activity steps to the same reviewer

  As a Coordinator
  I want to assign all activity steps of a Pending Intake Service Request to a single reviewer
  So that one reviewer processes the entire request end-to-end

  Scenario: Coordinator assigns all activity steps to the same reviewer
    Given the Coordinator is logged in to the portal
    When the Coordinator opens a Pending Intake Service Request
    Then the Coordinator assigns all activity steps to "Reviewer 2"
    And the Coordinator launches the review
    Then the Service Request moves to Under Review
