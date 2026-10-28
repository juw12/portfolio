/*
 * Newsletter settings + helper shared by /hi/, /log/ and /news/.
 *
 *   inbox:    Gmail address that receives AI Daily signups (forwarded by
 *             FormSubmit, free and unlimited). Empty = AI Daily signups stay
 *             closed ("soon" badge, links to /news/).
 *             scripts/ai_daily/build_ai_daily.py reads the signups from this
 *             inbox every morning and emails each subscriber from the same Gmail.
 *   substack: the build-log publication.
 */
window.JL_NEWSLETTER = {
  inbox: "",
  substack: "https://juwenlie.substack.com"
};

window.JLNewsletter = (function () {
  "use strict";
  var cfg = window.JL_NEWSLETTER;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function aiDailyOpen() {
    return Boolean(cfg.inbox);
  }

  function post(subject, email) {
    return fetch("https://formsubmit.co/ajax/" + encodeURIComponent(cfg.inbox), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: email,
        list: "AI Daily",
        page: location.href,
        _subject: subject,
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
        return data;
      });
  }

  function joinAiDaily(email) {
    if (!aiDailyOpen()) {
      return Promise.reject(new Error("AI Daily signups are not open yet"));
    }
    return post("AI Daily: subscribe", email);
  }

  function leaveAiDaily(email) {
    return post("AI Daily: unsubscribe", email);
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

  // Opens Substack synchronously, then resolves once the AI Daily signup is stored.
  function subscribe(email, picks) {
    if (picks.buildlog) {
      joinBuildLog(email);
    }
    return picks.aidaily ? joinAiDaily(email) : Promise.resolve(null);
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
              parts.push("finish the build-log signup in the Substack tab");
            }
            if (status) {
              status.textContent = "Done: " + parts.join(", and ") + ".";
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
    leaveAiDaily: leaveAiDaily,
    prepare: prepare,
    selected: selected,
    subscribe: subscribe
  };
})();
