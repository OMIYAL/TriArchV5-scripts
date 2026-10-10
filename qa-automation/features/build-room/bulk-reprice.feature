Feature: Catalog — Bulk Reprice preview

  As a BuildRoom estimator
  I want to preview a Bulk Reprice batch scoped to a category and rate
  So that I can see its impact before deciding whether to queue it

  @build-room @smoke
  Scenario: Bulk Reprice preview recomputes for real when the category scope changes
    Given the Estimator is logged in to BuildRoom
    When the Estimator opens Parts & Assemblies
    And the Estimator opens the Bulk Reprice panel
    Then the Bulk Reprice panel shows the rate toggle and rate input
    When the Estimator scopes the batch to category "Fire Alarm Devices" at 10 percent off list
    Then the Bulk Reprice preview reports how many parts would update
    When the Estimator rescopes the batch to category "Fire Alarm"
    Then the Bulk Reprice preview reports a different part count than before
    When the Estimator cancels the Bulk Reprice panel
    Then the Bulk Reprice panel is closed

  @build-room @smoke
  Scenario: Queuing a Bulk Reprice batch for real updates the scoped parts' pricing
    Given the Estimator is logged in to BuildRoom
    When the Estimator opens Parts & Assemblies
    And the Estimator opens the Bulk Reprice panel
    And the Estimator scopes the batch to manufacturer "Acme" at 1 percent off list
    Then the Bulk Reprice preview reports how many parts would update and that manual overrides are protected
    When the Estimator queues the Bulk Reprice batch
    Then the catalog grid shows "Acme" parts priced with today's FILE date
