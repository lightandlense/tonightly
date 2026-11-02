import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime'
import type { Converse, ConverseOutput } from './assistant'

// Claude Haiku 4.5 through the US cross-region profile. Claude 5 models are not open to this account yet (2026-11-01).
export const DEFAULT_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

export function makeConverse(modelId = DEFAULT_MODEL, region = 'us-east-2'): Converse {
  // ponytail: new accounts get 10 requests a minute on Haiku 4.5; adaptive retry spaces calls out. Quota increase is the real fix.
  const client = new BedrockRuntimeClient({ region, retryMode: 'adaptive', maxAttempts: 5 })
  return async (input) => {
    const res = await client.send(
      new ConverseCommand({ ...(input as unknown as ConverseCommandInput), modelId, inferenceConfig: { maxTokens: 700, temperature: 0.4 } }),
    )
    return res as unknown as ConverseOutput
  }
}
