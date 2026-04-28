export const DEFAULT_AI_GLOBAL_MAX_PROMPT_CHARACTERS = 15000;

export const DEFAULT_AI_PROVIDERS = [
  {
    id: 'lm-studio-local',
    type: 'local',
    title: 'LM Studio local',
    enabled: false,
    priority: 35,
    endpointUrl: 'http://127.0.0.1:1234/v1/chat/completions',
    requestFormat: 'openai-compatible-chat',
    model: 'local-model',
    maxPromptCharacters: 12000
  },
  {
    id: 'ollama-openai-compatible',
    type: 'local',
    title: 'Ollama OpenAI-compatible',
    enabled: false,
    priority: 36,
    endpointUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    requestFormat: 'openai-compatible-chat',
    model: 'local-model',
    maxPromptCharacters: 8000
  },
  {
    id: 'chatgpt-temp',
    type: 'browser',
    title: 'ChatGPT temporary chat',
    enabled: true,
    priority: 40,
    url: 'https://chatgpt.com/?temporary-chat=true',
    maxPromptCharacters: 15000
  },
  {
    id: 'gemini-web',
    type: 'browser',
    title: 'Gemini web app',
    enabled: true,
    priority: 50,
    url: 'https://gemini.google.com/app',
    maxPromptCharacters: 15000
  }
];

export const DEFAULT_SETTINGS = {
  color: true,
  ai: {
    globalMaxPromptCharacters: DEFAULT_AI_GLOBAL_MAX_PROMPT_CHARACTERS,
    providers: DEFAULT_AI_PROVIDERS
  }
};
