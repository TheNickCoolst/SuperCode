import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.mjs';
import type Anthropic from '@anthropic-ai/sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '../mcp.json');

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

// Store active MCP clients
const mcpClients: Map<string, { client: Client, transport: StdioClientTransport }> = new Map();

/**
 * Parses the mcp.json configuration file.
 */
function loadConfig(): McpConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log(`[MCP] No mcp.json found at ${CONFIG_PATH}. Skipping external servers.`);
    return { mcpServers: {} };
  }
  const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(content) as McpConfig;
}

/**
 * Initializes all configured MCP servers and establishes connections.
 */
export async function initMcpBridge(): Promise<void> {
  const config = loadConfig();
  
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    console.log(`[MCP] Starting server '${serverName}'...`);
    try {
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: { ...process.env, ...serverConfig.env } as Record<string, string>
      });

      const client = new Client(
        { name: 'SuperCode', version: '1.0.0' },
        { capabilities: { } }
      );

      await client.connect(transport);
      console.log(`[MCP] Successfully connected to '${serverName}'`);
      
      mcpClients.set(serverName, { client, transport });
    } catch (err: any) {
      console.error(`[MCP] Failed to start server '${serverName}': ${err.message}`);
    }
  }
}

/**
 * Fetches all tools from connected MCP servers and maps them to Anthropic's Tool format.
 * Tool names are prefixed to avoid conflicts (e.g., "sqlite_query").
 */
export async function getMcpTools(): Promise<Tool[]> {
  const allTools: Tool[] = [];
  
  for (const [serverName, { client }] of mcpClients.entries()) {
    try {
      const result = await client.listTools();
      // map MCP tools to Anthropic tool schema
      for (const mcpTool of result.tools) {
        // We use a double underscore separator convention: serverName__toolName
        const prefixedName = `${serverName}__${mcpTool.name}`;
        
        allTools.push({
          name: prefixedName,
          description: mcpTool.description || `Tool ${mcpTool.name} from ${serverName} MCP server`,
          input_schema: mcpTool.inputSchema as Anthropic.Messages.Tool.InputSchema
        });
      }
    } catch (err: any) {
      console.error(`[MCP] Failed to list tools for server '${serverName}': ${err.message}`);
    }
  }
  
  return allTools;
}

/**
 * Proxy execution to the appropriate MCP server and return the stringified result.
 */
export async function executeMcpTool(prefixedName: string, args: Record<string, unknown>): Promise<string> {
  // Extract server name and the real tool name
  const match = prefixedName.match(/^(.+?)__(.+)$/);
  if (!match) {
    throw new Error(`Invalid MCP tool name format: ${prefixedName}`);
  }
  
  const serverName = match[1];
  const toolName = match[2];
  
  const connection = mcpClients.get(serverName);
  if (!connection) {
    throw new Error(`MCP server '${serverName}' is not connected.`);
  }

  try {
    const response = await connection.client.callTool({
      name: toolName,
      arguments: args
    });

    // Handle the standard MCP tool result format
    if (response.isError) {
      throw new Error(`MCP tool error: ${JSON.stringify(response.content)}`);
    }

    const content = (response as CallToolResult).content;
    // Convert the result content blocks to string
    return content.map((c: any) => 
      c.type === 'text' ? c.text : JSON.stringify(c)
    ).join('\n');
    
  } catch (err: any) {
    throw new Error(`MCP execution failed for ${toolName}: ${err.message}`);
  }
}

/**
 * Cleanly close all MCP connections and processes.
 */
export function cleanupMcpBridge(): void {
  for (const [serverName, { transport }] of mcpClients.entries()) {
    console.log(`[MCP] Closing connection to '${serverName}'...`);
    transport.close();
  }
  mcpClients.clear();
}
