import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
function geminiDevApi() {
  return {
    name: 'gemini-dev-api',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use('/api/chat', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const body = JSON.parse(raw) as { messages?: Array<{ role: string; content: string }> };
          const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: (body.messages ?? []).slice(-20).map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })) }),
          });
          const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
          res.statusCode = response.ok ? 200 : response.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(response.ok ? { text: data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '' } : { error: data.error?.message ?? 'Gemini request failed.' }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Gemini request failed.' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), geminiDevApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
