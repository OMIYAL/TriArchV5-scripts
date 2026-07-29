Feature: Reviewer gives a Conditional decision on a document review activity
 
  As a Reviewer
  I want to review all the activity steps of a service request assigned to me
  So that the decision can be submitted successfully
 
  @control-room @smoke @long-flow
  Scenario: Reviewer successfully submits the activity steps decision
 
    Given that the Reviewer is on the Landing page of the portal
    And the Reviewer logs in with valid credentials
    Then the Reviewer gets redirected to home page dashboard
    When the Reviewer selects a Service Request and triggers the Conditional decision on the Document Review step
    Then the Reviewer selects the "Conditional" option for the "Document review" activity only
    Then the status of the service request should be "Closed"