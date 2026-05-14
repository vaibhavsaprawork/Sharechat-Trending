/**
 * Vercel Node.js serverless: GET /api/trending
 * Pipeline: RSS (India headlines) → optional NewsAPI (top-headlines or GET_NEWS_API_URL e.g. /v2/everything) → LLM → JSON
 * Query: ?refresh=true — no FALLBACK_DATA on LLM failure (returns error instead).
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

function topicTargetCount() {
  const n = parseInt(process.env.TRENDING_TOPIC_COUNT, 10);
  if (Number.isFinite(n) && n >= 1 && n <= TREND_CATEGORIES.length) {
    return n;
  }
  return TREND_CATEGORIES.length;
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
      imageUrl: a.imageUrl || '',
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
    `उपरोक्त को मर्ज करके ठीक ${k} ट्रेंडिंग विषय JSON ऐरे में लौटाओ — प्रत्येक आइटम की "category" अलग हो (${TREND_CATEGORIES.slice(0, k).join(', ')})।`,
  ].join('\n');
}

function buildSystemPrompt() {
  const k = topicTargetCount();
  const categoriesForRun = TREND_CATEGORIES.slice(0, k);
  const catList = categoriesForRun.join(', ');
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
- Prioritize: cricket, Bollywood, Indian politics, Indian festivals, Indian weather, Indian finance news, board exams / education news, public health and wellness stories relevant to India.
- Ranks must be 1..${k} unique, sorted by importance.`;
}

function buildOllamaSpeedSuffix() {
  const k = topicTargetCount();
  return `

Speed note (local inference): JSON only, no markdown. Keep each "description" to 1 short Hindi sentence and "aiSummary" to 2 short Hindi sentences (not 3–4). Still return exactly ${k} items with all required keys, one distinct category per item.`;
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
  return articles.map((a) => ({
    title: a.title || '',
    description: a.description || '',
    url: a.url || '',
    imageUrl: a.urlToImage || '',
    source: (a.source && a.source.name) || '',
  }));
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

  return parsed;
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

  return parsed;
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
 * Local Ollama (OpenAI-compatible chat). Same JSON contract as Gemini.
 * https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
 */
async function callOllama(userText, signal) {
  assertOllamaHostReachableFromRuntime();
  const base = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.1';
  const url = `${base}/api/chat`;
  const numPredict = Math.min(
    8192,
    Math.max(512, Number(process.env.OLLAMA_NUM_PREDICT) || 1400)
  );

  console.info('[api/trending] Ollama: starting POST /api/chat', {
    url,
    model,
    timeoutMs: getOllamaFetchTimeoutMs(),
    userPayloadChars: userText.length,
    num_predict: numPredict,
  });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() + buildOllamaSpeedSuffix() },
          { role: 'user', content: userText },
        ],
        stream: false,
        options: {
          temperature: 0.25,
          num_predict: numPredict,
        },
      }),
    });
  } catch (e) {
    if (isAbortLikeError(e)) {
      throw new Error(
        `Ollama request timed out after ${getOllamaFetchTimeoutMs()}ms (model=${model}). Raise OLLAMA_FETCH_TIMEOUT_MS (10000–${MAX_OLLAMA_FETCH_TIMEOUT_MS}, e.g. 600000), or shrink the prompt: OLLAMA_MAX_RSS_TERMS, OLLAMA_MAX_ARTICLES, and/or OLLAMA_NUM_PREDICT.`
      );
    }
    throw new Error(
      `Ollama network error (${url}, model=${model}): ${formatNodeFetchError(e)}. Run \`ollama serve\` on this machine, set OLLAMA_HOST if remote (e.g. http://host.docker.internal:11434). Cloud hosts (Vercel) cannot use http://127.0.0.1:11434 on your laptop — use Gemini there or run this API locally with LLM_PROVIDER=ollama.`
    );
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama API failed: ${res.status} ${t.slice(0, 400)}`);
  }

  const data = await res.json();
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

  let body = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jsonMatch = body.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : body;

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Ollama returned non-JSON output; try a JSON-capable model or repeat the request.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Ollama JSON was not an array');
  }

  return parsed;
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

function normalizeTopics(raw) {
  const k = topicTargetCount();
  const targetOrder = TREND_CATEGORIES.slice(0, k);
  const targetCatSet = new Set(targetOrder);
  const allowedCategories = new Set(TREND_CATEGORIES);
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
      const category = allowedCategories.has(String(item.category || '').trim())
        ? String(item.category).trim()
        : 'समाचार';
      const heatLabel = allowedHeatLabels.has(String(item.heatLabel || '').trim())
        ? String(item.heatLabel).trim()
        : 'वायरल';
      let heatScore = Number(item.heatScore);
      if (!Number.isFinite(heatScore)) heatScore = 50;
      heatScore = Math.min(100, Math.max(1, Math.round(heatScore)));

      return {
        rank,
        hashtag: String(item.hashtag || '').trim() || `#ट्रेंड${idx + 1}`,
        hindiName: String(item.hindiName || '').trim() || 'अज्ञात विषय',
        description: String(item.description || '').trim(),
        aiSummary: String(item.aiSummary || '').trim(),
        category,
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
    .sort((a, b) => a.rank - b.rank);

  const seen = new Set();
  const deduped = [];
  for (const item of mapped) {
    if (!targetCatSet.has(item.category)) continue;
    if (seen.has(item.category)) continue;
    seen.add(item.category);
    deduped.push(item);
    if (deduped.length >= k) break;
  }

  deduped.sort((a, b) => targetOrder.indexOf(a.category) - targetOrder.indexOf(b.category));

  return deduped.map((item, i) => ({ ...item, rank: i + 1 }));
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
    res.end(JSON.stringify(FALLBACK_DATA));
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
          maxTerms: Number(process.env.OLLAMA_MAX_RSS_TERMS) || 12,
          maxArticles: Number(process.env.OLLAMA_MAX_ARTICLES) || 8,
          slimArticles: true,
        }
      : {};

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
                      ? `Ollama exceeded OLLAMA_FETCH_TIMEOUT_MS (default ${DEFAULT_OLLAMA_FETCH_TIMEOUT_MS / 1000}s, max ${MAX_OLLAMA_FETCH_TIMEOUT_MS / 1000}s). Raise the env var, or lower OLLAMA_NUM_PREDICT / OLLAMA_MAX_RSS_TERMS / OLLAMA_MAX_ARTICLES so the model finishes sooner.`
                      : detail.includes('fetch failed')
                        ? 'Low-level fetch failed — expand the error message for "cause:" (e.g. ECONNREFUSED = wrong host/port). Local Llama only works when the Node process can reach that OLLAMA_HOST.'
                        : detail.includes('aborted') || detail.includes('AbortError') || detail.includes('TimeoutError')
                          ? `LLM (cloud) request exceeded ${getLlmFetchTimeoutMs()}ms. For Ollama use OLLAMA_FETCH_TIMEOUT_MS. Omit ?refresh=true for FALLBACK_DATA when the model is slow.`
                          : undefined,
      })
    );
  }
}
