/**
 * Bookish / Sanskrit-heavy words that small children don't understand when LISTENING.
 * For ages 2–7 any match FAILS the story and the rewriter is told the simple word to use.
 * (Ages 8–9: the critic judges vocabulary instead.) Edit freely as review finds more.
 * Matching is on whole words, including common suffixed forms listed here.
 */
export const HARD_WORDS: Record<string, string> = {
  अनपेक्षित: 'अचानक / वाटलं नव्हतं असं',
  अनपेक्षितपणे: 'अचानक',
  आश्चर्यचकित: 'थक्क / नवल वाटलं',
  आश्चर्यचकित्त: 'थक्क',
  अचानकपणे: 'अचानक',
  निर्णय: 'ठरवलं',
  परिस्थिती: '(सोप्या शब्दात सांगा)',
  समस्या: 'अडचण',
  संकट: 'अडचण',
  उपाय: 'युक्ती',
  आवश्यक: 'हवं / लागणार',
  तात्काळ: 'लगेच',
  त्वरित: 'लगेच',
  संपूर्ण: 'सगळं',
  अत्यंत: 'खूप',
  अतिशय: 'खूप',
  आनंदित: 'खूश',
  भयभीत: 'घाबरलेला',
  क्षणार्धात: 'लगेच',
  अविश्वसनीय: 'भारी / नवलाचं',
  विलक्षण: 'वेगळंच',
  अद्भुत: 'जादूसारखं / भारी',
  प्रचंड: 'खूप मोठा',
  निरीक्षण: 'नीट पाहिलं',
  प्रतिबिंब: 'पाण्यात दिसणारं चित्र',
  उत्सुकतेने: 'उत्सुकतेनं → "काय असेल बरं?" म्हणत',
  विचारमग्न: 'विचार करत',
  निराश: 'हिरमुसला / वाईट वाटलं',
  प्रयत्नशील: 'प्रयत्न करत',
  सहकार्य: 'मदत',
  यशस्वी: 'जमलं',
  यशस्वीपणे: 'नीट',
  अद्वितीय: 'वेगळा',
  सुरक्षित: 'नीट / काळजीने',
  अंतिम: 'शेवटचा',
  प्रारंभ: 'सुरुवात',
  तत्पर: 'तयार',
  सावधगिरीने: 'हळूच / जपून',
  मनोमन: 'मनात',
  हर्ष: 'आनंद',
  हर्षभरित: 'खूश',
  विस्मय: 'नवल',
};

export function findHardWords(text: string): string[] {
  const tokens = text.split(/[^\p{L}\p{M}]+/u).filter(Boolean);
  const found = new Set<string>();
  for (const t of tokens) if (Object.prototype.hasOwnProperty.call(HARD_WORDS, t)) found.add(t);
  return [...found];
}

/** Joined consonants (e.g. "द्र" in चंद्रू) are hard for 2–5-year-olds to say. */
export function isEasyName(name: string): boolean {
  return !name.includes('्'); // Devanagari virama (halant)
}
