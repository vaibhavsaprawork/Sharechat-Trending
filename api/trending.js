/**
 * Vercel Node.js serverless: GET /api/trending
 * Pipeline: RSS (India headlines) → optional NewsAPI → LLM → JSON
 * Query: ?refresh=true — no FALLBACK_DATA on LLM failure (returns error instead).
 * Query: ?stream=1 — Ollama only: Server-Sent Events; one smaller /api/chat per news article (see .env.example).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'X-LLM-Provider',
  'Content-Type': 'application/json; charset=utf-8',
};

const RSS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
};

/** Abort slow LLM HTTP calls (Gemini, Anthropic, Ollama) via AbortController. Override with LLM_FETCH_TIMEOUT_MS (ms). */
function getLlmFetchTimeoutMs() {
  const n = parseInt(process.env.LLM_FETCH_TIMEOUT_MS, 10);
  if (Number.isFinite(n) && n >= 3000 && n <= 300_000) {
    return n;
  }
  return 8000;
}

function createLlmAbortSignal() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), getLlmFetchTimeoutMs());
  return controller.signal;
}

/** Local Ollama inference is slow — default timeout below; cap via OLLAMA_FETCH_TIMEOUT_MS (up to 30 min). */
const DEFAULT_OLLAMA_FETCH_TIMEOUT_MS = 300_000;
const MAX_OLLAMA_FETCH_TIMEOUT_MS = 1_800_000;

function getOllamaFetchTimeoutMs() {
  const o = parseInt(process.env.OLLAMA_FETCH_TIMEOUT_MS, 10);
  if (Number.isFinite(o) && o >= 10_000 && o <= MAX_OLLAMA_FETCH_TIMEOUT_MS) {
    return o;
  }
  const shared = parseInt(process.env.LLM_FETCH_TIMEOUT_MS, 10);
  if (Number.isFinite(shared) && shared >= 10_000 && shared <= MAX_OLLAMA_FETCH_TIMEOUT_MS) {
    return shared;
  }
  return DEFAULT_OLLAMA_FETCH_TIMEOUT_MS;
}

function createOllamaAbortSignal() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), getOllamaFetchTimeoutMs());
  return controller.signal;
}

/** Context window for Ollama (input + output must fit). Default 4096 often truncates long RSS+News payloads + system prompt. */
function getOllamaNumCtx() {
  const n = parseInt(process.env.OLLAMA_NUM_CTX, 10);
  if (Number.isFinite(n) && n >= 2048 && n <= 32768) {
    return n;
  }
  return 8192;
}

/** When `OLLAMA_DEBUG_CURL=1`, logs the exact POST body and a copy-pastable curl (see `.env.example`). */
function isOllamaDebugCurl() {
  return String(process.env.OLLAMA_DEBUG_CURL || '').trim() === '1';
}

