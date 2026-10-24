import type {
  Advisory,
  Brief,
  CalendarResponse,
  CropDiagnosis,
  CropRecommendation,
  DocumentExplanation,
  Lang,
  LabelReading,
  MandiPrices,
  MarketPrice,
  PricePoint,
  SchemeAnswers,
  SchemeMatch,
  SchemeResult,
  Season,
  SellAdvice,
  SellAdviceRequest,
  VoiceContext,
  VoiceResponse,
  Weather,
  WeatherCondition,
  WeatherDay,
} from '@/lib/api/types'

/**
 * Realistic Maharashtra data for every endpoint: Niphad / Nashik district,
 * Lasalgaon mandi, onion, soybean, tomato, grapes. Numbers are deterministic
 * (seeded from the date) so the demo looks the same on every run that day.
 */

type T3 = { en: string; hi: string; mr: string }
const L = (s: T3, lang: Lang) => s[lang] ?? s.en
const LA = (items: T3[], lang: Lang) => items.map((s) => L(s, lang))

const MODEL = 'gemma-4'

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}
function addDays(base: Date, n: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}
/** tiny deterministic PRNG so mock charts don't jump on every refetch */
function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ---- Weather -------------------------------------------------------------

const RAIN = [20, 80, 65, 30, 10, 5, 15]
const COND: WeatherCondition[] = ['partly_cloudy', 'rain', 'thunderstorm', 'cloudy', 'clear', 'clear', 'partly_cloudy']

export function weatherDays(n = 7): WeatherDay[] {
  const today = new Date()
  return Array.from({ length: n }, (_, i) => ({
    date: iso(addDays(today, i)),
    minC: [19, 20, 20, 19, 18, 18, 19][i] ?? 19,
    maxC: [31, 27, 26, 29, 32, 33, 32][i] ?? 31,
    rainProb: RAIN[i] ?? 10,
    rainMm: [0.4, 14.2, 9.8, 1.1, 0, 0, 0.2][i] ?? 0,
    windKmh: [11, 18, 24, 14, 9, 8, 10][i] ?? 10,
    condition: COND[i] ?? 'clear',
  }))
}

function advisories(days: WeatherDay[], lang: Lang): Advisory[] {
  const out: Advisory[] = []
  for (const d of days.slice(0, 4)) {
    if (d.rainProb > 60) {
      out.push({
        id: `rain-${d.date}`,
        severity: 'warning',
        rule: 'rain_no_spray',
        date: d.date,
        title: L(
          {
            en: `Don't spray on ${d.date === days[1]?.date ? 'tomorrow' : d.date} — ${d.rainProb}% rain`,
            hi: `${d.date === days[1]?.date ? 'कल' : d.date} छिड़काव न करें — ${d.rainProb}% बारिश`,
            mr: `${d.date === days[1]?.date ? 'उद्या' : d.date} फवारणी करू नका — ${d.rainProb}% पाऊस`,
          },
          lang,
        ),
        detail: L(
          {
            en: 'Rain will wash the spray off the leaves. Spray after the rain stops and leaves dry.',
            hi: 'बारिश से दवा पत्तों से धुल जाएगी। बारिश रुकने और पत्ते सूखने के बाद छिड़काव करें।',
            mr: 'पावसाने औषध पानांवरून धुऊन जाईल. पाऊस थांबून पाने सुकल्यावर फवारणी करा.',
          },
          lang,
        ),
      })
    }
    if (d.windKmh > 20) {
      out.push({
        id: `wind-${d.date}`,
        severity: 'info',
        rule: 'wind_no_spray',
        date: d.date,
        title: L(
          { en: `Strong wind ${d.windKmh} km/h — avoid spraying`, hi: `तेज़ हवा ${d.windKmh} किमी/घंटा — छिड़काव टालें`, mr: `जोराचा वारा ${d.windKmh} किमी/तास — फवारणी टाळा` },
          lang,
        ),
        detail: L(
          { en: 'Spray drifts away in wind and can reach you or the next field.', hi: 'हवा में दवा उड़कर आप पर या पड़ोसी खेत में जा सकती है।', mr: 'वाऱ्यात औषध उडून तुमच्यावर किंवा शेजारच्या शेतात जाऊ शकते.' },
          lang,
        ),
      })
    }
    if (d.maxC > 38) {
      out.push({
        id: `heat-${d.date}`,
        severity: 'danger',
        rule: 'heat_irrigate',
        date: d.date,
        title: L({ en: 'Very hot — irrigate in the evening', hi: 'बहुत गर्मी — शाम को सिंचाई करें', mr: 'खूप उष्ण — संध्याकाळी पाणी द्या' }, lang),
        detail: L({ en: 'Evening water is not lost to the afternoon sun.', hi: 'शाम का पानी दोपहर की धूप में नहीं उड़ता।', mr: 'संध्याकाळचे पाणी दुपारच्या उन्हात उडून जात नाही.' }, lang),
      })
    }
  }
  return out
}

export function weather(lang: Lang): Weather {
  const daily = weatherDays(7)
  return {
    location: L({ en: 'Niphad, Nashik', hi: 'निफाड, नासिक', mr: 'निफाड, नाशिक' }, lang),
    current: { tempC: 28, feelsLikeC: 30, humidity: 68, windKmh: 11, rainProb: 20, condition: 'partly_cloudy' },
    daily,
    advisories: advisories(daily, lang),
  }
}

// ---- Mandi ---------------------------------------------------------------

const MARKETS: Record<string, { name: string; district: string; at: [number, number] }> = {
  lasalgaon: { name: 'Lasalgaon', district: 'Nashik', at: [20.15, 74.23] },
  pimpalgaon: { name: 'Pimpalgaon Baswant', district: 'Nashik', at: [20.17, 73.99] },
  nashik: { name: 'Nashik', district: 'Nashik', at: [20.0, 73.79] },
  yeola: { name: 'Yeola', district: 'Nashik', at: [20.04, 74.49] },
  sinnar: { name: 'Sinnar', district: 'Nashik', at: [19.85, 74.0] },
  dindori: { name: 'Dindori', district: 'Nashik', at: [20.2, 73.83] },
  malegaon: { name: 'Malegaon', district: 'Nashik', at: [20.55, 74.53] },
  pune: { name: 'Pune', district: 'Pune', at: [18.52, 73.86] },
  vashi: { name: 'Vashi (Mumbai)', district: 'Thane', at: [19.08, 73.0] },
  latur: { name: 'Latur', district: 'Latur', at: [18.4, 76.57] },
}

