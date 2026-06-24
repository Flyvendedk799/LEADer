import type { User } from "@prisma/client";
import { z } from "zod";

import { AGENT_TOOL_CATALOG, executeAgentTool, type AgentToolCall, type AgentToolResult } from "@/lib/agent/tools";
import { aiConfig, chat, hasLlm, isMissingSubscriptionLoginError } from "@/lib/ai/provider";

export interface AgentHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentRunInput {
  user: User;
  message: string;
  history?: AgentHistoryMessage[];
}

export interface AgentRunResult {
  answer: string;
  toolCalls: AgentToolCall[];
  toolResults: AgentToolResult[];
  mutated: boolean;
  mocked: boolean;
  model: string;
}

const agentPlanSchema = z.object({
  answer: z.string().optional(),
  toolCalls: z
    .array(z.object({
      tool: z.string(),
      args: z.record(z.unknown()).default({}),
    }))
    .max(5)
    .default([]),
});

function clean(value: string, max = 500) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function extractLikelyId(message: string) {
  return message.match(/\b(c[a-z0-9]{12,}|[a-z0-9]{16,})\b/i)?.[1];
}

function inferWorkspace(message: string) {
  return /global|international|remote|europe/i.test(message) ? "GLOBAL" : "DK";
}

function inferLaneSlug(message: string) {
  if (/tender|procurement|udbud|public buyer/i.test(message)) return "tenders-procurement";
  if (/startup|founder|mvp|prototype|pre-seed/i.test(message)) return "direct-startup-mvp";
  if (/automation|workflow|dashboard|reporting|internal tool|sme|sm[eå]/i.test(message)) return "sme-ai-automation";
  if (/warm|network|referral|past customer|follow-up|dormant/i.test(message)) return "warm-network";
  if (/community|manual|facebook|linkedin post/i.test(message)) return "community-manual";
  if (/fund|grant|voucher|tilskud|innobooster|smv digital/i.test(message)) return "funded-work";
  return "funded-work";
}

function inferEntity(message: string): "all" | "deals" | "accounts" | "people" | "tasks" | "candidates" {
  if (/candidate|lead found|discovery/i.test(message)) return "candidates";
  if (/account|company|customer|buyer/i.test(message)) return "accounts";
  if (/person|people|contact|founder/i.test(message)) return "people";
  if (/task|follow-up|todo|deadline|overdue/i.test(message)) return "tasks";
  if (/deal|pipeline|opportunit/i.test(message)) return "deals";
  return "all";
}

function inferPriority(message: string): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  if (/urgent|today|asap|now/i.test(message)) return "URGENT";
  if (/high|important|soon|tomorrow/i.test(message)) return "HIGH";
  if (/low|someday|later/i.test(message)) return "LOW";
  return "MEDIUM";
}

function inferResearchObjective(message: string) {
  const lower = message.toLowerCase();
  if (/verify|confirm|identity|same person|same company|hvem er|who is/.test(lower)) return "verify-identity";
  if (/opportunity|tender|procurement|udbud|buying signal|lead map|map.*lead|find more|explore/.test(lower)) return "map-opportunity";
  if (/phone|telefon|mobile|email|e-mail|contact|kontakt|linkedin|reach/.test(lower)) return "find-contact";
  return "general";
}

function inferResearchDepth(message: string) {
  const lower = message.toLowerCase();
  if (/deep|thorough|thorougher|top to bottom|everything|full|complete|explore/.test(lower)) return "deep";
  if (/quick|fast|light|brief/.test(lower)) return "quick";
  return "standard";
}

function inferResearchSubjectType(message: string) {
  const lower = message.toLowerCase();
  if (/person|name|founder|ceo|cto|owner|kontaktperson|medarbejder|employee/.test(lower)) return "person";
  if (/company|account|buyer|business|organisation|organization|virksomhed|firma|kunde/.test(lower)) return "company";
  return "unknown";
}

