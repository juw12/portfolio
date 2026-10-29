/**
 * AI Daily signups for juwenlie.pages.dev
 *
 * The site's Subscribe / Unsubscribe buttons post here. Each request becomes
 * one short email in this Gmail inbox ("AI Daily: subscribe" + the address).
 * The daily GitHub job reads those emails to build the subscriber list, so
 * nothing is stored anywhere else. Free; a personal Google account can take
 * up to 100 signups a day.
 *
 * Deploy once:
 *   Deploy > New deployment > type: Web app
 *   Execute as: Me    Who has access: Anyone
 *   Deploy > Authorize access (Advanced > Go to project) > copy the Web app URL
 */
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var ACTIONS = ["subscribe", "unsubscribe"];
var REPEAT_WINDOW_SECONDS = 6 * 60 * 60;

function doPost(e) {
  var data = parseBody_(e);
  var email = String(data.email || "").trim().toLowerCase();
  var action = ACTIONS.indexOf(data.action) >= 0 ? data.action : "subscribe";

  if (data._honey || email.length > 254 || !EMAIL_RE.test(email)) {
    return json_({ success: false, message: "Please enter a valid email address." });
  }

  var cache = CacheService.getScriptCache();
  var key = action + ":" + email;
  if (!cache.get(key)) {
    cache.put(key, "1", REPEAT_WINDOW_SECONDS);
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: "AI Daily: " + action,
      name: "AI Daily signups",
      body:
        "email: " + email + "\n" +
        "list: AI Daily\n" +
        "page: " + String(data.page || "").slice(0, 300) + "\n"
    });
  }
  return json_({ success: true });
}

function doGet() {
  return json_({ success: true, service: "AI Daily signups" });
}

function parseBody_(e) {
  try {
    return JSON.parse((e.postData && e.postData.contents) || "{}");
  } catch (error) {
    return e.parameter || {};
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
