(function () {
  "use strict";

  const config = window.PORSCHE_CONFIG;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const maxCachedFrames = config.maxCachedFrames;
  const reducedHeroPanels = [];
  let scrollY = window.scrollY;
  let scrollDirection = 0;
  let hideTimer;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isMobileViewport() {
    return window.matchMedia(`(max-width: ${config.breakpoint - 1}px)`).matches;
  }

  function framePath(sceneConfig, index) {
    if (Array.isArray(sceneConfig.path)) {
      return sceneConfig.path[index];
    }
    return sceneConfig.path.replace("{frame}", String(index + 1).padStart(4, "0"));
  }

  function trimFrameCache(frameSet, center) {
    const loaded = frameSet.cache
      .map((bitmap, index) => bitmap ? { bitmap, index, distance: Math.abs(index - center) } : null)
      .filter(Boolean)
      .sort((left, right) => left.distance - right.distance);

    loaded.slice(maxCachedFrames).forEach(({ index, bitmap }) => {
      bitmap.close();
      frameSet.cache[index] = null;
    });
  }

  function loadSceneFrames(name, sceneConfig) {
    const frameSet = {
      cache: new Array(sceneConfig.frameCount).fill(null),
      pending: new Array(sceneConfig.frameCount).fill(null),
      center: 0,
      version: 0
    };

    frameSet.load = function (index) {
      if (!Number.isInteger(index) || index < 0 || index >= sceneConfig.frameCount) {
        return Promise.reject(new RangeError(`${name} frame ${index + 1} is outside the configured frame count.`));
      }
      if (frameSet.cache[index]) {
        return Promise.resolve(frameSet.cache[index]);
      }
      if (frameSet.pending[index]) {
        return frameSet.pending[index];
      }

      const path = framePath(sceneConfig, index);
      const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = async () => {
          try {
            if (typeof image.decode === "function") {
              await image.decode();
            }
            if (typeof createImageBitmap !== "function") {
              throw new Error("This browser does not support ImageBitmap frame decoding.");
            }
            const bitmap = await createImageBitmap(image);
            image.removeAttribute("src");
            frameSet.cache[index] = bitmap;
            frameSet.version += 1;
            trimFrameCache(frameSet, frameSet.center);
            resolve(bitmap);
          } catch (error) {
            reject(new Error(`Could not decode ${path}: ${error.message}`));
          }
        };
        image.onerror = () => reject(new Error(`Could not load ${path}.`));
        image.src = path;
      });

      frameSet.pending[index] = promise;
      promise.then(
        () => { frameSet.pending[index] = null; },
        () => { frameSet.pending[index] = null; }
      );
      return promise;
    };

    return frameSet;
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
    const scale = isMobileViewport()
      ? Math.min(width / image.width, height / image.height)
      : Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
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
      currentProgress: 0,
      lastRequestedFrame: -1,
      lastDrawnFrame: -1,
      lastDrawnProgress: -1,
      reportedFailures: new Set(),
      width: 0,
      height: 0
    };

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, config.pixelRatioCap);
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (scene.width !== width || scene.height !== height) {
        scene.width = width;
        scene.height = height;
        canvas.width = width;
        canvas.height = height;
        scene.lastDrawnFrame = -1;
        scene.lastDrawnProgress = -1;
      }
    }

    function progress() {
      const distance = section.offsetHeight - window.innerHeight;
      if (distance <= 0) {
        return 0;
      }
      return clamp(-section.getBoundingClientRect().top / distance, 0, 1);
    }

    function requestFrame(index) {
      if (index < 0 || index >= sceneConfig.frameCount || frameSet.cache[index] || frameSet.pending[index]) {
        return;
      }
      frameSet.load(index).catch((error) => {
        if (!scene.reportedFailures.has(index)) {
          scene.reportedFailures.add(index);
          console.error(error);
        }
      });
    }

    function renderCrossfade() {
      const easedProgress = scene.currentProgress;
      const progressKey = Math.round(easedProgress * 200) / 200;
      const firstIndex = nearestLoadedFrame(frameSet.cache, 0);
      const lastIndex = nearestLoadedFrame(frameSet.cache, sceneConfig.frameCount - 1);
      if (firstIndex < 0 && lastIndex < 0) {
        return;
      }
      if (progressKey === scene.lastDrawnProgress && frameSet.version === scene.lastVersion) {
        return;
      }

      context.fillStyle = "#07080a";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (firstIndex >= 0) {
        context.globalAlpha = 1 - easedProgress;
        drawCoverFit(context, canvas, frameSet.cache[firstIndex]);
      }
      if (lastIndex >= 0) {
        context.globalAlpha = easedProgress;
        drawCoverFit(context, canvas, frameSet.cache[lastIndex]);
      }
      context.globalAlpha = 1;
      scene.lastDrawnProgress = progressKey;
      scene.lastVersion = frameSet.version;
    }

    function renderSequence() {
      const target = Math.round(scene.progress * (sceneConfig.frameCount - 1));
      frameSet.center = target;
      if (target !== scene.lastRequestedFrame) {
        scene.lastRequestedFrame = target;
        const direction = target >= scene.currentFrame ? 1 : -1;
        requestFrame(target);
        requestFrame(target + direction);
        requestFrame(target - direction);
      }

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

    function render() {
      scene.progress = progress();
      if (sceneConfig.transition === "crossfade") {
        frameSet.center = scene.progress < 0.5 ? 0 : sceneConfig.frameCount - 1;
        scene.currentProgress += (scene.progress - scene.currentProgress) * config.frameRate;
        renderCrossfade();
      } else {
        renderSequence();
      }
    }

    frameSet.onChange = () => requestAnimationFrame(render);
    const originalLoad = frameSet.load;
    frameSet.load = function (index) {
      return originalLoad(index).then((bitmap) => {
        frameSet.onChange();
        return bitmap;
      });
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    scene.render = render;
    scene.resize = resize;
    return scene;
  }

  const hero = createScene("hero", document.querySelector(".hero-section"), document.getElementById("hero-canvas"), config.hero);
  const reveal = createScene(
    "reveal",
    document.querySelector(".reveal-section"),
    document.getElementById("reveal-canvas"),
    config.reveal
  );

  document.querySelectorAll("[data-scene]").forEach((section) => {
    section.style.setProperty("--scroll-height", `${config[section.dataset.scene].scrollVh}vh`);
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
      chapter.style.setProperty("--chapter-offset", `${(1 - opacity) * 100}%`);
      chapter.classList.toggle("is-active", opacity > 0.01);
      if (opacity > 0.01) {
        activeChapter = index;
      }
    });

    const frame = Math.round(progress * (config.hero.frameCount - 1)) + 1;
    document.getElementById("chapter-count").textContent = `${String(activeChapter + 1).padStart(2, "0")} / 04`;
    document.getElementById("frame-count").textContent = String(frame).padStart(3, "0");
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

  function createReducedHeroPanels() {
    if (!reducedMotion) {
      return;
    }

    const heroSection = document.querySelector(".hero-section");
    const panelData = [
      { frame: 0, title: "PORSCHE 911", copy: "An icon, after dark." },
      { frame: Math.round((config.hero.frameCount - 1) * 0.35), title: "911", copy: "A silhouette, unmistakable." },
      { frame: Math.round((config.hero.frameCount - 1) * 0.65), title: "911", copy: "Shaped by the night." },
      { frame: config.hero.frameCount - 1, title: "911", copy: "FORM · FUNCTION · FEELING" }
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
    window.addEventListener("resize", () => {
      reducedHeroPanels.forEach((panel) => {
        hero.frameSet.load(panel.frame)
          .then((bitmap) => drawReducedHeroPanel(panel, bitmap))
          .catch((error) => console.error(`Could not redraw reduced-motion frame ${panel.frame + 1}.`, error));
      });
    }, { passive: true });
  }

  function drawReducedHeroPanel(panel, bitmap) {
    const ratio = Math.min(window.devicePixelRatio || 1, config.pixelRatioCap);
    const bounds = panel.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    panel.canvas.width = width;
    panel.canvas.height = height;
    const context = panel.canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#07080a";
    context.fillRect(0, 0, width, height);
    drawCoverFit(context, panel.canvas, bitmap);
  }

  function updateRevealOverlay(progress) {
    const stage = document.querySelector(".reveal-stage");
    stage.style.setProperty("--progress", `${progress * 100}%`);
    const label = progress < 0.01
      ? "ASSEMBLED"
      : progress > 0.99
        ? "EXPLODED REFERENCE"
        : "ASSEMBLED → EXPLODED REFERENCE";
    document.getElementById("reveal-state").textContent = label;
  }

  function updateScrollEffects() {
    hero.render();
    reveal.render();
    updateHeroOverlay(hero.progress);
    updateRevealOverlay(reveal.progress);

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
      article.style.setProperty("--reveal-delay", `${index * 80}ms`);
      article.innerHTML = `
        <button class="slide-trigger" type="button" aria-expanded="${index === 0}" aria-label="Open ${model.name}: ${model.description}" data-cursor-label="${index === 0 ? "VIEW" : "OPEN"}">
          <span class="slide-number">${model.number}</span>
          <span class="slide-vertical-name">${model.name}</span>
          <img class="slide-image" src="assets/lineup/${model.file}" alt="${model.alt}" width="1600" height="900" loading="${index === 0 ? "eager" : "lazy"}" decoding="async">
          <h3 class="slide-open-title display-type">${model.name}</h3>
        </button>
        <div class="slide-details">
          <p class="slide-description">${model.description}</p>
          <a class="configure-link" href="https://www.porsche.com/" target="_blank" rel="noopener noreferrer" data-cursor-label="VIEW">Explore Porsche <span aria-hidden="true">↗</span></a>
        </div>`;
      container.append(article);
    });

    container.addEventListener("click", (event) => {
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
      triggers[(currentIndex + direction + triggers.length) % triggers.length].focus();
    });

    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !isMobileViewport() && !reducedMotion) {
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
      trigger.dataset.cursorLabel = isOpen ? "VIEW" : "OPEN";
    });
  }

  function setupReveals() {
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

    observer.observe(document.querySelector(".lineup-section"));
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
    if (reducedMotion) {
      return;
    }
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
    if (reducedMotion || isMobileViewport() || !window.matchMedia("(pointer: fine)").matches) {
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
        ? action.dataset.cursorLabel || "VIEW"
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
    const heroCount = Math.min(config.hero.initialFrames, config.hero.frameCount);
    const revealCount = config.reveal.frameCount;
    const total = heroCount + revealCount;
    let loaded = 0;
    const startupLoads = [];
    for (let index = 0; index < heroCount; index += 1) {
      startupLoads.push(hero.frameSet.load(index).then(() => {
        loaded += 1;
        updatePreloader(loaded, total);
      }));
    }
    for (let index = 0; index < revealCount; index += 1) {
      startupLoads.push(reveal.frameSet.load(index).then(() => {
        loaded += 1;
        updatePreloader(loaded, total);
      }));
    }
    await Promise.all(startupLoads);
    document.getElementById("preloader-line").classList.add("is-complete");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    createReducedHeroPanels();
    document.documentElement.classList.remove("is-loading");
    document.documentElement.classList.add("is-ready");
    document.body.classList.remove("is-loading");
    requestAnimationFrame(updateScrollEffects);
    preloadRest().catch((error) => {
      console.error("Background frame preloading stopped; the current frame cache remains available.", error);
    });
  }

  async function preloadRest() {
    if (reducedMotion) {
      for (const panel of reducedHeroPanels) {
        const bitmap = await hero.frameSet.load(panel.frame);
        drawReducedHeroPanel(panel, bitmap);
      }
      return;
    }

    for (let offset = config.hero.initialFrames; offset < config.hero.frameCount; offset += 4) {
      const end = Math.min(offset + 4, config.hero.frameCount);
      await Promise.all(
        Array.from({ length: end - offset }, (_, index) => hero.frameSet.load(offset + index))
      );
    }
  }

  createStatementWords();
  configureHeroChapters();
  createLineup();
  setupReveals();
  setupNavigation();
  setupGrain();
  setupCursor();

  preloadHeroStart().catch(showFrameError);
})();