function ollamaDebugMaxChars(envKey, fallback) {
  const n = parseInt(process.env[envKey], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function trimDebugLog(text, maxChars) {
  const s = String(text);
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n… [truncated, total ${s.length} chars]`;
}

/**
 * @param {string} url
 * @param {object} chatBody
 * @param {string} passLabel
 */
function logOllamaDebugRequest(url, chatBody, passLabel) {
  if (!isOllamaDebugCurl()) return;
  const bodyMax = ollamaDebugMaxChars('OLLAMA_DEBUG_MAX_BODY_CHARS', 500_000);
  const bodyPretty = JSON.stringify(chatBody, null, 2);
  const urlLit = JSON.stringify(url);
  console.info(
    [
      `[api/trending] Ollama DEBUG request (${passLabel})`,
      '',
      '# Save the following block as request-body.json, then run:',
      `curl -sS -X POST ${urlLit} -H 'Content-Type: application/json' --data-binary @request-body.json`,
      '',
      '# --- request-body.json ---',
      trimDebugLog(bodyPretty, bodyMax),
      '',
    ].join('\n')
  );
}

/**
 * @param {string} passLabel
 * @param {unknown} data
 */
function logOllamaDebugResponseJson(passLabel, data) {
  if (!isOllamaDebugCurl()) return;
  const max = ollamaDebugMaxChars('OLLAMA_DEBUG_MAX_RESPONSE_CHARS', 500_000);
  let pretty;
  try {
    pretty = JSON.stringify(data, null, 2);
  } catch (e) {
    pretty = `[could not JSON.stringify response: ${e && e.message ? e.message : e}]`;
  }
  console.info(
    [
      `[api/trending] Ollama DEBUG response (${passLabel}) — JSON returned by Ollama POST /api/chat:`,
      '',
      trimDebugLog(pretty, max),
      '',
    ].join('\n')
  );
}

/**
 * @param {string} passLabel
 * @param {number} status
 * @param {string} text
 */
function logOllamaDebugErrorBody(passLabel, status, text) {
  if (!isOllamaDebugCurl()) return;
  const max = ollamaDebugMaxChars('OLLAMA_DEBUG_MAX_RESPONSE_CHARS', 500_000);
  console.info(
    [
      `[api/trending] Ollama DEBUG response (${passLabel}) — HTTP ${status} body:`,
      '',
      trimDebugLog(text, max),
      '',
    ].join('\n')
  );
}

function isAbortLikeError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const m = String(err.message || err);
  return /aborted|AbortError/i.test(m);
}

/** Node/undici `fetch failed` — surface `error.cause` (e.g. ECONNREFUSED, ENOTFOUND). */
function formatNodeFetchError(err) {
  if (!err) return '';
  let s = err.message || String(err);
  const c = err.cause;
  if (c) {
    const cm = c.message || String(c);
    s += ` | cause: ${cm}`;
    if (c.code) s += ` (${c.code})`;
  }
  return s;
}

/** Shown when LLM is unavailable or fails (timeout, rate limit, bad response). */
const FALLBACK_DATA = [
  {
    rank: 1,
    hashtag: '#IPL2026Final',
    hindiName: 'IPL 2026 फाइनल',
    description:
      'MI बनाम CSK का महामुकाबला आज वानखेड़े में। 80 हज़ार दर्शक स्टेडियम में मौजूद।',
    aiSummary:
      'IPL 2026 का फाइनल मुकाबला आज मुंबई के वानखेड़े स्टेडियम में खेला जाएगा। मुंबई इंडियंस और चेन्नई सुपर किंग्स के बीच यह छठी बार फाइनल में आमना-सामना होगा। रोहित शर्मा और MS धोनी की यह शायद आखिरी IPL भिड़ंत हो। पूरे देश की नज़रें इस मैच पर टिकी हैं।',
    category: 'खेल',
    heatScore: 98,
    heatLabel: 'बहुत गर्म',
    sources: ['Google Trends India — #1', 'NewsAPI — 340 आर्टिकल', 'ShareChat पर 1.2L पोस्ट'],
    imageUrl: '',
    relatedTags: ['#MIvsCSK', '#IPLFinal', '#Rohit', '#Dhoni'],
  },
  {
    rank: 2,
    hashtag: '#KeralaElection',
    hindiName: 'केरल चुनाव',
    description: 'केरल में नई सरकार के गठन की प्रक्रिया शुरू। कांग्रेस ने VD सथीसन को CM बनाया।',
    aiSummary:
      'केरल विधानसभा चुनाव में कांग्रेस नेतृत्व वाले UDF को बहुमत मिला है। VD सथीसन को मुख्यमंत्री पद के लिए चुना गया है। यह LDF सरकार के लंबे कार्यकाल के बाद बड़ा बदलाव है। शपथ ग्रहण समारोह अगले 48 घंटों में होने की उम्मीद है।',
    category: 'राजनीति',
    heatScore: 91,
    heatLabel: 'बहुत गर्म',
    sources: ['Google Trends — #2', 'NDTV, The Hindu — Breaking', 'Twitter India Trending'],
    imageUrl: '',
    relatedTags: ['#VDSatheesan', '#KeralaResult', '#Congress', '#UDF'],
  },
  {
    rank: 3,
    hashtag: '#MumbaiBarish',
    hindiName: 'मुंबई बारिश',
    description: 'मुंबई में मानसून की पहली भारी बारिश। IMD ने रेड अलर्ट जारी किया।',
    aiSummary:
      'मुंबई में आज मानसून की पहली तेज़ बारिश दर्ज की गई। IMD ने अगले 24 घंटों के लिए रेड अलर्ट जारी किया है। कई इलाकों में जलभराव की स्थिति बन गई है और लोकल ट्रेनें प्रभावित हुई हैं। BMC ने नागरिकों से घर पर रहने की अपील की है।',
    category: 'मौसम',
    heatScore: 85,
    heatLabel: 'तेज़ी से बढ़ रहा',
    sources: ['IMD अलर्ट — आधिकारिक', 'Google Trends Mumbai', 'ShareChat 85k पोस्ट'],
    imageUrl: '',
    relatedTags: ['#MumbaiRains', '#IMDAlert', '#Monsoon2026', '#RedAlert'],
  },
  {
    rank: 4,
    hashtag: '#Pushpa3Trailer',
    hindiName: 'पुष्पा 3 ट्रेलर',
    description: 'अल्लू अर्जुन की पुष्पा 3 का ट्रेलर रिलीज़। 2 घंटे में 50 लाख व्यूज़।',
    aiSummary:
      'अल्लू अर्जुन स्टारर पुष्पा 3 का आधिकारिक ट्रेलर आज यूट्यूब पर रिलीज़ हुआ। ट्रेलर ने 2 घंटे के भीतर 50 लाख व्यूज़ का आंकड़ा पार कर लिया। फिल्म में रश्मिका मंदाना और फहाद फासिल भी हैं। फिल्म दिसंबर 2026 में सिनेमाघरों में आएगी।',
    category: 'मनोरंजन',
    heatScore: 88,
    heatLabel: 'वायरल',
    sources: ['YouTube — 50L व्यूज़', 'Google Trends Entertainment', 'Reddit India'],
    imageUrl: '',
    relatedTags: ['#AlluArjun', '#Pushpa3', '#Tollywood', '#Rashmika'],
  },
  {
    rank: 5,
    hashtag: '#RBIRepoCut',
    hindiName: 'RBI रेपो रेट कटौती',
    description: 'RBI ने रेपो रेट 25 bps घटाकर 6% किया। होम लोन और कार लोन होंगे सस्ते।',
    aiSummary:
      'भारतीय रिज़र्व बैंक ने आज मौद्रिक नीति समिति की बैठक में रेपो रेट में 25 आधार अंकों की कटौती का फैसला किया। यह इस वित्त वर्ष में दूसरी कटौती है। इससे बैंक होम लोन और ऑटो लोन की ब्याज दरें घटा सकते हैं। शेयर बाज़ार ने इस फैसले का स्वागत किया और सेंसेक्स 400 अंक चढ़ा।',
    category: 'वित्त',
    heatScore: 72,
    heatLabel: 'तेज़ी से बढ़ रहा',
    sources: ['RBI प्रेस रिलीज़', 'ET, Mint — Breaking', 'Google Finance Trends'],
    imageUrl: '',
    relatedTags: ['#RBI', '#HomeLoan', '#SensexRise', '#EMIKam'],
  },
  {
    rank: 6,
    hashtag: '#BudhaAshtami',
    hindiName: 'बुद्ध अष्टमी',
    description: 'आज बुद्ध पूर्णिमा पर विशेष पूजा और दीप प्रज्वलन। देशभर में भक्तों की भीड़।',
    aiSummary:
      'बुद्ध अष्टमी के अवसर पर देशभर के मंदिरों और बौद्ध विहारों में विशेष आयोजन किए जा रहे हैं। सारनाथ, बोधगया और कुशीनगर में लाखों श्रद्धालु जुटे हैं। PM ने भी इस अवसर पर देशवासियों को शुभकामनाएं दी हैं। ShareChat पर भक्तों द्वारा हज़ारों तस्वीरें और वीडियो शेयर किए जा रहे हैं।',
    category: 'त्योहार',
    heatScore: 79,
    heatLabel: 'वायरल',
    sources: ['Google Trends — Festival', 'ShareChat 90k पोस्ट', 'Aaj Tak, DD News'],
    imageUrl: '',
    relatedTags: ['#BuddhPurnima', '#BudhAshtami', '#Buddhist', '#DipPrajwalan'],
  },
  {
    rank: 7,
    hashtag: '#ViratKohli200',
    hindiName: 'विराट का दोहरा शतक',
    description: 'विराट कोहली ने टेस्ट में 200 रन पूरे किए। ऑस्ट्रेलिया के खिलाफ यादगार पारी।',
    aiSummary:
      'विराट कोहली ने आज ऑस्ट्रेलिया के खिलाफ तीसरे टेस्ट मैच में दोहरा शतक जड़ा। यह उनके करियर का पहला टेस्ट दोहरा शतक है। इस पारी के साथ वे टेस्ट क्रिकेट में 10,000 रन पूरे करने वाले चौथे भारतीय बन गए। पूरे देश में जश्न का माहौल है।',
    category: 'खेल',
    heatScore: 94,
    heatLabel: 'बहुत गर्म',
    sources: ['BCCI Live', 'Google Trends Sports #1', 'Twitter Trending India'],
    imageUrl: '',
    relatedTags: ['#Kohli200', '#KingKohli', '#IndiaVsAus', '#TestCricket'],
  },
  {
    rank: 8,
    hashtag: '#PatnaMetro',
    hindiName: 'पटना मेट्रो',
    description: 'पटना मेट्रो का पहला ट्रायल रन आज। CM नीतीश कुमार ने हरी झंडी दिखाई।',
    aiSummary:
      'पटना मेट्रो रेल परियोजना का पहला सफल ट्रायल रन आज संपन्न हुआ। मुख्यमंत्री नीतीश कुमार ने स्वयं हरी झंडी दिखाकर ट्रायल की शुरुआत की। यह बिहार के इतिहास में पहली मेट्रो सेवा होगी। पहले फेज़ में 6 स्टेशन कवर होंगे और यात्री सेवा 3 महीने में शुरू होने की उम्मीद है।',
    category: 'समाचार',
    heatScore: 67,
    heatLabel: 'उभरता हुआ',
    sources: ['Google Trends Bihar', 'NewsAPI India', 'Dainik Bhaskar'],
    imageUrl: '',
    relatedTags: ['#PatnaMetro', '#Bihar', '#NitishKumar', '#SmartCity'],
  },
  {
    rank: 9,
    hashtag: '#JioAI',
    hindiName: 'Jio AI फोन',
    description:
      'Reliance Jio ने ₹999 में AI-पावर्ड स्मार्टफोन लॉन्च किया। 4G और Hindi AI assistant।',
    aiSummary:
      'रिलायंस जियो ने आज ₹999 की कीमत पर एक AI-सक्षम स्मार्टफोन लॉन्च किया है। इस फोन में हिंदी में बात करने वाला AI असिस्टेंट बिल्ट-इन है। मुकेश अंबानी ने इसे \'भारत का अपना AI फोन\' बताया। पहले 24 घंटों में 10 लाख से ज़्यादा प्री-बुकिंग आई हैं।',
    category: 'तकनीक',
    heatScore: 76,
    heatLabel: 'वायरल',
    sources: ['Jio Press Release', 'Google Trends Tech', 'Reddit r/india'],
    imageUrl: '',
    relatedTags: ['#JioPhone', '#RelianceJio', '#AIIndia', '#MakeInIndia'],
  },
  {
    rank: 10,
    hashtag: '#DelhiHeatwave',
    hindiName: 'दिल्ली लू',
    description: 'दिल्ली में तापमान 47°C पहुंचा। IMD का येलो अलर्ट, स्कूल बंद।',
    aiSummary:
      'दिल्ली में इस सीज़न का सबसे गर्म दिन दर्ज किया गया, तापमान 47 डिग्री सेल्सियस तक पहुंच गया। IMD ने येलो अलर्ट जारी करते हुए लोगों को दोपहर में बाहर न निकलने की सलाह दी है। दिल्ली के सभी सरकारी स्कूलों में कल छुट्टी घोषित की गई है। अस्पतालों में हीट स्ट्रोक के मामले बढ़ रहे हैं।',
    category: 'मौसम',
    heatScore: 81,
    heatLabel: 'तेज़ी से बढ़ रहा',
    sources: ['IMD Delhi Alert', 'Google Trends Weather', 'Times of India'],
    imageUrl: '',
    relatedTags: ['#DelhiHeat', '#Heatwave2026', '#IMDAlert', '#StayCool'],
  },
  {
    rank: 11,
    hashtag: '#SalmanKhanShoot',
    hindiName: 'सलमान खान शूटिंग',
    description:
      'सलमान खान की नई फिल्म \'Sikandar 2\' की शूटिंग शुरू। राजकुमार हिरानी डायरेक्ट करेंगे।',
    aiSummary:
      'बॉलीवुड के भाईजान सलमान खान ने आज अपनी अगली बड़ी फिल्म \'Sikandar 2\' की शूटिंग शुरू की। फिल्म को राजकुमार हिरानी निर्देशित कर रहे हैं। मुंबई के फिल्म सिटी में शूटिंग का पहला दिन था। फिल्म ईद 2027 पर रिलीज़ होगी।',
    category: 'मनोरंजन',
    heatScore: 69,
    heatLabel: 'उभरता हुआ',
    sources: ['Bollywood Hungama', 'Google Trends Entertainment', 'Instagram Trending'],
    imageUrl: '',
    relatedTags: ['#SalmanKhan', '#Sikandar2', '#Bollywood', '#EidRelease'],
  },
  {
    rank: 12,
    hashtag: '#UPBoard10Result',
    hindiName: 'UP Board 10वीं रिजल्ट',
    description: 'UP Board कक्षा 10 का रिजल्ट आज दोपहर 2 बजे। 30 लाख छात्र बेसब्री से इंतज़ार में।',
    aiSummary:
      'उत्तर प्रदेश माध्यमिक शिक्षा परिषद ने आज कक्षा 10 का परीक्षा परिणाम जारी किया। इस बार 30 लाख से ज़्यादा छात्रों ने परीक्षा दी थी। upmsp.edu.in पर रिजल्ट चेक किया जा सकता है। इस बार पास प्रतिशत 78% रहा जो पिछले साल से 3% ज़्यादा है।',
    category: 'समाचार',
    heatScore: 83,
    heatLabel: 'बहुत गर्म',
    sources: ['UPMSP Official', 'Google Trends Education #1', 'Dainik Jagran'],
    imageUrl: '',
    relatedTags: ['#UPBoard', '#10thResult', '#UPBoardResult2026', '#UPMSP'],
  },
];

/** India / world RSS used as trend signals for the LLM (Google Trends daily RSS is discontinued — 404). */
const RSS_TREND_SIGNAL_FEEDS = [
  { url: 'https://news.google.com/rss?hl=hi&gl=IN&ceid=IN:hi', name: 'Google News (HI)' },
  { url: 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en', name: 'Google News (en-IN)' },
  {
    url: 'https://news.google.com/rss/headlines/section/topic/NATION?ned=in&hl=en-IN&gl=IN',
    name: 'Google News (Nation)',
  },
  { url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml', name: 'BBC News India' },
  { url: 'https://feeds.bbci.co.uk/sport/cricket/rss.xml', name: 'BBC Sport Cricket' },
  { url: 'https://indianexpress.com/section/india/feed/', name: 'Indian Express India' },
  { url: 'https://www.thehindu.com/news/national/?service=rss', name: 'The Hindu National' },
  { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', name: 'NDTV Top Stories' },
];

const RSS_FETCH_TIMEOUT_MS = 12_000;

/** Feed categories — default is one topic per category (10 total; assignment minimum 10). */
const TREND_CATEGORIES = [
  'खेल',
  'समाचार',
  'मनोरंजन',
  'मौसम',
  'वित्त',
  'त्योहार',
  'राजनीति',
  'तकनीक',
  'शिक्षा',
  'स्वास्थ्य',
];

const TREND_CAT_SET = new Set(TREND_CATEGORIES);

/** Map common English category labels from models to our Hindi `TREND_CATEGORIES` keys. */
const CATEGORY_EN_TO_HI = {
  sports: 'खेल',
  sport: 'खेल',
  news: 'समाचार',
  entertainment: 'मनोरंजन',
  weather: 'मौसम',
  finance: 'वित्त',
  festival: 'त्योहार',
  politics: 'राजनीति',
  tech: 'तकनीक',
  technology: 'तकनीक',
  education: 'शिक्षा',
  health: 'स्वास्थ्य',
};

/**
 * @param {unknown} raw
 * @returns {string | null} member of TREND_CATEGORIES, or null if unknown
 */
function resolveToCanonicalCategory(raw) {
  const t = String(raw ?? '')
    .trim()
    .normalize('NFC');
  if (!t) return null;
  if (TREND_CAT_SET.has(t)) return t;
  const lo = t.toLowerCase();
  if (CATEGORY_EN_TO_HI[lo]) return CATEGORY_EN_TO_HI[lo];
  return null;
}

/** True when the run asks for one topic per category covering all 10 slots. */
function isFullCategoryDeckForK(k) {
  return k >= TREND_CATEGORIES.length;
}

/** True when we ask the LLM for one topic per category covering all 10 slots. */
function isFullCategoryDeck() {
  return isFullCategoryDeckForK(topicTargetCount());
}

/**
 * Best-effort category from hashtags/copy when the model mislabels (e.g. NEET as खेल).
 * Uses Latin + Devanagari hints; returns null if unclear.
 * @param {{ hashtag?: string, hindiName?: string, description?: string, aiSummary?: string }} row
 * @returns {string | null}
 */
function inferTrendCategoryFromText(row) {
  const blob = [row.hashtag, row.hindiName, row.description, row.aiSummary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const edu =
    /नीट|neet|परीक्षा|पेपर|लीक|बोर्ड|छात्र|शिक्षा|university|college|admission|jee|upsc|cbse|icse|स्कूल|विद्यालय|campus|degree|scholarship|result|marksheet|exam\b|examination/i.test(
      blob
    );
  const sport =
    /ipl\b|क्रिकेट|cricket|t20\b|odi\b|batsman|wicket|वर्ल्ड\s*कप|world\s+cup|football|hockey|olympic|stadium|मैच\s*\(|vs\.?\s*australia|ind\s*vs/i.test(
      blob
    );
  if (edu && !sport) return 'शिक्षा';
  if (sport && !edu) return 'खेल';

  const pol =
    /चुनाव|bjp|congress|कांग्रेस|मुख्यमंत्री|सीएम\b|pm\b|संसद|विधानसभा|राजनीति|मंत्री|govt|government|court|hc\b|high\s+court|supreme\s+court/i.test(
      blob
    );
  if (pol && !sport) return 'राजनीति';

  const health =
    /स्वास्थ्य|hospital|doctor|covid|vaccine|मौत|death|disease|patient|उपचार|clinic|mental\s+health/i.test(
      blob
    );
  if (health) return 'स्वास्थ्य';

  const weather = /मौसम|बारिश|rain|monsoon|imd\b|cyclone|temperature|heatwave|flood|snow/i.test(blob);
  if (weather) return 'मौसम';

  const fin =
    /rbi\b|repo|stock|share|sensex|nifty|rupee|export|import|gdp|budget|bank|loan|crypto|finance|invest/i.test(
      blob
    );
  if (fin) return 'वित्त';

  const ent =
    /bollywood|trailer|movie|film|cinema|actor|actress|album|song|concert|oscar|cannes|netflix|series|ट्रेलर|फिल्म|सिनेमा/i.test(
      blob
    );
  if (ent) return 'मनोरंजन';

  const tech =
    /ai\b|chip|semiconductor|smartphone|android|iphone|app\b|startup|cyber|hack|software|5g\b|internet|google|microsoft/i.test(
      blob
    );
  if (tech) return 'तकनीक';

  const fest = /त्योहार|festival|diwali|दिवाली|holi|eid|ईद|navratri|christmas|pongal|lohri|rakhi/i.test(blob);
  if (fest) return 'त्योहार';

  return null;
}

function topicTargetCount() {
  const n = parseInt(process.env.TRENDING_TOPIC_COUNT, 10);
  if (Number.isFinite(n) && n >= 1 && n <= TREND_CATEGORIES.length) {
    return n;
  }
  return TREND_CATEGORIES.length;
}

/** Trim any topic list to `TRENDING_TOPIC_COUNT` and renumber `rank` (LLM + fallback paths). */
function sliceTopicsToLimit(topics) {
  const k = topicTargetCount();
  if (!Array.isArray(topics) || topics.length === 0) return topics;
  const slice = topics.slice(0, k);
  return slice.map((item, i) => ({ ...item, rank: i + 1 }));
}

function buildTrendingUserPayload(signals, articles, opts = {}) {
  const maxTerms = opts.maxTerms ?? 40;
  const maxArticles = opts.maxArticles ?? 30;
  const k = topicTargetCount();
  const terms = signals.terms || [];
  const label = signals.sourceLabel || 'ट्रेंड RSS';
  let slice = articles.slice(0, maxArticles);
  if (opts.slimArticles) {
    slice = slice.map((a) => ({
      title: a.title || '',
      source: a.source || '',
      imageUrl: truncateStringForLlm(a.imageUrl || '', 220),
    }));
  }
  const newsLabel = opts.slimArticles
    ? `2) समाचार सूची — भारत की शीर्ष ${maxArticles} (title, source, imageUrl जब उपलब्ध हो):`
    : `2) NewsAPI — भारत की शीर्ष ${maxArticles} हेडलाइन (title, description, source, imageUrl):`;
  return [
    'नीचे दो सूचियाँ हैं।',
    '',
    `1) ${label}:`,
    JSON.stringify(terms.slice(0, maxTerms), null, 0),
    '',
    newsLabel,
    JSON.stringify(slice, null, 0),
    '',
    (() => {
      const full = isFullCategoryDeck();
      if (full) {
        return `उपरोक्त को मर्ज करके ठीक ${k} ट्रेंडिंग विषय JSON ऐरे में लौटाओ — प्रत्येक आइटम की "category" अलग हो (${TREND_CATEGORIES.join(', ')})।`;
      }
      return `उपरोक्त को मर्ज करके ठीक ${k} ट्रेंडिंग विषय JSON ऐरे में लौटाओ — प्रत्येक आइटम की "category" नीचे दी पूरी सूची में से उस शीर्षक के लिए सबसे सही श्रेणी हो (${TREND_CATEGORIES.join(', ')})। उदाहरण: नीट/परीक्षा/पेपर लीक → शिक्षा; क्रिकेट/IPL → खेल; चुनाव/अदालत/सीएम → राजनीति — खेल तभी जब खेल की खबर हो।`;
    })(),
  ].join('\n');
}

function buildSystemPrompt() {
  const k = topicTargetCount();
  const allCats = TREND_CATEGORIES.join(', ');
  const fullDeck = isFullCategoryDeck();

  if (fullDeck) {
    const catList = TREND_CATEGORIES.join(', ');
    return `You are a trending topics analyst for ShareChat, India's leading Hindi social media platform. Your audience is Hindi-speaking users from Bharat — tier 2 and tier 3 cities, age 18-35.

