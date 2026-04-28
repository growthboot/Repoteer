import { AI_TOOL_DEFINITIONS } from '../data/aiTools.js';

export class AiPromptManager {
  constructor(promptsStore) {
    this.promptsStore = promptsStore;
  }

  listTools() {
    return AI_TOOL_DEFINITIONS.map((tool) => ({ ...tool }));
  }

  getTool(toolId) {
    return this.listTools().find((tool) => tool.id === toolId) ?? null;
  }

  getToolPrompt(toolId) {
    const tool = this.getTool(toolId);

    if (!tool) {
      return null;
    }

    return {
      tool,
      systemPrompt: this.promptsStore.getPrompt(tool.systemPromptId),
      prePrompt: this.promptsStore.getPrompt(tool.prePromptId)
    };
  }

  setToolPrompt(toolId, field, value) {
    const tool = this.getTool(toolId);

    if (!tool) {
      return null;
    }

    if (field === 'system') {
      return this.promptsStore.setPrompt(tool.systemPromptId, value);
    }

    if (field === 'pre') {
      return this.promptsStore.setPrompt(tool.prePromptId, value);
    }

    return null;
  }

  resetToolPrompt(toolId, field) {
    const tool = this.getTool(toolId);

    if (!tool) {
      return null;
    }

    if (field === 'system') {
      return this.promptsStore.resetPrompt(tool.systemPromptId);
    }

    if (field === 'pre') {
      return this.promptsStore.resetPrompt(tool.prePromptId);
    }

    return null;
  }

  composeBrowserPrompt(toolId, userPayload) {
    const prompt = this.getToolPrompt(toolId);

    if (!prompt) {
      return null;
    }

    return [
      prompt.systemPrompt,
      prompt.prePrompt,
      String(userPayload ?? '')
    ].join('\n\n');
  }
}
