require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_SITE = process.env.TARGET_SITE || 'https://www.eatclub.de';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = 'Y73iImK10lnRsUzzVAY5';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Check for required environment variables
if (!OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY environment variable is not set!');
  console.error('Please set it in your .env file or Railway environment variables.');
  process.exit(1);
}

if (!ELEVENLABS_API_KEY) {
  console.error('❌ ERROR: ELEVENLABS_API_KEY environment variable is not set!');
  console.error('Please set it in your .env file or Railway environment variables.');
  process.exit(1);
}

// Serve the widget script
app.get('/funke-widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'funke.js'));
});

// API endpoint for OpenAI chat completions (protects API key)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, max_tokens = 120 } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API Error:', errorText);
      return res.status(response.status).json({ error: 'OpenAI API error' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint for ElevenLabs Speech-to-Text (STT)
app.post('/api/speech-to-text', async (req, res) => {
  try {
    const { audio } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio.split(',')[1], 'base64');

    // Create multipart form data with proper formatting
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const chunks = [];

    // Add audio file field (ElevenLabs expects "file" as the field name)
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="recording.webm"\r\n`));
    chunks.push(Buffer.from(`Content-Type: audio/webm\r\n\r\n`));
    chunks.push(audioBuffer);
    chunks.push(Buffer.from(`\r\n`));

    // Add model field (required by ElevenLabs - use scribe_v1 for STT)
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="model_id"\r\n\r\n`));
    chunks.push(Buffer.from(`scribe_v1\r\n`));

    // Add language field (optional but helps accuracy)
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="language_code"\r\n\r\n`));
    chunks.push(Buffer.from(`de\r\n`));

    // Close boundary
    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(chunks);

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: body
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs STT Error:', errorText);
      return res.status(response.status).json({ error: 'ElevenLabs STT error', details: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('STT endpoint error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// API endpoint for ElevenLabs Text-to-Speech (TTS)
app.post('/api/text-to-speech', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs TTS Error:', errorText);
      return res.status(response.status).json({ error: 'ElevenLabs TTS error' });
    }

    // Return audio as base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    res.json({ audio: `data:audio/mpeg;base64,${base64Audio}` });
  } catch (error) {
    console.error('TTS endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Proxy middleware with HTML injection
const proxyMiddleware = createProxyMiddleware({
  target: TARGET_SITE,
  changeOrigin: true,
  selfHandleResponse: true,

  onProxyReq: (proxyReq, req, res) => {
    // Keep accept-encoding for better performance, we handle decompression when needed
    // proxyReq.removeHeader('accept-encoding');
    // Add headers to make it look like a real browser
    proxyReq.setHeader('Accept-Language', 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7');
  },

  onProxyRes: (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || '';
    const encoding = proxyRes.headers['content-encoding'];

    // Modify HTML (for widget injection) and CSS (for URL rewriting)
    // Skip JS processing for better performance
    const shouldModify = contentType.includes('text/html') ||
                         contentType.includes('text/css');

    if (shouldModify) {
      let body = Buffer.from('');

      proxyRes.on('data', (chunk) => {
        body = Buffer.concat([body, chunk]);
      });

      proxyRes.on('end', () => {
        // Decompress if needed
        let decompressed;
        try {
          if (encoding === 'gzip') {
            decompressed = zlib.gunzipSync(body).toString('utf8');
          } else if (encoding === 'br') {
            decompressed = zlib.brotliDecompressSync(body).toString('utf8');
          } else if (encoding === 'deflate') {
            decompressed = zlib.inflateSync(body).toString('utf8');
          } else {
            decompressed = body.toString('utf8');
          }
        } catch (e) {
          decompressed = body.toString('utf8');
        }

        // Rewrite URLs to point to the proxy server instead of the actual site
        const proxyUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        decompressed = decompressed.replace(/https?:\/\/(www\.)?eatclub\.de/gi, proxyUrl);

        // For HTML only: Inject the widget script before closing </body> tag
        if (contentType.includes('text/html')) {
          const widgetScript = `
<!-- FanGuru Widget Injection -->
<script src="/funke-widget.js"></script>
</body>`;
          decompressed = decompressed.replace(/<\/body>/i, widgetScript);
        }

        // Remove encoding-related headers
        delete proxyRes.headers['content-encoding'];
        delete proxyRes.headers['content-length'];
        delete proxyRes.headers['transfer-encoding'];

        // Remove CSP headers that might block the widget
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['content-security-policy-report-only'];
        delete proxyRes.headers['x-frame-options'];

        // Copy other headers
        Object.keys(proxyRes.headers).forEach((key) => {
          if (!['content-encoding', 'content-length', 'content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'transfer-encoding'].includes(key.toLowerCase())) {
            res.setHeader(key, proxyRes.headers[key]);
          }
        });

        res.setHeader('content-type', contentType);
        res.status(proxyRes.statusCode);
        res.send(decompressed);
      });
    } else {
      // For non-HTML content, just pipe through
      res.status(proxyRes.statusCode);
      Object.keys(proxyRes.headers).forEach((key) => {
        res.setHeader(key, proxyRes.headers[key]);
      });
      proxyRes.pipe(res);
    }
  },

  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error occurred');
  }
});

// Apply proxy to all routes
app.use('/', proxyMiddleware);

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   FanGuru Proxy Server Running            ║
╚═══════════════════════════════════════════╝

🌐 Local URL: http://localhost:${PORT}
🎯 Proxying: ${TARGET_SITE}
📦 Widget: Funke chatbot injected into all pages

Visit http://localhost:${PORT} to see the proxied site with the widget!
  `);
});
