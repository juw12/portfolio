/*
 * Newsletter settings + helper shared by /hi/, /log/ and /news/.
 *
 *   googleGroup: name of the Google Group that delivers AI Daily, e.g.
 *                "juwenlie-ai-daily" (the part before @googlegroups.com).
 *                Empty = AI Daily signups stay closed ("soon" badge, links to /news/).
 *                scripts/ai_daily/build_ai_daily.py reads this same value and
 *                emails each edition to the group, which delivers it to every member.
 *   substack:    the build-log publication.
 */
window.JL_NEWSLETTER = {
  googleGroup: "",
  substack: "https://juwenlie.substack.com"
};

window.JLNewsletter = (function () {
  "use strict";
  var cfg = window.JL_NEWSLETTER;

  function aiDailyOpen() {
    return Boolean(cfg.googleGroup);
  }

  function groupAddress() {
    return cfg.googleGroup + "@googlegroups.com";
  }

  function joinAddress() {
    return cfg.googleGroup + "+subscribe@googlegroups.com";
  }

  function webJoinUrl() {
    return "https://groups.google.com/g/" + encodeURIComponent(cfg.googleGroup);
  }

  // Google Groups joins by email: the visitor sends one (empty) email to
  // group+subscribe@ and clicks the confirmation Google sends back.
  function joinAiDaily() {
    if (!aiDailyOpen()) {
      return;
    }
    var mail = "mailto:" + joinAddress() +
      "?subject=" + encodeURIComponent("Subscribe me to AI Daily") +
      "&body=" + encodeURIComponent("Just press Send. Google will email you a link to confirm.");
    window.location.href = mail;
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
      joinAiDaily();
    }
  }

  // Fallback links shown after signup, for people whose email app didn't open.
  function aiDailyHelpHtml() {
    if (!aiDailyOpen()) {
      return "";
    }
    return 'No email app? Send any email to <a href="mailto:' + joinAddress() + '">' + joinAddress() +
      '</a> or <a href="' + webJoinUrl() + '" target="_blank" rel="noopener">join with a Google account</a>.';
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
        var picks = selected(form);
        if (picks.buildlog && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          input.focus();
          return;
        }
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
            parts.push("press Send in the email that just opened, then confirm Google's reply for AI Daily");
          }
          if (picks.buildlog) {
            parts.push("finish the build-log signup in the Substack tab");
          }
          status.innerHTML = "Almost there: " + parts.join(", and ") + "." +
            (picks.aidaily ? " " + aiDailyHelpHtml() : "");
        }
        form.reset();
        prepare(form);
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
    aiDailyHelpHtml: aiDailyHelpHtml,
    groupAddress: groupAddress,
    joinAddress: joinAddress,
    webJoinUrl: webJoinUrl,
    prepare: prepare,
    selected: selected,
    subscribe: subscribe
  };
})();