const COMMODITY: Record<string, { base: number; slope: number; markets: [string, number][] }> = {
  // [market id, price offset vs base]
  onion: { base: 2450, slope: 6, markets: [['lasalgaon', 0], ['pimpalgaon', -40], ['nashik', -90], ['yeola', -120], ['pune', 260], ['vashi', 380]] },
  soybean: { base: 4520, slope: -3, markets: [['lasalgaon', 0], ['nashik', -30], ['malegaon', -60], ['sinnar', -45], ['latur', 140]] },
  tomato: { base: 1480, slope: 32, markets: [['pimpalgaon', 0], ['nashik', 60], ['sinnar', -40], ['pune', 240], ['vashi', 360]] },
  grapes: { base: 5200, slope: -9, markets: [['pimpalgaon', 0], ['nashik', 120], ['dindori', -80], ['lasalgaon', -150], ['vashi', 540]] },
}

export const COMMODITIES = Object.keys(COMMODITY)

function priceTrend(commodity: string): PricePoint[] {
  const c = COMMODITY[commodity] ?? COMMODITY.onion!
  const today = new Date()
  const rnd = seeded(Number(iso(today).replace(/-/g, '')) + commodity.length * 97)
  return Array.from({ length: 30 }, (_, i) => {
    const daysAgo = 29 - i
    const noise = (rnd() - 0.5) * c.base * 0.06
    return { date: iso(addDays(today, -daysAgo)), modalPrice: Math.round(c.base - c.slope * daysAgo + noise) }
  })
}

export function mandiPrices(commodity: string, lat: number, lon: number): MandiPrices {
  const c = COMMODITY[commodity] ?? COMMODITY.onion!
  const trend = priceTrend(commodity)
  const today = iso(new Date())
  const markets: MarketPrice[] = c.markets.map(([id, off]) => {
    const m = MARKETS[id]!
    const modal = c.base + off
    return {
      market: m.name,
      district: m.district,
      minPrice: Math.round(modal * 0.78),
      maxPrice: Math.round(modal * 1.14),
      modalPrice: modal,
      distanceKm: Math.round(haversineKm([lat, lon], m.at)),
      arrivalDate: today,
    }
  })
  markets.sort((a, b) => b.modalPrice - a.modalPrice)
  const last = trend[trend.length - 1]!.modalPrice
  const weekAgo = trend[trend.length - 8]!.modalPrice
  return {
    commodity,
    unit: 'quintal',
    asOf: today,
    markets,
    trend,
    trendMarket: MARKETS[c.markets[0]![0]]!.name,
    changePct7d: Math.round(((last - weekAgo) / weekAgo) * 1000) / 10,
  }
}

const TRANSPORT_PER_KM_PER_QTL = 2.5

export function sellAdvice(req: SellAdviceRequest): SellAdvice {
  const prices = mandiPrices(req.commodity, req.lat, req.lon)
  const options = prices.markets
    .map((m) => {
      const transportCost = Math.round(m.distanceKm * TRANSPORT_PER_KM_PER_QTL * req.quantityQuintals)
      return {
        market: m.market,
        modalPrice: m.modalPrice,
        distanceKm: m.distanceKm,
        transportCost,
        netEarning: Math.round(m.modalPrice * req.quantityQuintals - transportCost),
      }
    })
    .sort((a, b) => b.netEarning - a.netEarning)
  const best = options[0]!
  const slope = COMMODITY[req.commodity]?.slope ?? 0
  const wait = slope >= 20
  const lang = req.lang
  const reasoning = wait
    ? L(
        {
          en: `Prices for ${req.commodity} have risen about ₹${slope} per quintal every day this week. Waiting 5–7 days could add roughly ₹${slope * 6 * req.quantityQuintals}. If your crop can't wait, ${best.market} gives the best net today.`,
          hi: `इस हफ्ते ${req.commodity} का भाव रोज़ लगभग ₹${slope} प्रति क्विंटल बढ़ा है। 5–7 दिन रुकने से लगभग ₹${slope * 6 * req.quantityQuintals} ज़्यादा मिल सकते हैं। अगर माल रुक नहीं सकता, तो आज ${best.market} में सबसे अच्छा शुद्ध दाम है।`,
          mr: `या आठवड्यात ${req.commodity} चा भाव रोज सुमारे ₹${slope} प्रति क्विंटल वाढला आहे. 5–7 दिवस थांबल्यास सुमारे ₹${slope * 6 * req.quantityQuintals} जास्त मिळू शकतात. माल थांबू शकत नसेल तर आज ${best.market} मध्ये सर्वात चांगला निव्वळ दर आहे.`,
        },
        lang,
      )
    : L(
        {
          en: `${best.market} gives you the most after transport. Far markets like Pune pay more per quintal, but the truck cost eats the difference. Prices are steady this week, so selling now is safe.`,
          hi: `ढुलाई के बाद ${best.market} में सबसे ज़्यादा पैसा मिलेगा। पुणे जैसे दूर के बाज़ार में भाव ज़्यादा है, पर ट्रक का खर्च वह फ़र्क खा जाता है। इस हफ्ते भाव स्थिर है, अभी बेचना सुरक्षित है।`,
          mr: `वाहतूक खर्चानंतर ${best.market} मध्ये सर्वात जास्त पैसे मिळतील. पुण्यासारख्या दूरच्या बाजारात भाव जास्त आहे, पण ट्रकचा खर्च तो फरक खाऊन टाकतो. या आठवड्यात भाव स्थिर आहे, आता विकणे सुरक्षित आहे.`,
        },
        lang,
      )
  return {
    recommendation: wait ? 'WAIT' : 'SELL_NOW',
    bestMarket: best.market,
    netEarning: best.netEarning,
    options,
    trendSlope: slope,
    reasoning,
  }
}

// ---- Brief ---------------------------------------------------------------

