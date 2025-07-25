import { v4 as uuidv4 } from "uuid";
import {
  isAIMessage,
  isToolMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  createInstallDependenciesTool,
  createShellTool,
} from "../../../tools/index.js";
import { GraphConfig, TaskPlan } from "@open-swe/shared/open-swe/types";
import {
  ReviewerGraphState,
  ReviewerGraphUpdate,
} from "@open-swe/shared/open-swe/reviewer/types";
import { createLogger, LogLevel } from "../../../utils/logger.js";
import { zodSchemaToString } from "../../../utils/zod-to-string.js";
import { formatBadArgsError } from "../../../utils/zod-to-string.js";
import { truncateOutput } from "../../../utils/truncate-outputs.js";
import { createSearchTool } from "../../../tools/search.js";
import {
  checkoutBranchAndCommit,
  getChangedFilesStatus,
} from "../../../utils/github/git.js";
import { getRepoAbsolutePath } from "@open-swe/shared/git";
import { getSandboxWithErrorHandling } from "../../../utils/sandbox.js";
import { Command } from "@langchain/langgraph";
import { shouldDiagnoseError } from "../../../utils/tool-message-error.js";
import { filterHiddenMessages } from "../../../utils/message/filter-hidden.js";
import { getGitHubTokensFromConfig } from "../../../utils/github-tokens.js";
import { createScratchpadTool } from "../../../tools/scratchpad.js";
import { getActiveTask } from "@open-swe/shared/open-swe/tasks";
import { createPullRequestToolCallMessage } from "../../../utils/message/create-pr-message.js";

const logger = createLogger(LogLevel.INFO, "TakeReviewAction");

