(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var staticMode = /[?&]static=1/.test(location.search);
  var BATAM_OFFSET_MIN = 7 * 60; // WIB, UTC+7
  var CONTACT_EMAIL = "juwen12006@gmail.com";
  // Fallback signup provider (used only if SUBSTACK_URL is empty): FormSubmit
  // forwards each signup to my inbox.
  var SIGNUP_ENDPOINT = "https://formsubmit.co/ajax/" + CONTACT_EMAIL;
  // Substack publication URL, e.g. "https://juwenlie.substack.com". When set, the
  // form hands the email to Substack (free, unlimited subscribers, subscriber count,
  // one-click unsubscribe). Empty = fall back to FormSubmit.
  var SUBSTACK_URL = "https://juwenlie.substack.com";

  // ------------------------------------------------------------------
  // Copy. English lives in the HTML; ID and ZH override by key.
  // ------------------------------------------------------------------
  var dictionary = {
    id: {
      skip: "Langsung ke konten",
      statusFallback: "mungkin di lab",
      pitch: "Saya membuat hardware yang tahan",
      bio: "R&amp;D mechanical engineer untuk kamera IP di Batam. Lulusan teknik dirgantara <a href=\"https://www.youtube.com/watch?v=WyFLAkQsCgY\" target=\"_blank\" rel=\"noopener\">Tamkang, Taiwan</a>. Di luar jam kerja saya membuat <a href=\"../#projects\">tool teknik gratis</a> dan musik progressive house sebagai <a href=\"https://li.sten.to/juwmusic\" target=\"_blank\" rel=\"noopener\">juw</a>.",
      sayHello: "sapa saya",
      tbDwg: "No. gbr",
      tbRev: "Rev",
      tbMat: "Material",
      tbMatVal: "Kopi",
      tbTol: "Tol.",
      logTitle: "Dapatkan build log",
      logSub: "Satu email setiap kali saya merilis sesuatu yang layak. Kira-kira sebulan sekali.",
      k1: "Tool",
      v1: "Aplikasi teknik gratis, di hari rilisnya",
      k2: "Catatan",
      v2: "Apa yang gagal saat pengujian dan cara memperbaikinya",
      k3: "Musik",
      v3: "Lagu baru sebagai juw",
      emailLabel: "Alamat email",
      subscribe: "Langganan",
      note: "Tanpa spam. Berhenti cukup dengan satu balasan.",
      fPortfolio: "Portofolio",
      fLog: "Build log",
      fEmail: "Email",
      fContact: "Simpan kontak",
      fPrivacy: "Privasi",
      privacy: "Tanpa cookie, tracker, atau analitik. Jika berlangganan, alamat Anda diteruskan ke Substack (juwenlie.substack.com) yang mengirim build log dan menyediakan berhenti langganan sekali klik. Tidak pernah dijual atau dibagikan."
    },
    zh: {
      skip: "跳到內容",
      statusFallback: "大概在實驗室",
      pitch: "我做的硬體經得起",
      bio: "在印尼巴淡島擔任網路攝影機的研發機械工程師，畢業於台灣<a href=\"https://www.youtube.com/watch?v=WyFLAkQsCgY\" target=\"_blank\" rel=\"noopener\">淡江大學</a>航空太空工程學系。下班後做<a href=\"../#projects\">免費的工程工具</a>，也以 <a href=\"https://li.sten.to/juwmusic\" target=\"_blank\" rel=\"noopener\">juw</a> 之名創作 Progressive House。",
      sayHello: "打聲招呼",
      tbDwg: "圖號",
      tbRev: "版次",
      tbMat: "材料",
      tbMatVal: "咖啡",
      tbTol: "公差",
      logTitle: "訂閱 Build Log",
      logSub: "只在我做出值得一看的東西時寄一封信，大約每月一次。",
      k1: "工具",
      v1: "免費工程應用，上線當天通知你",
      k2: "筆記",
      v2: "測試中壞了什麼、又是怎麼修好的",
      k3: "音樂",
      v3: "juw 的新作品",
      emailLabel: "電子郵件地址",
      subscribe: "訂閱",
      note: "不寄垃圾信。回覆一句即可取消訂閱。",
      fPortfolio: "作品集",
      fLog: "作品紀錄",
      fContact: "儲存聯絡人",
      fPrivacy: "隱私",
      privacy: "沒有 Cookie、追蹤器或分析工具。訂閱時，你的信箱會交給 Substack（juwenlie.substack.com）寄送 Build Log，隨時可一鍵取消訂閱，絕不出售或分享。"
    }
  };

  var runtime = {
    en: {
      place: "Batam",
      cycle: ["rain.", "drops.", "heat.", "mass production."],
      status: {
        sleep: "probably asleep",
        morning: "coffee, then the plant",
        lab: "at the plant, mid-DVT",
        lunch: "lunch break",
        afternoon: "in the test lab",
        commute: "heading home",
        side: "building side projects",
        weekend: "weekend, tinkering or making music"
      },
      invalid: "That email doesn't look right.",
      sending: "Sending…",
      ok: "You're in. The next build log comes to you.",
      okConfirm: "Almost there: finish in the Substack tab, then check your inbox.",
      fail: "Couldn't reach the list. <a href=\"mailto:" + CONTACT_EMAIL + "?subject=Add%20me%20to%20the%20build%20log\">Email me instead</a>."
    },
    id: {
      place: "Batam",
      cycle: ["hujan.", "benturan.", "panas.", "produksi massal."],
      status: {
        sleep: "mungkin sedang tidur",
        morning: "ngopi, lalu ke pabrik",
        lab: "di pabrik, sedang DVT",
        lunch: "istirahat makan siang",
        afternoon: "di lab uji",
        commute: "perjalanan pulang",
        side: "mengerjakan proyek sampingan",
        weekend: "akhir pekan, ngoprek atau bikin musik"
      },
      invalid: "Alamat email sepertinya salah.",
      sending: "Mengirim…",
      ok: "Berhasil. Build log berikutnya akan sampai ke Anda.",
      okConfirm: "Sedikit lagi: selesaikan di tab Substack, lalu cek inbox Anda.",
      fail: "Gagal terhubung. <a href=\"mailto:" + CONTACT_EMAIL + "?subject=Add%20me%20to%20the%20build%20log\">Kirim email saja</a>."
    },
    zh: {
      place: "巴淡島",
      cycle: ["風雨。", "摔落。", "高溫。", "量產。"],
      status: {
        sleep: "大概在睡覺",
        morning: "喝咖啡，準備去工廠",
        lab: "在工廠跑 DVT",
        lunch: "午餐時間",
        afternoon: "在測試實驗室",
        commute: "下班路上",
        side: "在做業餘專案",
        weekend: "週末，動手做東西或做音樂"
      },
      invalid: "信箱格式好像不對。",
      sending: "傳送中…",
      ok: "訂閱成功，下一封 Build Log 會寄給你。",
      okConfirm: "快完成了：請在 Substack 分頁完成訂閱，再到信箱確認。",
      fail: "暫時連不上。<a href=\"mailto:" + CONTACT_EMAIL + "?subject=Add%20me%20to%20the%20build%20log\">改用 Email 聯絡我</a>。"
    }
  };

  dictionary.en = {};
  document.querySelectorAll("[data-i18n]").forEach(function (element) {
    dictionary.en[element.getAttribute("data-i18n")] = element.innerHTML;
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
      // Storage blocked: the choice still applies for this visit.
    }
  }

  function detectLanguage() {
    var forced = (location.search.match(/[?&]lang=(en|id|zh)/) || [])[1];
    if (forced) {
      return forced;
    }
    var saved = readStorage("jl-lang");
    if (saved && runtime[saved]) {
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
  // Theme
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
  // "...survives rain. / drops. / heat. / mass production."
  // ------------------------------------------------------------------
  var cycle = document.getElementById("cycle");
  var cycleTimer = null;
  var cycleIndex = 0;

  function startCycle() {
    if (!cycle) {
      return;
    }
    clearInterval(cycleTimer);
    var words = t("cycle");
    cycleIndex = 0;
    cycle.textContent = words[0];
    if (reduceMotion || staticMode) {
      return;
    }
    cycleTimer = setInterval(function () {
      cycleIndex = (cycleIndex + 1) % words.length;
      cycle.classList.remove("is-swapping");
      void cycle.offsetWidth;
      cycle.textContent = words[cycleIndex];
      cycle.classList.add("is-swapping");
    }, 2200);
  }

  // ------------------------------------------------------------------
  // Live line: Batam time + what I'm probably doing
  // ------------------------------------------------------------------
  var clock = document.getElementById("live-clock");
  var statusLine = document.getElementById("live-status");
  var dot = document.querySelector(".live-dot");

  function batamNow() {
    var now = new Date();
    var total = now.getUTCHours() * 60 + now.getUTCMinutes() + BATAM_OFFSET_MIN;
    var minutes = total % 1440;
    var weekday = (now.getUTCDay() + (total >= 1440 ? 1 : 0)) % 7;
    return { minutes: minutes, hour: minutes / 60, weekday: weekday };
  }

  function statusKey(hour, weekday) {
    if (hour < 6 || hour >= 23) {
      return "sleep";
    }
    if (hour < 8) {
      return "morning";
    }
    if (weekday === 0 || weekday === 6) {
      return "weekend";
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

  function renderLive() {
    var now = batamNow();
    var hh = Math.floor(now.minutes / 60);
    var mm = now.minutes % 60;
    var time = (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
    var key = statusKey(now.hour, now.weekday);
    if (clock) {
      clock.textContent = t("place") + " " + time;
    }
    if (statusLine) {
      statusLine.textContent = t("status")[key];
    }
    if (dot) {
      dot.classList.toggle("is-asleep", key === "sleep");
      dot.classList.toggle("is-away", key === "lunch" || key === "commute" || key === "morning");
    }
  }

  setInterval(renderLive, 30000);

  // ------------------------------------------------------------------
  // Language
  // ------------------------------------------------------------------
  function applyLanguage(next, remember) {
    lang = runtime[next] ? next : "en";
    root.setAttribute("lang", lang === "zh" ? "zh-Hant" : lang);
    var copy = dictionary[lang];
    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      var key = element.getAttribute("data-i18n");
      var value = copy[key] !== undefined ? copy[key] : dictionary.en[key];
      if (value !== undefined) {
        element.innerHTML = value;
      }
    });
    document.querySelectorAll(".lang-btn").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-lang") === lang));
    });
    if (remember) {
      writeStorage("jl-lang", lang);
    }
    startCycle();
    renderLive();
  }

  document.querySelectorAll(".lang-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      applyLanguage(button.getAttribute("data-lang"), true);
    });
  });

  // ------------------------------------------------------------------
  // Build-log signup
  // ------------------------------------------------------------------
  var form = document.getElementById("signup");
  var emailInput = document.getElementById("signup-email");
  var button = document.getElementById("signup-button");
  var note = document.getElementById("signup-note");
  var logSection = document.querySelector(".log");

  function setNote(html, state) {
    note.innerHTML = html;
    note.classList.toggle("is-ok", state === "ok");
    note.classList.toggle("is-error", state === "error");
  }

  if (form && emailInput) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var email = emailInput.value.trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      emailInput.setAttribute("aria-invalid", String(!valid));
      if (!valid) {
        setNote(t("invalid"), "error");
        emailInput.focus();
        return;
      }
      var honey = form.querySelector("input[name=_honey]").value;
      if (honey) {
        logSection.classList.add("is-done");
        setNote(t("ok"), "ok");
        return;
      }
      button.disabled = true;
      setNote(t("sending"), null);
      if (SUBSTACK_URL) {
        window.open(SUBSTACK_URL + "/subscribe?email=" + encodeURIComponent(email), "_blank", "noopener");
        logSection.classList.add("is-done");
        setNote(t("okConfirm"), "ok");
        return;
      }
      fetch(SIGNUP_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          email: email,
          language: lang,
          page: location.href,
          _subject: "New build-log subscriber",
          _template: "table",
          _captcha: "false"
        })
      })
        .then(function (response) {
          return response.json();
        })
        .then(function (data) {
          if (String(data.success) !== "true") {
            throw new Error(data.message || "Signup failed");
          }
          logSection.classList.add("is-done");
          setNote(t("ok"), "ok");
        })
        .catch(function () {
          button.disabled = false;
          setNote(t("fail"), "error");
        });
    });
  }

  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  applyLanguage(lang, false);
})();
