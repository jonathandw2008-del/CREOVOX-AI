import type { TranscriptSegment, Highlight, SubtitleTrack, ThumbnailDesign, ContentOutput, AudienceVariation } from '@/types'

export const DEMO_TRANSCRIPT: TranscriptSegment[] = [
  { id: 't1', startTime: 0, endTime: 4.2, text: "Welcome back to another episode where we dive deep into the future of creative technology.", speaker: 'Host' },
  { id: 't2', startTime: 4.5, endTime: 8.8, text: "Today we're exploring how artificial intelligence is transforming video production.", speaker: 'Host' },
  { id: 't3', startTime: 9.1, endTime: 13.5, text: "From automated editing to intelligent content repurposing, the landscape is changing fast.", speaker: 'Host' },
  { id: 't4', startTime: 14.0, endTime: 18.3, text: "Let me show you five key trends that every content creator needs to understand right now.", speaker: 'Host' },
  { id: 't5', startTime: 18.8, endTime: 23.1, text: "The first trend is AI-powered video summarization. Imagine uploading a two-hour lecture.", speaker: 'Host' },
  { id: 't6', startTime: 23.5, endTime: 27.9, text: "And getting perfectly edited highlights in minutes, not hours of manual work.", speaker: 'Host' },
  { id: 't7', startTime: 28.2, endTime: 32.6, text: "The second trend is multilingual content. AI can now generate natural-sounding subtitles.", speaker: 'Host' },
  { id: 't8', startTime: 33.0, endTime: 37.4, text: "In over 50 languages, making your content accessible to a truly global audience.", speaker: 'Host' },
  { id: 't9', startTime: 37.8, endTime: 42.1, text: "Third, we're seeing AI thumbnail generation that understands visual storytelling.", speaker: 'Host' },
  { id: 't10', startTime: 42.5, endTime: 46.8, text: "These tools analyze your video frames and suggest the most engaging compositions.", speaker: 'Host' },
  { id: 't11', startTime: 47.2, endTime: 51.5, text: "Fourth is audience personalization. The same video can be repackaged for different demographics.", speaker: 'Host' },
  { id: 't12', startTime: 51.9, endTime: 56.2, text: "Students get a simplified version, professionals get the technical deep-dive, and casual viewers get the highlights.", speaker: 'Host' },
  { id: 't13', startTime: 56.6, endTime: 60.9, text: "And fifth, intelligent content writing. AI can generate platform-optimized titles and descriptions.", speaker: 'Host' },
  { id: 't14', startTime: 61.3, endTime: 65.6, text: "That boost discoverability while maintaining your authentic voice and brand identity.", speaker: 'Host' },
  { id: 't15', startTime: 66.0, endTime: 70.3, text: "These trends aren't just theoretical — they're available now, and creators who adopt early will have a massive advantage.", speaker: 'Host' },
]

export const DEMO_HIGHLIGHTS: Highlight[] = [
  { id: 'h1', startTime: 0, endTime: 13.5, title: 'Introduction — AI in Video Production', description: 'Opening segment setting up the discussion about AI transforming creative workflows.', confidence: 0.95, selected: true, category: 'key-moment' },
  { id: 'h2', startTime: 14.0, endTime: 27.9, title: 'Trend 1: AI Video Summarization', description: 'Key moment explaining automated video highlights and time savings.', confidence: 0.92, selected: true, category: 'topic-change' },
  { id: 'h3', startTime: 28.2, endTime: 37.4, title: 'Trend 2: Multilingual Content', description: 'Discussion of AI-generated subtitles for global reach.', confidence: 0.88, selected: false, category: 'topic-change' },
  { id: 'h4', startTime: 37.8, endTime: 46.8, title: 'Trend 3: AI Thumbnail Generation', description: 'Visual storytelling through AI-powered thumbnail design.', confidence: 0.90, selected: true, category: 'engagement-peak' },
  { id: 'h5', startTime: 47.2, endTime: 56.2, title: 'Trend 4: Audience Personalization', description: 'Adapting content for different viewer demographics.', confidence: 0.87, selected: false, category: 'topic-change' },
  { id: 'h6', startTime: 56.6, endTime: 70.3, title: 'Trend 5: Intelligent Content Writing', description: 'AI-generated platform-optimized titles and descriptions.', confidence: 0.93, selected: true, category: 'quote' },
]

