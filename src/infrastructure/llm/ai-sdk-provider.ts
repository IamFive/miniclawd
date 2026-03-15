/**
 * AI SDK provider wrapper for multi-provider support.
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, type CoreMessage, type CoreTool, type LanguageModelV1 } from 'ai'
import type { ILLMProvider } from '../../core/interfaces/llm-provider.js'
import type { Config } from '../../core/types/config.js'
import type { LLMResponse } from '../../core/types/llm.js'
import type { ToolCallRequest } from '../../core/types/tool.js'
import logger from '../../utils/logger.js'

/**
 * AI provider options.
 */
export interface AIProviderOptions {
  config: Config
  defaultModel?: string
}

/**
 * AI provider that wraps Vercel AI SDK.
 */
export class AIProvider implements ILLMProvider {
  private config: Config
  private defaultModel: string

  constructor(options: AIProviderOptions) {
    this.config = options.config
    this.defaultModel = options.defaultModel || options.config.agents.defaults.model
  }

  /**
   * Send a chat completion request.
   */
  async chat(
    messages: CoreMessage[],
    tools?: Record<string, CoreTool>,
    model?: string,
    maxTokens?: number,
    temperature?: number
  ): Promise<LLMResponse> {
    const modelId = model || this.defaultModel
    const resolvedMaxTokens = maxTokens || this.config.agents.defaults.maxTokens
    const resolvedTemperature = temperature ?? this.config.agents.defaults.temperature

    try {
      const provider = this.getProvider(modelId)

      const result = await generateText({
        model: provider,
        messages,
        tools: tools || {},
        maxTokens: resolvedMaxTokens,
        temperature: resolvedTemperature,
      })

      // Parse tool calls
      const toolCalls: ToolCallRequest[] = []
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            toolCalls.push({
              id: tc.toolCallId,
              name: tc.toolName,
              arguments: tc.args as Record<string, unknown>,
            })
          }
        }
      }

      return {
        content: result.text || null,
        toolCalls,
        finishReason: result.finishReason,
        usage: {
          promptTokens: result.usage?.promptTokens || 0,
          completionTokens: result.usage?.completionTokens || 0,
        },
      }
    } catch (error) {
      logger.error({ error, model: modelId }, 'Error calling LLM')
      return {
        content: `Error calling LLM: ${error}`,
        toolCalls: [],
        finishReason: 'error',
        usage: { promptTokens: 0, completionTokens: 0 },
      }
    }
  }

  /**
   * Get the appropriate provider based on model ID.
   */
  private getProvider(modelId: string) {
    const [providerName, modelName] = modelId.includes('/')
      ? modelId.split('/')
      : ['anthropic', modelId]

    const providerCreators: Record<string, () => LanguageModelV1> = {
      anthropic: () =>
        createAnthropic({
          baseURL: this.config.providers.anthropic.apiBase || process.env.ANTHROPIC_API_BASEURL,
          apiKey: this.config.providers.anthropic.apiKey || process.env.ANTHROPIC_API_KEY,
        })(modelName || 'claude-sonnet-4-20250514'),
      openai: () =>
        createOpenAI({
          baseURL: this.config.providers.openai.apiBase || process.env.OPENAI_API_BASEURL,
          apiKey: this.config.providers.openai.apiKey || process.env.OPENAI_API_KEY,
        })(modelName || 'gpt-4o'),
      openrouter: () =>
        createOpenAI({
          apiKey: this.config.providers.openrouter.apiKey || process.env.OPENROUTER_API_KEY,
          baseURL: this.config.providers.openrouter.apiBase || 'https://openrouter.ai/api/v1',
        })(modelName),
      google: () =>
        createGoogleGenerativeAI({
          baseURL: this.config.providers.google.apiBase || process.env.GOOGLE_API_BASEURL,
          apiKey: this.config.providers.google.apiKey || process.env.GOOGLE_API_KEY,
        })(modelName || 'gemini-2.0-flash'),
      bedrock: () =>
        createAmazonBedrock({
          region: this.config.providers.bedrock.region || process.env.AWS_REGION,
          accessKeyId: this.config.providers.bedrock.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey:
            this.config.providers.bedrock.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: this.config.providers.bedrock.sessionToken || process.env.AWS_SESSION_TOKEN,
        })(modelName || 'anthropic.claude-3-5-sonnet-20241022-v2:0'),
      groq: () =>
        createOpenAI({
          apiKey: this.config.providers.groq.apiKey || process.env.GROQ_API_KEY,
          baseURL: 'https://api.groq.com/openai/v1',
        })(modelName || 'llama-3.3-70b-versatile'),
    }

    const providerCreator = providerCreators[providerName.toLowerCase()]
    if (providerCreator) {
      return providerCreator()
    }

    // 默认回退到 Anthropic
    return providerCreators.anthropic()
  }

  /**
   * Get the default model.
   */
  getDefaultModel(): string {
    return this.defaultModel
  }

  /**
   * Check if response has tool calls.
   */
  static hasToolCalls(response: LLMResponse): boolean {
    return response.toolCalls.length > 0
  }
}
