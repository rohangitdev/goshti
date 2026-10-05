/**
 * Aaji's scenes, drawn in code (flat picture-book style; no generated images).
 *   room       — Aaji in her wooden chair by the lamp, evening window behind her
 *   night      — under the big tree on a clear starry night, lantern glowing
 *   courtyard  — evening in the angan: tulsi, rangoli, sunset sky
 * The only motion is a few stars twinkling slowly at night (off when "reduce motion" is on).
 * A designer can later replace any scene without touching the screens.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { SCENE_LABEL, type SceneId } from '@/utils/scene';

const W = 390;
const H = 300;

interface Props {
  scene: SceneId;
  /** Two children sitting in front of Aaji (Welcome screen). */
  withChildren?: boolean;
}

export function AajiScene({ scene, withChildren = false }: Props) {
  // Gradient ids must be unique per picture (on web, several pictures share one document).
  const p = `s${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={SCENE_LABEL[scene]} style={styles.fill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {scene === 'room' ? <Room p={p} /> : scene === 'night' ? <Night p={p} /> : <Courtyard p={p} />}
        <Aaji x={135} y={scene === 'room' ? 78 : 84} />
        {withChildren ? <Children /> : null}
      </Svg>
      {scene === 'night' ? <Twinkles /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Aaji (shared by every scene). Local box ≈ 120 × 170.
// ---------------------------------------------------------------------------

const SKIN = '#C98B5B';
const SKIN_DARK = '#A86E44';
const SAREE = '#9E2A3A';
const PALLU = '#B83C4C';
const ZARI = '#E3A23A';
const BLOUSE = '#3E7D5A';
const HAIR = '#BDB7B0';
const WOOD = '#8B5A2B';

function Aaji({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      {/* chair */}
      <Rect x={18} y={36} width={84} height={98} rx={16} fill={WOOD} />
      <Rect x={26} y={44} width={68} height={82} rx={11} fill="#A86F35" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Line key={`v${i}`} x1={34 + i * 13} y1={48} x2={34 + i * 13} y2={122} stroke="#C08A4E" strokeWidth={1.2} opacity={0.6} />
      ))}
      <Rect x={2} y={98} width={20} height={9} rx={4.5} fill={WOOD} />
      <Rect x={98} y={98} width={20} height={9} rx={4.5} fill={WOOD} />
      <Rect x={12} y={150} width={9} height={22} rx={3} fill="#6E4420" />
      <Rect x={99} y={150} width={9} height={22} rx={3} fill="#6E4420" />

      {/* saree: lap and legs */}
      <Path d="M24 112 Q60 98 96 112 L104 164 Q60 172 16 164 Z" fill={SAREE} />
      <Path d="M17 160 Q60 168 103 160" stroke={ZARI} strokeWidth={4} fill="none" />
      {/* feet */}
      <Ellipse cx={46} cy={168} rx={8} ry={4} fill={SKIN_DARK} />
      <Ellipse cx={74} cy={168} rx={8} ry={4} fill={SKIN_DARK} />

      {/* body */}
      <Path d="M40 70 Q60 61 80 70 L88 118 L32 118 Z" fill={BLOUSE} />
      <Path d="M44 68 L60 64 L92 114 L74 120 Z" fill={PALLU} />
      <Path d="M60 64 L92 114" stroke={ZARI} strokeWidth={3} />
      <Path d="M44 68 L74 120" stroke={ZARI} strokeWidth={2} opacity={0.8} />

      {/* left arm resting on the lap */}
      <Path d="M42 74 L33 98" stroke={BLOUSE} strokeWidth={10} strokeLinecap="round" />
      <Path d="M33 98 L54 110" stroke={SKIN} strokeWidth={8.5} strokeLinecap="round" />
      <Circle cx={57} cy={111} r={5} fill={SKIN} />
      {/* right arm raised, telling the story */}
      <Path d="M80 74 L95 95" stroke={BLOUSE} strokeWidth={10} strokeLinecap="round" />
      <Path d="M95 95 L105 76" stroke={SKIN} strokeWidth={8.5} strokeLinecap="round" />
      <Circle cx={106} cy={72} r={5.5} fill={SKIN} />
      <Circle cx={104} cy={83} r={2.2} fill={ZARI} />

      {/* head */}
      <Rect x={55} y={56} width={10} height={10} rx={3} fill={SKIN} />
      <Circle cx={60} cy={24} r={7.5} fill={HAIR} />
      <Circle cx={60} cy={45} r={17} fill={SKIN} />
      <Path d="M43 44 Q43 26 60 27 Q77 26 77 44 Q71 34 61 33 L60 37 L59 33 Q49 34 43 44 Z" fill={HAIR} />
      <Circle cx={44} cy={50} r={1.8} fill={ZARI} />
      <Circle cx={76} cy={50} r={1.8} fill={ZARI} />
      <Circle cx={60} cy={39} r={2} fill="#C0272D" />
      {/* glasses and smiling eyes */}
      <Circle cx={53} cy={47} r={5.2} fill="#FFFFFF" opacity={0.25} stroke="#5A3A2A" strokeWidth={1.3} />
      <Circle cx={67} cy={47} r={5.2} fill="#FFFFFF" opacity={0.25} stroke="#5A3A2A" strokeWidth={1.3} />
      <Line x1={58.2} y1={47} x2={61.8} y2={47} stroke="#5A3A2A" strokeWidth={1.3} />
      <Path d="M50.5 48 Q53 45.8 55.5 48" stroke="#3D2418" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Path d="M64.5 48 Q67 45.8 69.5 48" stroke="#3D2418" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Circle cx={50} cy={54} r={2.6} fill="#E07A6A" opacity={0.35} />
      <Circle cx={70} cy={54} r={2.6} fill="#E07A6A" opacity={0.35} />
      <Path d="M54.5 55 Q60 60 65.5 55" stroke="#7A3B2A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </G>
  );
}

/** Two children seen from behind, sitting on the floor and listening. */
function Children() {
  const child = (cx: number, shirt: string, hair: string, bow?: boolean) => (
    <G key={cx}>
      <Path d={`M${cx - 20} 300 Q${cx - 18} 268 ${cx} 266 Q${cx + 18} 268 ${cx + 20} 300 Z`} fill={shirt} />
      <Circle cx={cx} cy={256} r={13} fill={hair} />
      {bow ? <Circle cx={cx + 9} cy={248} r={4} fill="#E3A23A" /> : null}
    </G>
  );
  return (
    <G>
      {child(150, '#3E7DA8', '#2B1A12')}
      {child(240, '#E3A23A', '#2B1A12', true)}
    </G>
  );
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

function Room({ p }: { p: string }) {
  return (
    <G>
      <Defs>
        <LinearGradient id={`${p}wall`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F9E3C2" />
          <Stop offset="1" stopColor="#F0C994" />
        </LinearGradient>
        <LinearGradient id={`${p}dusk`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7E6BB0" />
          <Stop offset="0.6" stopColor="#E99A7C" />
          <Stop offset="1" stopColor="#F7C98B" />
        </LinearGradient>
        <RadialGradient id={`${p}lampGlow`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFD27A" stopOpacity={0.75} />
          <Stop offset="1" stopColor="#FFD27A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={`url(#${p}wall)`} />
      {/* window with the evening sky */}
      <Rect x={32} y={42} width={92} height={112} rx={6} fill={WOOD} />
      <Rect x={39} y={49} width={78} height={98} rx={3} fill={`url(#${p}dusk)`} />
      <Circle cx={95} cy={72} r={9} fill="#FFF4CC" />
      <Circle cx={60} cy={64} r={1.4} fill="#FFFFFF" />
      <Circle cx={74} cy={84} r={1.1} fill="#FFFFFF" />
      <Line x1={78} y1={49} x2={78} y2={147} stroke={WOOD} strokeWidth={4} />
      <Line x1={39} y1={98} x2={117} y2={98} stroke={WOOD} strokeWidth={4} />
      <Path d="M28 38 L52 38 Q44 100 54 160 L28 160 Z" fill="#C2562F" />
      <Path d="M36 40 Q32 100 40 158" stroke="#A44723" strokeWidth={2} fill="none" />
      {/* lamp on a little table */}
      <Circle cx={320} cy={150} r={78} fill={`url(#${p}lampGlow)`} />
      <Rect x={290} y={182} width={62} height={10} rx={3} fill={WOOD} />
      <Rect x={298} y={192} width={6} height={44} fill="#6E4420" />
      <Rect x={338} y={192} width={6} height={44} fill="#6E4420" />
      <Path d="M306 182 Q321 196 336 182 Z" fill="#C9972E" />
      <Path d="M321 162 Q314 172 321 180 Q328 172 321 162 Z" fill="#FFB23E" />
      <Path d="M321 168 Q318 174 321 179 Q324 174 321 168 Z" fill="#FFF0B3" />
      {/* small framed picture */}
      <Rect x={240} y={48} width={44} height={36} rx={3} fill={WOOD} />
      <Rect x={245} y={53} width={34} height={26} fill="#F6E7CF" />
      <Path d="M247 77 L257 64 L265 72 L271 66 L277 77 Z" fill="#7FA36B" />
      {/* floor and rug */}
      <Rect x={0} y={232} width={W} height={68} fill="#C98E5A" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Line key={i} x1={i * 64} y1={232} x2={i * 64 - 20} y2={300} stroke="#B87D4B" strokeWidth={1.5} />
      ))}
      <Ellipse cx={195} cy={258} rx={150} ry={30} fill="#B23A48" />
      <Ellipse cx={195} cy={258} rx={138} ry={24} fill="none" stroke={ZARI} strokeWidth={2} strokeDasharray="6 5" />
    </G>
  );
}

