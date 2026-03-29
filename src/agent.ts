import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { saveMemory, searchMemory } from './memory.js';
import { executeMcpTool } from './mcp.js';
import { loadSkills, hasSkill, executeSkill } from './skills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize the Anthropic client (Proxied to MiniMax)
const anthropic = new Anthropic({
  apiKey: config.minimaxApiKey,
  baseURL: config.minimaxBaseUrl,
});

export interface AgentOptions {
  model?: string;
  maxIterations?: number;
  systemPrompt?: string;
  mcpTools?: Anthropic.Tool[];
}

const DEFAULT_MAX_ITERATIONS = 5;

/**
 * Executes an agentic loop with the Anthropic API, handling tool calls
 * until a final text response is produced, or the max iteration limit is reached.
 */
export async function runAgentLoop(
  messages: Anthropic.MessageParam[],
  options: AgentOptions = {}
): Promise<{ text: string, newThread: Anthropic.MessageParam[] }> {
  const model = options.model || 'MiniMax-M2.7';
  const maxIterations = options.maxIterations || DEFAULT_MAX_ITERATIONS;
  const systemPrompt = options.systemPrompt || 'You are SuperCode, a helpful personal AI agent. You have persistent memory capability. You have access to external MCP tools, including tools to read and interact with the local file system (Desktop). Use these tools when asked about local files.';
  const dynamicTools = options.mcpTools || [];
  
  const thread = [...messages];
  let iterations = 0;

  // Static Native Tools definition including memory functions
  const nativeTools: Anthropic.Tool[] = [
    {
      name: "get_weather",
      description: "Get the current weather in a given location",
      input_schema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA"
          }
        },
        required: ["location"]
      }
    },
    {
      name: "save_memory",
      description: "Save an important fact or preference about the user into long-term persistent memory.",
      input_schema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The exact fact to save, e.g. 'User lives in Berlin' or 'User likes the color green'."
          }
        },
        required: ["content"]
      }
    },
    {
      name: "search_memory",
      description: "Search the long-term persistent memory for previously stored facts using semantic matches. Use this to recall user preferences, locations, or past context.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search terms to look up, e.g. 'favorite color' or 'city'."
          }
        },
        required: ["query"]
      }
    },
    {
      name: "delegate_task",
      description: "Delegate a specific sub-task to a specialized sub-agent. The sub-agent will operate autonomously to complete the task and return its final text response. Use this to break down complex problems.",
      input_schema: {
        type: "object",
        properties: {
          systemPrompt: {
            type: "string",
            description: "The persona and instructions for the sub-agent (e.g., 'You are a Python expert...')."
          },
          taskDescription: {
            type: "string",
            description: "The detailed task for the sub-agent to complete."
          }
        },
        required: ["systemPrompt", "taskDescription"]
      }
    },
    {
      name: "create_skill",
      description: "Create a new programmatic skill to extend your own capabilities. The skill is written in TypeScript and immediately loaded. Use this to teach yourself how to interact with new systems, process specific data, or automate complex math/logic natively.",
      input_schema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The unique name of the skill/tool (e.g., 'calculate_fibonacci')."
          },
          description: {
            type: "string",
            description: "A detailed description of what the skill does and when to use it."
          },
          code: {
            type: "string",
            description: "The complete TypeScript file content. MUST export a 'tool' object (Anthropic Tool schema matching the exact name and description) and an async 'handler(args: Record<string, any>): Promise<string>' function."
          }
        },
        required: ["name", "description", "code"]
      }
    }
  ];

  while (iterations < maxIterations) {
    iterations++;

    // Load dynamic native skills
    const nativeSkills = await loadSkills();
    const tools = [...nativeTools, ...nativeSkills, ...dynamicTools];

    // Call Anthropic
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: thread,
      tools: tools,
    });

    thread.push({
      role: 'assistant',
      content: response.content,
    });

    const toolCalls = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolCalls.length > 0) {
      console.log(`[Agent: Iteration ${iterations}] Processing ${toolCalls.length} tool calls...`);
      
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolCall of toolCalls) {
        try {
          if (toolCall.name === 'get_weather') {
            const args = toolCall.input as { location: string };
            console.log(`  > Executing native tool 'get_weather' for ${args.location}`);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: `The weather in ${args.location} is sunny and 72 degrees.`,
            });
          } else if (toolCall.name === 'save_memory') {
            const args = toolCall.input as { content: string };
            console.log(`  > Saving memory: "${args.content}"`);
            const id = saveMemory(args.content);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: `Fact saved successfully to persistent memory with ID ${id}.`,
            });
          } else if (toolCall.name === 'search_memory') {
            const args = toolCall.input as { query: string };
            console.log(`  > Searching memory for: "${args.query}"`);
            const results = searchMemory(args.query);
            
            let resultText = "Search results:\n";
            if (results.length === 0) {
              resultText = "No relevant facts found in memory.";
            } else {
              results.forEach(r => {
                resultText += `- [ID: ${r.id}, Date: ${r.created_at}] ${r.content}\n`;
              });
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: resultText,
            });
          } else if (toolCall.name === 'delegate_task') {
            const args = toolCall.input as { systemPrompt: string, taskDescription: string };
            console.log(`  > Spawning sub-agent for task: "${args.taskDescription.substring(0, 50)}..."`);
            try {
              const subAgentThread: Anthropic.MessageParam[] = [
                { role: 'user', content: args.taskDescription }
              ];
              const result = await runAgentLoop(subAgentThread, {
                model, 
                maxIterations: 10,
                systemPrompt: args.systemPrompt,
                mcpTools: dynamicTools
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `Sub-agent completed the task.\n\nResult:\n${result.text}`,
              });
            } catch (err: any) {
              console.error(`  > Sub-agent failed: ${err.message}`);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `Sub-agent failed with error: ${err.message}`,
                is_error: true,
              });
            }
          } else if (toolCall.name === 'create_skill') {
            const args = toolCall.input as { name: string, code: string };
            console.log(`  > Self-Evolving: Creating new skill '${args.name}'`);
            try {
              const skillsDir = path.resolve(__dirname, 'skills');
              if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
              fs.writeFileSync(path.resolve(skillsDir, `${args.name}.ts`), args.code);
              
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `Skill '${args.name}' created successfully. Note: you must finish this turn before the tool is loaded in your context.`,
              });
            } catch (err: any) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `Failed to create skill: ${err.message}`,
                is_error: true,
              });
            }
          } else if (hasSkill(toolCall.name)) {
            console.log(`  > Executing dynamically evolved skill: '${toolCall.name}'`);
            try {
              const resultText = await executeSkill(toolCall.name, toolCall.input as Record<string, any>);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: resultText,
              });
            } catch (err: any) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `Dynamic skill error: ${err.message}`,
                is_error: true,
              });
            }
          } else {
            // Assume it's an MCP tool handled by the dynamic bridge
            console.log(`  > Delegate to MCP Bridge: '${toolCall.name}'`);
            const args = toolCall.input as Record<string, unknown>;
            
            // Execute tool in external process via MCP
            const resultText = await executeMcpTool(toolCall.name, args);
            
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: resultText,
            });
          }
        } catch (err: any) {
          console.error(`  > Tool execution error: ${err.message}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: `Error executing tool: ${err.message}`,
            is_error: true,
          });
        }
      }

      thread.push({
        role: 'user',
        content: toolResults,
      });

    } else {
      const textBlock = response.content.find((block) => block.type === 'text') as Anthropic.TextBlock;
      return { 
        text: textBlock?.text || '(no response provided)',
        newThread: thread 
      };
    }
  }

  throw new Error(`Agent loop aborted: reached max iterations limit (${maxIterations}). This is a safety hard stop.`);
}