export function brief(lang: Lang, name: string): Brief {
  const first = name.split(' ')[0] || name
  const onion = mandiPrices('onion', 20.08, 74.11)
  const grapes = mandiPrices('grapes', 20.08, 74.11)
  const onionLas = onion.markets.find((m) => m.market === 'Lasalgaon')!
  const grapesPim = grapes.markets.find((m) => m.market === 'Pimpalgaon Baswant')!
  return {
    greeting: L({ en: `Good morning, ${first}`, hi: `नमस्ते ${first}जी`, mr: `नमस्कार ${first}राव` }, lang),
    date: iso(new Date()),
    weather: weatherDays(4),
    actions: [
      {
        id: 'a1',
        type: 'spray',
        priority: 'high',
        source: 'weather',
        route: '/weather',
        title: L({ en: "Don't spray onion tomorrow — 80% rain", hi: 'कल प्याज़ पर छिड़काव न करें — 80% बारिश', mr: 'उद्या कांद्यावर फवारणी करू नका — 80% पाऊस' }, lang),
        detail: L(
          { en: 'Spray today before 4 pm, or wait until Thursday when leaves are dry.', hi: 'आज शाम 4 बजे से पहले छिड़कें, या गुरुवार तक रुकें जब पत्ते सूखे हों।', mr: 'आज दुपारी 4 पूर्वी फवारणी करा, किंवा पाने कोरडी होतील तेव्हा गुरुवारपर्यंत थांबा.' },
          lang,
        ),
      },
      {
        id: 'a2',
        type: 'sell',
        priority: 'medium',
        source: 'mandi',
        route: '/mandi',
        title: L(
          { en: `Onion ₹${onionLas.modalPrice} at Lasalgaon — good time to sell part`, hi: `लासलगांव में प्याज़ ₹${onionLas.modalPrice} — कुछ माल बेचने का अच्छा समय`, mr: `लासलगावला कांदा ₹${onionLas.modalPrice} — काही माल विकण्याची चांगली वेळ` },
          lang,
        ),
        detail: L(
          { en: 'Up this week. Check Sell Smart to compare markets after transport.', hi: 'इस हफ्ते भाव बढ़ा है। ढुलाई के बाद बाज़ारों की तुलना Sell Smart में देखें।', mr: 'या आठवड्यात भाव वाढला. वाहतुकीनंतर बाजारांची तुलना Sell Smart मध्ये पहा.' },
          lang,
        ),
      },
      {
        id: 'a3',
        type: 'protect',
        priority: 'low',
        source: 'calendar',
        route: '/calendar',
        title: L({ en: 'Grapes: watch for downy mildew after the rain', hi: 'अंगूर: बारिश के बाद डाउनी मिल्ड्यू पर नज़र रखें', mr: 'द्राक्ष: पावसानंतर डाऊनी मिल्ड्यूकडे लक्ष ठेवा' }, lang),
        detail: L(
          { en: 'Fruit pruning is done — new shoots are tender. Check leaf undersides on Friday.', hi: 'फल छँटाई हो चुकी है — नई कोंपलें नाज़ुक हैं। शुक्रवार को पत्तों के नीचे देखें।', mr: 'फळछाटणी झाली आहे — नवीन फुटवे कोवळे आहेत. शुक्रवारी पानांच्या खालची बाजू तपासा.' },
          lang,
        ),
      },
    ],
    priceAlerts: [
      { commodity: 'onion', market: 'Lasalgaon', modalPrice: onionLas.modalPrice, changePct: onion.changePct7d, direction: onion.changePct7d > 0.5 ? 'up' : onion.changePct7d < -0.5 ? 'down' : 'flat' },
      { commodity: 'grapes', market: 'Pimpalgaon Baswant', modalPrice: grapesPim.modalPrice, changePct: grapes.changePct7d, direction: grapes.changePct7d > 0.5 ? 'up' : grapes.changePct7d < -0.5 ? 'down' : 'flat' },
    ],
    toolCalls: [
      { name: 'get_weather', args: { district: 'Nashik', days: 4 }, ms: 212 },
      { name: 'get_mandi_trend', args: { commodity: 'onion', market: 'Lasalgaon', days: 7 }, ms: 148 },
      { name: 'get_crop_stage', args: { crop: 'grapes', season: 'rabi' }, ms: 31 },
    ],
  }
}

// ---- AI ------------------------------------------------------------------

