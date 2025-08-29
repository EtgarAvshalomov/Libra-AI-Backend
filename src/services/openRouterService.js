// src/services/openRouterService.js - OpenRouter Connection Service
import OpenAI from 'openai';

class OpenAIService {
    constructor() {
        this.client = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY,
            defaultHeaders: {},
        });
        
        this.defaultModel = 'deepseek/deepseek-chat-v3.1:free';
    }

    async chatCompletion(messages, options = {}) {
        try {
            const {
                model = this.defaultModel,
                max_tokens = 1000,
                temperature = 1
            } = options;

            console.log(`[OpenAI Service] Sending request to model: ${model}`);

            const completion = await this.client.chat.completions.create({
                model,
                messages,
                max_tokens,
                temperature
            });

            console.log('[OpenAI Service] Response received successfully');
            
            return this.parseResponse(completion);
        } catch (error) {
            console.error('[OpenAI Service] Error:', error);
            throw this.handleError(error);
        }
    }

    async streamChat({ messages, model = this.defaultModel, max_tokens, temperature = 1 }) {
        const controller = new AbortController();

        const stream = await this.client.chat.completions.create({
            model,
            max_tokens,
            messages,
            temperature,
            stream: true,
            signal: controller.signal
        });

        return {stream, controller};
    }

    parseResponse(completion) {
        if (!completion?.choices?.length) {
            throw new Error('No response choices received from AI');
        }

        const choice = completion.choices[0];
        
        return {
            message: choice.message?.content || '',
            role: choice.message?.role || 'assistant',
            finishReason: choice.finish_reason,
            usage: completion.usage,
            model: completion.model,
            id: completion.id,
            created: completion.created
        };
    }

    handleError(error) {
        // Handle specific OpenAI errors
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.error?.message || error.message;
            
            switch (status) {
                case 401:
                    return new Error('Invalid API key');
                case 429:
                    return new Error('Rate limit exceeded. Please try again later.');
                case 500:
                    return new Error('AI service temporarily unavailable');
                default:
                    return new Error(`AI service errord: ${message}`);
            }
        }
        
        return new Error(`AI service error: ${error.message}`);
    }
}

export default new OpenAIService();