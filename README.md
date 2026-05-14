# ShareChat Trending

मोबाइल‑फर्स्ट “ट्रेंडिंग टैग” वेब ऐप — भारत के हिंदी दर्शकों के लिए। फ्रंटएंड React + Vite है, बैकएंड Vercel सर्वरलेस `/api/trending` पर चलता है।

## पाइपलाइन (संक्षेप)

हर `GET /api/trending` अनुरोध पर (कोई कैश नहीं):

1. **RSS ट्रेंड संकेत (भारत)** — Google Trends RSS (अक्सर 404) या **Google News भारत RSS**।
2. **NewsAPI** (वैकल्पिक) — भारत की हेडलाइनें; कुंजी न हो तो सूची खाली, सिर्फ़ RSS।
3. **LLM** — डिफ़ॉल्ट **Gemini** (क्लाउड); वैकल्पिक **`LLM_PROVIDER=ollama`** से **Mac पर स्थानीय [Ollama](https://ollama.com/)** (Llama आदि)।
4. प्रतिक्रिया **JSON ऐरे** + **CORS**; सफलता पर **`X-LLM-Provider: gemini | ollama`** हेडर।

## आवश्यक एनवायरनमेंट वेरिएबल

### Gemini (डिफ़ॉल्ट)

- `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/apikey) (वैकल्पिक नाम: `GOOGLE_GENERATIVE_AI_API_KEY`)
- (वैकल्पिक) `GEMINI_MODEL` — डिफ़ॉल्ट `gemini-2.0-flash` (404 पर `gemini-1.5-flash`)

`LLM_PROVIDER` सेट न करें या `gemini` रखें।

### Ollama (मैक पर ऑन‑प्रिमाइस, बिना Gemini कुंजी)

1. [Ollama](https://ollama.com/) इंस्टॉल करें, मॉडल खींचें: `ollama pull llama3.2` (या जो नाम `ollama list` में हो)।
2. `.env.local` में:

```bash
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2
# OLLAMA_HOST=http://127.0.0.1:11434   # डिफ़ॉल्ट
```

3. `ollama serve` चल रहा हो (आम तौर पर ऐप स्वयं)।

**गति:** Mac पर लोकल Llama **Gemini से कहीं धीमा** होता है — JSON (डिफ़ॉल्ट **8 विषय**, प्रति श्रेणी एक, हिंदी फ़ील्ड) CPU/GPU पर सेकंडों से मिनट तक ले सकता है। इस रिपो में Ollama पथ पर **छोटा प्रॉम्प्ट** (कम RSS शब्द / कम NewsAPI आर्टिकल) और **`OLLAMA_NUM_PREDICT`** पहले से ट्यून हैं। और तेज़ चाहें तो छोटा मॉडल (`llama3.2:1b` जैसा), `TRENDING_TOPIC_COUNT` कम करना, या `OLLAMA_NUM_PREDICT=2200` आज़माएँ (`.env.example` देखें)।

**ध्यान:** Vercel सर्वरलेस पर डिफ़ॉल्ट `127.0.0.1` **आपके Mac पर Ollama नहीं पहुँचता**। क्लाउड डिप्लॉय के लिए Gemini रखें, या सुरक्षित टनल/गेटवे पर Ollama और `OLLAMA_HOST` सेट करें।

### अन्य

- `NEWSAPI_KEY` — वैकल्पिक; न हो तो केवल RSS सिग्नल LLM को जाते हैं।
- `TRENDING_TOPIC_COUNT` — वैकल्पिक, पूर्णांक **1–8**; डिफ़ॉल्ट **8** (प्रत्येक श्रेणि में एक टॉपिक: खेल, समाचार, मनोरंजन, मौसम, वित्त, त्योहार, राजनीति, तकनीक)।

उदाहरण: `.env.example`। **लोकल:** `sharechat-trending/.env.local`। **Vercel:** डैशबोर्ड में env (`.env.local` डिप्लॉय नहीं होता)।

## लोकल चलाना

### एक कमांड (सिफारिश)

रूट में `.env.local` रखें (Gemini: `GEMINI_API_KEY`; या **Ollama**: `LLM_PROVIDER=ollama` + `OLLAMA_MODEL`)। फिर:

```bash
npm install
npm run dev:stack
```

यह एक साथ **लोकल API** और **Vite** चलाता है। पोर्ट **3000 व्यस्त** हो तो खाली पोर्ट (3001, 3002, …) अपने आप चुना जाता है; प्रॉक्सी उसी से मेल खाती है।

### अलग टर्मिनल (वैकल्पिक)

**टर्मिनल 1 — API**

```bash
npm run dev:api
```

`scripts/local-api.mjs` Vercel CLI के बिना `api/trending.js` चलाता है (डिफ़ॉल्ट `http://127.0.0.1:3000`, या env `PORT`) और `.env.local` / `.env` लोड करता है।

**टर्मिनल 2 — फ्रंटएंड**

```bash
npm run dev
```

अगर API किसी और पोर्ट पर है (उदा. 3000 पर `EADDRINUSE`), दोनों टर्मिनल में वही पोर्ट दें:

```bash
PORT=3001 npm run dev:api
# दूसरे टर्मिनल:
VITE_DEV_API_PORT=3001 npm run dev
```

या सिर्फ **`npm run dev:stack`** — पोर्ट अपने आप मिल जाता है।

### Vercel CLI से API (पैरिटी टेस्ट)

```bash
npm run dev:vercel
```

(पहले `npm i -g vercel` या `npx vercel`।)

## डिप्लॉय (Vercel)

- रिपॉज़िटरी Vercel से कनेक्ट करें।
- `GEMINI_API_KEY` (क्लाउड के लिए) और वैकल्पिक `NEWSAPI_KEY` प्रोडक्शन एनव में सेट करें। Ollama सिर्फ़ तभी जब आपका API सर्वर उस होस्ट तक पहुँच सके (सामान्य Vercel + `127.0.0.1` नहीं)।
- बिल्ड: `npm run build`, आउटपुट: `dist` (Vite डिफ़ॉल्ट)।

`vercel.json` में SPA फ़ॉलबैक रिराइट है ताकि भविष्य में क्लाइंट रूटिंग जोड़ने पर भी होस्टिंग ठीक रहे।

## स्क्रिप्ट

- `npm run dev:stack` — **API + Vite एक साथ** (लोकल डेव के लिए सिफारिश)
- `npm run dev` — सिर्फ Vite (अलग से `npm run dev:api` चलाना ज़रूरी)
- `npm run dev:api` — सिर्फ लोकल API (`scripts/local-api.mjs`; पोर्ट `PORT` या 3000)
- `npm run dev:vercel` — Vercel CLI से API (वैकल्पिक)
- `npm run build` — प्रोडक्शन बिल्ड
- `npm run preview` — बिल्ड प्रीव्यू

## समस्या निवारण (API फेल हो तो)

- **`EADDRINUSE` / पोर्ट 3000 व्यस्त**: पुराना `vercel dev` या कोई और सर्वर बंद करें, या **`npm run dev:stack`** चलाएँ — खाली पोर्ट चुनकर API और Vite दोनों सिंक रहते हैं।
- **`ECONNREFUSED` / `अनुरोध असफल`**: सिर्फ `npm run dev` चल रहा है और API नहीं — **`npm run dev:stack`** या पहले `npm run dev:api`।
- **NewsAPI**: कई बार **200** के साथ बॉडी में `{ "status": "error", ... }` आता है (कुंजी गलत, कोटा, या **सर्वरलेस IP ब्लॉक**)। अब API इसे स्पष्ट त्रुटि के रूप में फेंकती है। फ्री प्लान पर डेटासेंटर IP ब्लॉक हो तो पेड प्लान या दूसरा न्यूज़ स्रोत ज़रूरी हो सकता है।
- **Gemini**: `GEMINI_API_KEY` ([AI Studio](https://aistudio.google.com/apikey)), वैकल्पिक `GEMINI_MODEL` — [मूल्य नीति / सीमा](https://ai.google.dev/pricing)।
- **Ollama**: `LLM_PROVIDER=ollama`, `ollama serve`, सही `OLLAMA_MODEL` — [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)।

## संरचना

- `api/trending.js` — Vercel फ़ंक्शन
- `src/App.jsx` — फ़ीड / डिटेल नेविगेशन
- `src/components/*` — UI कंपोनेंट
- `src/styles/*` — CSS (टेलविंड नहीं)
