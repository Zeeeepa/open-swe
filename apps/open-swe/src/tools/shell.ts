import { tool } from "@langchain/core/tools";
import { GraphState } from "@open-swe/shared/open-swe/types";
import { getSandboxErrorFields } from "../utils/sandbox-error-fields.js";
import { createLogger, LogLevel } from "../utils/logger.js";
import { TIMEOUT_SEC } from "@open-swe/shared/constants";
import { createShellToolFields } from "@open-swe/shared/open-swe/tools";
import { getSandboxSessionOrThrow } from "./utils/get-sandbox-id.js";

const logger = createLogger(LogLevel.INFO, "ShellTool");

const DEFAULT_ENV = {
  // Prevents corepack from showing a y/n download prompt which causes the command to hang
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
};

export function createShellTool(
  state: Pick<GraphState, "sandboxSessionId" | "targetRepository">,
) {
  const shellTool = tool(
    async (input): Promise<{ result: string; status: "success" | "error" }> => {
      try {
        const sandbox = await getSandboxSessionOrThrow(input);

        const { command, workdir, timeout } = input;
        const response = await sandbox.process.executeCommand(
          command.join(" "),
          workdir,
          DEFAULT_ENV,
          timeout ?? TIMEOUT_SEC,
        );

        if (response.exitCode !== 0) {
          logger.error("Failed to run command", {
            error: response.result,
            error_result: response,
            input,
          });
          throw new Error(
            `Command failed. Exit code: ${response.exitCode}\nResult: ${response.result}\nStdout:\n${response.artifacts?.stdout}`,
          );
        }

        return {
          result: response.result,
          status: "success",
        };
      } catch (e) {
        const errorFields = getSandboxErrorFields(e);
        if (errorFields) {
          logger.error("Failed to run command", {
            input,
            error: errorFields,
          });
          throw new Error(
            `Command failed. Exit code: ${errorFields.exitCode}\nError: ${errorFields.result}\nStdout:\n${errorFields.artifacts?.stdout}`,
          );
        }

        logger.error(
          "Failed to run command: " +
            (e instanceof Error ? e.message : "Unknown error"),
          {
            error: e,
            input,
          },
        );
        throw new Error(
          "FAILED TO RUN COMMAND: " +
            (e instanceof Error ? e.message : "Unknown error"),
        );
      }
    },
    createShellToolFields(state.targetRepository),
  );

  return shellTool;
}
