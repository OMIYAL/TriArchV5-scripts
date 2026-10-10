Feature: Catalog — Parts & Assemblies edit panel

  As a BuildRoom estimator
  I want to view a catalog part's details, edit its price and create new catalog parts
  So that the catalog stays accurate

  @build-room @smoke
  Scenario: Editing a part's manual price persists and shows in the grid
    Given the Estimator is logged in to BuildRoom
    When the Estimator opens Parts & Assemblies
    And the Estimator searches the catalog for "Addressable Pull Station, Single Action"
    Then the Estimator ensures the part "Addressable Pull Station, Single Action" with catalog number "PS-2000-SA" exists in category "Fire Alarm Devices"
    When the Estimator opens the part named "Addressable Pull Station, Single Action"
    Then the Catalog Part Edit panel shows the expected fields
    When the Estimator sets a manual Trade List Price and Net Cost of "88.00" on the open part
    And the Estimator saves the Catalog Part Edit panel
    Then the grid shows "Addressable Pull Station, Single Action" priced at "$88.00" and following "MANUAL"
