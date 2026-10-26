(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Theme toggle (remembers the visitor's choice) ----
  var themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("jl-theme", next);
      } catch (error) {
        // Storage can be blocked; the toggle still works for this visit.
      }
    });
  }

  // ---- Greeting: cycles through the languages I work in, with a short scramble ----
  var greet = document.getElementById("greet");
  var greetings = ["friend", "teman", "朋友", "engineer", "recruiter", "friend"];
  var glyphs = "abcdefghijklmnopqrstuvwxyz";

  function scrambleTo(element, target, done) {
    var frame = 0;
    var totalFrames = 14;
    var timer = setInterval(function () {
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
        if (done) {
          done();
        }
      }
    }, 45);
  }

  if (greet && !reduceMotion) {
    var index = 0;
    var cycle = function () {
      index += 1;
      if (index >= greetings.length) {
        return;
      }
      scrambleTo(greet, greetings[index], function () {
        setTimeout(cycle, index === greetings.length - 1 ? 0 : 1600);
      });
    };
    setTimeout(cycle, 1800);
  }

  // ---- Copy email pill ----
  var copyButton = document.getElementById("copy-email");
  var copyLabel = document.getElementById("copy-email-label");
  if (copyButton && copyLabel) {
    var email = copyButton.getAttribute("data-email");
    copyButton.addEventListener("click", function () {
      var showCopied = function () {
        copyButton.classList.add("is-copied");
        copyLabel.textContent = "Copied to clipboard";
        setTimeout(function () {
          copyButton.classList.remove("is-copied");
          copyLabel.textContent = email;
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(showCopied, function () {
          window.location.href = "mailto:" + email;
        });
      } else {
        window.location.href = "mailto:" + email;
      }
    });
  }

  // ---- "Say hello" form: composes an email with the topic as the subject ----
  var helloForm = document.getElementById("hello-form");
  var helloTopic = document.getElementById("hello-topic");
  if (helloForm && helloTopic) {
    helloForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var topic = helloTopic.value.trim() || "Hello from your website";
      var body = "Hi Juwen,\n\n";
      window.location.href =
        "mailto:juwen12006@gmail.com?subject=" + encodeURIComponent(topic) + "&body=" + encodeURIComponent(body);
    });
  }

  // ---- Local time in Batam (WIB, UTC+7) ----
  var clock = document.getElementById("local-time");
  function renderClock() {
    if (!clock) {
      return;
    }
    try {
      var time = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date());
      clock.textContent = "Batam · " + time;
    } catch (error) {
      clock.textContent = "Batam";
    }
  }
  renderClock();
  setInterval(renderClock, 30000);

  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
})();