You must merge, deduplicate, and output exactly ${k} trending topics from the provided RSS trend signals (when present) and India news headlines.

CRITICAL: Each of the ${k} objects must use a DISTINCT "category" value — at most one topic per category. For this response use exactly these categories once each (no duplicates): ${catList}.

Return ONLY a valid JSON array (no markdown fences, no explanation). Each element must be an object with exactly these keys:
{
  "rank": number,
  "hashtag": string,
  "hindiName": string,
  "description": string,
  "aiSummary": string,
  "category": string,
  "heatScore": number,
  "heatLabel": string,
  "sources": string[],
  "imageUrl": string,
  "relatedTags": string[]
}

Rules:
- "hashtag": Hindi-style hashtag like #IndiaVsAustralia (Latin script OK for names/brands).
- "hindiName": Hindi display name for the topic.
- "description": exactly 2 sentences in Hindi explaining why it is trending.
- "aiSummary": 3-4 sentences in Hindi — deeper bonus analysis.
- "category": exactly one of: ${catList} (use each exactly once in this response)
- "heatScore": integer 1-100
- "heatLabel": exactly one of: बहुत गर्म, तेज़ी से बढ़ रहा, वायरल, उभरता हुआ
- "sources": 2-3 short Hindi strings describing signals (e.g. गूगल ट्रेंड्स, समाचार स्रोत).
- "imageUrl": copy a relevant imageUrl from the news list when available; else "".
- "relatedTags": 3-4 related Hindi hashtags.
- Filter out topics irrelevant to Indian Hindi-speaking audience.
- GROUNDING (mandatory): Each topic MUST be clearly based on at least one headline from the RSS title list OR one item from the news JSON (paraphrase is OK). Do NOT invent events (e.g. a live India–Australia cricket match) unless those exact stories appear in the provided lists. If the lists are about politics, exams, ships, diplomacy, etc., output those — do not substitute unrelated cricket/IPL filler.
- When several signals fit, prefer themes that actually appear in the lists: cricket/Bollywood/politics/etc. only if supported by those headlines.
- If you cannot identify a clear trending topic from a headline, skip it entirely — do not return placeholder or unknown entries. Only return topics you can clearly name in Hindi (real "hindiName" and "hashtag", never "अज्ञात विषय" or generic fillers).
- Ranks must be 1..${k} unique, sorted by importance.`;
  }

  return `You are a trending topics analyst for ShareChat, India's leading Hindi social media platform. Your audience is Hindi-speaking users from Bharat — tier 2 and tier 3 cities, age 18-35.

