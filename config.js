window.NOCTIS_CONFIG = {
  breakpoint: 768,
  frameRate: 0.15,
  pixelRatioCap: 2,
  hero: {
    scrollVh: 600,
    frameCount: 119,
    desktopPath: "assets/frames/hero/frame_{frame}.webp",
    mobilePath: "assets/frames/hero-mobile/frame_{frame}.webp",
    initialFrames: 40,
    chapters: [
      { start: 0, end: 0.12 },
      { start: 0.22, end: 0.4 },
      { start: 0.5, end: 0.68 },
      { start: 0.8, end: 1 }
    ]
  },
  dismantle: {
    scrollVh: 350,
    frameCount: 1,
    desktopPath: "assets/frames/dismantle/frame_{frame}.webp",
    mobilePath: "assets/frames/dismantle-mobile/frame_{frame}.webp",
    callouts: [
      {
        label: "BODY",
        detail: "Carbon composite monocoque",
        x: 18,
        y: 38,
        reveal: 0.72
      },
      {
        label: "BATTERY",
        detail: "110 kWh structural pack",
        x: 38,
        y: 76,
        reveal: 0.78
      },
      {
        label: "DRIVE",
        detail: "Dual axial-flux motors, 680 kW",
        x: 74,
        y: 60,
        reveal: 0.84
      },
      {
        label: "LIGHT",
        detail: "Single-line LED signature",
        x: 83,
        y: 34,
        reveal: 0.9
      }
    ]
  },
  lineup: [
    {
      number: "01",
      name: "GT-E",
      file: "gt-e.webp",
      description: "The grand tourer.",
      range: "640 km",
      acceleration: "3.1 s",
      power: "680 kW",
      colors: ["#242629", "#d9d7d0", "#26354a", "#8d2220"]
    },
    {
      number: "02",
      name: "S",
      file: "s.webp",
      description: "Four doors, no compromise.",
      range: "600 km",
      acceleration: "3.6 s",
      power: "520 kW",
      colors: ["#dedbd2", "#1a1b1e", "#616b76", "#8d2220"]
    },
    {
      number: "03",
      name: "X",
      file: "x.webp",
      description: "Higher, never heavier.",
      range: "560 km",
      acceleration: "4.2 s",
      power: "480 kW",
      colors: ["#1e2b3c", "#dad6cc", "#25272b", "#596558"]
    },
    {
      number: "04",
      name: "R",
      file: "r.webp",
      description: "Built for the track.",
      range: "420 km",
      acceleration: "2.4 s",
      power: "900 kW",
      colors: ["#151619", "#6f1c1b", "#d6d4ce", "#454c55"]
    },
    {
      number: "05",
      name: "ONE",
      file: "one.webp",
      description: "The future, early.",
      range: "Concept",
      acceleration: "—",
      power: "—",
      colors: ["#c6c7c5", "#181a1d", "#8d2220", "#26354a"]
    }
  ]
};
