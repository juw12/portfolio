/*
 * Newsletter settings + helper shared by /hi/, /log/ and /news/.
 *
 *   inbox:    Gmail address that receives AI Daily signups. Empty = AI Daily
 *             signups stay closed ("soon" badge, links to /news/).
 *             scripts/ai_daily/build_ai_daily.py reads the signups from this
 *             inbox every morning and emails each subscriber from the same Gmail.
 *   endpoint: Google Apps Script web app (scripts/ai_daily/signups-apps-script.gs) that turns
 *             each signup into an "AI Daily: subscribe" email in that inbox.
 *             Empty = fall back to FormSubmit.
 *   substack: the build-log publication (substackId = its publication id,
 *             sent along with background signups the way Substack's own
 *             embed form does).
 */
window.JL_NEWSLETTER = {
  inbox: "juwpegatron@gmail.com",
  endpoint: "https://script.google.com/macros/s/AKfycby6D0jg4iOLwdC5JxF8zfphmbj_V9T7xyOMWD5peClIxKukIYfm8DtSpYHQExddTuxWYw/exec",
  substack: "https://juwenlie.substack.com",
  substackId: "11952083"
};

window.JLNewsletter = (function () {
  "use strict";
  var cfg = window.JL_NEWSLETTER;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function aiDailyOpen() {
    return Boolean(cfg.inbox);
  }

  // action: "subscribe" | "unsubscribe". Both backends answer {success: true}.
  function record(action, email) {
    var request;
    if (cfg.endpoint) {
      // text/plain keeps this a simple cross-origin request (no preflight).
      request = fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ email: email, action: action, list: "AI Daily", page: location.href })
      });
    } else {
      request = fetch("https://formsubmit.co/ajax/" + encodeURIComponent(cfg.inbox), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: email,
          list: "AI Daily",
          page: location.href,
          _subject: "AI Daily: " + action,
          _template: "table",
          _captcha: "false"
        })
      });
    }
    return request
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        if (String(data.success) !== "true") {
          throw new Error(data.message || "Signup failed");
        }
        return data;
      });
  }

  function joinAiDaily(email) {
    if (!aiDailyOpen()) {
      return Promise.reject(new Error("AI Daily signups are not open yet"));
    }
    return record("subscribe", email);
  }

  function leaveAiDaily(email) {
    return record("unsubscribe", email);
  }

  // One press, no Substack tab: post the address to the endpoint Substack's own
  // signup form uses, straight from the visitor's browser. The reply is opaque
  // (no-cors), so success is confirmed by Substack's welcome email, and the
  // success message keeps a manual link as a fallback.
  function joinBuildLog(email) {
    var body = new URLSearchParams({
      email: email,
      first_url: location.href,
      first_referrer: document.referrer || "",
      current_url: location.href,
      current_referrer: document.referrer || "",
      referral_code: "",
      source: "embed",
      landingPublicationId: cfg.substackId || ""
    });
    return fetch(cfg.substack + "/api/v1/free", {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    }).then(function () {
      return true;
    });
  }

  function buildLogPage(email) {
    return cfg.substack + "/subscribe" + (email ? "?email=" + encodeURIComponent(email) : "");
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

  // Joins every picked list in one go. Rejects only if the AI Daily signup
  // fails (the build-log reply can't be read, see joinBuildLog).
  function subscribe(email, picks) {
    var buildLog = picks.buildlog
      ? joinBuildLog(email).catch(function () {
          return false;
        })
      : Promise.resolve(null);
    var aiDaily = picks.aidaily ? joinAiDaily(email) : Promise.resolve(null);
    return Promise.all([buildLog, aiDaily]);
  }

  // Plain forms (/log/, /news/) opt in with data-newsletter-form.
  function bindSimpleForms() {
    document.querySelectorAll("form[data-newsletter-form]").forEach(function (form) {
      prepare(form);
      var status = form.parentNode.querySelector("[data-newsletter-status]");
      var button = form.querySelector("button[type=submit]");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = form.querySelector("input[type=email]");
        var email = (input.value || "").trim();
        var picks = selected(form);
        if (!EMAIL_RE.test(email)) {
          input.focus();
          return;
        }
        if (!picks.buildlog && !picks.aidaily) {
          if (status) {
            status.textContent = "Pick at least one newsletter.";
          }
          return;
        }
        if (button) {
          button.disabled = true;
        }
        if (status) {
          status.textContent = "Subscribing…";
        }
        subscribe(email, picks)
          .then(function () {
            var parts = [];
            if (picks.aidaily) {
              parts.push("you're in for AI Daily; the first issue arrives tomorrow at 6:00 WIB");
            }
            if (picks.buildlog) {
              parts.push("the next build log comes to you (Substack sends a welcome email)");
            }
            if (status) {
              status.textContent = "Done: " + parts.join(", and ") + ".";
              if (picks.buildlog) {
                var fallback = document.createElement("a");
                fallback.href = buildLogPage(email);
                fallback.target = "_blank";
                fallback.rel = "noopener";
                fallback.textContent = "No email from Substack in a few minutes? Subscribe there.";
                status.appendChild(document.createTextNode(" "));
                status.appendChild(fallback);
              }
            }
            form.reset();
            prepare(form);
          })
          .catch(function () {
            if (status) {
              status.textContent = "Couldn't reach the list right now. Please try again in a minute.";
            }
          })
          .then(function () {
            if (button) {
              button.disabled = false;
            }
          });
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
    buildLogPage: buildLogPage,
    leaveAiDaily: leaveAiDaily,
    prepare: prepare,
    selected: selected,
    subscribe: subscribe
  };
})();