You must merge, deduplicate, and output exactly ${k} trending topics from the provided RSS trend signals (when present) and India news headlines.

Category rules (you are returning fewer than 10 topics):
- Each object must use a DISTINCT "category" chosen from this full list by best semantic fit to the story: ${allCats}.
- "category" must be exactly one of those Hindi labels. Examples: NEET / boards / paper leak / university → शिक्षा; cricket / IPL / match → खेल; elections / CM / court / party → राजनीति; RBI / markets / exports → वित्त; IMD / rain / cyclone → मौसम; films / trailers / stars → मनोरंजन; apps / AI / 5G / cyber → तकनीक; hospitals / disease / public health → स्वास्थ्य; major festivals → त्योहार; broad national breaking news with no better bucket → समाचार.
- Do NOT use खेल for exam or admission stories. Do NOT use शिक्षा for cricket.

Return ONLY a valid JSON array (no markdown fences, no explanation). Each element must be an object with exactly these keys:
{
  "rank": number,
  "hashtag": string,
  "hindiName": string,
  "description": string,
  "aiSummary": string,
  "category": string,
  "heatScore": number,
  "heatLabel": string,
  "sources": string[],
  "imageUrl": string,
  "relatedTags": string[]
}

Rules:
- "hashtag": Hindi-style hashtag (Latin script OK for names/brands).
- "hindiName": Hindi display name for the topic.
- "description": exactly 2 sentences in Hindi explaining why it is trending.
- "aiSummary": 3-4 sentences in Hindi — deeper bonus analysis.
- "category": exactly one of: ${allCats} — must match the story, not a default.
- "heatScore": integer 1-100
- "heatLabel": exactly one of: बहुत गर्म, तेज़ी से बढ़ रहा, वायरल, उभरता हुआ
- "sources": 2-3 short Hindi strings describing signals (e.g. गूगल ट्रेंड्स, समाचार स्रोत).
- "imageUrl": copy a relevant imageUrl from the news list when available; else "".
- "relatedTags": 3-4 related Hindi hashtags.
- GROUNDING (mandatory): Each topic MUST be clearly based on at least one RSS title OR one news JSON item. Do not invent unrelated events.
- If you cannot identify a clear trending topic from a headline, skip it entirely — do not return placeholder or unknown entries. Only return topics you can clearly name in Hindi (real "hindiName" and "hashtag", never "अज्ञात विषय" or generic fillers).
- Ranks must be 1..${k} unique, sorted by importance.`;
}

function buildOllamaSpeedSuffix() {
  const k = topicTargetCount();
  const full = isFullCategoryDeck();
  const catHint = full
    ? 'Each object must include all required keys; one distinct category per fixed slot.'
    : `Pick "category" from the full 10 Hindi types by story fit (e.g. NEET → शिक्षा, not खेल). ${k} distinct categories.`;
  return `

Speed note (local inference): Return ONLY valid JSON. Root value must be a JSON array (first character [, last ]). No markdown fences, or commentary before or after. The array MUST contain exactly ${k} complete objects — stopping early or emitting fewer than ${k} items is wrong. Keep each "description" to 1 short Hindi sentence and "aiSummary" to 2 short Hindi sentences (not 3–4). ${catHint}`;
}

function setCors(res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

function parseRssItemTitles(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const titles = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const cdata = block.match(/<title[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/i);
    const plain = block.match(/<title[^>]*>\s*([^<]+)\s*<\/title>/i);
    const raw = (cdata && cdata[1]) || (plain && plain[1]) || '';
    const title = raw.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    if (
      title &&
      !/^daily\s+search\s+trends/i.test(title) &&
      !/^trending\s+searches/i.test(title)
    ) {
      titles.push(title);
    }
  }
  return [...new Set(titles)];
}

/** Atom 1.0 (many publishers use <entry> instead of <item>). */
function parseAtomEntryTitles(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const titles = [];
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = entryRegex.exec(xml)) !== null) {
    const block = m[1];
    let raw = '';
    const cdata = block.match(/<title[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/i);
    if (cdata) {
      raw = cdata[1];
    } else {
      const plain = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (plain) raw = plain[1].replace(/<[^>]+>/g, ' ');
    }
    const title = raw.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s+/g, ' ').trim();
    if (title && !/^untitled$/i.test(title)) {
      titles.push(title);
    }
  }
  return [...new Set(titles)];
}

function parseFeedTitles(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const looksXml = /<(rss|rdf:RDF|feed)\b/i.test(xml);
  if (!looksXml) return [];
  const fromItems = parseRssItemTitles(xml);
  if (fromItems.length > 0) return fromItems;
  return parseAtomEntryTitles(xml);
}

function rssFetchSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), RSS_FETCH_TIMEOUT_MS);
  return c.signal;
}

async function fetchRssFeed({ url, name }) {
  try {
    const res = await fetch(url, {
      headers: RSS_HEADERS,
      signal: rssFetchSignal(),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const xml = await res.text();
    const titles = parseFeedTitles(xml);
    console.info('[api/trending] RSS feed fetch result:', {
      name,
      url,
      httpStatus: res.status,
      titleCount: titles.length,
      sampleTitles: titles.slice(0, 5),
    });
    return { url, name, titles };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.warn('[api/trending] RSS feed fetch failed:', { name, url, error: msg });
    throw err;
  }
}

function trendFeedsList() {
  const extra = (process.env.RSS_TREND_FEED_URLS || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((feedUrl, i) => ({ url: feedUrl, name: `RSS ${i + 1}` }));
  return [...extra, ...RSS_TREND_SIGNAL_FEEDS];
}

/**
 * Trend headlines for the LLM: parallel fetch of India-focused RSS/Atom feeds.
 * Google Trends “daily RSS” is discontinued (404) — see https://newsapi.org/docs for news APIs; we use public RSS here.
 * Does not throw — returns empty terms if every feed fails.
 */
async function fetchTrendSearchSignals() {
  const feeds = trendFeedsList();
  const settled = await Promise.allSettled(feeds.map((f) => fetchRssFeed(f)));

  const merged = [];
  const seen = new Set();
  const okNames = [];
  const errors = [];

  for (let i = 0; i < settled.length; i += 1) {
    const s = settled[i];
    const label = feeds[i] ? feeds[i].name : String(i);
    if (s.status !== 'fulfilled') {
      const msg = s.reason && s.reason.message ? s.reason.message : String(s.reason);
      errors.push(`${label}: ${msg}`);
      continue;
    }
    const { name, titles } = s.value;
    if (!titles.length) {
      errors.push(`${name}: no titles parsed`);
      continue;
    }
    okNames.push(name);
    for (const t of titles) {
      const key = t.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }
  }

  if (merged.length > 0) {
    const labelNames = okNames.slice(0, 5).join(', ');
    console.info(
      `[api/trending] RSS trend signals: ${merged.length} unique headlines from ${okNames.length} feed(s) — ${labelNames}`
    );
    console.info('[api/trending] RSS merged headlines (preview):', merged.slice(0, 8));
    return {
      terms: merged.slice(0, 50),
      sourceLabel: `भारत — RSS शीर्षक (${okNames.join(' + ')})`,
    };
  }

  console.warn(
    `[api/trending] All RSS trend feeds failed or empty (${feeds.length} tried). Last errors:`,
    errors.slice(0, 5).join(' | ')
  );
  return { terms: [], sourceLabel: 'RSS उपलब्ध नहीं (सूची खाली)' };
}

const DEFAULT_NEWSAPI_TOP_HEADLINES = 'https://newsapi.org/v2/top-headlines';

/**
 * NewsAPI /v2/everything requires `q`. Build a short query from RSS terms when env URL has no `q`.
 * Long `q` strings (many ORs / long headlines) trigger `queryTooLong` / "too complex".
 */
function simplifyNewsQueryTerm(t) {
  let s = String(t).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const pipe = s.indexOf(' | ');
  if (pipe > 8) s = s.slice(0, pipe).trim();
  const dash = s.indexOf(' - ');
  if (dash > 10) s = s.slice(0, dash).trim();
  s = s.replace(/["'|]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 36) s = s.slice(0, 36).trim();
  return s;
}

function buildNewsEverythingQuery(signals) {
  const envQ = (process.env.NEWSAPI_EVERYTHING_Q || '').trim();
  if (envQ) return envQ.slice(0, 120);

  const raw = (signals && Array.isArray(signals.terms) ? signals.terms : [])
    .map(simplifyNewsQueryTerm)
    .filter(Boolean);
  if (raw.length === 0) {
    return 'India';
  }
  const a = raw[0];
  const b = raw[1];
  if (!b) return a;
  const joined = `${a} OR ${b}`;
  return joined.length > 100 ? a : joined;
}

async function fetchNewsHeadlines(apiKey, signals = { terms: [] }) {
  const rawBase = (process.env.GET_NEWS_API_URL || '').trim();
  const url = rawBase ? new URL(rawBase) : new URL(DEFAULT_NEWSAPI_TOP_HEADLINES);
  const isEverything = /\/everything\/?$/i.test(url.pathname);

  if (isEverything) {
    if (!url.searchParams.get('q')) {
      url.searchParams.set('q', buildNewsEverythingQuery(signals));
    }
    if (!url.searchParams.get('pageSize')) {
      url.searchParams.set('pageSize', '30');
    }
    if (!url.searchParams.get('sortBy')) {
      url.searchParams.set('sortBy', 'publishedAt');
    }
  } else {
    if (!rawBase) {
      url.searchParams.set('country', 'in');
    } else if (!url.searchParams.get('country') && !url.searchParams.get('sources')) {
      url.searchParams.set('country', 'in');
    }
    if (!url.searchParams.get('pageSize')) {
      url.searchParams.set('pageSize', '30');
    }
  }

  url.searchParams.set('apiKey', apiKey);

  const fetchOnce = () =>
    fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

  let res = await fetchOnce();

  if (!res.ok) {
    const errBody = await res.text();
    const canRetry =
      isEverything &&
      (res.status === 400 || res.status === 414) &&
      /queryTooLong|too complex|request is too complex/i.test(errBody);
    if (canRetry) {
      console.warn(
        '[api/trending] NewsAPI queryTooLong/too complex; retrying with NEWSAPI_EVERYTHING_FALLBACK_Q (default India).'
      );
      const fallback = (process.env.NEWSAPI_EVERYTHING_FALLBACK_Q || 'India').trim() || 'India';
      url.searchParams.set('q', fallback.slice(0, 120));
      url.searchParams.set('apiKey', apiKey);
      res = await fetchOnce();
    } else {
      throw new Error(`NewsAPI failed: ${res.status} ${errBody.slice(0, 200)}`);
    }
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`NewsAPI failed: ${res.status} ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data && data.status === 'error') {
    const msg = [data.code, data.message].filter(Boolean).join(' — ') || 'NewsAPI error';
    throw new Error(`NewsAPI: ${msg}`);
  }
  const articles = Array.isArray(data.articles) ? data.articles : [];
  const mapped = articles.map((a) => ({
    title: a.title || '',
    description: a.description || '',
    url: a.url || '',
    imageUrl: a.urlToImage || '',
    source: (a.source && a.source.name) || '',
  }));
  return dedupeNewsArticles(mapped);
}

