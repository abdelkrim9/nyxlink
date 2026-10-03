// Le corps de NYX — la mascotte animée d'Eddies (SVG), reprise telle quelle. Il suit le pointeur
// des yeux, cligne, et son humeur dit ce qu'il fait : il écoute (micro), il réfléchit (Claude),
// il dort (inactivité), sinon il est là. Le style (.nyxm …) vit dans index.html.

export const MOODS = {
  idle: { eye: 'norm', curve: [0, 0, 0, 0, 0, 0, 0] },
  happy: { eye: 'happy', curve: [-3, -1, 1, 2, 1, -1, -3] },
  thinking: { eye: 'scan', curve: [0, 0, 0, 0, 0, 0, 0] },
  listening: { eye: 'norm', curve: [0, 0, 0, 0, 0, 0, 0] },
  sleep: { eye: 'sleep', curve: [1, 1, 1, 1, 1, 1, 1] }
};
const NYX_MOODS = MOODS;

export function nyxSVG(p, mood) {
  const m=NYX_MOODS[mood]?mood:'idle';
  const eye=(cx,side)=>`<g transform="translate(${cx} 100)"><g class="eye-inner">
      <rect class="v v-norm eye-fill" x="-9" y="-4.5" width="18" height="9" rx="1"/>
      <path class="v v-happy eye-stroke" d="M-9 4 L0 -4 L9 4" fill="none" stroke-width="3.2" stroke-linecap="square"/>
      <polygon class="v v-angry eye-fill" points="${side<0?'-9,-4 9,1.5 9,5 -9,5':'-9,1.5 9,-4 9,5 -9,5'}"/>
      <rect class="v v-sleep eye-fill" x="-9" y="1" width="18" height="2.4"/>
      <rect class="v v-scan eye-fill" x="-4.5" y="-4.5" width="9" height="9"/></g></g>`;
  const spikes=[[80,22,-6],[90,32,-2],[100,38,4],[110,30,9],[120,18,13]].map(([x,h,dx])=>
    `<polygon class="spike" points="${x-6},52 ${x+6},52 ${x+dx},${52-h}" fill="url(#${p}mh)" stroke="#ff3e6c" stroke-width=".8"/>`).join('');
  const bars=Array.from({length:7},(_,i)=>`<rect class="bar" x="${83.5+i*5}" y="129" width="3" height="4"/>`).join('');
  return `<svg class="nyxm" data-mood="${m}" data-eye="${NYX_MOODS[m].eye}" viewBox="0 0 200 240" aria-hidden="true">
  <defs>
    <linearGradient id="${p}ch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3a4a"/><stop offset=".55" stop-color="#151d27"/><stop offset="1" stop-color="#0a0f14"/></linearGradient>
    <linearGradient id="${p}mh" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b44fff"/><stop offset="1" stop-color="#ff3e6c"/></linearGradient>
    <linearGradient id="${p}sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="${p}gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="${p}bl" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="${p}vc"><path d="M57 88 L143 88 L147 113 L53 113 Z"/></clipPath>
  </defs>
  <ellipse class="shadow" cx="100" cy="226" rx="40" ry="6" fill="#000" opacity=".55"/>
  <g class="float"><g class="body"><g class="squash">
    <ellipse class="thrust" cx="100" cy="188" rx="20" ry="6" fill="#00d4ff" filter="url(#${p}bl)" opacity=".85"/>
    <path d="M84 158 C82 175 70 182 72 198" stroke="#1e3a4a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M116 158 C120 172 132 178 128 194" stroke="#2a5068" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M100 160 L100 180" stroke="#1e3a4a" stroke-width="4" stroke-linecap="round"/>
    <circle cx="72" cy="199" r="2.6" fill="#b44fff"/><circle cx="128" cy="195" r="2.2" fill="#ff3e6c"/><circle cx="100" cy="182" r="2.4" fill="#00d4ff"/>
    <g>${spikes}</g>
    <line x1="149" y1="92" x2="162" y2="56" stroke="#2a5068" stroke-width="2"/>
    <circle class="led" cx="162" cy="55" r="3" fill="#00ff9f" filter="url(#${p}gl)"/>
    <path d="M60 70 L80 46 L120 46 L140 70 L149 110 L136 146 L116 162 L84 162 L64 146 L51 110 Z" fill="url(#${p}ch)" stroke="#ff3e6c" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M80 46 L120 46 L130 58 L70 58 Z" fill="url(#${p}sh)"/>
    <path d="M64 146 L74 128 M136 146 L126 128 M51 110 L60 116 M149 110 L140 116" stroke="#2a5068" stroke-width="1"/>
    <path d="M89 63 L100 72 L111 63" stroke="#ff3e6c" stroke-width="2" fill="none" filter="url(#${p}gl)"/>
    <rect x="145" y="90" width="11" height="24" rx="2" fill="#111820" stroke="#2a5068"/>
    <circle class="led" cx="150.5" cy="97" r="2" fill="#ff3e6c"/>
    <rect x="148" y="103" width="5" height="1.4" fill="#2a5068"/><rect x="148" y="106.5" width="5" height="1.4" fill="#2a5068"/>
    <g fill="#7a9db0" opacity=".55"><rect x="60" y="120" width="1.4" height="11"/><rect x="62.6" y="120" width="2.6" height="11"/><rect x="66.4" y="120" width="1" height="11"/><rect x="68.6" y="120" width="2" height="11"/><rect x="71.6" y="120" width="1" height="11"/></g>
    <text x="66" y="137" font-family="Share Tech Mono,monospace" font-size="4.2" fill="#3d6070" text-anchor="middle">NYX-0451</text>
    <path d="M57 88 L143 88 L147 113 L53 113 Z" fill="#05080b" stroke="#00d4ff" stroke-width="1.4"/>
    <g clip-path="url(#${p}vc)">
      <rect class="visor-tint" x="50" y="86" width="100" height="30"/>
      <rect class="scan" x="56" y="88" width="6" height="26" fill="#00d4ff" opacity=".35"/>
      <g class="look" filter="url(#${p}gl)">${eye(81,-1)}${eye(119,1)}</g>
      <path d="M60 90 L140 90" stroke="#fff" stroke-opacity=".12" stroke-width="1"/>
    </g>
    <path d="M75 121 L125 121 L120 142 L80 142 Z" fill="#0a0f14" stroke="#2a5068" stroke-width="1.2"/>
    <g class="mouth" filter="url(#${p}gl)">${bars}</g>
  </g></g></g>
  <g class="zzz"><text x="150" y="70" font-size="13">Z</text><text x="160" y="58" font-size="10">z</text><text x="168" y="48" font-size="8">z</text></g>
</svg>`;
}

