Feature: Catalog — Vendor prices on a part

  As a BuildRoom estimator
  I want to add a vendor's price to a part, use it, and later stop following that vendor
  So that a part's net cost can be pinned to a vendor quote and released back to file pricing

  Background:
    Given the Estimator is logged in to BuildRoom
    When the Estimator opens Parts & Assemblies
    And the Estimator searches the catalog for "Addressable Pull Station, Single Action"
    Then the Estimator ensures the part "Addressable Pull Station, Single Action" with catalog number "PS-2000-SA" exists in category "Fire Alarm Devices"
    When the Estimator opens the part named "Addressable Pull Station, Single Action"

  @build-room @smoke
  Scenario: Using a vendor price flips the part to VENDOR pricing
    When the Estimator adds a vendor price from "WireCo" of "60.00" with quote "Q-84220" expiring "2026-12-31"
    And the Estimator uses the "WireCo" vendor price
    And the Estimator saves the Catalog Part Edit panel
    Then the grid shows "Addressable Pull Station, Single Action" priced at "$60.00" and following "VENDOR"

  @build-room @smoke
  Scenario: Stopping using a vendor returns the part to file pricing without changing net cost
    Given the part already follows the "WireCo" vendor price at "60.00" with quote "Q-84220" expiring "2026-12-31"
    When the Estimator stops using the "WireCo" vendor price
    And the Estimator saves the Catalog Part Edit panel
    Then the grid shows "Addressable Pull Station, Single Action" priced at "$60.00" and following "FILE"