/**
 * Strip tracking params so the same story from slightly different URLs still dedupes.
 * @param {string} u
 */
function normalizeUrlForArticleDedupe(u) {
  const raw = String(u || '').trim();
  if (!raw) return '';
  try {
    const x = new URL(raw);
    x.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid']) {
      x.searchParams.delete(p);
    }
    return x.href.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * Remove duplicate NewsAPI rows (same canonical URL or same normalized title).
 * @param {{ title?: string, url?: string }[]} list
 */
function dedupeNewsArticles(list) {
  if (!Array.isArray(list) || list.length === 0) return list;
  const seen = new Set();
  const out = [];
  for (const a of list) {
    const urlKey = normalizeUrlForArticleDedupe(a.url || '');
    const titleKey = String(a.title || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 180);
    const key = urlKey.length > 14 ? `u:${urlKey}` : `t:${titleKey}`;
    if (key.length < 5) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** Stable identity for a trending card (hashtag preferred, else Hindi title). */
function topicIdentityKey(topic) {
  let h = String(topic.hashtag || '').trim().toLowerCase();
  h = h.replace(/^#+/, '');
  if (h) return `h:#${h}`;
  const n = String(topic.hindiName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return `n:${n}`;
}

/**
 * Drop duplicate stories while preserving order and renumbering rank.
 * @param {unknown[]} topics
 */
function dedupeTrendTopicsPreservingOrder(topics) {
  if (!Array.isArray(topics) || topics.length === 0) return topics;
  const seen = new Set();
  const out = [];
  for (const t of topics) {
    if (!t || typeof t !== 'object') continue;
    const k = topicIdentityKey(/** @type {Record<string, unknown>} */ (t));
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  if (out.length === topics.length) return topics;
  return out.map((item, i) => ({ ...item, rank: i + 1 }));
}

/**
 * Google Gemini (AI Studio) generateContent REST API.
 * https://ai.google.dev/gemini-api/docs/get-started/rest
 */
async function callGemini(apiKey, userText, signal) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemPrompt() }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userText }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 6144,
        },
      }),
    });
  } catch (e) {
    throw new Error(
      `Gemini network error (${model}): ${formatNodeFetchError(e)}. Check GEMINI_API_KEY, outbound HTTPS, and DNS. If you meant to use local Llama, set LLM_PROVIDER=ollama only when this API runs on the same host as Ollama (Vercel cannot reach your laptop's 127.0.0.1).`
    );
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API failed: ${res.status} ${t.slice(0, 400)}`);
  }

  const data = await res.json();
  if (data && data.error && data.error.message) {
    throw new Error(`Gemini: ${data.error.message}`);
  }

  const cand = data && data.candidates && data.candidates[0];
  if (!cand) {
    throw new Error('Gemini: no candidates in response');
  }
  if (cand.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS') {
    throw new Error(`Gemini: finishReason ${cand.finishReason}`);
  }

  const parts = cand.content && cand.content.parts;
  const rawText =
    parts && parts[0] && parts[0].text !== undefined && parts[0].text !== null
      ? parts[0].text
      : '';

  const trimmed = String(rawText).trim();
  if (!trimmed) {
    throw new Error('Gemini returned empty text. Try another GEMINI_MODEL.');
  }

  let body = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jsonMatch = body.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : body;

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Gemini returned non-JSON output');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Gemini JSON was not an array');
  }

  const filtered = filterLlmQualityTopicRows(parsed);
  if (filtered.length === 0) {
    throw new Error(
      'Gemini returned no topics passing quality filters (require real hindiName, hashtag, heatScore ≥ 20; no placeholder names).'
    );
  }
  return filtered;
}

/** Hindi/Latin placeholders — reject rows whose title matches these substrings (after trim + NFC). */
const INVALID_TREND_HINDI_SUBSTRINGS = [
  'अज्ञात विषय',
  'अज्ञात',
  'unknown',
  'Unknown',
  'अज्ञात topic',
  'N/A',
  'null',
];

/**
 * Raw LLM JSON objects (Gemini / Anthropic / Ollama) before `normalizeTopics`.
 * @param {unknown[]} parsed
 * @returns {unknown[]}
 */
function filterLlmQualityTopicRows(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((tag) => {
    if (!tag || typeof tag !== 'object') return false;
    const o = /** @type {Record<string, unknown>} */ (tag);
    const hi = String(o.hindiName ?? '')
      .trim()
      .normalize('NFC');
    const ht = String(o.hashtag ?? '').trim();
    if (!hi) return false;
    if (!ht) return false;
    const hiLower = hi.toLowerCase();
    if (INVALID_TREND_HINDI_SUBSTRINGS.some((n) => n && hiLower.includes(String(n).toLowerCase()))) {
      return false;
    }
    if (hi.length < 3) return false;
    const heat = Number(o.heatScore);
    if (!Number.isFinite(heat) || heat < 20) return false;
    return true;
  });
}

/**
 * After `normalizeTopics` mapping — drops rows that are still empty/placeholder (e.g. bad LLM keys).
 * @param {Record<string, unknown>} row
 * @returns {boolean}
 */
function passesNormalizedTrendQuality(row) {
  const hi = String(row.hindiName ?? '')
    .trim()
    .normalize('NFC');
  const ht = String(row.hashtag ?? '').trim();
  if (!hi || hi.length < 3) return false;
  if (!ht) return false;
  const hiLower = hi.toLowerCase();
  if (INVALID_TREND_HINDI_SUBSTRINGS.some((n) => n && hiLower.includes(String(n).toLowerCase()))) {
    return false;
  }
  const heat = Number(row.heatScore);
  if (!Number.isFinite(heat) || heat < 20) return false;
  return true;
}

/**
 * Anthropic Messages API — tried before Gemini when ANTHROPIC_API_KEY is set (max_tokens capped for latency).
 * https://docs.anthropic.com/en/api/messages
 */
async function callAnthropic(apiKey, userText, signal) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.3,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: userText }],
      }),
    });
  } catch (e) {
    throw new Error(`Anthropic network error: ${formatNodeFetchError(e)}`);
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API failed: ${res.status} ${t.slice(0, 400)}`);
  }

  const data = await res.json();
  if (data && data.error && data.error.message) {
    throw new Error(`Anthropic: ${data.error.message}`);
  }

  const blocks = data && data.content;
  let rawText = '';
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      if (b && b.type === 'text' && b.text) rawText += b.text;
    }
  }

  const trimmed = String(rawText).trim();
  if (!trimmed) {
    throw new Error('Anthropic returned empty text');
  }

  let body = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jsonMatch = body.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : body;

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Anthropic returned non-JSON output');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Anthropic JSON was not an array');
  }

  const filtered = filterLlmQualityTopicRows(parsed);
  if (filtered.length === 0) {
    throw new Error(
      'Anthropic returned no topics passing quality filters (require real hindiName, hashtag, heatScore ≥ 20; no placeholder names).'
    );
  }
  return filtered;
}

/** True on Vercel production/preview (and similar), false for local Node and `vercel dev` (VERCEL_ENV=development). */
function isVercelCloudRuntime() {
  const env = (process.env.VERCEL_ENV || '').trim();
  if (env === 'production' || env === 'preview') return true;
  const vercel = (process.env.VERCEL || '').trim().toLowerCase();
  const vercelOn = vercel === '1' || vercel === 'true';
  if (!vercelOn) return false;
  if (env === 'development') return false;
  return true;
}

/** Localhost Ollama from Vercel cloud always targets the serverless VM, not the developer's machine. */
function assertOllamaHostReachableFromRuntime() {
  const raw = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').trim();
  let hostname = '';
  try {
    hostname = new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error(`OLLAMA_HOST is not a valid URL: ${raw}`);
  }
  const local =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1';
  if (local && isVercelCloudRuntime()) {
    throw new Error(
      'OLLAMA_HOST points at localhost but this handler runs on Vercel (production/preview). That URL is the serverless machine, not your PC — Ollama on your laptop will never get traffic or logs. Fix: set GEMINI_API_KEY (or Anthropic) for production, or run the API locally with LLM_PROVIDER=ollama. To use Ollama from the cloud you need a reachable host (VPN/tunnel/VPS) in OLLAMA_HOST, not 127.0.0.1.'
    );
  }
}

