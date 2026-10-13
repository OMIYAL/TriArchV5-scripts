Feature: ITB project through bidding — Estimate, Quote review, and Approval

  As a BuildRoom estimator
  I want one continuous flow from a new ITB project through pricing, a sent quote, and sign-off
  So that the whole bidding pipeline is covered, not just Take-Off through the raw estimate

  @build-room @smoke
  Scenario: A new bid moves from Take-Off through pricing, a sent quote, and sign-off
    Given the Estimator is logged in to BuildRoom
    When the Estimator creates a project from the ITB fixture "UNC_Gray_Hall_-_90__DD_STOP_AND_PLOT_-_ELECTRICAL_-_Fire_Alarm_Take_Off_2.pdf" with bid deadline "12/12/2027"
    And the Estimator launches the phase
    Then the workflow is at the "Take-Off" stage
    When the Estimator clears any devices left on the count log
    And the Estimator adds any catalog device as "@deviceA" to the count log
    And the Estimator places the device on the plan
    Then the count log shows 1 placed for "@deviceA"
    When the Estimator adds any catalog device as "@deviceB" to the count log
    And the Estimator places the device on the plan
    Then the count log shows 1 placed for "@deviceB"
    When the Estimator generates the BOM
    Then the workflow is at the "BOM review" stage
    When the Estimator approves the BOM
    Then the workflow is at the "Estimate" stage
    When the Estimator locks the estimate
    Then the workflow is at the "Quote review" stage
    When the Estimator sends the quote for approval
    Then the workflow is at the "Approval" stage
    When the Estimator signs as the primary account
    Then the workflow is at the "Submit" stage
    When the Estimator ticks every contractor attestation
And the Estimator submits the bid
    Then the bid shows as submitted