export function cropDoctor(lang: Lang, crop?: string): CropDiagnosis {
  if (crop === 'tomato') {
    return {
      diagnosis: L({ en: 'Early blight', hi: 'अगेती झुलसा (अर्ली ब्लाइट)', mr: 'लवकर करपा (अर्ली ब्लाइट)' }, lang),
      scientificName: 'Alternaria solani',
      confidence: 0.86,
      severity: 'medium',
      symptoms: LA(
        [
          { en: 'Brown spots with rings like a target on lower leaves', hi: 'निचली पत्तियों पर निशाने जैसे छल्लों वाले भूरे धब्बे', mr: 'खालच्या पानांवर नेमासारखी वर्तुळे असलेले तपकिरी ठिपके' },
          { en: 'Yellowing around the spots', hi: 'धब्बों के आसपास पीलापन', mr: 'ठिपक्यांभोवती पिवळेपणा' },
        ],
        lang,
      ),
      treatment: {
        organic: LA(
          [
            { en: 'Remove and burn infected lower leaves', hi: 'संक्रमित निचली पत्तियाँ तोड़कर जला दें', mr: 'रोगट खालची पाने तोडून जाळून टाका' },
            { en: 'Spray neem oil 5 ml per litre of water', hi: 'नीम तेल 5 मिली प्रति लीटर पानी में छिड़कें', mr: 'निंबोळी तेल 5 मिली प्रति लिटर पाण्यात फवारा' },
          ],
          lang,
        ),
        chemical: LA(
          [{ en: 'Mancozeb 75% WP — follow the dose printed on the label', hi: 'मैनकोज़ेब 75% WP — लेबल पर छपी मात्रा ही लें', mr: 'मॅन्कोझेब 75% WP — लेबलवर छापलेलेच प्रमाण वापरा' }],
          lang,
        ),
      },
      prevention: LA(
        [
          { en: 'Water at the base, not on the leaves', hi: 'पानी जड़ में दें, पत्तों पर नहीं', mr: 'पाणी मुळाशी द्या, पानांवर नाही' },
          { en: 'Rotate with a non-solanaceous crop next season', hi: 'अगले मौसम में दूसरी फसल लगाएँ', mr: 'पुढच्या हंगामात वेगळे पीक घ्या' },
        ],
        lang,
      ),
      escalate: false,
      model: MODEL,
    }
  }
  if (crop === 'grapes') {
    return {
      diagnosis: L({ en: 'Downy mildew', hi: 'डाउनी मिल्ड्यू (केवड़ा)', mr: 'डाऊनी मिल्ड्यू (केवडा)' }, lang),
      scientificName: 'Plasmopara viticola',
      confidence: 0.79,
      severity: 'high',
      symptoms: LA(
        [
          { en: 'Yellow oily patches on the upper leaf', hi: 'पत्ते के ऊपर पीले तैलीय धब्बे', mr: 'पानाच्या वरच्या बाजूला पिवळे तेलकट डाग' },
          { en: 'White downy growth underneath', hi: 'नीचे सफ़ेद रोएँदार परत', mr: 'खालच्या बाजूला पांढरी केसाळ वाढ' },
        ],
        lang,
      ),
      treatment: {
        organic: LA(
          [
            { en: 'Open the canopy — remove extra shoots for air flow', hi: 'छतरी खोलें — हवा के लिए अतिरिक्त कोंपलें हटाएँ', mr: 'वेलीचा घेर मोकळा करा — हवेसाठी जास्तीचे फुटवे काढा' },
            { en: 'Spray Bordeaux mixture 1%', hi: '1% बोर्डो मिश्रण छिड़कें', mr: '1% बोर्डो मिश्रण फवारा' },
          ],
          lang,
        ),
        chemical: LA(
          [{ en: 'Metalaxyl + Mancozeb — dose from the label only', hi: 'मेटालैक्सिल + मैनकोज़ेब — मात्रा केवल लेबल से', mr: 'मेटॅलॅक्झिल + मॅन्कोझेब — प्रमाण फक्त लेबलवरून' }],
          lang,
        ),
      },
      prevention: LA([{ en: 'Avoid spraying water on leaves in the evening', hi: 'शाम को पत्तों पर पानी न डालें', mr: 'संध्याकाळी पानांवर पाणी टाकू नका' }], lang),
      escalate: false,
      model: MODEL,
    }
  }
  return {
    diagnosis: L({ en: 'Purple blotch', hi: 'बैंगनी धब्बा (पर्पल ब्लॉच)', mr: 'जांभळा करपा (पर्पल ब्लॉच)' }, lang),
    scientificName: 'Alternaria porri',
    confidence: 0.88,
    severity: 'medium',
    symptoms: LA(
      [
        { en: 'Small white sunken spots that turn purple with a yellow edge', hi: 'छोटे सफ़ेद धँसे धब्बे जो पीली किनारी के साथ बैंगनी हो जाते हैं', mr: 'लहान पांढरे खोलगट ठिपके जे पिवळ्या कडेसह जांभळे होतात' },
        { en: 'Leaf tips dry and fall over', hi: 'पत्तों के सिरे सूखकर गिर जाते हैं', mr: 'पानांची टोके वाळून खाली पडतात' },
        { en: 'Spreads fast after rain or heavy dew', hi: 'बारिश या ओस के बाद तेज़ी से फैलता है', mr: 'पाऊस किंवा दवानंतर झपाट्याने पसरतो' },
      ],
      lang,
    ),
    treatment: {
      organic: LA(
        [
          { en: 'Pull out badly infected plants and destroy them', hi: 'ज़्यादा संक्रमित पौधे उखाड़कर नष्ट करें', mr: 'जास्त रोगट रोपे उपटून नष्ट करा' },
          { en: 'Spray Trichoderma or neem-based fungicide', hi: 'ट्राइकोडर्मा या नीम आधारित दवा छिड़कें', mr: 'ट्रायकोडर्मा किंवा निंबोळी आधारित औषध फवारा' },
        ],
        lang,
      ),
      chemical: LA(
        [
          { en: 'Mancozeb 75% WP — dose from the label (use Label Reader)', hi: 'मैनकोज़ेब 75% WP — मात्रा लेबल से (लेबल रीडर इस्तेमाल करें)', mr: 'मॅन्कोझेब 75% WP — प्रमाण लेबलवरून (लेबल वाचक वापरा)' },
          { en: 'Add a sticker so the spray stays on waxy onion leaves', hi: 'चिपकने वाला द्रव मिलाएँ ताकि दवा पत्तों पर टिके', mr: 'स्टिकर मिसळा म्हणजे औषध कांद्याच्या पानांवर टिकेल' },
        ],
        lang,
      ),
    },
    prevention: LA(
      [
        { en: 'Keep 15 cm between plants for air flow', hi: 'हवा के लिए पौधों में 15 सेमी दूरी रखें', mr: 'हवेसाठी रोपांमध्ये 15 सेमी अंतर ठेवा' },
        { en: "Don't over-irrigate; avoid water standing in the field", hi: 'ज़्यादा पानी न दें; खेत में पानी न रुकने दें', mr: 'जास्त पाणी देऊ नका; शेतात पाणी साचू देऊ नका' },
      ],
      lang,
    ),
    escalate: false,
    model: MODEL,
  }
}

export function labelReader(lang: Lang, tankSizeLitres: number, unreadable = false): LabelReading {
  const base = {
    productName: 'Mancozeb 75% WP',
    activeIngredient: 'Mancozeb 75% w/w',
    formulation: '75% WP',
    tankSizeLitres,
    model: MODEL,
    safety: LA(
      [
        { en: 'Wear gloves and a mask', hi: 'दस्ताने और मास्क पहनें', mr: 'हातमोजे आणि मास्क घाला' },
        { en: 'Spray with the wind behind you', hi: 'हवा की दिशा में पीठ करके छिड़कें', mr: 'वारा पाठीमागून येईल असे उभे राहून फवारा' },
        { en: "Don't eat, drink or smoke while spraying", hi: 'छिड़काव के समय खाना, पीना या धूम्रपान न करें', mr: 'फवारणी करताना खाऊ, पिऊ किंवा धूम्रपान करू नका' },
        { en: 'Wash hands and clothes after spraying', hi: 'छिड़काव के बाद हाथ और कपड़े धोएँ', mr: 'फवारणीनंतर हात आणि कपडे धुवा' },
      ],
      lang,
    ),
    warnings: LA(
      [
        { en: 'Harmful if swallowed — keep away from children', hi: 'निगलने पर हानिकारक — बच्चों से दूर रखें', mr: 'गिळल्यास घातक — मुलांपासून दूर ठेवा' },
        { en: 'Toxic to fish — do not wash the pump in a well or stream', hi: 'मछलियों के लिए ज़हरीला — पंप कुएँ या नाले में न धोएँ', mr: 'माशांसाठी विषारी — पंप विहिरीत किंवा ओढ्यात धुऊ नका' },
      ],
      lang,
    ),
  }
  if (unreadable) {
    return { ...base, dosePerTank: null, waitingPeriodDays: null, confidence: 0.41, escalate: true }
  }
  return {
    ...base,
    // label: 2.5 g per litre of water
    dosePerTank: { amount: Math.round(2.5 * tankSizeLitres * 10) / 10, unit: 'g' },
    waitingPeriodDays: 15,
    confidence: 0.93,
    escalate: false,
  }
}

