import { createOwnedCharacterLookup } from "./contributor-policy.js";
import CAST_ROWS from "./characters.gen.json" with { type: "json" };

export const contributorFor = createOwnedCharacterLookup(CAST_ROWS);
