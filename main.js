(function () {
  "use strict";

  const config = window.NOCTIS_CONFIG;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia(`(max-width: ${config.breakpoint - 1}px)`).matches;
  const pixelRatioCap = config.pixelRatioCap;
  const reducedHeroPanels = [];
  let scrollY = window.scrollY;
  let scrollDirection = 0;
  let hideTimer;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function framePath(sceneConfig, index, mobile) {
    const path = mobile ? sceneConfig.mobilePath : sceneConfig.desktopPath;
    return path.replace("{frame}", String(index + 1).padStart(4, "0"));
  }

  function loadSceneFrames(name, sceneConfig) {
    const cache = new Array(sceneConfig.frameCount).fill(null);
    const promises = new Array(sceneConfig.frameCount).fill(null);

    function load(index) {
      if (index < 0 || index >= sceneConfig.frameCount) {
        return Promise.reject(new RangeError(`${name} frame ${index + 1} is outside the configured frame count.`));
      }
      if (promises[index]) {
        return promises[index];
      }

      promises[index] = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = async () => {
          try {
            if (typeof image.decode === "function") {
              await image.decode();
            }
            cache[index] = image;
            resolve(image);
          } catch (error) {
            reject(new Error(`Could not decode ${framePath(sceneConfig, index, isMobile)}: ${error.message}`));
          }
        };
        image.onerror = () => reject(new Error(`Could not load ${framePath(sceneConfig, index, isMobile)}.`));
        image.src = framePath(sceneConfig, index, isMobile);
      });

      return promises[index];
    }

    return { cache, load, promises };
  }

  function nearestLoadedFrame(cache, target) {
    if (cache[target]) {
      return target;
    }
    for (let distance = 1; distance < cache.length; distance += 1) {
      const before = target - distance;
      const after = target + distance;
      if (before >= 0 && cache[before]) {
        return before;
      }
      if (after < cache.length && cache[after]) {
        return after;
      }
    }
    return -1;
  }

  function drawCoverFit(context, canvas, image) {
    const width = canvas.width;
    const height = canvas.height;
    const portrait = window.innerWidth < config.breakpoint;
    const scale = portrait
      ? Math.min(width / image.width, height / image.height)
      : Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    context.drawImage(image, x, y, drawWidth, drawHeight);
  }

  function createScene(name, section, canvas, sceneConfig) {
    const context = canvas.getContext("2d", { alpha: false });
    const frameSet = loadSceneFrames(name, sceneConfig);
    const scene = {
      name,
      section,
      canvas,
      context,
      frameSet,
      progress: 0,
      currentFrame: 0,
      lastDrawnFrame: -1,
      width: 0,
      height: 0
    };

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (scene.width !== width || scene.height !== height) {
        scene.width = width;
        scene.height = height;
        canvas.width = width;
        canvas.height = height;
        scene.lastDrawnFrame = -1;
      }
    }

    function progress() {
      const distance = section.offsetHeight - window.innerHeight;
      if (distance <= 0) {
        return 0;
      }
      return clamp(-section.getBoundingClientRect().top / distance, 0, 1);
    }

    function render() {
      scene.progress = progress();
      const target = Math.round(scene.progress * (sceneConfig.frameCount - 1));
      scene.currentFrame += (target - scene.currentFrame) * config.frameRate;
      const intendedFrame = Math.round(scene.currentFrame);
      const drawableFrame = nearestLoadedFrame(frameSet.cache, intendedFrame);

      if (drawableFrame < 0 || drawableFrame === scene.lastDrawnFrame) {
        return;
      }

      context.fillStyle = "#07080a";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      if (name === "hero" && scene.progress > 0.95) {
        context.globalAlpha = clamp((1 - scene.progress) / 0.05, 0, 1);
      }
      drawCoverFit(context, canvas, frameSet.cache[drawableFrame]);
      context.restore();
      scene.lastDrawnFrame = drawableFrame;
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    scene.render = render;
    scene.resize = resize;
    return scene;
  }

  const hero = createScene("hero", document.querySelector(".hero-section"), document.getElementById("hero-canvas"), config.hero);
  const dismantle = createScene(
    "dismantle",
    document.querySelector(".dismantle-section"),
    document.getElementById("dismantle-canvas"),
    config.dismantle
  );

  document.querySelectorAll("[data-scene]").forEach((section) => {
    const sceneConfig = config[section.dataset.scene];
    section.style.setProperty("--scroll-height", `${sceneConfig.scrollVh}vh`);
  });

  function updateHeroOverlay(progress) {
    const chapters = Array.from(document.querySelectorAll(".hero-chapter"));
    let activeChapter = 0;

    chapters.forEach((chapter, index) => {
      const [start, end] = chapter.dataset.range.split(",").map(Number);
      const fadeIn = start === 0 ? 1 : clamp((progress - start) / 0.025, 0, 1);
      const fadeOut = end === 1 ? 1 : clamp((end - progress) / 0.025, 0, 1);
      const opacity = reducedMotion
        ? (index === 0 || index === chapters.length - 1 ? 1 : 0)
        : Math.min(fadeIn, fadeOut);
      chapter.style.opacity = opacity.toFixed(3);
      chapter.style.setProperty("--chapter-reveal", opacity.toFixed(3));
      chapter.style.setProperty("--chapter-offset", `${(1 - opacity) * 100}%`);
      chapter.classList.toggle("is-active", opacity > 0.01);
      if (opacity > 0.01) {
        activeChapter = index;
      }
    });

    document.getElementById("chapter-count").textContent = `${String(activeChapter + 1).padStart(2, "0")} / 04`;
    document.getElementById("speed-count").textContent = String(Math.round(progress * 118)).padStart(3, "0");
    document.getElementById("distance-count").textContent = (progress * 4.2).toFixed(1);
    document.querySelector(".hero-section .section-progress").style.setProperty("--progress", `${progress * 100}%`);
  }

  function configureHeroChapters() {
    const chapters = document.querySelectorAll(".hero-chapter");
    if (chapters.length !== config.hero.chapters.length) {
      throw new Error(`Hero chapter count mismatch: expected ${config.hero.chapters.length}, found ${chapters.length}.`);
    }
    chapters.forEach((chapter, index) => {
      const range = config.hero.chapters[index];
      chapter.dataset.range = `${range.start},${range.end}`;
    });
  }

  function createCallouts() {
    const layer = document.getElementById("callout-layer");
    config.dismantle.callouts.forEach((item, index) => {
      const callout = document.createElement("div");
      callout.className = "callout";
      callout.style.left = `${item.x}%`;
      callout.style.top = `${item.y}%`;
      callout.style.setProperty("--callout-offset", item.x > 55 ? "-100%" : "0");
      callout.dataset.reveal = item.reveal;
      callout.innerHTML = `<span class="callout-dot" aria-hidden="true"></span><span class="callout-copy"><strong>${item.label}</strong><span>${item.detail}</span></span>`;
      callout.setAttribute("aria-label", `${item.label}: ${item.detail}`);
      callout.style.transitionDelay = `${index * 80}ms`;
      layer.append(callout);
    });
  }

  function createReducedHeroPanels() {
    if (!reducedMotion) {
      return;
    }

    const heroSection = document.querySelector(".hero-section");
    const panelData = [
      { frame: 0, title: "NOCTIS", copy: "The city is asleep." },
      { frame: Math.round((config.hero.frameCount - 1) * 0.35), title: "NOCTIS", copy: "It doesn't need the city's light." },
      { frame: Math.round((config.hero.frameCount - 1) * 0.65), title: "NOCTIS", copy: "It brings its own." },
      { frame: config.hero.frameCount - 1, title: "GT-E", copy: "640 KM RANGE · DUAL MOTOR" }
    ];
    const container = document.createElement("div");
    container.className = "reduced-hero-panels";
    panelData.forEach((item) => {
      const panel = document.createElement("section");
      panel.className = "reduced-hero-panel";
      const canvas = document.createElement("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `${item.title}. ${item.copy}`);
      const title = document.createElement("h2");
      title.className = "display-type";
      title.textContent = item.title;
      const copy = document.createElement("p");
      copy.textContent = item.copy;
      panel.append(canvas, title, copy);
      container.append(panel);
      reducedHeroPanels.push({ canvas, frame: item.frame });
    });
    heroSection.append(container);
    window.addEventListener("resize", drawReducedHeroPanels, { passive: true });
  }

  function drawReducedHeroPanels() {
    reducedHeroPanels.forEach(({ canvas, frame }) => {
      const imageIndex = nearestLoadedFrame(hero.frameSet.cache, frame);
      if (imageIndex < 0) {
        return;
      }
      const ratio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#07080a";
      context.fillRect(0, 0, width, height);
      drawCoverFit(context, canvas, hero.frameSet.cache[imageIndex]);
    });
  }

  function updateDismantleOverlay(progress) {
    const stage = document.querySelector(".dismantle-stage");
    stage.style.setProperty("--progress", `${progress * 100}%`);
    stage.querySelectorAll(".callout").forEach((callout) => {
      callout.classList.toggle("is-visible", progress >= Number(callout.dataset.reveal));
    });
  }

  function updateScrollEffects() {
    hero.render();
    dismantle.render();
    updateHeroOverlay(hero.progress);
    updateDismantleOverlay(dismantle.progress);

    const statement = document.querySelector(".statement-section");
    const statementProgress = clamp(
      (window.innerHeight - statement.getBoundingClientRect().top) / (window.innerHeight + statement.offsetHeight),
      0,
      1
    );
    const words = statement.querySelectorAll("[data-word-reveal] span");
    words.forEach((word, index) => {
      const threshold = index / Math.max(1, words.length - 1);
      const opacity = 0.15 + 0.85 * clamp((statementProgress * 1.65 - threshold * 0.65) / 0.55, 0, 1);
      word.style.opacity = opacity.toFixed(2);
    });
    requestAnimationFrame(updateScrollEffects);
  }

  function createStatementWords() {
    const heading = document.querySelector("[data-word-reveal]");
    const sentence = heading.textContent.trim();
    heading.setAttribute("aria-label", sentence);
    heading.replaceChildren();
    sentence.split(/\s+/).forEach((word, index, words) => {
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      span.textContent = word + (index < words.length - 1 ? " " : "");
      heading.append(span);
    });
  }

  function createLineup() {
    const container = document.getElementById("lineup-slides");
    config.lineup.forEach((model, index) => {
      const article = document.createElement("article");
      article.className = `model-slide${index === 0 ? " is-open" : ""}`;
      article.dataset.modelIndex = index;
      article.style.transitionDelay = `${index * 80}ms`;
      const specs = [
        ["RANGE", model.range],
        ["0–100 KM/H", model.acceleration],
        ["POWER", model.power]
      ];
      const swatches = model.colors.map((color, colorIndex) =>
        `<button class="color-swatch" type="button" style="--swatch:${color}" aria-label="${model.name} color ${colorIndex + 1}" aria-pressed="${colorIndex === 0}"></button>`
      ).join("");

      article.innerHTML = `
        <button class="slide-trigger" type="button" aria-expanded="${index === 0}" aria-label="Open ${model.name}: ${model.description}" data-cursor-label="${index === 0 ? "CONFIGURE" : "OPEN"}">
          <span class="slide-number">${model.number}</span>
          <span class="slide-vertical-name">${model.name}</span>
          <img class="slide-image" src="assets/cars/${model.file}" alt="${model.name}, NOCTIS electric vehicle concept" width="1600" height="900" loading="${index === 0 ? "eager" : "lazy"}" decoding="async">
          <h3 class="slide-open-title display-type">${model.name}</h3>
        </button>
        <div class="slide-details">
          <p class="slide-description">${model.description}</p>
          <div class="slide-specs">${specs.map(([label, value]) => `<div>${label}<br><span>${value}</span></div>`).join("")}</div>
          <div class="slide-colors" aria-label="Available colors">${swatches}</div>
          <a class="configure-link" href="#reserve" data-cursor-label="CONFIGURE">Configure <span aria-hidden="true">→</span></a>
        </div>`;
      container.append(article);
    });

    container.addEventListener("click", (event) => {
      const swatch = event.target.closest(".color-swatch");
      if (swatch) {
        swatch.parentElement.querySelectorAll(".color-swatch").forEach((button) => {
          button.setAttribute("aria-pressed", String(button === swatch));
        });
        return;
      }

      const trigger = event.target.closest(".slide-trigger");
      if (trigger) {
        setOpenSlide(trigger.closest(".model-slide"));
      }
    });

    container.addEventListener("focusin", (event) => {
      const trigger = event.target.closest(".slide-trigger");
      if (trigger) {
        setOpenSlide(trigger.closest(".model-slide"));
      }
    });

    container.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }
      const trigger = event.target.closest(".slide-trigger");
      if (!trigger) {
        return;
      }
      event.preventDefault();
      const triggers = Array.from(container.querySelectorAll(".slide-trigger"));
      const currentIndex = triggers.indexOf(trigger);
      const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
      const nextIndex = (currentIndex + direction + triggers.length) % triggers.length;
      triggers[nextIndex].focus();
    });

    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !isMobile && !reducedMotion) {
      let hoverTimer;
      let hoveredSlide = null;
      container.addEventListener("pointermove", (event) => {
        const slide = event.target.closest(".model-slide");
        if (!slide || slide === hoveredSlide) {
          return;
        }
        hoveredSlide = slide;
        window.clearTimeout(hoverTimer);
        hoverTimer = window.setTimeout(() => setOpenSlide(slide), 80);
      });
      container.addEventListener("pointerleave", () => {
        hoveredSlide = null;
        window.clearTimeout(hoverTimer);
      });
    }
  }

  function setOpenSlide(activeSlide) {
    document.querySelectorAll(".model-slide").forEach((slide) => {
      const isOpen = slide === activeSlide;
      slide.classList.toggle("is-open", isOpen);
      const trigger = slide.querySelector(".slide-trigger");
      trigger.setAttribute("aria-expanded", String(isOpen));
      trigger.dataset.cursorLabel = isOpen ? "CONFIGURE" : "OPEN";
    });
  }

  function setupReveals() {
    const lineup = document.querySelector(".lineup-section");
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal-on-view, .lineup-section").forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    observer.observe(lineup);
    observer.observe(document.querySelector(".lineup-heading"));
    observer.observe(document.querySelector(".reserve-content"));
  }

  function setupNavigation() {
    const nav = document.getElementById("site-nav");
    window.addEventListener("scroll", () => {
      const nextScrollY = window.scrollY;
      const delta = nextScrollY - scrollY;
      if (Math.abs(delta) > 4) {
        scrollDirection = delta > 0 ? 1 : -1;
        if (nextScrollY > 160 && scrollDirection > 0) {
          nav.classList.add("is-hidden");
        } else {
          nav.classList.remove("is-hidden");
        }
      }
      scrollY = nextScrollY;
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => nav.classList.remove("is-hidden"), 900);
    }, { passive: true });
  }

  function setupGrain() {
    const tile = document.createElement("canvas");
    tile.width = 128;
    tile.height = 128;
    const context = tile.getContext("2d");
    const imageData = context.createImageData(tile.width, tile.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const shade = Math.floor(Math.random() * 256);
      imageData.data[index] = shade;
      imageData.data[index + 1] = shade;
      imageData.data[index + 2] = shade;
      imageData.data[index + 3] = 90;
    }
    context.putImageData(imageData, 0, 0);
    const grain = document.querySelector(".grain");
    grain.style.backgroundImage = `url("${tile.toDataURL("image/png")}")`;
    window.setInterval(() => {
      grain.style.backgroundPosition = `${Math.random() * 24 - 12}px ${Math.random() * 24 - 12}px`;
    }, 125);
  }

  function setupCursor() {
    const cursor = document.getElementById("headlight-cursor");
    if (reducedMotion || isMobile || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let targetX = x;
    let targetY = y;

    window.addEventListener("pointermove", (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      cursor.classList.add("is-visible");
      const action = event.target.closest("a, button");
      cursor.classList.toggle("is-action", Boolean(action));
      cursor.querySelector(".cursor-label").textContent = action
        ? action.dataset.cursorLabel || (action.matches(".reserve-button") ? "RESERVE" : "VIEW")
        : "";
    }, { passive: true });

    window.addEventListener("pointerdown", () => {
      cursor.classList.add("is-pressed");
      window.setTimeout(() => cursor.classList.remove("is-pressed"), 120);
    });

    function follow() {
      x += (targetX - x) * 0.18;
      y += (targetY - y) * 0.18;
      cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      requestAnimationFrame(follow);
    }
    follow();
  }

  function showFrameError(error) {
    console.error(error);
    const preloader = document.getElementById("preloader");
    const copy = document.getElementById("preloader-copy");
    const retry = document.getElementById("preloader-retry");
    document.getElementById("preloader-line").classList.remove("is-complete");
    copy.textContent = `FRAME LOAD FAILED — ${error.message}`;
    retry.hidden = false;
    retry.addEventListener("click", () => window.location.reload(), { once: true });
    document.documentElement.classList.add("is-loading");
    document.documentElement.classList.remove("is-ready");
    document.body.classList.add("is-loading");
  }

  function updatePreloader(loaded, total) {
    const percent = Math.floor((loaded / total) * 100);
    document.getElementById("load-count").textContent = String(percent).padStart(3, "0");
    document.getElementById("preloader-line").style.transform = `scaleX(${percent / 100})`;
  }

  async function preloadHeroStart() {
    const count = Math.min(config.hero.initialFrames, config.hero.frameCount);
    let loaded = 0;
    await Promise.all(Array.from({ length: count }, (_, index) =>
      hero.frameSet.load(index).then(() => {
        loaded += 1;
        updatePreloader(loaded, count);
      })
    ));
    document.getElementById("preloader-line").classList.add("is-complete");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    createReducedHeroPanels();
    document.documentElement.classList.remove("is-loading");
    document.documentElement.classList.add("is-ready");
    document.body.classList.remove("is-loading");
    requestAnimationFrame(updateScrollEffects);
    preloadRest().catch(showFrameError);
  }

  async function preloadRest() {
    const remaining = [];
    for (let index = config.hero.initialFrames; index < config.hero.frameCount; index += 1) {
      remaining.push(index);
    }
    for (let offset = 0; offset < remaining.length; offset += 4) {
      await Promise.all(remaining.slice(offset, offset + 4).map((index) => hero.frameSet.load(index)));
      drawReducedHeroPanels();
    }
    for (let offset = 0; offset < config.dismantle.frameCount; offset += 4) {
      await Promise.all(
        Array.from(
          { length: Math.min(4, config.dismantle.frameCount - offset) },
          (_, index) => dismantle.frameSet.load(offset + index)
        )
      );
    }
  }

  createStatementWords();
  configureHeroChapters();
  createCallouts();
  createLineup();
  setupReveals();
  setupNavigation();
  setupGrain();
  setupCursor();

  preloadHeroStart().catch(showFrameError);
})();
