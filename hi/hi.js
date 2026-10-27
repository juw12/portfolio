(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var staticMode = /[?&]static=1/.test(location.search);
  var TIME_ZONE = "Asia/Jakarta"; // Batam is on WIB, UTC+7
  var BATAM_OFFSET_MIN = 7 * 60;

  // ------------------------------------------------------------------
  // Translations. English lives in the HTML; ID and ZH override by key.
  // ------------------------------------------------------------------
  var dictionary = {
    id: {
      skip: "Langsung ke konten",
      hey: "Halo",
      headline: "Saya membuat hardware <em>tahan dunia nyata.</em>",
      role: "R&amp;D Mechanical Engineer · Kamera IP &amp; CCTV · Batam, Indonesia",
      statusFallback: "Biasanya di lab, sengaja merusak barang.",
      linksTitle: "Temukan saya di sini",
      liSub: "Karier, pekerjaan DVT/NPI, rekomendasi",
      pfTitle: "Portofolio",
      pfSub: "23+ proyek: tools, CAD, otomasi",
      ghSub: "Kode sumber semua tool yang saya buat",
      emailTitle: "Email",
      emailSub: "Ketuk untuk menyalin alamat",
      musicTitle: "Musik sebagai “juw”",
      musicSub: "Progressive house di Spotify, Apple Music, YouTube",
      ytSub: "Vlog dari Taiwan dan sekitarnya",
      mdSub: "Esai, mis. “The Essence of Looking Back”",
      igSub: "Kehidupan di luar lab",
      saveContact: "Simpan kontak",
      share: "Bagikan halaman ini",
      cv: "Minta CV saya",
      storyTitle: "Versi singkatnya",
      story1: "Saya Juwen. Di Pegatron Batam, saya membawa kamera IP dan housing CCTV dari EVT hingga produksi massal: menyegelnya sampai IPX6/7, menjalankan DVT, dan menelusuri setiap kegagalan sampai ke akar masalahnya.",
      story2: "Sebelumnya saya kuliah teknik dirgantara di Tamkang University, Taiwan, lulus dengan IPK 3,85 dan skripsi tentang <a class=\"ichip\" href=\"../assets/docs/juwen-lie-bachelor-thesis-nozzle-preconditioning.pdf\" target=\"_blank\" rel=\"noopener\">solver CFD untuk aliran nozzle</a>.",
      story3: "Di luar jam kerja saya membuat tool yang dulu saya butuhkan: <a class=\"ichip\" href=\"https://juw12.github.io/projects/stackup/app.html\" target=\"_blank\" rel=\"noopener\">Stackup</a> untuk analisis toleransi, <a class=\"ichip\" href=\"https://juw12.github.io/projects/me-rd-toolkit/index.html\" target=\"_blank\" rel=\"noopener\">ME R&amp;D Toolkit</a> untuk NPI, dan <a class=\"ichip\" href=\"https://github.com/juw12/projects/tree/main/outputs/3d-models\" target=\"_blank\" rel=\"noopener\">koleksi model 3D</a>. Akhir pekan saya membuat musik <a class=\"ichip\" href=\"https://li.sten.to/juwmusic\" target=\"_blank\" rel=\"noopener\">progressive house</a>.",
      story4: "Kalau Anda membuat produk fisik, atau ingin memulainya, mari ngobrol.",
      caption: "Meja yang sama, dari pagi sampai malam. Batam.",
      featuredTitle: "Yang pernah saya buat",
      seeAll: "Semua proyek →",
      tagTool: "Tool teknik",
      tagResearch: "Riset",
      fStackup: "Stack toleransi worst case, RSS, dan Monte Carlo dengan Cpk dan ppm.",
      fThesisTitle: "Skripsi CFD nozzle",
      fThesis: "Solver Euler dengan preconditioning untuk nozzle divergen, semua rezim Mach.",
      fModelsTitle: "Koleksi Model 3D",
      fModels: "41 model siap cetak dalam STL/STEP, termasuk figurin siap SLA.",
      expectTitle: "Yang bisa Anda harapkan saat menghubungi saya",
      e1t: "Balasan sungguhan",
      e1: "Dari saya langsung, bukan bot, biasanya dalam sehari.",
      e2t: "Jawaban lugas",
      e2: "Spesifikasi, toleransi, jadwal. Tanpa basa-basi.",
      e3t: "Tanpa spam",
      e3: "Tanpa newsletter, tracker, atau cookie di halaman ini.",
      helloLabel: "Tentang apa?",
      t1: "Lowongan",
      t2: "Proyek",
      t3: "Tool Anda",
      t4: "Sekadar menyapa",
      noteLabel: "Catatan singkat",
      notePh: "Satu kalimat tentang itu (opsional)",
      send: "Tulis email",
      footPortfolio: "Portofolio",
      footOnePage: "CV satu halaman",
      footNote: "Dibuat manual, tanpa tracker"
    },
    zh: {
      skip: "跳到内容",
      hey: "嗨",
      headline: "我让硬件<em>经得起真实世界的考验。</em>",
      role: "研发机械工程师 · 网络摄像机与 CCTV · 印尼巴淡岛",
      statusFallback: "通常在实验室里，有目的地把东西弄坏。",
      linksTitle: "在这里找到我",
      liSub: "履历、DVT/NPI 工作、推荐信",
      pfTitle: "作品集",
      pfSub: "23+ 个项目：工具、CAD、自动化",
      ghSub: "我发布的每个工具的源代码",
      emailTitle: "电子邮件",
      emailSub: "点击复制邮箱地址",
      musicTitle: "音乐人 “juw”",
      musicSub: "Spotify、Apple Music、YouTube 上的 Progressive House",
      ytSub: "来自台湾等地的 Vlog",
      mdSub: "随笔，例如《The Essence of Looking Back》",
      igSub: "实验室之外的生活",
      saveContact: "保存联系人",
      share: "分享此页面",
      cv: "索取我的履历",
      storyTitle: "简短版本",
      story1: "我是 Juwen。在巴淡岛的和硕（Pegatron），我负责把网络摄像机和 CCTV 外壳从 EVT 推进到量产：做到 IPX6/7 防水、执行 DVT，并把每一个失效追溯到根本原因。",
      story2: "在此之前，我在台湾淡江大学读航空太空工程，以 GPA 3.85 毕业，毕业论文写了一个<a class=\"ichip\" href=\"../assets/docs/juwen-lie-bachelor-thesis-nozzle-preconditioning.pdf\" target=\"_blank\" rel=\"noopener\">喷管流场 CFD 求解器</a>。",
      story3: "下班后，我做那些我在工作中希望拥有的工具：做公差叠加分析的 <a class=\"ichip\" href=\"https://juw12.github.io/projects/stackup/app.html\" target=\"_blank\" rel=\"noopener\">Stackup</a>、用于 NPI 的 <a class=\"ichip\" href=\"https://juw12.github.io/projects/me-rd-toolkit/index.html\" target=\"_blank\" rel=\"noopener\">ME R&amp;D Toolkit</a>，还有一个 <a class=\"ichip\" href=\"https://github.com/juw12/projects/tree/main/outputs/3d-models\" target=\"_blank\" rel=\"noopener\">3D 模型库</a>。周末我做 <a class=\"ichip\" href=\"https://li.sten.to/juwmusic\" target=\"_blank\" rel=\"noopener\">Progressive House</a> 音乐。",
      story4: "如果你在做实体产品，或者想开始做，我们应该聊聊。",
      caption: "同一张桌子，从白天到夜晚。巴淡岛。",
      featuredTitle: "我做过的东西",
      seeAll: "全部项目 →",
      tagTool: "工程工具",
      tagResearch: "研究",
      fStackup: "最坏情况、RSS 与蒙特卡洛公差叠加，含 Cpk 与 ppm。",
      fThesisTitle: "喷管 CFD 毕业论文",
      fThesis: "适用于全马赫数范围的扩张喷管预处理 Euler 求解器。",
      fModelsTitle: "3D 模型库",
      fModels: "41 个可打印模型（STL/STEP），包括可直接 SLA 打印的公仔。",
      expectTitle: "联系我之后你会得到什么",
      e1t: "真人回复",
      e1: "由我本人回复，不是机器人，通常一天内。",
      e2t: "直接的答案",
      e2: "规格、公差、时程，不说废话。",
      e3t: "没有垃圾信息",
      e3: "此页面没有电子报、追踪器或 Cookie。",
      helloLabel: "关于什么？",
      t1: "工作机会",
      t2: "项目合作",
      t3: "你的工具",
      t4: "打个招呼",
      noteLabel: "简短说明",
      notePh: "用一句话说明（可选）",
      send: "写邮件",
      footPortfolio: "作品集",
      footOnePage: "一页式履历",
      footNote: "手工编写，无追踪器"
    }
  };

  var runtime = {
    en: {
      greetings: ["friend", "teman", "朋友", "engineer", "recruiter", "friend"],
      copied: "Copied. Talk soon!",
      linkCopied: "Link copied",
      sameTime: "same time as you",
      ahead: "{h} ahead of you",
      behind: "{h} behind you",
      weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      status: {
        sleep: "Probably asleep. I'll reply in the morning.",
        morning: "Coffee, then off to the plant.",
        lab: "At the plant, probably mid-DVT or in a design review.",
        lunch: "Lunch break. Nasi padang, most likely.",
        afternoon: "In the test lab, chasing a root cause.",
        commute: "Heading home from work.",
        side: "Off the clock, building side projects.",
        weekend: "Weekend. Tinkering, printing, or making music."
      }
    },
    id: {
      greetings: ["teman", "friend", "朋友", "engineer", "recruiter", "teman"],
      copied: "Tersalin. Sampai jumpa!",
      linkCopied: "Tautan tersalin",
      sameTime: "sama dengan waktu Anda",
      ahead: "{h} lebih cepat dari Anda",
      behind: "{h} lebih lambat dari Anda",
      weekdays: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
      status: {
        sleep: "Mungkin sedang tidur. Saya balas besok pagi.",
        morning: "Ngopi dulu, lalu berangkat ke pabrik.",
        lab: "Di pabrik, mungkin sedang DVT atau design review.",
        lunch: "Istirahat makan siang. Kemungkinan nasi padang.",
        afternoon: "Di lab uji, menelusuri akar masalah.",
        commute: "Dalam perjalanan pulang.",
        side: "Sudah pulang kerja, mengerjakan proyek sampingan.",
        weekend: "Akhir pekan. Ngoprek, nge-print 3D, atau bikin musik."
      }
    },
    zh: {
      greetings: ["朋友", "friend", "teman", "工程师", "招聘官", "朋友"],
      copied: "已复制，回头聊！",
      linkCopied: "链接已复制",
      sameTime: "与你同一时间",
      ahead: "比你快 {h}",
      behind: "比你慢 {h}",
      weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
      status: {
        sleep: "大概在睡觉，早上回复你。",
        morning: "先喝咖啡，然后去工厂。",
        lab: "在工厂，可能正在跑 DVT 或开设计评审。",
        lunch: "午餐时间，多半是巴东饭。",
        afternoon: "在测试实验室追查根本原因。",
        commute: "下班回家路上。",
        side: "下班了，在做业余项目。",
        weekend: "周末：折腾、3D 打印，或做音乐。"
      }
    }
  };

  // Capture the English copy straight from the markup.
  dictionary.en = {};
  document.querySelectorAll("[data-i18n]").forEach(function (element) {
    dictionary.en[element.getAttribute("data-i18n")] = element.innerHTML;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(function (element) {
    dictionary.en[element.getAttribute("data-i18n-placeholder")] = element.getAttribute("placeholder");
  });

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Storage can be blocked; the choice still applies for this visit.
    }
  }

  function detectLanguage() {
    var forced = (location.search.match(/[?&]lang=(en|id|zh)/) || [])[1];
    if (forced) {
      return forced;
    }
    var saved = readStorage("jl-lang");
    if (saved && dictionary[saved]) {
      return saved;
    }
    var browser = (navigator.language || "en").toLowerCase();
    if (browser.indexOf("id") === 0 || browser.indexOf("ms") === 0) {
      return "id";
    }
    if (browser.indexOf("zh") === 0) {
      return "zh";
    }
    return "en";
  }

  var lang = detectLanguage();

  function t(key) {
    return runtime[lang][key];
  }

  // ------------------------------------------------------------------
  // Theme toggle
  // ------------------------------------------------------------------
  var themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      writeStorage("jl-theme", next);
    });
  }

  // ------------------------------------------------------------------
  // Greeting scramble
  // ------------------------------------------------------------------
  var greet = document.getElementById("greet");
  var glyphs = "abcdefghijklmnopqrstuvwxyz";
  var greetTimer = null;
  var greetRun = 0;

  function scrambleTo(element, target, run, done) {
    var frame = 0;
    var totalFrames = 14;
    var timer = setInterval(function () {
      if (run !== greetRun) {
        clearInterval(timer);
        return;
      }
      frame += 1;
      var revealCount = Math.floor((frame / totalFrames) * target.length);
      var output = "";
      for (var i = 0; i < target.length; i += 1) {
        if (i < revealCount || /[^\x00-\x7F]/.test(target[i])) {
          output += target[i];
        } else {
          output += glyphs[Math.floor(Math.random() * glyphs.length)];
        }
      }
      element.textContent = output;
      if (frame >= totalFrames) {
        clearInterval(timer);
        element.textContent = target;
        done();
      }
    }, 45);
  }

  function startGreeting() {
    if (!greet) {
      return;
    }
    greetRun += 1;
    clearTimeout(greetTimer);
    var list = t("greetings");
    greet.textContent = list[0];
    if (reduceMotion || staticMode) {
      return;
    }
    var run = greetRun;
    var index = 0;
    var cycle = function () {
      index += 1;
      if (index >= list.length || run !== greetRun) {
        return;
      }
      scrambleTo(greet, list[index], run, function () {
        greetTimer = setTimeout(cycle, 1500);
      });
    };
    greetTimer = setTimeout(cycle, 1800);
  }

  // ------------------------------------------------------------------
  // Story: split into word tokens that light up as they scroll past
  // ------------------------------------------------------------------
  var story = document.getElementById("story");
  var storyWords = [];

  function tokenize(paragraph) {
    var nodes = Array.prototype.slice.call(paragraph.childNodes);
    nodes.forEach(function (node) {
      if (node.nodeType === 3) {
        var pieces = lang === "zh" ? Array.from(node.textContent) : node.textContent.split(/(\s+)/);
        var fragment = document.createDocumentFragment();
        pieces.forEach(function (piece) {
          if (!piece) {
            return;
          }
          if (/^\s+$/.test(piece)) {
            fragment.appendChild(document.createTextNode(piece));
            return;
          }
          var span = document.createElement("span");
          span.className = "w";
          span.textContent = piece;
          fragment.appendChild(span);
        });
        paragraph.replaceChild(fragment, node);
      } else if (node.nodeType === 1) {
        node.classList.add("w");
      }
    });
  }

  function buildStory() {
    if (!story) {
      return;
    }
    if (reduceMotion || staticMode) {
      storyWords = [];
      return;
    }
    story.querySelectorAll("p").forEach(tokenize);
    storyWords = Array.prototype.slice.call(story.querySelectorAll(".w"));
    updateStory();
  }

  var storyQueued = false;

  function updateStory() {
    storyQueued = false;
    var threshold = window.innerHeight * 0.78;
    for (var i = 0; i < storyWords.length; i += 1) {
      var lit = storyWords[i].getBoundingClientRect().top < threshold;
      storyWords[i].classList.toggle("on", lit);
    }
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!storyQueued && storyWords.length) {
        storyQueued = true;
        requestAnimationFrame(updateStory);
      }
    },
    { passive: true }
  );
  window.addEventListener("resize", updateStory);

  // ------------------------------------------------------------------
  // Language switch
  // ------------------------------------------------------------------
  function applyLanguage(next, remember) {
    lang = dictionary[next] ? next : "en";
    root.setAttribute("lang", lang === "zh" ? "zh-Hans" : lang);
    var copy = dictionary[lang];
    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      var key = element.getAttribute("data-i18n");
      var value = copy[key] || dictionary.en[key];
      if (value !== undefined) {
        element.innerHTML = value;
      }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (element) {
      var key = element.getAttribute("data-i18n-placeholder");
      element.setAttribute("placeholder", copy[key] || dictionary.en[key]);
    });
    document.querySelectorAll(".lang-btn").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-lang") === lang));
    });
    if (remember) {
      writeStorage("jl-lang", lang);
    }
    buildStory();
    startGreeting();
    renderNow();
  }

  document.querySelectorAll(".lang-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      applyLanguage(button.getAttribute("data-lang"), true);
    });
  });

  // ------------------------------------------------------------------
  // "Right now in Batam": clock, status line and a sky that follows the sun
  // ------------------------------------------------------------------
  var skyStops = [
    [0, "#070b1f", "#1c2340"],
    [5, "#141a3a", "#3a3560"],
    [6.5, "#4a5d9a", "#f3a36b"],
    [9, "#4aa3e8", "#bfe3ff"],
    [15, "#3d93dd", "#b5dcff"],
    [17.5, "#5a64a8", "#f59a5f"],
    [19, "#1d2350", "#5a3e6b"],
    [21, "#0b1026", "#26304f"],
    [24, "#070b1f", "#1c2340"]
  ];

  function mixHex(a, b, f) {
    var out = "#";
    for (var i = 1; i < 7; i += 2) {
      var va = parseInt(a.substr(i, 2), 16);
      var vb = parseInt(b.substr(i, 2), 16);
      var v = Math.round(va + (vb - va) * f);
      out += (v < 16 ? "0" : "") + v.toString(16);
    }
    return out;
  }

  function skyColors(hour) {
    for (var i = 0; i < skyStops.length - 1; i += 1) {
      var from = skyStops[i];
      var to = skyStops[i + 1];
      if (hour >= from[0] && hour <= to[0]) {
        var f = (hour - from[0]) / (to[0] - from[0]);
        return [mixHex(from[1], to[1], f), mixHex(from[2], to[2], f)];
      }
    }
    return [skyStops[0][1], skyStops[0][2]];
  }

  function batamNow() {
    var now = new Date();
    var utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    var batamMinutes = (utcMinutes + BATAM_OFFSET_MIN) % 1440;
    var dayShift = utcMinutes + BATAM_OFFSET_MIN >= 1440 ? 1 : 0;
    var weekday = (now.getUTCDay() + dayShift) % 7;
    return { hour: batamMinutes / 60, weekday: weekday, date: now };
  }

  function statusKey(hour, weekday) {
    if (hour < 6 || hour >= 23) {
      return "sleep";
    }
    if (weekday === 0 || weekday === 6) {
      return hour < 8 ? "morning" : "weekend";
    }
    if (hour < 8) {
      return "morning";
    }
    if (hour < 12) {
      return "lab";
    }
    if (hour < 13) {
      return "lunch";
    }
    if (hour < 17.5) {
      return "afternoon";
    }
    if (hour < 19) {
      return "commute";
    }
    return "side";
  }

  function offsetText(date) {
    var visitorOffset = -date.getTimezoneOffset();
    var diff = BATAM_OFFSET_MIN - visitorOffset;
    if (diff === 0) {
      return t("sameTime");
    }
    var hours = Math.abs(diff) / 60;
    var label = (Number.isInteger(hours) ? hours : hours.toFixed(1)) + "h";
    return (diff > 0 ? t("ahead") : t("behind")).replace("{h}", label);
  }

  var clock = document.getElementById("now-clock");
  var statusLine = document.getElementById("now-status");
  var sky = document.getElementById("sky");
  var orb = document.getElementById("orb");

  function renderNow() {
    var now = batamNow();
    var hour = now.hour;
    var time = "";
    try {
      time = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TIME_ZONE
      }).format(now.date);
    } catch (error) {
      var h = Math.floor(hour);
      var m = Math.floor((hour - h) * 60);
      time = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
    var placeName = lang === "zh" ? "巴淡岛" : "Batam";
    if (clock) {
      clock.textContent = placeName + " · " + time + " WIB · " + t("weekdays")[now.weekday] + " · " + offsetText(now.date);
    }
    if (statusLine) {
      statusLine.textContent = t("status")[statusKey(hour, now.weekday)];
    }
    if (sky && orb) {
      var isDay = hour >= 6 && hour < 18;
      var progress = isDay ? (hour - 6) / 12 : ((hour - 18 + 24) % 24) / 12;
      var x = 12 + progress * 76;
      var y = 78 - Math.sin(Math.PI * progress) * 56;
      orb.style.setProperty("--x", x.toFixed(1) + "%");
      orb.style.setProperty("--y", y.toFixed(1) + "%");
      var colors = skyColors(hour);
      sky.style.setProperty("--sky-top", colors[0]);
      sky.style.setProperty("--sky-bottom", colors[1]);
      sky.classList.toggle("is-night", !isDay);
    }
  }

  setInterval(renderNow, 30000);

  // ------------------------------------------------------------------
  // Copy email, share page, hello form
  // ------------------------------------------------------------------
  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    return Promise.reject(new Error("Clipboard unavailable"));
  }

  var copyButton = document.getElementById("copy-email");
  if (copyButton) {
    var email = copyButton.getAttribute("data-email");
    copyButton.addEventListener("click", function () {
      copyText(email).then(
        function () {
          var label = document.getElementById("copy-email-label");
          var original = label.innerHTML;
          copyButton.classList.add("is-copied");
          label.textContent = t("copied");
          setTimeout(function () {
            copyButton.classList.remove("is-copied");
            label.innerHTML = original;
          }, 1800);
        },
        function () {
          window.location.href = "mailto:" + email;
        }
      );
    });
  }

  var shareButton = document.getElementById("share-page");
  if (shareButton) {
    shareButton.addEventListener("click", function () {
      var url = "https://juwenlie.pages.dev/hi/";
      if (navigator.share) {
        navigator.share({ title: "Juwen Lie", text: document.title, url: url }).catch(function () {});
        return;
      }
      copyText(url).then(function () {
        var label = document.getElementById("share-label");
        var original = label.innerHTML;
        label.textContent = t("linkCopied");
        setTimeout(function () {
          label.innerHTML = original;
        }, 1800);
      }, function () {});
    });
  }

  var helloForm = document.getElementById("hello-form");
  if (helloForm) {
    helloForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var picked = helloForm.querySelector("input[name=topic]:checked");
      var note = document.getElementById("hello-note").value.trim();
      var subject = (picked ? picked.value : "Hello") + (note ? ": " + note : "");
      window.location.href =
        "mailto:juwen12006@gmail.com?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent("Hi Juwen,\n\n");
    });
  }

  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  applyLanguage(lang, false);
})();
