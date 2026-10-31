import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

// Cliente único da Anthropic. Só existe com ANTHROPIC_API_KEY (veja env.aiEnabled).
let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!env.aiEnabled) throw new Error("IA desligada: defina ANTHROPIC_API_KEY.");
  return (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
}