export const DEMO_SUBTITLES: SubtitleTrack[] = [
  {
    id: 'sub-en',
    language: 'English',
    languageCode: 'en',
    segments: DEMO_TRANSCRIPT.map((t) => ({ id: `sub-en-${t.id}`, startTime: t.startTime, endTime: t.endTime, text: t.text })),
  },
  {
    id: 'sub-ta',
    language: 'Tamil',
    languageCode: 'ta',
    simulated: true,
    segments: [
      { id: 'sub-ta-1', startTime: 0, endTime: 4.2, text: 'படைப்பு தொழில்நுட்பத்தின் எதிர்காலத்தில் ஆழமாக நுழையும் மற்றொரு அத்தியாயத்திற்கு மீண்டும் வரவேற்கிறோம்.' },
      { id: 'sub-ta-2', startTime: 4.5, endTime: 8.8, text: 'இன்று நாம் செயற்கை நுண்ணறிவு வீடியோ தயாரிப்பை எவ்வாறு மாற்றுகிறது என்பதை ஆராய்கிறோம்.' },
      { id: 'sub-ta-3', startTime: 9.1, endTime: 13.5, text: 'தானியங்கு எடிட்டிங் முதல் நுண்ணறிவு உள்ளடக்க மறுபயன்பாடு வரை, நிலப்பரப்பு வேகமாக மாறி வருகிறது.' },
    ],
  },
  {
    id: 'sub-hi',
    language: 'Hindi',
    languageCode: 'hi',
    simulated: true,
    segments: [
      { id: 'sub-hi-1', startTime: 0, endTime: 4.2, text: 'एक और एपिसोड में आपका स्वागत है जहाँ हम रचनात्मक प्रौद्योगिकी के भविष्य में गहराई से उतरते हैं।' },
      { id: 'sub-hi-2', startTime: 4.5, endTime: 8.8, text: 'आज हम यह पता लगा रहे हैं कि कृत्रिम बुद्धिमत्ता वीडियो उत्पादन को कैसे बदल रही है।' },
      { id: 'sub-hi-3', startTime: 9.1, endTime: 13.5, text: 'स्वचालित संपादन से लेकर बुद्धिमान सामग्री पुनर्उपयोग तक, परिदृश्य तेजी से बदल रहा है।' },
    ],
  },
  {
    id: 'sub-es',
    language: 'Spanish',
    languageCode: 'es',
    simulated: true,
    segments: [
      { id: 'sub-es-1', startTime: 0, endTime: 4.2, text: 'Bienvenidos a otro episodio donde profundizamos en el futuro de la tecnología creativa.' },
      { id: 'sub-es-2', startTime: 4.5, endTime: 8.8, text: 'Hoy exploramos cómo la inteligencia artificial está transformando la producción de video.' },
      { id: 'sub-es-3', startTime: 9.1, endTime: 13.5, text: 'Desde la edición automatizada hasta la reutilización inteligente de contenido, el panorama está cambiando rápidamente.' },
    ],
  },
]

export const DEMO_THUMBNAILS: ThumbnailDesign[] = [
  { id: 'thumb1', title: 'Bold Impact', textOverlay: '5 AI TRENDS\nChanging Video Forever', fontSize: 48, fontFamily: 'Space Grotesk', textColor: '#FFFFFF', textPosition: { x: 50, y: 50 }, backgroundColor: '#1a1a2e', style: 'bold', overlay: 0.4 },
  { id: 'thumb2', title: 'Minimal Clean', textOverlay: 'The Future of\nVideo Production', fontSize: 36, fontFamily: 'Inter', textColor: '#F5F2EE', textPosition: { x: 50, y: 60 }, backgroundColor: '#0f0f1a', style: 'minimal', overlay: 0.4 },
  { id: 'thumb3', title: 'Cinematic Warm', textOverlay: 'AI × CREATIVITY', fontSize: 56, fontFamily: 'Space Grotesk', textColor: '#FF5B16', textPosition: { x: 50, y: 45 }, backgroundColor: '#11151B', style: 'cinematic', overlay: 0.4 },
  { id: 'thumb4', title: 'Editorial Focus', textOverlay: 'Five trends\nevery creator needs', fontSize: 32, fontFamily: 'Instrument Serif', textColor: '#FFA45E', textPosition: { x: 30, y: 55 }, backgroundColor: '#090B0F', style: 'editorial', overlay: 0.4 },
]

