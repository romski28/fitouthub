import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  getSandboxHealth() {
    const endpoint = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '15000');
    const maxOutputTokens = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '450');
    const apiKeyPresent = Boolean(process.env.DEEPSEEK_API_KEY?.trim());

    return {
      ok: apiKeyPresent,
      status: apiKeyPresent ? 'configured' : 'missing_api_key',
      provider: 'deepseek',
      config: {
        model,
        endpoint,
        timeoutMs,
        maxOutputTokens,
        apiKeyPresent,
      },
    };
  }

  async previewRequirements(prompt: string) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new BadRequestException('Prompt is required');
    }
    if (trimmedPrompt.length > 4000) {
      throw new BadRequestException('Prompt is too long (max 4000 chars)');
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('DeepSeek sandbox is not configured');
    }

    const endpoint = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '15000');
    const maxOutputTokens = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '450');

    const requestId = `ds_${Date.now().toString(36)}`;
    const startedAt = Date.now();

    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content:
          'You are a renovation requirements analyst. Return concise JSON only with keys: summary, scope, assumptions, risks, nextQuestions. Keep output practical for project intake.',
      },
      {
        role: 'user',
        content: trimmedPrompt,
      },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      this.logger.log(
        `[${requestId}] DeepSeek request started model=${model} promptChars=${trimmedPrompt.length}`,
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        this.logger.error(
          `[${requestId}] DeepSeek request failed status=${response.status} body=${rawText.slice(0, 800)}`,
        );
        throw new ServiceUnavailableException('DeepSeek request failed');
      }

      let payload: DeepSeekChatResponse;
      try {
        payload = JSON.parse(rawText) as DeepSeekChatResponse;
      } catch {
        this.logger.error(`[${requestId}] Invalid JSON from DeepSeek`);
        throw new InternalServerErrorException('Invalid DeepSeek response');
      }

      const output = payload.choices?.[0]?.message?.content?.trim() || '';
      const durationMs = Date.now() - startedAt;
      const usage = payload.usage || {};

      this.logger.log(
        `[${requestId}] DeepSeek request completed durationMs=${durationMs} promptTokens=${usage.prompt_tokens ?? 0} completionTokens=${usage.completion_tokens ?? 0} totalTokens=${usage.total_tokens ?? 0}`,
      );

      return {
        requestId,
        model: payload.model || model,
        durationMs,
        usage: {
          promptTokens: usage.prompt_tokens ?? null,
          completionTokens: usage.completion_tokens ?? null,
          totalTokens: usage.total_tokens ?? null,
        },
        output,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if ((error as Error).name === 'AbortError') {
        this.logger.warn(`[${requestId}] DeepSeek request timeout after ${durationMs}ms`);
        throw new ServiceUnavailableException('DeepSeek request timed out');
      }
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `[${requestId}] DeepSeek request unexpected error after ${durationMs}ms: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException('DeepSeek sandbox unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