export function explainDocument(lang: Lang): DocumentExplanation {
  const due = iso(addDays(new Date(), 21))
  return {
    docType: L({ en: 'Kisan Credit Card renewal notice', hi: 'किसान क्रेडिट कार्ड नवीनीकरण सूचना', mr: 'किसान क्रेडिट कार्ड नूतनीकरण सूचना' }, lang),
    summary: L(
      {
        en: 'Your bank says your crop loan (KCC) limit is due for renewal. Pay the interest and visit the branch before the date below to keep the 4% interest rate.',
        hi: 'बैंक कह रहा है कि आपके फसल ऋण (KCC) की सीमा का नवीनीकरण होना है। नीचे की तारीख से पहले ब्याज भरें और शाखा जाएँ ताकि 4% ब्याज दर बनी रहे।',
        mr: 'बँक सांगत आहे की तुमच्या पीक कर्जाची (KCC) मर्यादा नूतनीकरणासाठी आली आहे. 4% व्याजदर कायम ठेवण्यासाठी खालील तारखेपूर्वी व्याज भरा आणि शाखेत जा.',
      },
      lang,
    ),
    keyPoints: LA(
      [
        { en: 'Loan limit: ₹1,60,000', hi: 'ऋण सीमा: ₹1,60,000', mr: 'कर्ज मर्यादा: ₹1,60,000' },
        { en: 'Interest due: ₹4,850', hi: 'बकाया ब्याज: ₹4,850', mr: 'थकीत व्याज: ₹4,850' },
        { en: 'Late renewal loses the interest subsidy', hi: 'देर से नवीनीकरण पर ब्याज छूट नहीं मिलेगी', mr: 'उशिरा नूतनीकरण केल्यास व्याज सवलत मिळणार नाही' },
      ],
      lang,
    ),
    deadlines: [{ label: L({ en: 'Renew KCC at branch', hi: 'शाखा में KCC नवीनीकरण', mr: 'शाखेत KCC नूतनीकरण' }, lang), date: due }],
    nextSteps: LA(
      [
        { en: 'Pay ₹4,850 interest', hi: '₹4,850 ब्याज भरें', mr: '₹4,850 व्याज भरा' },
        { en: 'Take the 7/12 extract and passbook to the branch', hi: '7/12 उतारा और पासबुक शाखा ले जाएँ', mr: '7/12 उतारा आणि पासबुक शाखेत न्या' },
        { en: 'Sign the renewal form', hi: 'नवीनीकरण फ़ॉर्म पर हस्ताक्षर करें', mr: 'नूतनीकरण अर्जावर सही करा' },
      ],
      lang,
    ),
    redactedFields: LA(
      [
        { en: 'Aadhaar number', hi: 'आधार नंबर', mr: 'आधार क्रमांक' },
        { en: 'Bank account number', hi: 'बैंक खाता नंबर', mr: 'बँक खाते क्रमांक' },
        { en: 'Mobile number', hi: 'मोबाइल नंबर', mr: 'मोबाईल क्रमांक' },
      ],
      lang,
    ),
    model: MODEL,
  }
}

export function voice(lang: Lang, context: VoiceContext): VoiceResponse {
  if (context.formFields?.length) {
    const slots: Record<string, string> = {}
    const sample: Record<string, string> = { name: 'Ramesh Patil', village: 'Niphad', district: 'Nashik', landAcres: '2.5', crop: 'onion', bankName: 'Nashik DCC Bank' }
    for (const f of context.formFields) if (sample[f]) slots[f] = sample[f]
    return {
      transcript: L({ en: 'My name is Ramesh Patil, from Niphad, I have two and a half acres', hi: 'मेरा नाम रमेश पाटिल है, निफाड से, ढाई एकड़ ज़मीन है', mr: 'माझं नाव रमेश पाटील, निफाडचा, अडीच एकर जमीन आहे' }, lang),
      reply: L({ en: 'I filled your name, village and land. Please check each one.', hi: 'मैंने नाम, गाँव और ज़मीन भर दी है। कृपया हर एक जाँच लें।', mr: 'मी नाव, गाव आणि जमीन भरली आहे. कृपया प्रत्येक तपासा.' }, lang),
      intent: 'fill_form',
      navigateTo: null,
      slots,
      escalate: false,
      model: MODEL,
    }
  }
  return {
    transcript: L({ en: 'What is the onion price today?', hi: 'आज प्याज़ का भाव क्या है?', mr: 'आज कांद्याचा भाव काय आहे?' }, lang),
    reply: L(
      { en: 'Onion is ₹2,450 per quintal at Lasalgaon today, up this week. Opening the mandi page.', hi: 'आज लासलगांव में प्याज़ ₹2,450 प्रति क्विंटल है, इस हफ्ते बढ़ा है। मंडी पेज खोल रहा हूँ।', mr: 'आज लासलगावला कांदा ₹2,450 प्रति क्विंटल आहे, या आठवड्यात वाढला आहे. बाजारभाव पान उघडत आहे.' },
      lang,
    ),
    intent: 'navigate',
    navigateTo: '/mandi',
    slots: {},
    escalate: false,
    model: MODEL,
  }
}

// ---- Calendar ------------------------------------------------------------

type CropSeed = { crop: string; name: T3; suitability: CropRecommendation['suitability']; from: string; to: string; durationDays: number; why: T3; timeline: { title: T3; tasks: T3[] }[] }