/**
 * Find the first top-level JSON array substring (respects quoted strings) for sloppy model output.
 * @param {string} text
 * @returns {string | null}
 */
function extractTopLevelJsonArray(text) {
  const s = String(text).trim();
  const start = s.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * @param {unknown} parsed
 * @returns {unknown[] | null}
 */
function coerceTrendingArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const o = /** @type {Record<string, unknown>} */ (parsed);
    for (const key of [
      'trends',
      'topics',
      'data',
      'items',
      'results',
      'tags',
      'trending',
      'trending_topics',
      'trendingTags',
    ]) {
      if (Array.isArray(o[key])) return o[key];
    }
  }
  return null;
}

/**
 * Remove trailing commas before `}` or `]` (common invalid JSON from LLMs).
 * @param {string} s
 */
function repairTrailingCommasInJson(s) {
  let out = String(s);
  for (let i = 0; i < 6; i++) {
    const next = out.replace(/,(\s*[}\]])/g, '$1');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Normalize sloppy model JSON: line separators, trailing commas, integer heatScore.
 * @param {string} s
 */
function sanitizeOllamaTrendJsonText(s) {
  let t = String(s).trim();
  t = t.replace(/\u2028|\u2029/g, ' ');
  t = repairTrailingCommasInJson(t);
  t = t.replace(/"heatScore"\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi, (_, num) => {
    const n = Number(num);
    if (!Number.isFinite(n)) return '"heatScore":50';
    const v = Math.min(100, Math.max(1, Math.round(n)));
    return `"heatScore":${v}`;
  });
  return t;
}

/**
 * If the model truncated output, find a prefix ending in `]` that parses as a non-empty JSON array.
 * @param {string} s
 * @returns {unknown[] | null}
 */
function tryParseByTruncatingArraySuffix(s) {
  const raw = String(s).trim();
  const start = raw.indexOf('[');
  if (start === -1) return null;
  const sub = raw.slice(start);
  let i = sub.length;
  while (i > 40) {
    const slice = sub.slice(0, i).trimEnd();
    if (slice.endsWith(']')) {
      try {
        const parsed = JSON.parse(slice);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        const arr = coerceTrendingArray(parsed);
        if (arr && arr.length > 0) return arr;
      } catch (_) {
        /* continue */
      }
    }
    if (i > 6000) i -= 6;
    else if (i > 2000) i -= 2;
    else i -= 1;
  }
  return null;
}

/**
 * Append closing quotes / brackets for a truncated prefix (string-aware `{` `[` stack).
 * Returns null if braces/brackets are already inconsistent (e.g. unescaped `"` in a value).
 * @param {string} prefix
 * @returns {string | null}
 */
function appendJsonClosersForTruncatedPrefix(prefix) {
  let inString = false;
  let escape = false;
  /** @type {('obj' | 'arr')[]} */
  const stack = [];

  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') {
      stack.push('obj');
      continue;
    }
    if (c === '[') {
      stack.push('arr');
      continue;
    }
    if (c === '}') {
      if (stack.length === 0 || stack[stack.length - 1] !== 'obj') return null;
      stack.pop();
      continue;
    }
    if (c === ']') {
      if (stack.length === 0 || stack[stack.length - 1] !== 'arr') return null;
      stack.pop();
      continue;
    }
  }

  let p = prefix;
  if (inString) {
    while (p.endsWith('\\')) {
      p = p.slice(0, -1);
      if (!p.length) return null;
    }
    p += '"';
  }

  const closers = [];
  for (let k = stack.length - 1; k >= 0; k -= 1) {
    closers.push(stack[k] === 'obj' ? '}' : ']');
  }
  return p + closers.join('');
}

/**
 * When Ollama hits `num_predict` mid-JSON, recover one or more complete topic objects by
 * truncating from the end and appending structural closers (works when output does not end in `]`).
 * @param {string} s
 * @returns {unknown[] | null}
 */
function trySalvageTruncatedJsonArray(s) {
  const raw = String(s).trim();
  const start = raw.indexOf('[');
  if (start === -1) return null;
  const sub = raw.slice(start).replace(/\uFEFF/g, '');
  const minLen = 32;
  let i = sub.length;
  while (i >= minLen) {
    let chunk = sub.slice(0, i).trimEnd();
    chunk = chunk.replace(/,\s*$/u, '');
    if (/:\s*$/u.test(chunk)) chunk += 'null';
    const cp = chunk.charCodeAt(chunk.length - 1);
    if (cp >= 0xd800 && cp <= 0xdbff) chunk = chunk.slice(0, -1);

    const closed = appendJsonClosersForTruncatedPrefix(chunk);
    if (closed) {
      try {
        const parsed = JSON.parse(closed);
        const arr = coerceTrendingArray(parsed);
        if (arr && arr.length > 0) return arr;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {
        /* try shorter prefix */
      }
    }
    const nearTip = i > sub.length - 900;
    i -= nearTip ? 1 : 5;
  }
  return null;
}

/**
 * @param {unknown} o
 * @returns {boolean}
 */
function looksLikeTopicRow(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const r = /** @type {Record<string, unknown>} */ (o);
  return (
    typeof r.hashtag === 'string' ||
    typeof r.hindiName === 'string' ||
    typeof r.category === 'string'
  );
}

/**
 * @param {string} rawText
 * @returns {unknown[]}
 */
function parseOllamaTrendingJson(rawText) {
  const trimmed = String(rawText).trim();
  const body = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const seen = new Set();
  /** @type {string[]} */
  const attempts = [];
  function add(s) {
    if (!s || seen.has(s)) return;
    seen.add(s);
    attempts.push(s);
  }
  add(body);
  const exBody = extractTopLevelJsonArray(body);
  if (exBody) add(exBody);
  const exTrim = extractTopLevelJsonArray(trimmed);
  if (exTrim) add(exTrim);

  add(sanitizeOllamaTrendJsonText(body));
  if (exBody) add(sanitizeOllamaTrendJsonText(exBody));
  if (exTrim) add(sanitizeOllamaTrendJsonText(exTrim));

  let lastErr = null;
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      const arr = coerceTrendingArray(parsed);
      if (arr) return arr;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && looksLikeTopicRow(parsed)) {
        return [parsed];
      }
      lastErr = new Error('Ollama JSON root was not an array (and no known wrapper key).');
    } catch (e) {
      lastErr = e;
    }
  }

  const salvaged =
    tryParseByTruncatingArraySuffix(sanitizeOllamaTrendJsonText(body)) ||
    tryParseByTruncatingArraySuffix(body) ||
    tryParseByTruncatingArraySuffix(trimmed) ||
    trySalvageTruncatedJsonArray(sanitizeOllamaTrendJsonText(body)) ||
    trySalvageTruncatedJsonArray(body) ||
    trySalvageTruncatedJsonArray(trimmed);
  if (salvaged) {
    console.warn('[api/trending] parseOllamaTrendingJson: used JSON salvage (truncated suffix and/or structural close)');
    return salvaged;
  }

  const preview = trimmed.slice(0, 400).replace(/\s+/g, ' ');
  const msg = lastErr && lastErr.message ? lastErr.message : 'parse failed';
  throw new Error(
    `Ollama returned non-JSON or wrong shape (${msg}). Preview: ${preview}${trimmed.length > 400 ? '…' : ''}`
  );
}

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.url
 * @param {string} opts.userText
 * @param {number} opts.numCtx
 * @param {number} opts.numPredict
 * @param {boolean} opts.useFormatJson
 * @param {AbortSignal} opts.signal
 * @param {string} opts.passLabel
 * @param {string} [opts.systemContent] — full system message (skips buildSystemPrompt + speed suffix when set)
 */
async function postOllamaChat(opts) {
  const {
    model,
    url,
    userText,
    numCtx,
    numPredict,
    useFormatJson,
    signal,
    passLabel,
    systemContent,
  } = opts;
  const systemMsg =
    systemContent != null && String(systemContent).trim() !== ''
      ? String(systemContent)
      : buildSystemPrompt() + buildOllamaSpeedSuffix();
  const chatBody = {
    model,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userText },
    ],
    stream: false,
    options: {
      temperature: 0.12,
      num_ctx: numCtx,
      num_predict: numPredict,
    },
  };
  if (useFormatJson) {
    chatBody.format = 'json';
  }

  logOllamaDebugRequest(url, chatBody, passLabel);

  console.info('[api/trending] Ollama: starting POST /api/chat', {
    pass: passLabel,
    url,
    model,
    timeoutMs: getOllamaFetchTimeoutMs(),
    userPayloadChars: userText.length,
    num_ctx: numCtx,
    num_predict: numPredict,
    format_json: useFormatJson,
  });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(chatBody),
    });
  } catch (e) {
    if (isAbortLikeError(e)) {
      throw new Error(
        `Ollama request timed out after ${getOllamaFetchTimeoutMs()}ms (model=${model}). Raise OLLAMA_FETCH_TIMEOUT_MS (10000–${MAX_OLLAMA_FETCH_TIMEOUT_MS}, e.g. 600000), or shrink the prompt: OLLAMA_MAX_RSS_TERMS, OLLAMA_MAX_ARTICLES, and/or OLLAMA_NUM_PREDICT. If the model stalls with no tokens, try OLLAMA_NUM_CTX=8192 (default in code) or lower.`
      );
    }
    throw new Error(
      `Ollama network error (${url}, model=${model}): ${formatNodeFetchError(e)}. Run \`ollama serve\` on this machine, set OLLAMA_HOST if remote (e.g. http://host.docker.internal:11434). Cloud hosts (Vercel) cannot use http://127.0.0.1:11434 on your laptop — use Gemini there or run this API locally with LLM_PROVIDER=ollama.`
    );
  }

  if (!res.ok) {
    const t = await res.text();
    logOllamaDebugErrorBody(passLabel, res.status, t);
    throw new Error(`Ollama API failed: ${res.status} ${t.slice(0, 400)}`);
  }

  const data = await res.json();
  logOllamaDebugResponseJson(passLabel, data);
  const rawText =
    data &&
    data.message &&
    data.message.content !== undefined &&
    data.message.content !== null
      ? data.message.content
      : '';

  const trimmed = String(rawText).trim();
  if (!trimmed) {
    throw new Error(
      'Ollama returned empty content. Is `ollama serve` running? Check OLLAMA_MODEL matches `ollama list`.'
    );
  }

  console.info('[api/trending] Ollama: response received', {
    pass: passLabel,
    contentChars: trimmed.length,
    evalCount: data.eval_count,
    promptEvalCount: data.prompt_eval_count,
    totalDurationNs: data.total_duration,
  });

  const arr = parseOllamaTrendingJson(trimmed);
  return { arr, data };
}

