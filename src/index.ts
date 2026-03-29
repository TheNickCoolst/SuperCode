import * as readline from 'readline';
import { runAgentLoop, AgentOptions } from './agent.js';
import { initMcpBridge, getMcpTools, cleanupMcpBridge } from './mcp.js';
import { initHeartbeat } from './heartbeat.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.mjs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let chatThread: MessageParam[] = [];
let options: AgentOptions = {};
let isThinking = false;

/**
 * Handle cleanup on exit to ensure MCP processes don't leak.
 */
function handleExit() {
  console.log('\nCleaning up SuperCode session...');
  cleanupMcpBridge();
  rl.close();
  process.exit(0);
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

async function startSession() {
  console.log('🚀 SuperCode CLI Initializing (Level 4 - Heartbeat)...');
  
  // 1. Initialize MCP bridge servers
  await initMcpBridge();
  
  // 2. Fetch available tools globally
  const dynamicTools = await getMcpTools();
  console.log(`[System] Attached ${dynamicTools.length} dynamic MCP tools.`);

  options = {
    maxIterations: 5,
    mcpTools: dynamicTools
  };

  // 3. Initialize background Heartbeats
  initHeartbeat(async (systemPrompt: string) => {
    // Only run autonomous loops if not actively busy
    if (isThinking) {
      console.log('\n[Heartbeat Skipped] Agent is currently busy.');
      reprompt();
      return;
    }

    // Erase the "> You: " prompt line visually before printing
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log('\n[Systen Event Triggered]: ' + systemPrompt);
    
    isThinking = true;
    chatThread.push({ role: 'user', content: systemPrompt });

    try {
      const { text: responseText, newThread } = await runAgentLoop(chatThread, options);
      chatThread = newThread;
      console.log(`\n> SuperCode (Autonomous): ${responseText}`);
    } catch (error: any) {
      console.error(`\n[Agent Error during Heartbeat] ${error.message}`);
      chatThread.pop();
    } finally {
      isThinking = false;
      reprompt();
    }
  });

  console.log('\nType your message and press Enter. Type "exit" or "quit" to stop.');
  console.log('----------------------------------------------------');
  promptUser();
}

function reprompt() {
  process.stdout.write('\n> You: ');
}

function promptUser() {
  rl.question('\n> You: ', async (input) => {
    const text = input.trim();
    
    if (!text) {
      promptUser();
      return;
    }

    if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
      handleExit();
      return;
    }

    isThinking = true;
    chatThread.push({ role: 'user', content: text });

    try {
      console.log('... thinking ...');
      
      const { text: responseText, newThread } = await runAgentLoop(chatThread, options);
      chatThread = newThread;
      
      console.log(`\n> SuperCode: ${responseText}`);
    } catch (error: any) {
      console.error(`\n[Agent Error] ${error.message}`);
      // Remove the last user message so they can try again
      chatThread.pop();
    } finally {
      isThinking = false;
    }

    promptUser();
  });
}

// Start the bootstrapping
startSession().catch(err => {
  console.error('[Fatal Error] Failed to bootstrap session:', err);
  process.exit(1);
});
