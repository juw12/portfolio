/*
 * Newsletter settings + helper shared by /hi/, /log/ and /news/.
 *
 *   buttondown: your Buttondown username. Empty = AI Daily email signups stay
 *               closed (the checkbox shows "opening soon" and links to /news/).
 *               scripts/ai_daily/build_ai_daily.py reads this same value.
 *   substack:   the build-log publication.
 */
window.JL_NEWSLETTER = {
  buttondown: "",
  substack: "https://juwenlie.substack.com"
};

window.JLNewsletter = (function () {
  "use strict";
  var cfg = window.JL_NEWSLETTER;

  function aiDailyOpen() {
    return Boolean(cfg.buttondown);
  }

  // Buttondown's embed endpoint takes a normal form POST and emails a
  // confirmation link (double opt-in), so a no-cors fire-and-forget is enough.
  function joinAiDaily(email) {
    if (!aiDailyOpen()) {
      return;
    }
    var body = new FormData();
    body.append("email", email);
    body.append("embed", "1");
    body.append("referrer_url", location.href);
    fetch("https://buttondown.com/api/emails/embed-subscribe/" + encodeURIComponent(cfg.buttondown), {
      method: "POST",
      body: body,
      mode: "no-cors"
    }).catch(function () {});
  }

  // Must run inside the submit handler (user gesture) so the tab isn't blocked.
  function joinBuildLog(email) {
    window.open(cfg.substack + "/subscribe?email=" + encodeURIComponent(email), "_blank", "noopener");
  }

  // Wires the list checkboxes inside any element with [data-newsletter-lists].
  function prepare(scope) {
    var box = (scope || document).querySelector("[data-newsletter-lists]");
    if (!box) {
      return;
    }
    var ai = box.querySelector("input[value=aidaily]");
    if (ai && !aiDailyOpen()) {
      ai.checked = false;
      ai.disabled = true;
      var row = ai.closest("label");
      if (row) {
        row.classList.add("is-soon");
      }
    }
  }

  function selected(scope) {
    var picks = { buildlog: false, aidaily: false };
    var inputs = (scope || document).querySelectorAll("[data-newsletter-lists] input[name=list]");
    if (!inputs.length) {
      picks.buildlog = true;
    }
    inputs.forEach(function (input) {
      if (input.checked && !input.disabled) {
        picks[input.value] = true;
      }
    });
    return picks;
  }

  function subscribe(email, picks) {
    if (picks.buildlog) {
      joinBuildLog(email);
    }
    if (picks.aidaily) {
      joinAiDaily(email);
    }
  }

  // Plain forms (e.g. /log/) opt in with data-newsletter-form.
  function bindSimpleForms() {
    document.querySelectorAll("form[data-newsletter-form]").forEach(function (form) {
      prepare(form);
      var status = form.parentNode.querySelector("[data-newsletter-status]");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = form.querySelector("input[type=email]");
        var email = (input.value || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          input.focus();
          return;
        }
        var picks = selected(form);
        if (!picks.buildlog && !picks.aidaily) {
          if (status) {
            status.textContent = "Pick at least one newsletter.";
          }
          return;
        }
        subscribe(email, picks);
        if (status) {
          var parts = [];
          if (picks.aidaily) {
            parts.push("check your inbox to confirm AI Daily");
          }
          if (picks.buildlog) {
            parts.push("finish the build-log signup in the Substack tab");
          }
          status.textContent = "Almost there: " + parts.join(", and ") + ".";
        }
        form.reset();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindSimpleForms);
  } else {
    bindSimpleForms();
  }

  return {
    aiDailyOpen: aiDailyOpen,
    prepare: prepare,
    selected: selected,
    subscribe: subscribe
  };
})();