const year = new Date().getFullYear()
const CROPS: Record<Season, CropSeed[]> = {
  rabi: [
    {
      crop: 'onion',
      name: { en: 'Rabi onion', hi: 'रबी प्याज़', mr: 'रब्बी कांदा' },
      suitability: 'high',
      from: `${year}-11-01`,
      to: `${year}-12-15`,
      durationDays: 120,
      why: { en: 'Black soil and drip suit onion; rabi onion stores well and Lasalgaon is 12 km away.', hi: 'काली मिट्टी और ड्रिप प्याज़ के लिए अच्छे हैं; रबी प्याज़ अच्छा टिकता है और लासलगांव 12 किमी है।', mr: 'काळी माती आणि ठिबक कांद्यासाठी योग्य; रब्बी कांदा चांगला टिकतो आणि लासलगाव 12 किमीवर आहे.' },
      timeline: [
        { title: { en: 'Nursery', hi: 'नर्सरी', mr: 'रोपवाटिका' }, tasks: [{ en: 'Raise seedlings on raised beds', hi: 'उठी क्यारियों पर पौध तैयार करें', mr: 'गादीवाफ्यावर रोपे तयार करा' }, { en: 'Treat seed with Trichoderma', hi: 'बीज को ट्राइकोडर्मा से उपचारित करें', mr: 'बियाण्याला ट्रायकोडर्मा लावा' }] },
        { title: { en: 'Field prep', hi: 'खेत की तैयारी', mr: 'शेत तयारी' }, tasks: [{ en: 'Plough and add 10 t compost per acre', hi: 'जुताई करें, प्रति एकड़ 10 टन खाद डालें', mr: 'नांगरणी करा, एकरी 10 टन शेणखत टाका' }] },
        { title: { en: 'Transplant', hi: 'रोपाई', mr: 'पुनर्लागवड' }, tasks: [{ en: 'Transplant 6-week seedlings, 15 × 10 cm', hi: '6 हफ्ते की पौध 15 × 10 सेमी पर रोपें', mr: '6 आठवड्यांची रोपे 15 × 10 सेमी अंतरावर लावा' }, { en: 'Light irrigation the same day', hi: 'उसी दिन हल्की सिंचाई', mr: 'त्याच दिवशी हलके पाणी' }] },
        { title: { en: 'Weeding + first dose', hi: 'निराई + पहली खाद', mr: 'खुरपणी + पहिला हप्ता' }, tasks: [{ en: 'Weed at 3 weeks', hi: '3 हफ्ते पर निराई', mr: '3 आठवड्यांनी खुरपणी' }, { en: 'Top-dress nitrogen', hi: 'नाइट्रोजन की ऊपरी खाद', mr: 'नत्राचा वरखत' }] },
        { title: { en: 'Watch for thrips & blotch', hi: 'थ्रिप्स और धब्बे पर नज़र', mr: 'फुलकिडे व करप्यावर लक्ष' }, tasks: [{ en: 'Scout twice a week', hi: 'हफ्ते में दो बार जाँचें', mr: 'आठवड्यातून दोनदा पहाणी' }] },
        { title: { en: 'Harvest', hi: 'कटाई', mr: 'काढणी' }, tasks: [{ en: 'Stop irrigation 2 weeks before', hi: '2 हफ्ते पहले सिंचाई बंद करें', mr: '2 आठवडे आधी पाणी बंद करा' }, { en: 'Cure in shade 10 days before storing', hi: 'भंडारण से पहले 10 दिन छाँव में सुखाएँ', mr: 'साठवणीपूर्वी 10 दिवस सावलीत सुकवा' }] },
      ],
    },
    {
      crop: 'wheat',
      name: { en: 'Wheat', hi: 'गेहूँ', mr: 'गहू' },
      suitability: 'medium',
      from: `${year}-11-01`,
      to: `${year}-11-30`,
      durationDays: 110,
      why: { en: 'Good if you have assured water for 5–6 irrigations.', hi: '5–6 सिंचाई का पक्का पानी हो तो अच्छा।', mr: '5–6 पाळ्यांचे खात्रीचे पाणी असल्यास चांगले.' },
      timeline: [
        { title: { en: 'Sowing', hi: 'बुवाई', mr: 'पेरणी' }, tasks: [{ en: 'Sow 40 kg seed per acre', hi: 'प्रति एकड़ 40 किलो बीज', mr: 'एकरी 40 किलो बियाणे' }] },
        { title: { en: 'Crown root irrigation', hi: 'शीर्ष जड़ सिंचाई', mr: 'मुकुटमूळ पाणी' }, tasks: [{ en: 'First irrigation at 21 days', hi: '21 दिन पर पहली सिंचाई', mr: '21 दिवसांनी पहिले पाणी' }] },
        { title: { en: 'Harvest', hi: 'कटाई', mr: 'काढणी' }, tasks: [{ en: 'Harvest when grains are hard', hi: 'दाने सख्त होने पर कटाई', mr: 'दाणे टणक झाल्यावर काढणी' }] },
      ],
    },
    {
      crop: 'gram',
      name: { en: 'Gram (chana)', hi: 'चना', mr: 'हरभरा' },
      suitability: 'high',
      from: `${year}-10-15`,
      to: `${year}-11-15`,
      durationDays: 100,
      why: { en: 'Needs little water and fixes nitrogen for your next onion crop.', hi: 'कम पानी चाहिए और अगली प्याज़ के लिए नाइट्रोजन देता है।', mr: 'कमी पाणी लागते आणि पुढच्या कांद्यासाठी नत्र स्थिर करतो.' },
      timeline: [
        { title: { en: 'Sowing', hi: 'बुवाई', mr: 'पेरणी' }, tasks: [{ en: 'Treat seed with Rhizobium', hi: 'बीज को राइज़ोबियम से उपचारित करें', mr: 'बियाण्याला रायझोबियम लावा' }] },
        { title: { en: 'Nipping', hi: 'खुंटाई', mr: 'शेंडे खुडणे' }, tasks: [{ en: 'Nip tips at 30 days for more branches', hi: '30 दिन पर सिरे तोड़ें', mr: '30 दिवसांनी शेंडे खुडा' }] },
        { title: { en: 'Pod borer watch', hi: 'फली छेदक पर नज़र', mr: 'घाटेअळीवर लक्ष' }, tasks: [{ en: 'Put up bird perches', hi: 'पक्षियों के बैठने के ठिकाने लगाएँ', mr: 'पक्षी थांबे लावा' }] },
      ],
    },
  ],
  kharif: [
    {
      crop: 'soybean',
      name: { en: 'Soybean', hi: 'सोयाबीन', mr: 'सोयाबीन' },
      suitability: 'high',
      from: `${year}-06-15`,
      to: `${year}-07-10`,
      durationDays: 100,
      why: { en: 'Sow after 75–100 mm of monsoon rain on black soil.', hi: 'काली मिट्टी पर 75–100 मिमी बारिश के बाद बोएँ।', mr: 'काळ्या मातीत 75–100 मिमी पावसानंतर पेरा.' },
      timeline: [
        { title: { en: 'Sowing', hi: 'बुवाई', mr: 'पेरणी' }, tasks: [{ en: 'Broad bed furrow sowing', hi: 'चौड़ी क्यारी नाली विधि', mr: 'रुंद वरंबा सरी पद्धत' }] },
        { title: { en: 'Weeding', hi: 'निराई', mr: 'खुरपणी' }, tasks: [{ en: 'Weed at 20 and 40 days', hi: '20 और 40 दिन पर निराई', mr: '20 व 40 दिवसांनी खुरपणी' }] },
        { title: { en: 'Harvest', hi: 'कटाई', mr: 'काढणी' }, tasks: [{ en: 'Harvest when 95% pods turn brown', hi: '95% फलियाँ भूरी होने पर', mr: '95% शेंगा तपकिरी झाल्यावर' }] },
      ],
    },
    {
      crop: 'tomato',
      name: { en: 'Tomato', hi: 'टमाटर', mr: 'टोमॅटो' },
      suitability: 'medium',
      from: `${year}-06-20`,
      to: `${year}-07-31`,
      durationDays: 130,
      why: { en: 'Pimpalgaon market is close; needs staking and good drainage.', hi: 'पिंपलगांव बाज़ार पास है; सहारा और अच्छी निकासी चाहिए।', mr: 'पिंपळगाव बाजार जवळ आहे; आधार आणि चांगला निचरा लागतो.' },
      timeline: [
        { title: { en: 'Nursery', hi: 'नर्सरी', mr: 'रोपवाटिका' }, tasks: [{ en: 'Raise seedlings under net', hi: 'जाली के नीचे पौध', mr: 'जाळीखाली रोपे' }] },
        { title: { en: 'Staking', hi: 'सहारा', mr: 'आधार देणे' }, tasks: [{ en: 'Stake at 3 weeks', hi: '3 हफ्ते पर सहारा', mr: '3 आठवड्यांनी आधार' }] },
      ],
    },
  ],
  zaid: [
    {
      crop: 'watermelon',
      name: { en: 'Watermelon', hi: 'तरबूज़', mr: 'कलिंगड' },
      suitability: 'medium',
      from: `${year}-01-15`,
      to: `${year}-02-28`,
      durationDays: 85,
      why: { en: 'Drip makes a summer crop possible; sells well in April.', hi: 'ड्रिप से गर्मी की फसल संभव; अप्रैल में अच्छा बिकता है।', mr: 'ठिबकमुळे उन्हाळी पीक शक्य; एप्रिलमध्ये चांगले विकते.' },
      timeline: [
        { title: { en: 'Sowing', hi: 'बुवाई', mr: 'पेरणी' }, tasks: [{ en: 'Sow on mulched beds', hi: 'मल्च वाली क्यारियों पर बोएँ', mr: 'आच्छादन केलेल्या वाफ्यांवर लावा' }] },
        { title: { en: 'Flowering', hi: 'फूल', mr: 'फुलोरा' }, tasks: [{ en: 'Keep bee boxes nearby', hi: 'पास में मधुमक्खी पेटी रखें', mr: 'जवळ मधमाशी पेट्या ठेवा' }] },
      ],
    },
  ],
}

