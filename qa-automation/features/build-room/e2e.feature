Feature: ITB project through bidding — Estimate, Quote review, and Approval

  As a BuildRoom estimator
  I want one continuous flow from a new ITB project through pricing, a sent quote, and sign-off
  So that the whole bidding pipeline is covered, not just Take-Off through the raw estimate
  @build-room
  Scenario: A new bid moves from Take-Off through pricing, a sent quote, and sign-off
    Given the Estimator is logged in to BuildRoom
    When the Estimator opens or creates a project from the ITB fixture "spring-pointe-exchange-combined.pdf" with GC "Ridgeline Commercial Builders", bid deadline "12/15/2026" and department "automation"
    And the Estimator assigns department "automation" and launches the Fire alarm phase
    Then the Take-Off stage is unlocked
    When the Estimator clears any devices left on the count log
    And the Estimator adds device "Wall strobe - white" to the count log
    And the Estimator places the device on the plan
    Then the count log shows 1 placed for "Wall strobe - white"
    When the Estimator adds device "Basis 1000 Wire Test" to the count log
    And the Estimator sets the sheet scale to "ft" using common scale "3"
    And the Estimator draws a linear run for the device on the plan
    Then the count log shows a non-zero length for "Basis 1000 Wire Test"
    When the Estimator changes the active plan to "POWER PLAN"
    And the Estimator adds device "E3 Series Basic System Modules" to the count log
    And the Estimator places the device on the symbols at "0.3926,0.1390 0.3319,0.1066 0.3405,0.2706"
    Then the count log shows 3 placed for "E3 Series Basic System Modules"
    When the Estimator generates the BOM
    Then the BOM shows a "Wall strobe - white" line sourced from Take-off
    And the BOM shows a "Basis 1000 Wire Test" line sourced from Take-off
    And the BOM shows a "E3 Series Basic System Modules" line sourced from Take-off
    When the Estimator approves the BOM
    Then the Estimate's cost stack shows a "Wall strobe - white" material line and a non-zero Direct cost
    When the Estimator sets Overhead to 12 percent
    And the Estimator sets Contingency to 3 percent
    And the Estimator adds a "Tax" cost line of 8.875 percent with notes "Local sales tax"
    Then the Estimate's cost basis reflects the added cost line
    When the Estimator locks the estimate
    Then the Quote review document is shown
    When the Estimator sends the quote for approval
    Then the Approval stage shows 0 of the roster signed
    When the Estimator signs as the primary account
    Then the bid advances to Submit
    When the Estimator ticks every contractor attestation
    Then the Submit checklist is complete
    When the Estimator submits the bid
    Then the bid shows as submitted
