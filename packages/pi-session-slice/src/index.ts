/** Registers the `/slice` command. */

import { runSliceCommand } from "./commands/slice.js";
import { EXTENSION_NAME } from "./extension-name.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { guardCommand } from "@sherif-fanous/pi-extensions-core";

/** Register the session-slice command. */
export default function sessionSlice(pi: ExtensionAPI): void {
  pi.registerCommand("slice", {
    description: "Start a new session from a range of this one",
    handler: guardCommand(EXTENSION_NAME, runSliceCommand),
  });
}
