Feature: Coordinator splits activity steps between two different reviewers

  As a Coordinator
  I want to assign the first 3 activity steps to one reviewer
  And the remaining steps to a second reviewer
  So that the workload is distributed and each reviewer handles only their assigned steps

  Scenario: Coordinator assigns first 3 steps to one reviewer and the rest to another
    Given the Coordinator is logged in to the portal
    When the Coordinator opens a Pending Intake Service Request
    Then the Coordinator assigns the first 3 activity steps to "Reviewer 1"
    And the Coordinator assigns the remaining activity steps to "Reviewer 2"
    And the Coordinator launches the review
    Then the Service Request moves to Under Review
