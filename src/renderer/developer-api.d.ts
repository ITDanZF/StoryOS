import type { DeveloperDatabaseApi } from "../shared/developerDatabase.ts";
declare global {
  interface Window { storyOSDeveloper?: DeveloperDatabaseApi }
}
