import { faker } from '@faker-js/faker';

export interface DynamicProjectData {
  name: string;
  jurisdiction: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  // Building characteristics
  grossSquareFootage: string;
  height: string;
  numberOfFloors: string;
  occupancyType: string;
  constructionType: string;
  sprinklerCoverage: string;
}

/**
 * Generates dynamic, randomized data for project creation to avoid
 * test collisions and remove reliance on hardcoded .env values.
 */
export function generateDynamicProjectData(): DynamicProjectData {
  return {
    // Generate a unique project name (e.g. "Test Project Acme Steel 1234")
    name: `Test Project ${faker.commerce.productName()} ${faker.string.numeric(4)}`,
    jurisdiction: faker.helpers.arrayElement(['Colorado', 'California', 'Texas', 'Florida', 'New York', 'Georgia']),
    streetAddress: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    postalCode: faker.location.zipCode('#####'),
    
    // Generate realistic building characteristics
    grossSquareFootage: faker.number.int({ min: 1000, max: 50000 }).toString(),
    height: faker.number.int({ min: 15, max: 200 }).toString(),
    numberOfFloors: faker.number.int({ min: 1, max: 15 }).toString(),
    
    // Pick random standard IBC values for dropdowns
    occupancyType: faker.helpers.arrayElement(['A1', 'B', 'E', 'M', 'R1', 'S1']),
    constructionType: faker.helpers.arrayElement(['TypeIA', 'TypeIB', 'TypeIIA', 'TypeIIB', 'TypeVA']),
    sprinklerCoverage: faker.helpers.arrayElement(['None', 'Partial', 'FullNfpa13', 'FullNfpa13R', 'FullNfpa13D']),
  };
}
