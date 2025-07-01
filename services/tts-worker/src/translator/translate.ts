import OpenAI from 'openai';
import { config } from '../worker.config';

let openai: OpenAI | null = null;

/**
 * Returns a singleton instance of the OpenAI client configured with the API key.
 *
 * @returns The initialized OpenAI client instance.
 *
 * @throws {Error} If the OpenAI API key is not configured in the application settings.
 */
export function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key is not configured in worker.config.ts');
    }
    openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return openai;
}

/**
 * Translates English text into Spanish using the OpenAI GPT-4o model.
 *
 * Returns the original text if it is empty or whitespace. If translation is successful, returns the translated Spanish text; otherwise, returns null.
 *
 * @param text - The English text to translate.
 * @returns The translated Spanish text, or null if translation fails or the API response is empty.
 */
export async function translateTextGoogle(text: string): Promise<string | null> {
  if (!text || text.trim() === '') {
    return text; // Return empty or whitespace as is
  }

  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o', // Or your preferred model like gpt-4-turbo
      messages: [
        {
          role: 'system',
          content: 'You are a highly skilled translator specializing in translating English Christian sermon content into natural, accurate, and reverent Spanish. Maintain the tone and meaning of the original text.'
        },
        {
          role: 'user',
          content: `Translate the following English text to Spanish: "${text}"`
        }
      ],
      temperature: 0.3, // Lower temperature for more deterministic, less creative translations
      max_tokens: Math.floor(text.length * 2.5) + 50, // Estimate based on input length plus some buffer
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    });

    const translatedText = completion.choices[0]?.message?.content?.trim();
    
    if (translatedText) {
      // console.log(`Original: "${text}" -> Translated: "${translatedText}"`);
      return translatedText;
    } else {
      console.warn('OpenAI translation returned empty or null content for:', text);
      return null;
    }

  } catch (error) {
    console.error('Error during OpenAI translation:', error);
    // Consider more specific error handling or re-throwing for the pipeline to manage
    return null; 
  }
}

// Example Usage (for testing directly):
/*
async function testTranslation() {
  console.log("Testing translation...");
  const textsToTest = [
    "Hello, world!",
    "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.",
    "The quick brown fox jumps over the lazy dog."
  ];

  for (const text of textsToTest) {
    const spanishText = await translateTextGoogle(text);
    if (spanishText) {
      console.log(`[EN]: ${text}
[ES]: ${spanishText}
---
`);
    } else {
      console.log(`[EN]: ${text}
[ES]: Translation failed.
---
`);
    }
  }
}

// testTranslation();
*/