export async function takeReviewerActions(
  state: ReviewerGraphState,
  config: GraphConfig,
): Promise<Command> {
  const { reviewerMessages } = state;
  const lastMessage = reviewerMessages[reviewerMessages.length - 1];

  if (!isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
    throw new Error("Last message is not an AI message with tool calls.");
  }

  const shellTool = createShellTool(state);
  const searchTool = createSearchTool(state);
  const installDependenciesTool = createInstallDependenciesTool(state);
  const scratchpadTool = createScratchpadTool("");
  const allTools = [
    shellTool,
    searchTool,
    installDependenciesTool,
    scratchpadTool,
  ];
  const toolsMap = Object.fromEntries(
    allTools.map((tool) => [tool.name, tool]),
  );

  const toolCalls = lastMessage.tool_calls;
  if (!toolCalls?.length) {
    throw new Error("No tool calls found.");
  }

  const { sandbox, codebaseTree, dependenciesInstalled } =
    await getSandboxWithErrorHandling(
      state.sandboxSessionId,
      state.targetRepository,
      state.branchName,
      config,
    );

  const toolCallResultsPromise = toolCalls.map(async (toolCall) => {
    const tool = toolsMap[toolCall.name];
    if (!tool) {
      logger.error(`Unknown tool: ${toolCall.name}`);
      const toolMessage = new ToolMessage({
        id: uuidv4(),
        tool_call_id: toolCall.id ?? "",
        content: `Unknown tool: ${toolCall.name}`,
        name: toolCall.name,
        status: "error",
      });

      return toolMessage;
    }

    logger.info("Executing review action", {
      ...toolCall,
    });

    let result = "";
    let toolCallStatus: "success" | "error" = "success";
    try {
      const toolResult =
        // @ts-expect-error tool.invoke types are weird here...
        (await tool.invoke({
          ...toolCall.args,
          // Pass in the existing/new sandbox session ID to the tool call.
          // use `x` prefix to avoid name conflicts with tool args.
          xSandboxSessionId: sandbox.id,
        })) as {
          result: string;
          status: "success" | "error";
        };

      result = toolResult.result;
      toolCallStatus = toolResult.status;

      if (!result) {
        result =
          toolCallStatus === "success"
            ? "Tool call returned no result"
            : "Tool call failed";
      }
    } catch (e) {
      toolCallStatus = "error";
      if (
        e instanceof Error &&
        e.message === "Received tool input did not match expected schema"
      ) {
        logger.error("Received tool input did not match expected schema", {
          toolCall,
          expectedSchema: zodSchemaToString(tool.schema),
        });
        result = formatBadArgsError(tool.schema, toolCall.args);
      } else {
        logger.error("Failed to call tool", {
          ...(e instanceof Error
            ? { name: e.name, message: e.message, stack: e.stack }
            : { error: e }),
        });
        const errMessage = e instanceof Error ? e.message : "Unknown error";
        result = `FAILED TO CALL TOOL: "${toolCall.name}"\n\n${errMessage}`;
      }
    }

    const toolMessage = new ToolMessage({
      id: uuidv4(),
      tool_call_id: toolCall.id ?? "",
      content: truncateOutput(result),
      name: toolCall.name,
      status: toolCallStatus,
    });
    return toolMessage;
  });

  const toolCallResults = await Promise.all(toolCallResultsPromise);
  const repoPath = getRepoAbsolutePath(state.targetRepository);
  const changedFiles = await getChangedFilesStatus(repoPath, sandbox);

  let branchName: string | undefined = state.branchName;
  let pullRequestNumber: number | undefined;
  let updatedTaskPlan: TaskPlan | undefined;

  if (changedFiles.length > 0) {
    logger.info(`Has ${changedFiles.length} changed files. Committing.`, {
      changedFiles,
    });
    const { githubInstallationToken } = getGitHubTokensFromConfig(config);
    const result = await checkoutBranchAndCommit(
      config,
      state.targetRepository,
      sandbox,
      {
        branchName,
        githubInstallationToken,
        taskPlan: state.taskPlan,
        githubIssueId: state.githubIssueId,
      },
    );
    branchName = result.branchName;
    pullRequestNumber = result.updatedTaskPlan
      ? getActiveTask(result.updatedTaskPlan)?.pullRequestNumber
      : undefined;
    updatedTaskPlan = result.updatedTaskPlan;
  }

  let wereDependenciesInstalled: boolean | null = null;
  toolCallResults.forEach((toolCallResult) => {
    if (toolCallResult.name === installDependenciesTool.name) {
      wereDependenciesInstalled = toolCallResult.status === "success";
    }
  });

  // Prioritize wereDependenciesInstalled over dependenciesInstalled
  const dependenciesInstalledUpdate =
    wereDependenciesInstalled !== null
      ? wereDependenciesInstalled
      : dependenciesInstalled !== null
        ? dependenciesInstalled
        : null;

  logger.info("Completed review action", {
    ...toolCallResults.map((tc) => ({
      tool_call_id: tc.tool_call_id,
      status: tc.status,
    })),
  });

  const userFacingMessagesUpdate = [
    ...toolCallResults,
    ...(updatedTaskPlan && pullRequestNumber
      ? createPullRequestToolCallMessage(
          state.targetRepository,
          pullRequestNumber,
          true,
        )
      : []),
  ];
  const commandUpdate: ReviewerGraphUpdate = {
    messages: userFacingMessagesUpdate,
    reviewerMessages: toolCallResults,
    ...(branchName && { branchName }),
    ...(updatedTaskPlan && {
      taskPlan: updatedTaskPlan,
    }),
    ...(codebaseTree ? { codebaseTree } : {}),
    ...(dependenciesInstalledUpdate !== null && {
      dependenciesInstalled: dependenciesInstalledUpdate,
    }),
  };

  const maxReviewActions = config.configurable?.maxReviewActions ?? 30;
  const maxActionsCount = maxReviewActions * 2;
  // Exclude hidden messages, and messages that are not AI messages or tool messages.
  const filteredMessages = filterHiddenMessages([
    ...state.reviewerMessages,
    ...(commandUpdate.reviewerMessages ?? []),
  ]).filter((m) => isAIMessage(m) || isToolMessage(m));
  // If we've reached the max allowed review actions, go to final review.
  if (filteredMessages.length >= maxActionsCount) {
    logger.info("Exceeded max actions count, going to final review.", {
      maxActionsCount,
      filteredMessages,
    });
    return new Command({
      goto: "final-review",
      update: commandUpdate,
    });
  }

  const shouldRouteDiagnoseNode = shouldDiagnoseError([
    ...state.reviewerMessages,
    ...toolCallResults,
  ]);

  return new Command({
    goto: shouldRouteDiagnoseNode
      ? "diagnose-reviewer-error"
      : "generate-review-actions",
    update: commandUpdate,
  });
}
