/**
 * Hindi words that must never appear in a GOSHTI story. Any match FAILS the story and the
 * rewriter is told which words to replace. Edit freely as human review finds more.
 *
 * Only add words that are NOT also normal Marathi — e.g. never "आई" (Marathi: mother),
 * "का" (why), "की" (that), "तो" (he), "दोस्त" / "साथ" / "जल्दी" (common in spoken Marathi).
 * Matching is on whole words only.
 */
export const HINDI_WORDS: Record<string, string> = {
  // word: Marathi suggestion (shown to the rewriter)
  बाल्टी: 'बादली',
  लेकिन: 'पण',
  बहुत: 'खूप',
  भी: 'पण / सुद्धा',
  नहीं: 'नाही',
  नही: 'नाही',
  है: '(Marathi verb form, e.g. आहे)',
  हैं: 'आहेत',
  था: 'होता',
  थी: 'होती',
  थे: 'होते',
  मैं: 'मी',
  हम: 'आम्ही / आपण',
  मुझे: 'मला',
  उसे: 'त्याला / तिला',
  उसका: 'त्याचा',
  उसकी: 'त्याची / तिची',
  क्या: 'काय',
  क्यों: 'का',
  कैसे: 'कसे',
  कहाँ: 'कुठे',
  यहाँ: 'इथे',
  वहाँ: 'तिथे',
  अभी: 'आत्ता',
  कभी: 'कधी',
  और: 'आणि',
  सब: 'सगळे',
  पानी: 'पाणी',
  बच्चा: 'मूल / बाळ',
  बच्चे: 'मुलं',
  लड़का: 'मुलगा',
  लड़की: 'मुलगी',
  गया: 'गेला',
  गयी: 'गेली',
  गई: 'गेली',
  आया: 'आला',
  किया: 'केलं',
  कहा: 'म्हणाला / म्हणाली',
  बोला: 'म्हणाला',
  देखो: 'बघ / बघा',
  देखा: 'पाहिलं',
  चलो: 'चला',
  रहा: '(Marathi continuous form)',
  रही: '(Marathi continuous form)',
  हुआ: 'झालं',
  हुई: 'झाली',
  लिए: 'साठी',
  में: 'मध्ये / त',
  अंदर: 'आत',
  बाहर: 'बाहेर',
  ऊपर: 'वर',
  नीचे: 'खाली',
  ज़्यादा: 'जास्त',
  ज्यादा: 'जास्त',
  ज़रूर: 'नक्की',
  सोचा: 'विचार केला',
};

/** Returns the distinct Hindi words found (whole-word match). */
export function findHindiWords(text: string): string[] {
  const tokens = text.split(/[^\p{L}\p{M}]+/u).filter(Boolean);
  const found = new Set<string>();
  for (const t of tokens) if (Object.prototype.hasOwnProperty.call(HINDI_WORDS, t)) found.add(t);
  return [...found];
}
