export class LocalAiClient {
  constructor(fetchImplementation = globalThis.fetch) {
    this.fetch = fetchImplementation;
  }

  async sendChatCompletion(provider, prompt) {
    const endpointUrl = String(provider.endpointUrl || '').trim();

    if (typeof this.fetch !== 'function') {
      return {
        ok: false,
        content: '',
        warning: 'Fetch is not available for local provider requests.'
      };
    }

    if (!/^https?:\/\//.test(endpointUrl)) {
      return {
        ok: false,
        content: '',
        warning: 'Local endpoint URL must start with http:// or https://.'
      };
    }

    const body = {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ],
      stream: false
    };

    if (String(provider.model || '').trim()) {
      body.model = String(provider.model).trim();
    }

    try {
      const response = await this.fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const text = await response.text();

      if (!response.ok) {
        return {
          ok: false,
          content: '',
          warning: 'Local provider returned HTTP ' + String(response.status) + ': ' + (text || response.statusText)
        };
      }

      return this.parseChatCompletionResponse(text);
    } catch (error) {
      return {
        ok: false,
        content: '',
        warning: error instanceof Error ? error.message : String(error)
      };
    }
  }

  parseChatCompletionResponse(text) {
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        content: '',
        warning: 'Local provider returned invalid JSON.'
      };
    }

    const content = parsed?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim() === '') {
      return {
        ok: false,
        content: '',
        warning: 'Local provider response did not include choices[0].message.content.'
      };
    }

    return {
      ok: true,
      content,
      warning: null
    };
  }
}