export const DEMO_CONTENT_OUTPUTS: ContentOutput[] = [
  { id: 'co1', type: 'title', platform: 'youtube', tone: 'entertaining', variant: 0, content: '5 AI Trends That Are Completely Changing Video Production in 2026' },
  { id: 'co2', type: 'description', platform: 'youtube', tone: 'professional', variant: 0, content: 'Discover the five most important AI trends transforming video production. From automated summarization to multilingual subtitles and intelligent audience personalization, learn how creators are leveraging artificial intelligence to work smarter and reach wider audiences.\n\n📌 Timestamps:\n0:00 — Introduction\n0:14 — Trend 1: AI Video Summarization\n0:28 — Trend 2: Multilingual Content\n0:38 — Trend 3: AI Thumbnails\n0:47 — Trend 4: Audience Personalization\n0:57 — Trend 5: Content Writing\n\n#AIVideo #ContentCreation #VideoProduction' },
  { id: 'co3', type: 'caption', platform: 'instagram', tone: 'casual', variant: 0, content: 'The future of video is here 🎬✨ AI is completely changing how we create, edit, and share content. From auto-generated subtitles to personalized viewer experiences — these 5 trends are game-changers.\n\nWhich trend excites you most? Drop a comment 👇' },
  { id: 'co4', type: 'caption', platform: 'tiktok', tone: 'entertaining', variant: 0, content: 'POV: You discover AI can turn your 2-hour video into perfect clips in minutes 🤯🎬 These 5 trends are changing EVERYTHING for creators #AICreator #VideoEditing #ContentCreation' },
  { id: 'co5', type: 'caption', platform: 'linkedin', tone: 'professional', variant: 0, content: 'The intersection of AI and video production is creating unprecedented opportunities for content creators and businesses.\n\nIn our latest analysis, we explore five key trends:\n→ AI-powered video summarization\n→ Multilingual content generation\n→ Intelligent thumbnail design\n→ Audience personalization\n→ Automated content writing\n\nCreators who adopt these technologies early will have a significant competitive advantage.' },
  { id: 'co6', type: 'hashtags', platform: 'instagram', tone: 'casual', variant: 0, content: '#AIVideo #ContentCreation #VideoProduction #AIEditing #CreatorEconomy #DigitalMedia #VideoMarketing #AITrends #ContentStrategy #SocialMediaTips' },
]

export const DEMO_AUDIENCE_VARIATIONS: AudienceVariation[] = [
  {
    id: 'av1',
    audienceType: 'student',
    language: 'English',
    tone: 'educational',
    title: 'AI in Video: 5 Key Concepts Every Student Should Know',
    description: 'A beginner-friendly overview of how artificial intelligence is being applied to video production. Learn the fundamentals of video summarization, multilingual subtitles, thumbnail generation, audience personalization, and content writing.',
    caption: 'Learning about AI in video production! 📚🎬 These 5 concepts are shaping the future of media — perfect for anyone starting out in content creation or media studies.',
    variant: 0,
    hashtags: ['#LearnAI', '#StudentLife', '#MediaStudies', '#VideoProduction', '#TechEducation'],
  },
  {
    id: 'av2',
    audienceType: 'professional',
    language: 'English',
    tone: 'professional',
    title: 'AI-Driven Video Production: 5 Trends Transforming Enterprise Content Strategy',
    description: 'An in-depth analysis of artificial intelligence applications in professional video production. This report covers automated summarization, multilingual content scaling, AI-driven visual asset generation, audience segmentation, and intelligent copywriting for maximum reach and engagement.',
    caption: 'Our latest industry analysis examines five AI-driven trends reshaping video production workflows. From automated multilingual subtitling to audience-specific content personalization — these capabilities are delivering measurable ROI for forward-thinking organizations.',
    variant: 0,
    hashtags: ['#EnterpriseAI', '#ContentStrategy', '#VideoMarketing', '#DigitalTransformation', '#B2BMarketing'],
  },
  {
    id: 'av3',
    audienceType: 'general',
    language: 'English',
    tone: 'casual',
    title: '5 Cool Ways AI Is Changing How We Make Videos',
    description: 'Ever wondered how AI is making video creation easier? Here are five amazing trends — from instant video highlights to subtitles in any language. Whether you\'re a YouTuber or just love creating content, these tools are worth checking out.',
    caption: 'AI is making video creation SO much easier 🎬🤖 Check out these 5 awesome trends that are changing the game for creators everywhere!',
    variant: 0,
    hashtags: ['#AI', '#VideoCreation', '#CreatorLife', '#TechTrends', '#CoolTech'],
  },
]

export const SUPPORTED_FORMATS = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ta', name: 'Tamil' },
  { code: 'hi', name: 'Hindi' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' },
  { code: 'bn', name: 'Bengali' },
  { code: 'mr', name: 'Marathi' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
]

export const PLATFORMS = [
  { id: 'youtube' as const, name: 'YouTube', icon: 'Youtube' },
  { id: 'instagram' as const, name: 'Instagram', icon: 'Instagram' },
  { id: 'tiktok' as const, name: 'TikTok', icon: 'Music2' },
  { id: 'twitter' as const, name: 'X / Twitter', icon: 'Twitter' },
  { id: 'linkedin' as const, name: 'LinkedIn', icon: 'Linkedin' },
  { id: 'facebook' as const, name: 'Facebook', icon: 'Facebook' },
]

export const TONES = [
  { id: 'professional' as const, name: 'Professional' },
  { id: 'casual' as const, name: 'Casual' },
  { id: 'educational' as const, name: 'Educational' },
  { id: 'entertaining' as const, name: 'Entertaining' },
  { id: 'inspirational' as const, name: 'Inspirational' },
]
