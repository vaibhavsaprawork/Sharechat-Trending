import { makePostId } from '../context/AppChromeContext.jsx';

/**
 * Placeholder feed rows for topic detail (locale-aware copy).
 */
export function getDemoFeed(topic, locale) {
  const name = topic.hindiName;
  const tag = topic.hashtag;
  const en = locale === 'en';

  if (en) {
    return {
      posts: [
        {
          id: makePostId(tag, 'posts', 0),
          user: 'Priya Sharma',
          time: '18m ago',
          text: `Memes and takes on ${name} have been non-stop since this morning. People say the trend is spreading fast in smaller towns too. Are you adding your voice?`,
          likes: '230K',
          comments: '4,289',
        },
        {
          id: makePostId(tag, 'posts', 1),
          user: 'Amit Yadav · Indore',
          time: '1h ago',
          text: `${tag} posts mix jokes, videos, and ground updates. Someone wrote: “My whole timeline is this story today.”`,
          likes: '110K',
          comments: '1,902',
        },
        {
          id: makePostId(tag, 'posts', 2),
          user: 'Neha 🇮🇳',
          time: 'This morning',
          text: `Family groups are debating “${name}” too—people are asking for sources, and new clips keep landing on ShareChat.`,
          likes: '84,310',
          comments: '674',
        },
      ],
      video: [
        {
          id: makePostId(tag, 'video', 0),
          title: `${name} — short field-report style clip`,
          views: '320K views',
        },
        {
          id: makePostId(tag, 'video', 1),
          title: `Funny clip on ${tag}; comments are on fire`,
          views: '760K views',
        },
      ],
      reel: [
        {
          id: makePostId(tag, 'reel', 0),
          caption: `Reel #1: ${name} — the vibe in 15 seconds`,
          hearts: '1.24M',
        },
        {
          id: makePostId(tag, 'reel', 1),
          caption: `Reel #2: that “hook” transition on ${tag}`,
          hearts: '620K',
        },
      ],
    };
  }

  return {
    posts: [
      {
        id: makePostId(tag, 'posts', 0),
        user: 'प्रिया शर्मा',
        time: '१८ मिनट पहले',
        text: `${name} पर आज सुबह से ही मीम्स और राय की बौछार है। लोग लिख रहे हैं कि यह ट्रेंड छोटे शहरों में भी तेज़ी से फैल रहा है। क्या आप भी इस पर अपनी बात जोड़ रहे हैं?`,
        likes: '२.३ लाख',
        comments: '४,२८९',
      },
      {
        id: makePostId(tag, 'posts', 1),
        user: 'अमित यादव · इंदौर',
        time: '१ घंटा पहले',
        text: `${tag} वाली पोस्ट्स में मज़ाक, वीडियो और ग्राउंड अपडेट सब मिल रहे हैं। किसी ने लिखा— “आज तो टाइमलाइन पूरी इसी खबर से भरी है।”`,
        likes: '१.१ लाख',
        comments: '१,९०२',
      },
      {
        id: makePostId(tag, 'posts', 2),
        user: 'नेहा 🇮🇳',
        time: 'आज सुबह',
        text: `“${name}” को लेकर परिवार वाले ग्रुप में भी चर्चा शुरू हो गई है। लोग स्रोत पूछ रहे हैं और शेयरचैट पर नई क्लिप्स लगातार आ रही हैं।`,
        likes: '८४,३१०',
        comments: '६७४',
      },
    ],
    video: [
      {
        id: makePostId(tag, 'video', 0),
        title: `${name} — ग्राउंड रिपोर्ट जैसा शॉर्ट वीडियो`,
        views: '३.२ लाख व्यूज',
      },
      {
        id: makePostId(tag, 'video', 1),
        title: `${tag} पर फनी क्लिप; कमेंट पटा पड़ा है`,
        views: '७.६ लाख व्यूज',
      },
    ],
    reel: [
      {
        id: makePostId(tag, 'reel', 0),
        caption: `रील #१: ${name} — १५ सेकंड में पूरा मूड`,
        hearts: '१२.४ लाख',
      },
      {
        id: makePostId(tag, 'reel', 1),
        caption: `रील #२: ${tag} पर “हुक” वाला ट्रांज़िशन`,
        hearts: '६.२ लाख',
      },
    ],
  };
}