export function calendar(season: Season, lang: Lang): CalendarResponse {
  return {
    season,
    recommendations: (CROPS[season] ?? []).map((c) => ({
      crop: c.crop,
      name: L(c.name, lang),
      suitability: c.suitability,
      sowingWindow: { from: c.from, to: c.to },
      durationDays: c.durationDays,
      why: L(c.why, lang),
      timeline: c.timeline.map((w, i) => ({ week: i * 2 + 1, title: L(w.title, lang), tasks: LA(w.tasks, lang) })),
    })),
  }
}

// ---- Schemes -------------------------------------------------------------

type SchemeSeed = { id: string; name: T3; benefit: T3; documents: T3[]; officialUrl: string; check: (a: SchemeAnswers) => [boolean, T3] }

const DOC = {
  aadhaar: { en: 'Aadhaar card', hi: 'आधार कार्ड', mr: 'आधार कार्ड' },
  satbara: { en: '7/12 land extract', hi: '7/12 भूमि अभिलेख', mr: '7/12 उतारा' },
  passbook: { en: 'Bank passbook', hi: 'बैंक पासबुक', mr: 'बँक पासबुक' },
  caste: { en: 'Caste certificate', hi: 'जाति प्रमाण पत्र', mr: 'जात प्रमाणपत्र' },
  sowing: { en: 'Sowing certificate', hi: 'बुवाई प्रमाण पत्र', mr: 'पेरणी प्रमाणपत्र' },
  quote: { en: 'Dealer quotation', hi: 'डीलर कोटेशन', mr: 'विक्रेत्याचे कोटेशन' },
}

