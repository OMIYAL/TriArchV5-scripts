Feature: Reviewer reviews the service request activity successfully 

  As a reviewer I want to review all the activity steps of a service request that has been assigned to me 
  So the decision can be submitted successfully 

  @control-room @smoke @long-flow
  Scenario: Reviewer successfully submits the activity steps decision 
    Given that the Reviewer is on the Landing page of the portal 
    And the Reviewer logs in with valid credentials 
    Then the Reviewer gets redirected to home page dashboard 
    When the Reviewer navigates to the Service Requests page 
    And the Reviewer selects a Service Request which is UNDER REVIEW 
    Then the Reviewer gets redirected to the Specific Request 
    When the Reviewer processes all active activities