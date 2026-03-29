import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.resolve(__dirname, 'skills');

if (!fs.existsSync(SKILLS_DIR)) {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

export interface SkillDefinition {
  tool: Tool;
  handler: (args: Record<string, any>) => Promise<string> | string;
  mtime: number;
}

const loadedSkills = new Map<string, SkillDefinition>();

export async function loadSkills(): Promise<Tool[]> {
  if (!fs.existsSync(SKILLS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.ts'));
  const currentFiles = new Set<string>();

  for (const file of files) {
    const filePath = path.resolve(SKILLS_DIR, file);
    const mtime = fs.statSync(filePath).mtimeMs;
    const fileBase = file.replace('.ts', '');
    currentFiles.add(fileBase);

    const existing = loadedSkills.get(fileBase);
    if (!existing || existing.mtime !== mtime) {
      try {
        const modulePath = `file://${filePath}?update=${mtime}`;
        const skillModule = await import(modulePath);
        
        if (skillModule.tool && skillModule.handler) {
          loadedSkills.set(fileBase, {
            tool: skillModule.tool,
            handler: skillModule.handler,
            mtime
          });
        }
      } catch (err: any) {
        console.error(`[Skills] Error loading skill ${file}: ${err.message}`);
      }
    }
  }

  // Remove deleted skills
  for (const fileBase of loadedSkills.keys()) {
    if (!currentFiles.has(fileBase)) {
      loadedSkills.delete(fileBase);
    }
  }

  return Array.from(loadedSkills.values()).map(s => s.tool);
}

export function hasSkill(name: string): boolean {
  for (const skill of loadedSkills.values()) {
    if (skill.tool.name === name) return true;
  }
  return false;
}

export async function executeSkill(name: string, args: Record<string, any>): Promise<string> {
  for (const skill of loadedSkills.values()) {
    if (skill.tool.name === name) {
      return await skill.handler(args);
    }
  }
  throw new Error(`Skill ${name} not found or not loaded.`);
}