/**
 * Local Ollama (OpenAI-compatible chat). Same JSON contract as Gemini.
 * https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
 */
async function callOllama(userText, signal) {
  assertOllamaHostReachableFromRuntime();
  const base = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.1';
  const url = `${base}/api/chat`;
  const numCtx = getOllamaNumCtx();
  const envPred = Number(process.env.OLLAMA_NUM_PREDICT);
  const basePredict = Math.min(
    8192,
    Math.max(512, Number.isFinite(envPred) && envPred >= 512 ? envPred : 4200)
  );
  const k = topicTargetCount();
  /** `format: json` often makes Llama stop at tiny valid JSON (~150 tokens). Opt in with OLLAMA_FORMAT_JSON=1. */
  const wantFormatJson = (process.env.OLLAMA_FORMAT_JSON || '0').trim() === '1';

  const run = (passLabel, useFormatJson, numPredict) =>
    postOllamaChat({
      model,
      url,
      userText,
      numCtx,
      numPredict,
      useFormatJson,
      signal,
      passLabel,
    });

  let arr;
  try {
    ({ arr } = await run('1', wantFormatJson, basePredict));
  } catch (e) {
    if (wantFormatJson) {
      console.warn('[api/trending] Ollama pass 1 failed with format=json; retry without format:', e.message || e);
      ({ arr } = await run('1b-no-format', false, basePredict));
    } else {
      throw e;
    }
  }

  if (arr.length < k) {
    throw new Error(
      `Ollama returned ${arr.length} topics after retries (need ${k}). Raise OLLAMA_NUM_PREDICT, set OLLAMA_NUM_CTX=8192 or higher, lower TRENDING_TOPIC_COUNT, or use a stronger model.`
    );
  }

  const filtered = filterLlmQualityTopicRows(arr);
  if (filtered.length < k) {
    throw new Error(
      `Ollama returned only ${filtered.length}/${arr.length} topics passing quality filters (need ${k}). Model may be emitting placeholder titles, missing hindiName/hashtag, or heatScore < 20. Improve prompts/model or lower TRENDING_TOPIC_COUNT.`
    );
  }

  return filtered;
}

function getPerArticleNumPredict() {
  const n = parseInt(process.env.OLLAMA_PER_ARTICLE_NUM_PREDICT, 10);
  if (Number.isFinite(n) && n >= 256 && n <= 8192) return n;
  return 1600;
}

/** Shorten long URLs in LLM payloads so the model is less likely to truncate mid-string in JSON. */
function truncateStringForLlm(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function buildSingleArticleSystemPrompt() {
  const cats = TREND_CATEGORIES.join(', ');
  return `You are a Hindi trending-topic writer for ShareChat (India). Output ONLY a JSON array containing exactly ONE object (the root value must be an array). Do not use markdown code fences.

Required keys on that object: rank, hashtag, hindiName, description, aiSummary, category, heatScore, heatLabel, sources, imageUrl, relatedTags.

The topic MUST be grounded in the single news article the user provides (RSS titles are optional context only). rank must be 1.

"category" must be exactly one of: ${cats} — pick the best semantic fit for this article alone (e.g. exams/NEET → शिक्षा; RBI/markets → वित्त; cricket match → खेल).

"heatLabel" must be exactly one of: बहुत गर्म, तेज़ी से बढ़ रहा, वायरल, उभरता हुआ.

"heatScore" must be a JSON integer from 1 to 100 (no decimals, no fractions).

Copy imageUrl from the article JSON when present (copy the exact string) else "". Every string value must use straight double quotes; escape internal " as \\". Keep relatedTags as a JSON array of 3–4 short hashtag strings.`;
}

/**
 * @param {{ title?: string, source?: string, imageUrl?: string }} article
 * @param {string[]} rssTitles
 * @param {number} index 1-based
 * @param {number} total
 */
function buildSingleArticleUserPayload(article, rssTitles, index, total) {
  const slim = {
    title: article.title || '',
    source: article.source || '',
    imageUrl: truncateStringForLlm(article.imageUrl || '', 220),
  };
  return [
    `News article ${index}/${total} — produce exactly ONE trending card from THIS item:`,
    JSON.stringify(slim, null, 0),
    '',
    'RSS headline context (same day; optional):',
    JSON.stringify(rssTitles, null, 0),
  ].join('\n');
}

function setSseCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-LLM-Provider');
}