const STARS: [number, number, number][] = [
  [262, 22, 1.4], [296, 36, 1], [348, 18, 1.6], [372, 52, 1.1], [242, 58, 1], [312, 92, 1.2], [356, 112, 1],
  [282, 128, 0.9], [226, 20, 1.1], [376, 140, 1.3], [250, 100, 0.8], [330, 140, 0.9], [210, 44, 0.9], [366, 84, 0.8],
  [292, 66, 0.8], [236, 132, 1], [270, 160, 0.9], [350, 168, 0.8],
];
/** Stars that twinkle (overlay), in viewBox coordinates. */
const TWINKLES: [number, number][] = [[302, 24], [338, 70], [258, 84], [372, 26], [228, 110]];

function Night({ p }: { p: string }) {
  return (
    <G>
      <Defs>
        <LinearGradient id={`${p}nightSky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0E1B3D" />
          <Stop offset="0.65" stopColor="#24346E" />
          <Stop offset="1" stopColor="#3E4486" />
        </LinearGradient>
        <RadialGradient id={`${p}moonGlow`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFF6D5" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFF6D5" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${p}lantern`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFC766" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFC766" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={`url(#${p}nightSky)`} />
      {STARS.map(([x, y, r]) => (
        <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={0.85} />
      ))}
      <Circle cx={330} cy={60} r={42} fill={`url(#${p}moonGlow)`} />
      <Circle cx={330} cy={60} r={17} fill="#FFF3C4" />
      <Circle cx={325} cy={56} r={3} fill="#EFE0A8" />
      <Circle cx={336} cy={66} r={2.2} fill="#EFE0A8" />
      {/* hills and ground */}
      <Path d="M0 214 Q70 186 150 206 Q230 184 300 204 Q350 192 390 206 L390 300 L0 300 Z" fill="#1B2650" />
      <Path d="M0 236 Q195 222 390 236 L390 300 L0 300 Z" fill="#2E2A4A" />
      {/* the big tree */}
      <Path d="M58 300 Q66 220 72 160 Q76 120 98 96 L108 104 Q90 128 88 170 Q86 230 92 300 Z" fill="#4A3226" />
      <Path d="M96 120 Q160 98 262 110" stroke="#4A3226" strokeWidth={7} fill="none" strokeLinecap="round" />
      {[
        [40, 70, 46], [96, 46, 50], [160, 52, 44], [214, 70, 34], [20, 120, 34], [130, 92, 40], [70, 104, 38], [190, 98, 28],
      ].map(([cx, cy, r]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#1E3A2E" />
      ))}
      {[
        [84, 34, 22], [150, 40, 18], [36, 60, 18], [200, 62, 14],
      ].map(([cx, cy, r]) => (
        <Circle key={`h${cx}`} cx={cx} cy={cy} r={r} fill="#2A4C3C" />
      ))}
      {/* hanging lantern lighting Aaji */}
      <Circle cx={220} cy={160} r={125} fill={`url(#${p}lantern)`} />
      <Line x1={252} y1={109} x2={252} y2={128} stroke="#8A6A4A" strokeWidth={1.2} />
      <Rect x={245} y={130} width={14} height={18} rx={4} fill="#FFB84D" />
      <Rect x={247} y={133} width={10} height={12} rx={3} fill="#FFE7A6" />
      <Rect x={243} y={127} width={18} height={4} rx={2} fill="#7A5230" />
      <Rect x={243} y={147} width={18} height={3} rx={1.5} fill="#7A5230" />
      {/* fireflies */}
      {[[250, 200], [286, 186], [120, 210], [330, 222]].map(([cx, cy]) => (
        <Circle key={`f${cx}`} cx={cx} cy={cy} r={1.8} fill="#FFE98A" opacity={0.9} />
      ))}
      <Ellipse cx={195} cy={262} rx={120} ry={18} fill="#3A3256" />
    </G>
  );
}

function Courtyard({ p }: { p: string }) {
  return (
    <G>
      <Defs>
        <LinearGradient id={`${p}sunset`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#B98CC0" />
          <Stop offset="0.45" stopColor="#F2A58E" />
          <Stop offset="0.8" stopColor="#FFD39A" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={`url(#${p}sunset)`} />
      <Circle cx={318} cy={176} r={26} fill="#FFE2A3" />
      <Path d="M140 196 Q170 176 200 192 Q240 172 280 190 Q330 176 390 194 L390 230 L140 230 Z" fill="#C98A8E" opacity={0.55} />
      {/* birds */}
      {[[220, 54], [244, 44], [262, 62]].map(([x, y]) => (
        <Path key={`b${x}`} d={`M${x - 7} ${y} Q${x - 3} ${y - 4} ${x} ${y} Q${x + 3} ${y - 4} ${x + 7} ${y}`} stroke="#5B3B4A" strokeWidth={1.6} fill="none" />
      ))}
      {/* house with a tiled roof */}
      <Rect x={0} y={104} width={112} height={132} fill="#EBCB9F" />
      <Path d="M-8 108 L60 70 L128 108 Z" fill="#B5523B" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Line key={`t${i}`} x1={10 + i * 22} y1={102 - (i < 3 ? i * 10 : (4 - i) * 10)} x2={10 + i * 22} y2={108} stroke="#94402D" strokeWidth={1.4} />
      ))}
      <Path d="M30 236 L30 160 Q52 140 74 160 L74 236 Z" fill="#6B3E26" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Path key={`l${i}`} d={`M${30 + i * 8} 152 L${34 + i * 8} 160 L${38 + i * 8} 152 Z`} fill={i % 2 ? '#5E8B5A' : '#E3A23A'} />
      ))}
      {/* courtyard floor */}
      <Rect x={0} y={232} width={W} height={68} fill="#D9A877" />
      {/* tulsi vrindavan */}
      <Rect x={318} y={192} width={46} height={50} fill="#EFE5D2" />
      <Rect x={312} y={186} width={58} height={8} rx={2} fill="#E2D5BC" />
      <Path d="M334 222 L341 210 L348 222 Z" fill="#C2562F" />
      {/* tulsi: thin stems with small leaves */}
      {[[-14, 0.9], [-6, 1], [2, 1.05], [10, 0.95], [16, 0.85]].map(([dx, k]) => (
        <G key={`st${dx}`}>
          <Path d={`M341 186 Q${341 + dx * 0.6} ${180 - 14 * k} ${341 + dx} ${186 - 32 * k}`} stroke="#3F6B36" strokeWidth={1.6} fill="none" />
          {[0.35, 0.6, 0.85, 1].map((t) => {
            const x = 341 + dx * t;
            const y = 186 - 32 * k * t;
            return (
              <G key={`lf${t}`}>
                <Ellipse cx={x - 3.2} cy={y} rx={3.4} ry={1.7} fill="#4E8A4A" transform={`rotate(-25 ${x - 3.2} ${y})`} />
                <Ellipse cx={x + 3.2} cy={y} rx={3.4} ry={1.7} fill="#5B9A55" transform={`rotate(25 ${x + 3.2} ${y})`} />
              </G>
            );
          })}
          <Circle cx={341 + dx} cy={186 - 32 * k - 2} r={1.6} fill="#7A4E8A" />
        </G>
      ))}
      {/* rangoli */}
      <G transform="translate(84 268)">
        <Circle r={22} fill="#F7E7C6" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <Ellipse key={`p${a}`} cx={0} cy={-13} rx={5} ry={9} fill={a % 90 ? '#E3A23A' : '#C2562F'} transform={`rotate(${a})`} />
        ))}
        <Circle r={6} fill="#3E7DA8" />
      </G>
      <Ellipse cx={195} cy={262} rx={110} ry={16} fill="#C99466" />
    </G>
  );
}

// ---------------------------------------------------------------------------
// Gentle twinkle (night only)
// ---------------------------------------------------------------------------

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => active && setReduce(r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

function Twinkles() {
  const reduce = useReduceMotion();
  const [values] = useState(() => TWINKLES.map(() => new Animated.Value(0.3)));
  const loops = useMemo(
    () =>
      values.map((v, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 700),
            Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.3, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ),
      ),
    [values],
  );
  useEffect(() => {
    if (reduce) return;
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [loops, reduce]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.passThrough]}>
      {TWINKLES.map(([x, y], i) => (
        <Animated.View
          key={`${x}-${y}`}
          style={[styles.twinkle, { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, opacity: reduce ? 0.8 : values[i] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  passThrough: { pointerEvents: 'none' },
  twinkle: {
    position: 'absolute',
    width: 4,
    height: 4,
    marginLeft: -2,
    marginTop: -2,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
});
