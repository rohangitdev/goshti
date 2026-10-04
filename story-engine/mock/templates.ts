import type { StoryCategory } from '../categories';
import type { VoiceStyle } from '../schemas';
import type { SfxId } from '../sfx';

/**
 * Hand-written placeholder story skeletons, one per category, used by the mock provider
 * so the full pipeline can run end to end without a model (no GEMINI_API_KEY, tests,
 * and the app's seed stories).
 */
export interface MockCharacter {
  id: string;
  name: string;
  description: string;
  role: 'HERO' | 'FRIEND' | 'HELPER';
  voiceStyle: VoiceStyle;
}

export interface MockTemplate {
  title: string;
  summary: string;
  characters: MockCharacter[];
  /** Opening sentence introducing the hero in their setting. */
  opening: string;
  setting: string;
  goal: string;
  problem: string;
  heroLine: string;
  attempts: { text: string; sfx?: SfxId }[];
  twist: string;
  twistSfx?: SfxId;
  resolution: string;
  closing: string;
  positiveValue: string;
  emotionalArc: string[];
  humourStyle: string;
  ambience: SfxId;
  heroSfx?: SfxId;
}

export const MOCK_TEMPLATES: Record<StoryCategory, MockTemplate> = {
  animals: {
    title: 'गोलू हत्ती आणि उंच आंबा',
    summary: 'छोट्या हत्तीला हवा आहे फांदीवरचा पिकलेला आंबा.',
    characters: [
      { id: 'golu', name: 'गोलू', description: 'छोटा, गुबगुबीत हत्ती', role: 'HERO', voiceStyle: 'GENTLE_GIANT' },
      { id: 'chinki', name: 'चिंकी', description: 'चपळ खार', role: 'FRIEND', voiceStyle: 'SQUEAKY' },
    ],
    opening: 'एका हिरव्यागार जंगलात गोलू नावाचा एक छोटा, गुबगुबीत हत्ती राहत होता.',
    setting: 'आंब्याच्या मोठ्या झाडाजवळचं हिरवंगार जंगल',
    goal: 'एके दिवशी गोलूला झाडाच्या सगळ्यात उंच फांदीवर एक पिवळाधमक, पिकलेला आंबा दिसला.',
    problem: 'पण तो आंबा खूप उंच होता. गोलूची सोंड तिथपर्यंत पोहोचतच नव्हती.',
    heroLine: 'मला तो आंबा हवाय! कसा बरं मिळेल?',
    attempts: [
      { text: 'गोलूने टाचा उंचावल्या, सोंड ताणली, अजून ताणली... पण आंबा अजून दूरच!' },
      { text: 'मग त्याने झाड जोरात हलवलं. धप्प! पानं पडली, फुलं पडली, पण आंबा काही पडला नाही.', sfx: 'WHOOSH_SOFT' },
    ],
    twist: 'तेवढ्यात वरून चिंकी खार म्हणाली, "गोलू, मी वर चढते. तू फक्त खाली नीट झेल!"',
    twistSfx: 'BIRDS',
    resolution:
      'चिंकी सरसर वर चढली, तिने आंबा तोडला, आणि गोलूने तो सोंडेत अलगद झेलला. मग दोघांनी तो गोड आंबा अर्धा-अर्धा वाटून खाल्ला.',
    closing: 'एकट्याला जमलं नाही, ते दोघांनी मिळून जमवलं.',
    positiveValue: 'मैत्री आणि एकमेकांना मदत',
    emotionalArc: ['curiosity', 'excitement', 'mild worry', 'surprise', 'joy'],
    humourStyle: 'gentle',
    ambience: 'FOREST_AMBIENCE',
    heroSfx: 'ELEPHANT',
  },
  adventure: {
    title: 'मीरा आणि लपलेला साकव',
    summary: 'मीराला डोंगरावरच्या वडापर्यंत पोहोचायचं आहे.',
    characters: [
      { id: 'meera', name: 'मीरा', description: 'धाडसी मुलगी', role: 'HERO', voiceStyle: 'SMALL_CHILD' },
      { id: 'tillu', name: 'टिकू', description: 'मीराचा छोटा कुत्रा', role: 'FRIEND', voiceStyle: 'PLAYFUL' },
    ],
    opening: 'डोंगराच्या पायथ्याशी एका छोट्या गावात मीरा नावाची एक धाडसी मुलगी राहत होती.',
    setting: 'डोंगराच्या पायथ्याशी वसलेलं छोटं गाव',
    goal: 'तिला डोंगरावरच्या जुन्या वडाच्या झाडापर्यंत जायचं होतं, कारण तिथून सगळं गाव दिसतं.',
    problem: 'पण वाटेत एक खळाळता ओढा आडवा आला.',
    heroLine: 'टिकू, आपण हा ओढा कसा पार करायचा?',
    attempts: [
      { text: 'मीराने एका दगडावर पाय ठेवला... दगड डुगडुगला! ती पटकन मागे आली.' },
      { text: 'टिकूने उडी मारली — छपाक! तो पाण्यात पडला आणि कुडकुडत बाहेर आला.', sfx: 'SPLASH' },
    ],
    twist: 'मग मीराला दिसलं — थोडं पुढे, झाडांच्या मागे, एक जुना लाकडी साकव लपलेला होता!',
    twistSfx: 'FOOTSTEPS',
    resolution:
      'दोघं हळूहळू, सावधपणे साकवावरून पलीकडे गेले. वडाच्या झाडाखाली बसून त्यांनी सगळं गाव पाहिलं. आकाश केशरी झालं होतं.',
    closing: 'घाई न करता नीट पाहिलं, तेव्हाच वाट सापडली.',
    positiveValue: 'धीर आणि सावधपणा',
    emotionalArc: ['excited', 'curious', 'worried', 'brave', 'happy'],
    humourStyle: 'gentle',
    ambience: 'WATER_STREAM',
    heroSfx: 'DOG_BARK',
  },
  magic: {
    title: 'सई आणि जादूचा तांब्या',
    summary: 'जादूच्या तांब्याला हवे आहेत खरे शब्द.',
    characters: [
      { id: 'sai', name: 'सई', description: 'उत्सुक मुलगी', role: 'HERO', voiceStyle: 'SMALL_CHILD' },
      { id: 'tambya', name: 'चमचम', description: 'माळ्यावरचा जादूचा पितळी तांब्या', role: 'HELPER', voiceStyle: 'WISE_OLD' },
    ],
    opening: 'आजीच्या जुन्या घराच्या माळ्यावर सईला एक चमकणारा पितळी तांब्या सापडला.',
    setting: 'आजीच्या जुन्या घराचा माळा',
    goal: 'अंगणातली आजीची लाडकी फुलं उन्हात सुकून गेली होती. सईला ती पुन्हा फुलवायची होती.',
    problem: 'पण तांब्याची जादू फक्त खऱ्या शब्दांनी चालते — आणि सईला ते शब्द माहीत नव्हते.',
    heroLine: 'तांब्या, तांब्या, आजीची फुलं परत फुलव ना!',
    attempts: [
      { text: 'सई म्हणाली, "अबरा का डबरा!" तांब्यातून फक्त एक छोटा बुडबुडा निघाला — पॉप!', sfx: 'OBJECT_DROP' },
      { text: 'मग ती ओरडली, "जादू जादू, लवकर कर!" पण तांब्या गप्पच राहिला.' },
    ],
    twist: 'शेवटी सईने हळूच म्हटलं, "आजीला आनंद व्हावा म्हणून मला मदत करशील का, प्लीज?" आणि तांब्या चमकू लागला!',
    twistSfx: 'MAGIC_SPARKLE',
    resolution:
      'तांब्यातून चमचमतं पाणी निघालं, फुलांवर पडलं, आणि सगळी फुलं पुन्हा टवटवीत झाली. आजीने सईला घट्ट मिठी मारली.',
    closing: 'प्रेमाने बोललेले शब्द, हीच खरी जादू.',
    positiveValue: 'प्रेमाने, नम्रपणे बोलणं',
    emotionalArc: ['curiosity', 'excitement', 'mild worry', 'surprise', 'joy'],
    humourStyle: 'silly sounds',
    ambience: 'VILLAGE_AMBIENCE',
  },
  funny: {
    title: 'बंटू माकडाचा खारट लाडू',
    summary: 'घाईघाईत लाडू बनवणाऱ्या बंटूची गंमत.',
    characters: [
      { id: 'bandya', name: 'बंटू', description: 'घाईघाईचा माकड', role: 'HERO', voiceStyle: 'PLAYFUL' },
      { id: 'kasav', name: 'कासवआजोबा', description: 'शांत, हळू चालणारे कासव', role: 'HELPER', voiceStyle: 'WISE_OLD' },
    ],
    opening: 'एका गावात बंटू नावाचा एक माकड राहत होता. तो प्रत्येक काम भरभर, घाईघाईत करायचा.',
    setting: 'जत्रेच्या आदल्या दिवशीचं गाव',
    goal: 'गावच्या जत्रेसाठी त्याला जगातला सगळ्यात मोठा लाडू बनवायचा होता.',
    problem: 'पण घाईत बंटूला साखर कुठली आणि मीठ कुठलं, हेच कळत नव्हतं!',
    heroLine: 'मी आत्ता, लगेच, सगळ्यात मोठा लाडू बनवणार!',
    attempts: [
      { text: 'पहिला लाडू चाखताच बंटूचं तोंड वाकडं झालं. शी! खारट खारट!', sfx: 'LAUGHTER' },
      { text: 'दुसऱ्या वेळी त्याने इतकं तूप घातलं की लाडू हातातून निसटला आणि टुणकन उडाला!', sfx: 'OBJECT_DROP' },
    ],
    twist: 'तेवढ्यात कासवआजोबा हळूहळू आले आणि म्हणाले, "घाई नको रे बाळा. आधी चव घे, मग घाल."',
    resolution:
      'बंटूने हळूहळू, चव घेत घेत लाडू बनवला. जत्रेत सगळ्यांनी तो खाल्ला आणि म्हणाले, "वा! गोड गोड!"',
    closing: 'आणि त्या दिवसापासून बंटू म्हणतो — आधी चव, मग घाई!',
    positiveValue: 'घाई न करता काम नीट करणं',
    emotionalArc: ['excited', 'surprised', 'worried', 'calm', 'happy'],
    humourStyle: 'funny mistakes',
    ambience: 'VILLAGE_AMBIENCE',
    heroSfx: 'LAUGHTER',
  },
  mystery: {
    title: 'ग्रंथालयातले छोटे ठसे',
    summary: 'रात्री पुस्तकं कोण हलवतं?',
    characters: [
      { id: 'riya', name: 'रिया', description: 'हुशार मुलगी', role: 'HERO', voiceStyle: 'SMALL_CHILD' },
      { id: 'mani', name: 'मनी', description: 'रियाची मांजर', role: 'FRIEND', voiceStyle: 'SQUEAKY' },
    ],
    opening: 'शाळेच्या मागे एक जुनं ग्रंथालय होतं. रिया आणि तिची मांजर मनी रोज तिथे जायच्या.',
    setting: 'शाळेच्या मागचं जुनं ग्रंथालय',
    goal: 'रियाला शोधायचं होतं की रोज रात्री पुस्तकं कोण हलवतं.',
    problem: 'रोज सकाळी पुस्तकं जमिनीवर पडलेली दिसायची, पण कोणीच दिसायचं नाही.',
    heroLine: 'मनी, आज आपण हे रहस्य सोडवायचंच!',
    attempts: [
      { text: 'रियाने खिडकीतून डोकावून पाहिलं. आत फक्त अंधार... आणि टक-टक असा आवाज.', sfx: 'DOOR_OPEN' },
      { text: 'मग तिने जमिनीवर थोडं पीठ पसरलं. सकाळी पिठावर छोटे-छोटे पंजांचे ठसे दिसले!' },
    ],
    twist: 'ठसे थेट कपाटामागे जात होते. रियाने हळूच पाहिलं — तिथे एक छोटी खार होती, पुस्तकांमागे शेंगदाणे लपवत!',
    twistSfx: 'CAT_MEOW',
    resolution:
      'रिया आणि मनीने खिडकीजवळ खारीसाठी एक उबदार खोकं ठेवलं. त्या दिवसापासून पुस्तकं जागेवर राहिली, आणि खारीला नवं घर मिळालं.',
    closing: 'नीट पाहिलं, विचार केला, आणि रहस्य सुटलं.',
    positiveValue: 'निरीक्षण आणि दयाळूपणा',
    emotionalArc: ['curious', 'worried', 'curious', 'surprised', 'happy'],
    humourStyle: 'gentle',
    ambience: 'NIGHT_AMBIENCE',
  },
  bedtime: {
    title: 'पिंटू ससा आणि तारे',
    summary: 'तारे मोजता मोजता झोपी जाणारा ससा.',
    characters: [
      { id: 'pintu', name: 'पिंटू', description: 'छोटा पांढरा ससा', role: 'HERO', voiceStyle: 'SMALL_CHILD' },
      { id: 'chandoba', name: 'चांदोबा', description: 'आकाशातला प्रेमळ चांदोबा', role: 'HELPER', voiceStyle: 'WISE_OLD' },
    ],
    opening: 'एका शांत रात्री, हिरव्या कुरणात, पिंटू नावाचा एक छोटा ससा आपल्या बिळाबाहेर बसला होता.',
    setting: 'रात्रीचं शांत कुरण',
    goal: 'पिंटूला झोप येत नव्हती. त्याला आकाशातले सगळे तारे मोजायचे होते.',
    problem: 'पण तारे इतके होते, की मोजता मोजता तो सारखा विसरायचा.',
    heroLine: 'एक... दोन... तीन... अरेच्चा, किती तारे!',
    attempts: [
      { text: 'एक, दोन, तीन... बारा... तेरा... अरे, कुठपर्यंत मोजलं होतं?' },
      { text: 'पुन्हा एक, दोन, तीन... तेवढ्यात एक तारा लुकलुकला, आणि पिंटू पुन्हा विसरला.', sfx: 'OWL' },
    ],
    twist: 'तेव्हा चांदोबा हळूच म्हणाला, "पिंटू, तारे मोजायचे नसतात बाळा. ते तुझ्यावर लक्ष ठेवतात, तू सुखाने झोपावंस म्हणून."',
    resolution:
      'पिंटूने आईच्या उबदार कुशीत डोकं ठेवलं. डोळे हळूहळू मिटले. आणि ताऱ्यांच्या मंद प्रकाशात तो शांत झोपी गेला.',
    closing: 'आता तूही डोळे मिट. तारे आहेत ना, लक्ष ठेवायला. शुभ रात्री.',
    positiveValue: 'शांतता आणि सुरक्षितपणाची भावना',
    emotionalArc: ['calm', 'curious', 'calm', 'sleepy'],
    humourStyle: 'none',
    ambience: 'NIGHT_AMBIENCE',
  },
  festivals: {
    title: 'ओमचा वाकडा आकाशकंदील',
    summary: 'दिवाळीत स्वतः कंदील बनवण्याची धडपड.',
    characters: [
      { id: 'om', name: 'ओम', description: 'उत्साही मुलगा', role: 'HERO', voiceStyle: 'SMALL_CHILD' },
      { id: 'tai', name: 'ताई', description: 'ओमची मोठी बहीण', role: 'HELPER', voiceStyle: 'OLDER_CHILD' },
    ],
    opening: 'दिवाळी जवळ आली होती. घराघरात फराळाचा सुगंध दरवळत होता.',
    setting: 'दिवाळीच्या आधीचं घर आणि अंगण',
    goal: 'ओमला यावर्षी आकाशकंदील विकत नको होता. त्याला तो स्वतः बनवायचा होता.',
    problem: 'पण कागद फाटायचा आणि बांबूच्या काड्या सारख्या सुटायच्या.',
    heroLine: 'मी बनवणार, माझा स्वतःचा कंदील!',
    attempts: [
      { text: 'पहिल्या वेळी ओमने इतका डिंक लावला, की सगळी बोटं चिकट चिकट झाली!', sfx: 'LAUGHTER' },
      { text: 'दुसऱ्या वेळी कंदील तयार झाला... पण वाकडा! एका बाजूला झुकलेला.' },
    ],
    twist: 'ताई हसून म्हणाली, "वाकडा असला तरी तो तुझा आहे ओम. चल, आपण दोघं मिळून त्याला रंगीत झालरी लावू."',
    resolution:
      'संध्याकाळी तो रंगीबेरंगी कंदील दारात लावला. आत दिवा लागला, आणि अंगणभर सुंदर प्रकाश पसरला. आजी म्हणाली, "हा तर सगळ्यात सुंदर कंदील!"',
    closing: 'स्वतःच्या हातांनी बनवलेल्या गोष्टीचा आनंद काही वेगळाच असतो.',
    positiveValue: 'स्वतः प्रयत्न करण्याचा आनंद',
    emotionalArc: ['excited', 'worried', 'worried', 'happy', 'happy'],
    humourStyle: 'gentle',
    ambience: 'CITY_AMBIENCE',
    heroSfx: 'BELL',
  },
  space: {
    title: 'चिऊ रॉकेट आणि हरवलेला तारा',
    summary: 'छोट्या रॉकेटला सापडतो एक रुसलेला तारा.',
    characters: [
      { id: 'chiu', name: 'चिऊ', description: 'छोटंसं, उत्साही रॉकेट', role: 'HERO', voiceStyle: 'SMALL_CHILD' },
      { id: 'tara', name: 'लुकलुक', description: 'रुसलेला छोटा तारा', role: 'FRIEND', voiceStyle: 'SQUEAKY' },
    ],
    opening: '"तीन... दोन... एक... झूम!" चिऊ रॉकेट पहिल्यांदाच एकटं आकाशात उडालं होतं.',
    setting: 'चंद्राच्या पलीकडचं शांत अंतराळ',
    goal: 'चिऊला चंद्राभोवती एक गोल फेरी मारून परत यायचं होतं.',
    problem: 'पण वाटेत त्याला एक छोटा तारा दिसला — त्याचा प्रकाश अगदी मंद झाला होता.',
    heroLine: 'अरे, तू असा अंधारात का बसलायस?',
    attempts: [
      { text: 'चिऊने आपले दिवे लुकलुकवले. "बघ, असं चमकायचं!" पण तारा अजूनच रुसला.' },
      { text: 'मग चिऊने गोल गोल गिरकी घेतली. तारा हसला... पण फक्त थोडासा.', sfx: 'WHOOSH_SOFT' },
    ],
    twist: 'तेव्हा ताऱ्याने हळूच सांगितलं, "माझे सगळे मित्र पलीकडे आहेत. मी एकटा मागे राहिलो."',
    twistSfx: 'MAGIC_SPARKLE',
    resolution:
      'चिऊने ताऱ्याला आपल्या टोकावर बसवलं आणि हळूहळू त्याच्या मित्रांपर्यंत नेलं. तिथे पोहोचताच लुकलुक पुन्हा लखलखू लागला.',
    closing: 'आणि आजही रात्री आकाशात एक तारा जरा जास्तच चमकतो — चिऊला धन्यवाद म्हणायला.',
    positiveValue: 'दयाळूपणा',
    emotionalArc: ['excitement', 'curiosity', 'empathy', 'relief', 'warmth'],
    humourStyle: 'gentle',
    ambience: 'WIND',
  },
};
