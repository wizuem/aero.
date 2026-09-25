import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const { messages } = await request.json() as { messages?: Array<{ role: 'user' | 'assistant'; content: string }> };
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: 'You are aero., a concise and helpful AI assistant inside a private browser workspace. Be clear, friendly, and practical.',
      messages: (messages ?? []).slice(-20).map((message) => ({ role: message.role, content: message.content })),
    });
    return Response.json({ text: result.text });
  } catch (error) {
    console.error('[aero] AI request failed', error);
    return Response.json({ error: 'Gemini is unavailable right now. Check GEMINI_API_KEY and try again.' }, { status: 500 });
  }
}
