Feature: Reviewer reviews the service request activity successfully
 
  As a Reviewer
  I want to review all the activity steps of a service request assigned to me
  So that the decision can be submitted successfully
 
  Scenario: Reviewer successfully submits the activity steps decision
 
    Given that the Reviewer is on the Landing page of the portal
    And the Reviewer logs in with valid credentials
    Then the Reviewer gets redirected to home page dashboard
    When the Reviewer selects a Service Request which is UNDER REVIEW
    Then the Reviewer gets redirected to the Specific Request
    When the Reviewer proceeds with the remaining activity steps
    And the Reviewer selects the "Conditional Decision" option for the "Document review" activity only
    Then the status of the service request should be "Closed"