/**
 * Un corps vivant dans `host`. `getMood()` est lu à chaque image : l'app décide, le corps suit.
 * Rend { setMood, lookAt, talk(ms), poke() }.
 */
export function createBody(host, prefix, getMood) {
  host.insertAdjacentHTML('afterbegin', nyxSVG(prefix, getMood()));
  const svg = host.querySelector('svg.nyxm');
  const look = svg.querySelector('.look'), body = svg.querySelector('.body'), bars = [...svg.querySelectorAll('.bar')];
  let ex = 0, ey = 0, tx = 0, ty = 0, lean = 0, talkUntil = 0, lastMouth = 0, shown = '';
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = t => {
    const m = getMood();
    if (m !== shown) { shown = m; svg.dataset.mood = m; svg.dataset.eye = MOODS[m].eye; }
    let gx = m === 'sleep' ? 0 : tx, gy = m === 'sleep' ? 2 : ty;
    if (m === 'thinking') { gx = Math.sin(t / 260) * 8; gy = 0; }
    if (m === 'listening') { gx = 0; gy = 0; }
    ex += (gx - ex) * 0.14; ey += (gy - ey) * 0.14;
    look.setAttribute('transform', `translate(${ex.toFixed(2)} ${ey.toFixed(2)})`);
    lean += ((m === 'sleep' ? -6 : ex * 0.9) - lean) * 0.1;
    body.setAttribute('transform', `rotate(${lean.toFixed(2)} 100 110)`);
    if (t - lastMouth > 70) {
      lastMouth = t;
      const parle = Date.now() < talkUntil, curve = MOODS[m].curve;
      bars.forEach((bar, i) => {
        const h = parle ? 2 + Math.random() * (i > 1 && i < 5 ? 11 : 7) : (m === 'sleep' ? 1.5 : 3.2);
        bar.setAttribute('height', h.toFixed(1));
        bar.setAttribute('y', (131 + (parle ? 0 : curve[i]) - h / 2).toFixed(1));
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  (function cligne() {
    setTimeout(() => {
      if (getMood() !== 'sleep' && !calme && !document.hidden) {
        svg.classList.add('blink'); setTimeout(() => svg.classList.remove('blink'), 130);
      }
      cligne();
    }, 2600 + Math.random() * 3400);
  })();
  return {
    lookAt(px, py) {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      const k = Math.max(r.width, 160) * 1.4;
      tx = Math.max(-1, Math.min(1, (px - r.left - r.width / 2) / k)) * 8;
      ty = Math.max(-1, Math.min(1, (py - r.top - r.height * 100 / 240) / k)) * 3.2;
    },
    talk(on) { talkUntil = on ? Date.now() + 60000 : 0; },
    poke() { svg.classList.remove('poked'); void svg.getBoundingClientRect(); svg.classList.add('poked'); }
  };
}