function beginOllamaArticleSse(res) {
  setSseCors(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-LLM-Provider', 'ollama');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function sseWrite(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * One Ollama /api/chat per news article; emits SSE `topics` after each completes.
 * @param {import('http').ServerResponse} res
 * @param {unknown} signals
 * @param {unknown[]} articles
 * @param {{ maxTerms?: number, maxArticles?: number }} payloadOpts
 */
async function streamOllamaPerArticle(res, signals, articles, payloadOpts) {
  assertOllamaHostReachableFromRuntime();
  beginOllamaArticleSse(res);
  const signal = createOllamaAbortSignal();
  const maxTerms = payloadOpts.maxTerms || 8;
  const maxArt = payloadOpts.maxArticles || 5;
  const terms = (signals.terms || []).slice(0, maxTerms);
  const slice = dedupeNewsArticles(articles).slice(0, maxArt);

  if (slice.length === 0) {
    sseWrite(res, {
      type: 'error',
      detail:
        'No news articles for per-article mode (NewsAPI returned none). Per-article streaming needs NEWSAPI_KEY and headlines.',
    });
    res.end();
    return;
  }

  const base = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.1';
  const url = `${base}/api/chat`;
  const numCtx = getOllamaNumCtx();
  const numPredArticle = getPerArticleNumPredict();
  const systemContent =
    buildSingleArticleSystemPrompt() +
    '\n\nSpeed: Return ONLY valid JSON — one array, one object, first character [, last ]. No markdown, no text before or after.';

  const rawAccum = [];

  try {
    sseWrite(res, {
      type: 'meta',
      mode: 'per_article',
      articles: slice.length,
      rssTerms: terms.length,
      topicTarget: topicTargetCount(),
    });

    for (let i = 0; i < slice.length; i++) {
      const article = /** @type {{ title?: string, source?: string, imageUrl?: string }} */ (slice[i]);
      const userText = buildSingleArticleUserPayload(article, terms, i + 1, slice.length);
      const passLabel = `stream-article-${i + 1}`;
      const { arr } = await postOllamaChat({
        model,
        url,
        userText,
        numCtx,
        numPredict: numPredArticle,
        useFormatJson: false,
        signal,
        passLabel,
        systemContent,
      });
      const row = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
      if (!row || typeof row !== 'object') {
        throw new Error(`Ollama returned no topic object for article ${i + 1}`);
      }
      rawAccum.push(row);
      const topicsSoFar = sliceTopicsToLimit(normalizeTopics(rawAccum));
      sseWrite(res, {
        type: 'topics',
        index: i,
        articleTitle: article.title || '',
        topics: topicsSoFar,
      });
    }

    const topicsFinal = sliceTopicsToLimit(normalizeTopics(rawAccum));
    sseWrite(res, { type: 'done', topics: topicsFinal });
    res.end();
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error('[api/trending] SSE per-article failed:', msg);
    try {
      sseWrite(res, { type: 'error', detail: msg });
    } catch (_) {
      /* ignore broken pipe */
    }
    try {
      res.end();
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * @returns {{ raw: unknown[], provider: string }}
 */
async function invokeLlm(useOllama, anthropicKey, geminiKey, userText) {
  if (useOllama) {
    const raw = await callOllama(userText, createOllamaAbortSignal());
    return { raw, provider: 'ollama' };
  }

  let lastErr;
  if (anthropicKey) {
    try {
      const raw = await callAnthropic(anthropicKey, userText, createLlmAbortSignal());
      return { raw, provider: 'anthropic' };
    } catch (e) {
      lastErr = e;
      console.warn('[api/trending] Anthropic failed:', e.message || e);
    }
  }
  if (geminiKey) {
    const raw = await callGemini(geminiKey, userText, createLlmAbortSignal());
    return { raw, provider: 'gemini' };
  }
  if (lastErr) throw lastErr;
  throw new Error('No cloud LLM key (set ANTHROPIC_API_KEY and/or GEMINI_API_KEY)');
}

function normalizeTopics(raw, topicCountOverride) {
  const k = topicCountOverride != null ? topicCountOverride : topicTargetCount();
  const fullDeck = isFullCategoryDeckForK(k);
  const allowedHeatLabels = new Set([
    'बहुत गर्म',
    'तेज़ी से बढ़ रहा',
    'वायरल',
    'उभरता हुआ',
  ]);

  const mapped = raw
    .map((item, idx) => {
      const rank =
        typeof item.rank === 'number' && !Number.isNaN(item.rank)
          ? item.rank
          : idx + 1;
      const rawCat = String(item.category ?? '')
        .trim()
        .normalize('NFC');
      const heatLabel = allowedHeatLabels.has(String(item.heatLabel || '').trim())
        ? String(item.heatLabel).trim()
        : 'वायरल';
      let heatScore = Number(item.heatScore);
      if (!Number.isFinite(heatScore)) heatScore = 50;
      heatScore = Math.min(100, Math.max(1, Math.round(heatScore)));

      return {
        rank,
        rawCategory: rawCat,
        hashtag: String(item.hashtag || '').trim() || `#ट्रेंड${idx + 1}`,
        /** Never substitute "अज्ञात विषय" — empty names are filtered out below. */
        hindiName: String(item.hindiName || '')
          .trim()
          .normalize('NFC'),
        description: String(item.description || '').trim(),
        aiSummary: String(item.aiSummary || '').trim(),
        heatScore,
        heatLabel,
        sources: Array.isArray(item.sources)
          ? item.sources.map((s) => String(s)).filter(Boolean).slice(0, 5)
          : [],
        imageUrl: String(item.imageUrl || '').trim(),
        relatedTags: Array.isArray(item.relatedTags)
          ? item.relatedTags.map((t) => String(t)).filter(Boolean).slice(0, 6)
          : [],
      };
    })
    .filter(passesNormalizedTrendQuality)
    .sort((a, b) => a.rank - b.rank);

  if (!fullDeck) {
    const seenCat = new Set();
    const out = [];
    for (const row of mapped) {
      if (out.length >= k) break;
      let cat = resolveToCanonicalCategory(row.rawCategory);
      const inferred = inferTrendCategoryFromText(row);
      if (inferred) {
        if (!cat) {
          cat = inferred;
        } else if (inferred !== cat && (cat === 'खेल' || cat === 'समाचार')) {
          cat = inferred;
        }
      }
      if (!cat) cat = inferred || 'समाचार';

      while (seenCat.has(cat)) {
        const alt = TREND_CATEGORIES.find((c) => !seenCat.has(c));
        if (!alt) break;
        cat = alt;
      }
      if (seenCat.has(cat)) continue;

      seenCat.add(cat);
      const resolvedModel = resolveToCanonicalCategory(row.rawCategory);
      if (inferred && cat === inferred && resolvedModel !== inferred) {
        console.info(
          `[api/trending] normalizeTopics (partial): category set to "${cat}" for rank=${row.rank} (model had "${row.rawCategory || '(empty)'}")`
        );
      }
      const { rawCategory: _drop, ...rest } = row;
      out.push({ ...rest, category: cat });
    }
    return dedupeTrendTopicsPreservingOrder(
      out.sort((a, b) => a.rank - b.rank).map((item, i) => ({ ...item, rank: i + 1 }))
    );
  }

  const targetOrder = TREND_CATEGORIES;
  const used = new Set();
  const deduped = [];
  for (const slot of targetOrder) {
    if (deduped.length >= k) break;
    let pick = -1;
    for (let i = 0; i < mapped.length; i++) {
      if (used.has(i)) continue;
      const resolved = resolveToCanonicalCategory(mapped[i].rawCategory);
      if (resolved === slot) {
        pick = i;
        break;
      }
    }
    if (pick === -1) {
      for (let i = 0; i < mapped.length; i++) {
        if (used.has(i)) continue;
        pick = i;
        break;
      }
    }
    if (pick === -1) break;
    used.add(pick);
    const row = mapped[pick];
    const resolved = resolveToCanonicalCategory(row.rawCategory);
    if (resolved !== slot) {
      console.warn(
        `[api/trending] normalizeTopics: slot "${slot}" filled from LLM row rank=${row.rank}; model category was "${row.rawCategory || '(empty)'}" (resolved=${resolved || 'none'}) — label adjusted to match required categories for this run.`
      );
    }
    const { rawCategory: _drop, ...rest } = row;
    deduped.push({ ...rest, category: slot });
  }

  deduped.sort((a, b) => targetOrder.indexOf(a.category) - targetOrder.indexOf(b.category));

  return dedupeTrendTopicsPreservingOrder(deduped.map((item, i) => ({ ...item, rank: i + 1 })));
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const reqUrl = req.url || '/';
  const parsedUrl = new URL(reqUrl, 'http://127.0.0.1');
  const forceRefresh = parsedUrl.searchParams.get('refresh') === 'true';

  const newsKey = process.env.NEWSAPI_KEY;
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase().trim();
  const useOllama = provider === 'ollama';

  const geminiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!useOllama && !geminiKey && !anthropicKey) {
    if (forceRefresh) {
      res.statusCode = 503;
      res.setHeader('X-LLM-Provider', 'none');
      res.end(
        JSON.stringify({
          error: 'No LLM configured',
          detail:
            'Set ANTHROPIC_API_KEY and/or GEMINI_API_KEY (or LLM_PROVIDER=ollama). refresh=true requires a live LLM.',
        })
      );
      return;
    }
    res.statusCode = 200;
    res.setHeader('X-LLM-Provider', 'fallback');
    res.end(JSON.stringify(sliceTopicsToLimit(FALLBACK_DATA)));
    return;
  }

  try {
    const signals = await fetchTrendSearchSignals();

    let articles = [];
    if (newsKey) {
      try {
        articles = await fetchNewsHeadlines(newsKey, signals);
      } catch (e) {
        console.warn('[api/trending] NewsAPI skipped:', e.message || e);
      }
    } else {
      console.warn('[api/trending] No NEWSAPI_KEY; using RSS-only (empty NewsAPI list).');
    }

    const payloadOpts = useOllama
      ? {
          maxTerms: Number(process.env.OLLAMA_MAX_RSS_TERMS) || 8,
          maxArticles: Number(process.env.OLLAMA_MAX_ARTICLES) || 5,
          slimArticles: true,
        }
      : {};

    const wantStream = parsedUrl.searchParams.get('stream') === '1';
    if (wantStream) {
      if (!useOllama) {
        setCors(res);
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: 'Bad request',
            detail: 'stream=1 (Server-Sent Events) only works with LLM_PROVIDER=ollama.',
          })
        );
        return;
      }
      await streamOllamaPerArticle(res, signals, articles, payloadOpts);
      return;
    }

    const userText = buildTrendingUserPayload(signals, articles, payloadOpts);

    console.info('[api/trending] LLM: invoking', {
      provider: useOllama ? 'ollama' : 'cloud',
      userPayloadChars: userText.length,
      vercelCloudRuntime: isVercelCloudRuntime(),
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
    });

    let topics;
    let providerHeader;
    try {
      const { raw: topicsRaw, provider: usedProvider } = await invokeLlm(
        useOllama,
        anthropicKey,
        geminiKey,
        userText
      );
      topics = normalizeTopics(topicsRaw);
      providerHeader = usedProvider;
    } catch (llmErr) {
      if (forceRefresh) {
        throw llmErr;
      }
      const extra =
        llmErr && llmErr.cause
          ? ` | cause: ${llmErr.cause.message || String(llmErr.cause)}`
          : '';
      console.warn('[api/trending] LLM failed, using FALLBACK_DATA:', (llmErr.message || llmErr) + extra);
      topics = FALLBACK_DATA;
      providerHeader = 'fallback';
    }

    topics = sliceTopicsToLimit(topics);

    res.statusCode = 200;
    res.setHeader('X-LLM-Provider', providerHeader);
    res.end(JSON.stringify(topics));
  } catch (err) {
    console.error('[api/trending]', err);
    const detail = err && err.message ? err.message : String(err);
    res.statusCode = 502;
    res.end(
      JSON.stringify({
        error: 'Trending pipeline failed',
        detail,
        hint:
          detail.includes('NewsAPI')
            ? 'NewsAPI often blocks serverless/datacenter IPs on the free plan; use a paid key or run API from an allowed network.'
            : detail.includes('Gemini network error')
              ? 'Gemini could not complete the HTTP request. Verify GEMINI_API_KEY and GEMINI_MODEL, and that this host allows outbound HTTPS to generativelanguage.googleapis.com.'
              : detail.includes('Anthropic')
                ? 'Check ANTHROPIC_API_KEY and ANTHROPIC_MODEL; see https://docs.anthropic.com/en/api/errors'
                : detail.includes('Gemini')
                  ? 'Check GEMINI_API_KEY (Google AI Studio) and GEMINI_MODEL in env; free tier limits apply — see https://ai.google.dev/pricing'
                  : detail.includes('Ollama network error') || detail.includes('Ollama API failed')
                    ? 'Ollama: run `ollama serve` on the same machine as this API (or set OLLAMA_HOST to a reachable URL). Vercel/cloud cannot call Ollama on your laptop via 127.0.0.1 — use Gemini in prod or run `scripts/local-api.mjs` / dev-stack locally with LLM_PROVIDER=ollama.'
                    : detail.includes('Ollama request timed out')
                      ? `Ollama exceeded OLLAMA_FETCH_TIMEOUT_MS (default ${DEFAULT_OLLAMA_FETCH_TIMEOUT_MS / 1000}s, max ${MAX_OLLAMA_FETCH_TIMEOUT_MS / 1000}s). Raise the env var, or lower OLLAMA_NUM_PREDICT / OLLAMA_MAX_RSS_TERMS / OLLAMA_MAX_ARTICLES / OLLAMA_NUM_CTX so the model finishes sooner.`
                      : detail.includes('fetch failed')
                        ? 'Low-level fetch failed — expand the error message for "cause:" (e.g. ECONNREFUSED = wrong host/port). Local Llama only works when the Node process can reach that OLLAMA_HOST.'
                        : detail.includes('aborted') || detail.includes('AbortError') || detail.includes('TimeoutError')
                          ? `LLM (cloud) request exceeded ${getLlmFetchTimeoutMs()}ms. For Ollama use OLLAMA_FETCH_TIMEOUT_MS. Omit ?refresh=true for FALLBACK_DATA when the model is slow.`
                          : undefined,
      })
    );
  }
}
