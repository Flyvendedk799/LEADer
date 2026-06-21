"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, Loader2, Send, Sparkles, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type AgentRole = "user" | "assistant";

type AgentMessage = {
  id: string;
  role: AgentRole;
  content: string;
  toolResults?: {
    tool: string;
    title: string;
    summary: string;
    mutated?: boolean;
  }[];
  mocked?: boolean;
};

type AgentResponse = {
  answer: string;
  toolResults: AgentMessage["toolResults"];
  mutated: boolean;
  mocked: boolean;
  model: string;
};

const STARTERS = [
  "What needs my attention today?",
  "Find hot discovery candidates",
  "Create a follow-up task for tomorrow",
  "Run a wide AI automation discovery search",
];

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PlatformAgent() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [messages, setMessages] = React.useState<AgentMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "I can read your CRM, run discovery, create tasks, log touchpoints, update deals, and save conversion assets.",
    },
  ]);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || pending) return;
    const userMessage: AgentMessage = { id: messageId(), role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: nextMessages
            .filter((message) => message.id !== "welcome")
            .slice(-10)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json() as AgentResponse | { error?: string };
      if (!res.ok) throw new Error("error" in data ? JSON.stringify(data.error) : "Agent failed");
      const agentData = data as AgentResponse;
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: agentData.answer,
          toolResults: agentData.toolResults,
          mocked: agentData.mocked,
        },
      ]);
      if (agentData.mutated) {
        router.refresh();
        toast.success("Agent action complete", "The current view has been refreshed.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The agent could not complete that request.";
      setMessages((current) => [
        ...current,
        { id: messageId(), role: "assistant", content: message },
      ]);
      toast.error("Agent failed", message);
    } finally {
      setPending(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void send();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-4 right-4 z-40 h-11 rounded-full px-4 shadow-lg"
          aria-label="Open LEADer agent"
        >
          <Sparkles className="h-4 w-4" />
          Agent
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            LEADer Agent
          </SheetTitle>
          <SheetDescription>
            Uses CRM tools to read data and perform scoped actions. No email sending or deletes.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4">
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <Button
                key={starter}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => send(starter)}
                disabled={pending}
              >
                {starter}
              </Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-border bg-surface/40 p-3 scrollbar-thin">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  message.role === "user"
                    ? "ml-8 border-primary/25 bg-primary/10"
                    : "mr-8 border-border bg-card",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {message.role === "user" ? "You" : "Agent"}
                  </span>
                  {message.mocked ? <Badge variant="outline">offline planner</Badge> : null}
                </div>
                <div className="whitespace-pre-wrap leading-6">{message.content}</div>
                {message.toolResults?.length ? (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    {message.toolResults.map((result, index) => (
                      <div key={`${result.tool}-${index}`} className="rounded-md bg-surface/70 p-2 text-xs">
                        <div className="mb-1 flex items-center gap-2 font-medium">
                          {result.mutated ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Wrench className="h-3.5 w-3.5 text-muted-foreground" />}
                          {result.title}
                          <Badge variant={result.mutated ? "success" : "outline"}>{result.tool}</Badge>
                        </div>
                        <p className="leading-5 text-muted-foreground">{result.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {pending ? (
              <div className="mr-8 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Thinking and calling tools...
              </div>
            ) : null}
            <div ref={scrollRef} />
          </div>

          <form onSubmit={submit} className="space-y-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about the CRM or tell the agent what to do..."
              className="min-h-24 resize-none"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Press Cmd/Ctrl+Enter to send.</p>
              <Button type="submit" disabled={!input.trim() || pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
