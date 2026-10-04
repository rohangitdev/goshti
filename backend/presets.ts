/** Test matrix presets for the developer tester. */
export interface Preset {
  label: string;
  request: {
    age: number;
    category: string;
    mode: 'RANDOM' | 'CUSTOM';
    userIdea?: string;
    childName?: string;
  };
}

export const PRESETS: Preset[] = [
  { label: 'Age 2 · Animals · Random', request: { age: 2, category: 'animals', mode: 'RANDOM' } },
  { label: 'Age 3 · Funny · Random', request: { age: 3, category: 'funny', mode: 'RANDOM' } },
  { label: 'Age 4 · Magic · Random', request: { age: 4, category: 'magic', mode: 'RANDOM' } },
  { label: 'Age 5 · Bedtime · Random', request: { age: 5, category: 'bedtime', mode: 'RANDOM' } },
  {
    label: 'Age 6 · Adventure · "एका हत्तीला चंद्रावर जायचं आहे"',
    request: { age: 6, category: 'adventure', mode: 'CUSTOM', userIdea: 'एका हत्तीला चंद्रावर जायचं आहे' },
  },
  {
    label: 'Age 6 · Animals · "एक मांजर क्रिकेट खेळतं"',
    request: { age: 6, category: 'animals', mode: 'CUSTOM', userIdea: 'एक मांजर क्रिकेट खेळतं' },
  },
  {
    label: 'Age 7 · Space · "हत्ती आणि मुंगी अंतराळात गेले"',
    request: { age: 7, category: 'space', mode: 'CUSTOM', userIdea: 'हत्ती आणि मुंगी अंतराळात गेले' },
  },
  { label: 'Age 8 · Mystery · Random', request: { age: 8, category: 'mystery', mode: 'RANDOM' } },
  { label: 'Age 9 · Adventure · Random', request: { age: 9, category: 'adventure', mode: 'RANDOM' } },
  {
    label: 'Age 9 · Adventure · "एका मुलीला शाळेत जायला थोडी भीती वाटते"',
    request: { age: 9, category: 'adventure', mode: 'CUSTOM', userIdea: 'एका मुलीला शाळेत जायला थोडी भीती वाटते' },
  },
  {
    label: 'Same idea, age 3 · "एका हत्तीला चंद्रावर जायचं आहे"',
    request: { age: 3, category: 'adventure', mode: 'CUSTOM', userIdea: 'एका हत्तीला चंद्रावर जायचं आहे' },
  },
  {
    label: 'Guardrail · OTHER · "भारताची राजधानी कोणती?"',
    request: { age: 7, category: 'adventure', mode: 'CUSTOM', userIdea: 'भारताची राजधानी कोणती?' },
  },
];
