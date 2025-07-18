import { tool } from "@langchain/core/tools";
import { applyPatch } from "diff";
import { GraphState } from "@open-swe/shared/open-swe/types";
import { readFile, writeFile } from "../utils/read-write.js";
import { fixGitPatch } from "../utils/diff.js";
import { createLogger, LogLevel } from "../utils/logger.js";
import { createApplyPatchToolFields } from "@open-swe/shared/open-swe/tools";
import { getRepoAbsolutePath } from "@open-swe/shared/git";
import { getSandboxSessionOrThrow } from "./utils/get-sandbox-id.js";

const logger = createLogger(LogLevel.INFO, "ApplyPatchTool");

export function createApplyPatchTool(state: GraphState) {
  const applyPatchTool = tool(
    async (input): Promise<{ result: string; status: "success" | "error" }> => {
      const sandbox = await getSandboxSessionOrThrow(input);

      const { diff, file_path } = input;

      const workDir = getRepoAbsolutePath(state.targetRepository);
      const { success: readFileSuccess, output: readFileOutput } =
        await readFile({
          sandbox,
          filePath: file_path,
          workDir,
        });
      if (!readFileSuccess) {
        logger.error(readFileOutput);
        throw new Error(readFileOutput);
      }

      let patchedContent: string | false;
      let fixedDiff: string | false = false;
      let errorApplyingPatchMessage: string | undefined;
      try {
        logger.info(`Applying patch to file ${file_path}`);
        patchedContent = applyPatch(readFileOutput, diff);
      } catch (e) {
        errorApplyingPatchMessage = e instanceof Error ? e.message : undefined;
        try {
          logger.warn("Failed to apply patch, trying to fix diff", {
            error: e,
          });
          const fixedDiff_ = fixGitPatch(diff, {
            [file_path]: readFileOutput,
          });
          patchedContent = applyPatch(readFileOutput, fixedDiff_);
          logger.info("Successfully fixed diff and applied patch to file", {
            file_path,
          });
          if (patchedContent) {
            fixedDiff = fixedDiff_;
          }
        } catch (_) {
          logger.error("Failed to apply patch", {
            ...(e instanceof Error
              ? { name: e.name, message: e.message, stack: e.stack }
              : { error: e }),
          });
          const errMessage = e instanceof Error ? e.message : "Unknown error";
          throw new Error(
            `FAILED TO APPLY PATCH: The diff could not be applied to file '${file_path}'.\n\nError: ${errMessage}`,
          );
        }
      }

      if (patchedContent === false) {
        logger.error(
          `FAILED TO APPLY PATCH: The diff could not be applied to file '${file_path}'. This may be due to an invalid diff format or conflicting changes with the file's current content. Original content length: ${readFileOutput.length}, Diff: ${diff.substring(0, 100)}...`,
        );
        throw new Error(
          `FAILED TO APPLY PATCH: The diff could not be applied to file '${file_path}'. This may be due to an invalid diff format or conflicting changes with the file's current content. Original content length: ${readFileOutput.length}, Diff: ${diff.substring(0, 100)}...`,
        );
      }

      const { success: writeFileSuccess, output: writeFileOutput } =
        await writeFile({
          sandbox,
          filePath: file_path,
          content: patchedContent,
          workDir,
        });
      if (!writeFileSuccess) {
        logger.error("Failed to write file", {
          writeFileOutput,
        });
        throw new Error(writeFileOutput);
      }

      let resultMessage = `Successfully applied diff to \`${file_path}\` and saved changes.`;
      logger.info(resultMessage);
      if (fixedDiff) {
        resultMessage +=
          "\n\nNOTE: The generated diff was NOT formatted properly, and had to be fixed." +
          `\nHere is the error that was thrown when your generated diff was applied:\n<apply-diff-error>\n${errorApplyingPatchMessage}\n</apply-diff-error>` +
          `\nThe diff which was applied is:\n<fixed-diff>\n${fixedDiff}\n</fixed-diff>`;
      }
      return {
        result: resultMessage,
        status: "success",
      };
    },
    createApplyPatchToolFields(state.targetRepository),
  );
  return applyPatchTool;
}