function cleanResearchSubject(value: string) {
  return clean(
    value
      .replace(/^["'“”]+|["'“”.,;:!?]+$/g, "")
      .replace(/\b(?:please|pls|tak|thanks)\b/gi, "")
      .replace(/\b(?:quick|standard|deep|thorough|top to bottom|everything|full|complete)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
    160,
  );
}

function extractResearchSubject(message: string) {
  const text = clean(message, 500);
  const patterns = [
    /\b(?:find|get|look up|lookup|research|verify|map|explore)\s+(?:me\s+)?(?:the\s+)?(?:phone number|telefonnummer|phone|telefon|mobile|email|e-mail|contact route|contact details|contact info|contact|kontakt|linkedin|profile|identity)\s+(?:for|of|on|about|to)\s+(.+)$/i,
    /\b(?:find|get|look up|lookup)\s+(.+?)\s+(?:phone number|telefonnummer|phone|telefon|mobile|email|e-mail|contact route|contact details|contact info|contact|kontakt|linkedin|profile)$/i,
    /\b(?:research|osint|verify|map|explore)\s+(?:the\s+)?(?:person|company|account|buyer|lead|opportunity|contact)?\s*(?:for|on|about|around)?\s+(.+)$/i,
    /\b(?:who is|hvem er)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const subject = cleanResearchSubject(text.match(pattern)?.[1] ?? "");
    if (subject.length >= 2) return subject;
  }

  return "";
}

function isResearchBriefRequest(message: string) {
  const lower = message.toLowerCase();
  return (
    /\b(?:osint|research|verify|map|explore)\b/.test(lower) ||
    /\b(?:find|get|look up|lookup)\b.*\b(?:phone|telefon|mobile|email|e-mail|contact|kontakt|linkedin|profile)\b/.test(lower) ||
    /\b(?:who is|hvem er)\b/.test(lower)
  );
}

export function planMockToolCalls(message: string): AgentToolCall[] {
  const text = clean(message, 1200);
  const id = extractLikelyId(text);
  const lower = text.toLowerCase();

  if (/cockpit|dashboard|today|overdue|deadline|stale|queue/.test(lower)) {
    return [{ tool: "get_cockpit", args: { workspace: inferWorkspace(text) } }];
  }

  if (/list .*lane|show .*lane|what lanes|discovery lanes/.test(lower)) {
    return [{ tool: "list_discovery_lanes", args: { activeOnly: true } }];
  }

  if (/(run|start|search|find|discover|source scan).*(lane|lead|client|candidate|opportunit|discovery search|discovery)/.test(lower)) {
    return [{
      tool: "run_discovery_lane",
      args: {
        laneSlug: inferLaneSlug(text),
        freeformBrief: text,
        searchMode: /wide|broad|more/.test(lower) ? "wide" : /focused|narrow/.test(lower) ? "focused" : "balanced",
        useAiPlanner: true,
        maxResults: /many|more|wide/.test(lower) ? 12 : 8,
      },
    }];
  }

  if (isResearchBriefRequest(text)) {
    const subject = extractResearchSubject(text);
    if (subject) {
      return [{
        tool: "queue_research_brief",
        args: {
          subject,
          subjectType: inferResearchSubjectType(text),
          objective: inferResearchObjective(text),
          depth: inferResearchDepth(text),
          workspace: inferWorkspace(text),
          createTasks: true,
        },
      }];
    }
  }

  if (/save .*candidate|candidate .*deal|promote .*candidate/.test(lower) && id) {
    return [{ tool: "save_candidate_as_deal", args: { candidateId: id } }];
  }

  if (/(mark|set).*task.*(done|complete|completed)/.test(lower) && id) {
    return [{ tool: "update_task", args: { id, status: "DONE" } }];
  }

  if (/(create|add|make).*(task|follow-up|todo)|remind me|follow up/.test(lower)) {
    return [{
      tool: "create_task",
      args: {
        title: clean(text.replace(/^(create|add|make)\s+/i, ""), 160) || "Follow up",
        priority: inferPriority(text),
      },
    }];
  }

  if (/(log|record|add).*(note|touchpoint|call|meeting|email|message)/.test(lower)) {
    return [{
      tool: "log_touchpoint",
      args: {
        kind: /call/.test(lower) ? "CALL" : /meeting/.test(lower) ? "MEETING" : /email/.test(lower) ? "EMAIL" : /message/.test(lower) ? "MESSAGE" : "NOTE",
        summary: clean(text, 220),
        dealId: id,
      },
    }];
  }

  if (/(update|set|move).*(deal|pipeline)/.test(lower) && id) {
    const status =
      /won/.test(lower) ? "WON" :
      /lost/.test(lower) ? "LOST" :
      /proposal/.test(lower) ? "PROPOSAL" :
      /contacted/.test(lower) ? "CONTACTED" :
      /negotiation/.test(lower) ? "NEGOTIATION" :
      /qualifying/.test(lower) ? "QUALIFYING" :
      undefined;
    return [{ tool: "update_deal", args: { dealId: id, ...(status ? { status } : { nextAction: clean(text, 300) }) } }];
  }

  if (/open|show|get|detail/.test(lower) && /deal/.test(lower)) {
    return [{ tool: "get_deal", args: id ? { dealId: id } : { query: text } }];
  }

  return [{ tool: "search_crm", args: { entity: inferEntity(text), query: text, limit: 8 } }];
}

function toolPrompt() {
  return AGENT_TOOL_CATALOG
    .map((tool) => `- ${tool.name} (${tool.risk}): ${tool.description}\n  input: ${tool.inputHint}`)
    .join("\n");
}

function historyText(history: AgentHistoryMessage[] = []) {
  return history
    .slice(-8)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

async function planWithLlm(user: User, message: string, history: AgentHistoryMessage[]) {
  const cfg = aiConfig(user.aiKeys);
  const raw = await chat(
    [
      {
        role: "system",
        content: `You are LEADer Agent, an operator inside a personal client-acquisition CRM.
You may call server-side tools to read CRM data and perform scoped actions. Use tools whenever the user asks about current data or asks you to create/update something.
Never invent IDs, budgets, deadlines, contact details, or tool results. Do not send email. Do not delete records.
Return strict JSON: {"answer":"short message if no tools are needed","toolCalls":[{"tool":"name","args":{...}}]}.
Available tools:
${toolPrompt()}`,
      },
      {
        role: "user",
        content: `Current user: ${user.email}

Recent conversation:
${historyText(history)}

User request:
${message}`,
      },
    ],
    { json: true, maxTokens: 1400 },
    cfg,
  );
  const parsed = agentPlanSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : { answer: "I could not parse a tool plan.", toolCalls: [] };
}

function compactToolResult(result: AgentToolResult) {
  return {
    tool: result.tool,
    title: result.title,
    summary: result.summary,
    data: result.data,
    mutated: result.mutated,
  };
}

function deterministicAnswer(message: string, results: AgentToolResult[]) {
  if (!results.length) return "I did not need to run a tool for that.";
  const lines = results.map((result) => `- ${result.summary}`);
  const wrote = results.some((result) => result.mutated);
  return `${wrote ? "Done." : "Here is what I found."}\n${lines.join("\n")}`;
}

async function synthesizeWithLlm(user: User, message: string, results: AgentToolResult[]) {
  const cfg = aiConfig(user.aiKeys);
  return chat(
    [
      {
        role: "system",
        content: `You are LEADer Agent. Answer from the tool results only. Be concise and explicit about actions completed. If a tool errored, say what failed and what the user can provide next.`,
      },
      {
        role: "user",
        content: `User request:\n${message}

Tool results JSON:\n${JSON.stringify(results.map(compactToolResult)).slice(0, 16000)}`,
      },
    ],
    { maxTokens: 900 },
    cfg,
  );
}

export async function runPlatformAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const message = clean(input.message, 2000);
  if (!message) throw new Error("Message is required");

  let usedLlm = hasLlm(input.user.aiKeys);
  let plan: { answer?: string; toolCalls: AgentToolCall[] };
  if (usedLlm) {
    try {
      plan = await planWithLlm(input.user, message, input.history ?? []);
    } catch (error) {
      if (!isMissingSubscriptionLoginError(error)) throw error;
      usedLlm = false;
      plan = { answer: undefined, toolCalls: planMockToolCalls(message) };
    }
  } else {
    plan = { answer: undefined, toolCalls: planMockToolCalls(message) };
  }
  const toolCalls = plan.toolCalls.slice(0, 5);
  const toolResults: AgentToolResult[] = [];

  for (const call of toolCalls) {
    try {
      toolResults.push(await executeAgentTool(input.user.id, call));
    } catch (error) {
      toolResults.push({
        tool: call.tool,
        title: "Tool failed",
        summary: error instanceof Error ? error.message : "Tool execution failed",
        data: { args: call.args },
      });
    }
  }

  let answer: string;
  if (!toolResults.length) {
    answer = plan.answer || "I can help with CRM data, discovery, tasks, touchpoints, deals, and conversion assets.";
  } else if (usedLlm) {
    try {
      answer = await synthesizeWithLlm(input.user, message, toolResults);
    } catch (error) {
      if (!isMissingSubscriptionLoginError(error)) throw error;
      usedLlm = false;
      answer = deterministicAnswer(message, toolResults);
    }
  } else {
    answer = deterministicAnswer(message, toolResults);
  }

  return {
    answer: answer.trim(),
    toolCalls,
    toolResults,
    mutated: toolResults.some((result) => result.mutated),
    mocked: !usedLlm,
    model: usedLlm ? aiConfig(input.user.aiKeys).model : "mock-agent",
  };
}
