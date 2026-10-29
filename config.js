window.PORSCHE_CONFIG = {
  breakpoint: 768,
  frameRate: 0.15,
  pixelRatioCap: 2,
  maxCachedFrames: 12,
  hero: {
    scrollVh: 600,
    frameCount: 119,
    path: "assets/frames/hero/frame_{frame}.jpg",
    initialFrames: 8,
    chapters: [
      { start: 0, end: 0.12 },
      { start: 0.22, end: 0.4 },
      { start: 0.5, end: 0.68 },
      { start: 0.8, end: 1 }
    ]
  },
  reveal: {
    scrollVh: 350,
    frameCount: 2,
    path: ["assets/chapters/assembled.webp", "assets/chapters/exploded.webp"],
    transition: "crossfade"
  },
  lineup: [
    {
      number: "01",
      name: "911 · STUDIO",
      file: "911-studio-pair.webp",
      alt: "Porsche 911 shown in side and rear studio views",
      description: "Studio study · side and rear views."
    },
    {
      number: "02",
      name: "911 · FRONT",
      file: "911-studio-front.webp",
      alt: "Porsche 911 in a front three-quarter studio view",
      description: "Studio study · front three-quarter."
    },
    {
      number: "03",
      name: "911 · CITY",
      file: "911-night-rear.webp",
      alt: "Porsche 911 seen from behind on a dark city street",
      description: "After dark · city approach."
    },
    {
      number: "04",
      name: "911 · LIGHT",
      file: "911-night-lights.webp",
      alt: "Porsche 911 rear light signature at night",
      description: "After dark · rear light signature."
    },
    {
      number: "05",
      name: "911 · PROFILE",
      file: "911-side-profile.webp",
      alt: "Porsche 911 side profile on a night road",
      description: "After dark · side profile."
    }
  ]
};