const SCHEMES: SchemeSeed[] = [
  {
    id: 'pm-kisan',
    name: { en: 'PM-KISAN', hi: 'पीएम-किसान', mr: 'पीएम-किसान' },
    benefit: { en: '₹6,000 a year in 3 instalments', hi: 'साल में ₹6,000, 3 किस्तों में', mr: 'वर्षाला ₹6,000, 3 हप्त्यांत' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook],
    officialUrl: 'https://pmkisan.gov.in',
    check: (a) =>
      a.ownsLand && !a.incomeTaxPayer
        ? [true, { en: 'You own farmland and do not pay income tax', hi: 'आपके नाम खेती की ज़मीन है और आप आयकर नहीं भरते', mr: 'तुमच्या नावावर शेतजमीन आहे आणि तुम्ही आयकर भरत नाही' }]
        : [false, { en: 'Needs land in your name and no income tax', hi: 'आपके नाम ज़मीन और आयकर न भरना ज़रूरी', mr: 'तुमच्या नावावर जमीन आणि आयकर न भरणे आवश्यक' }],
  },
  {
    id: 'namo-shetkari',
    name: { en: 'Namo Shetkari Mahasanman Nidhi', hi: 'नमो शेतकरी महासम्मान निधि', mr: 'नमो शेतकरी महासन्मान निधी' },
    benefit: { en: 'Extra ₹6,000 a year from Maharashtra', hi: 'महाराष्ट्र से साल में ₹6,000 अतिरिक्त', mr: 'महाराष्ट्राकडून वर्षाला अतिरिक्त ₹6,000' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook],
    officialUrl: 'https://nsmny.mahait.org',
    check: (a) =>
      a.ownsLand && !a.incomeTaxPayer && a.hasBankAccount
        ? [true, { en: 'You qualify for PM-KISAN, so you get this too', hi: 'आप पीएम-किसान के पात्र हैं, इसलिए यह भी मिलेगा', mr: 'तुम्ही पीएम-किसानसाठी पात्र आहात, म्हणून हेही मिळेल' }]
        : [false, { en: 'Only for PM-KISAN farmers with a bank account', hi: 'केवल बैंक खाते वाले पीएम-किसान किसानों के लिए', mr: 'फक्त बँक खाते असलेल्या पीएम-किसान शेतकऱ्यांसाठी' }],
  },
  {
    id: 'pmfby',
    name: { en: 'PM Fasal Bima Yojana (crop insurance)', hi: 'पीएम फसल बीमा योजना', mr: 'पीएम पीक विमा योजना' },
    benefit: { en: 'Insurance for crop loss from rain, drought or pests', hi: 'बारिश, सूखा या कीट से फसल नुकसान का बीमा', mr: 'पाऊस, दुष्काळ किंवा किडीमुळे पिकाच्या नुकसानीचा विमा' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook, DOC.sowing],
    officialUrl: 'https://pmfby.gov.in',
    check: (a) =>
      a.hasBankAccount
        ? [true, { en: 'Open to owners and tenant farmers with a bank account', hi: 'बैंक खाते वाले मालिक और बटाईदार दोनों के लिए', mr: 'बँक खाते असलेले मालक व कुळ दोघांसाठी' }]
        : [false, { en: 'You need a bank account for the claim money', hi: 'दावे की रकम के लिए बैंक खाता चाहिए', mr: 'दाव्याच्या रकमेसाठी बँक खाते हवे' }],
  },
  {
    id: 'kcc',
    name: { en: 'Kisan Credit Card', hi: 'किसान क्रेडिट कार्ड', mr: 'किसान क्रेडिट कार्ड' },
    benefit: { en: 'Crop loan up to ₹3 lakh at 4% if repaid on time', hi: 'समय पर चुकाने पर 4% पर ₹3 लाख तक फसल ऋण', mr: 'वेळेवर फेडल्यास 4% दराने ₹3 लाखांपर्यंत पीक कर्ज' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook],
    officialUrl: 'https://www.myscheme.gov.in/schemes/kcc',
    check: (a) =>
      a.hasBankAccount && (a.ownsLand || a.landAcres > 0)
        ? [true, { en: 'You farm land and have a bank account', hi: 'आप खेती करते हैं और बैंक खाता है', mr: 'तुम्ही शेती करता आणि बँक खाते आहे' }]
        : [false, { en: 'Needs a bank account and land you farm', hi: 'बैंक खाता और खेती की ज़मीन चाहिए', mr: 'बँक खाते आणि कसत असलेली जमीन हवी' }],
  },
  {
    id: 'pmksy-drip',
    name: { en: 'PMKSY — Per Drop More Crop (drip subsidy)', hi: 'पीएमकेएसवाई — ड्रिप सब्सिडी', mr: 'पीएमकेएसवाय — ठिबक अनुदान' },
    benefit: { en: 'Up to 55% subsidy on drip/sprinkler for small farmers', hi: 'छोटे किसानों को ड्रिप/स्प्रिंकलर पर 55% तक सब्सिडी', mr: 'अल्पभूधारकांना ठिबक/तुषारवर 55% पर्यंत अनुदान' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook, DOC.quote],
    officialUrl: 'https://pmksy.gov.in',
    check: (a) =>
      a.ownsLand && a.irrigation !== 'drip' && a.irrigation !== 'sprinkler'
        ? [true, { en: "You own land and don't have drip yet", hi: 'आपके पास ज़मीन है और अभी ड्रिप नहीं है', mr: 'तुमची जमीन आहे आणि अजून ठिबक नाही' }]
        : [false, a.ownsLand ? { en: 'You already have drip or sprinkler', hi: 'आपके पास पहले से ड्रिप या स्प्रिंकलर है', mr: 'तुमच्याकडे आधीच ठिबक किंवा तुषार आहे' } : { en: 'Needs land in your name', hi: 'आपके नाम ज़मीन चाहिए', mr: 'तुमच्या नावावर जमीन हवी' }],
  },
  {
    id: 'soil-health-card',
    name: { en: 'Soil Health Card', hi: 'मृदा स्वास्थ्य कार्ड', mr: 'मृदा आरोग्य पत्रिका' },
    benefit: { en: 'Free soil test with fertiliser advice', hi: 'मुफ़्त मिट्टी जाँच और खाद की सलाह', mr: 'मोफत माती परीक्षण आणि खत सल्ला' },
    documents: [DOC.aadhaar, DOC.satbara],
    officialUrl: 'https://soilhealth.dac.gov.in',
    check: () => [true, { en: 'Open to every farmer', hi: 'हर किसान के लिए', mr: 'प्रत्येक शेतकऱ्यासाठी' }],
  },
  {
    id: 'mahadbt-mech',
    name: { en: 'MahaDBT farm mechanisation', hi: 'महाडीबीटी कृषि यंत्रीकरण', mr: 'महाडीबीटी कृषी यांत्रिकीकरण' },
    benefit: { en: '40–50% subsidy on tractor, rotavator, sprayer', hi: 'ट्रैक्टर, रोटावेटर, स्प्रेयर पर 40–50% सब्सिडी', mr: 'ट्रॅक्टर, रोटाव्हेटर, फवारणी यंत्रावर 40–50% अनुदान' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook, DOC.quote],
    officialUrl: 'https://mahadbt.maharashtra.gov.in',
    check: (a) =>
      a.ownsLand && a.hasAadhaar
        ? [true, { en: a.isWoman || a.category === 'sc' || a.category === 'st' ? 'You get the higher 50% rate' : 'You own land and have Aadhaar', hi: a.isWoman || a.category === 'sc' || a.category === 'st' ? 'आपको 50% की ऊँची दर मिलेगी' : 'आपके पास ज़मीन और आधार है', mr: a.isWoman || a.category === 'sc' || a.category === 'st' ? 'तुम्हाला 50% चा जास्त दर मिळेल' : 'तुमची जमीन आणि आधार आहे' }]
        : [false, { en: 'Needs land in your name and Aadhaar', hi: 'आपके नाम ज़मीन और आधार चाहिए', mr: 'तुमच्या नावावर जमीन आणि आधार हवे' }],
  },
  {
    id: 'ambedkar-swavalamban',
    name: { en: 'Dr. Babasaheb Ambedkar Krishi Swavalamban Yojana', hi: 'डॉ. बाबासाहेब आंबेडकर कृषि स्वावलंबन योजना', mr: 'डॉ. बाबासाहेब आंबेडकर कृषी स्वावलंबन योजना' },
    benefit: { en: 'Up to ₹2.5 lakh for a well, pump, drip', hi: 'कुआँ, पंप, ड्रिप के लिए ₹2.5 लाख तक', mr: 'विहीर, पंप, ठिबकसाठी ₹2.5 लाखांपर्यंत' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook, DOC.caste],
    officialUrl: 'https://mahadbt.maharashtra.gov.in',
    check: (a) =>
      a.category === 'sc' && a.ownsLand
        ? [true, { en: 'For SC farmers who own land', hi: 'ज़मीन वाले अनुसूचित जाति के किसानों के लिए', mr: 'जमीन असलेल्या अनुसूचित जातीच्या शेतकऱ्यांसाठी' }]
        : [false, { en: 'Only for SC farmers who own land', hi: 'केवल ज़मीन वाले अनुसूचित जाति के किसान', mr: 'फक्त जमीन असलेले अनुसूचित जातीचे शेतकरी' }],
  },
]

export function matchSchemes(answers: SchemeAnswers, lang: Lang): SchemeMatch {
  const schemes: SchemeResult[] = SCHEMES.map((s) => {
    const [eligible, reason] = s.check(answers)
    return {
      id: s.id,
      name: L(s.name, lang),
      eligible,
      reasons: [L(reason, lang)],
      benefit: L(s.benefit, lang),
      documents: LA(s.documents, lang),
      officialUrl: s.officialUrl,
    }
  })
  schemes.sort((a, b) => Number(b.eligible) - Number(a.eligible))
  return { schemes }
}
