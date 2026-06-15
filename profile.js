// Profile view: a single user's statistics.
import {
  renderHeader, updateAuthControl, watchAuth, isConfigured,
  getUser, fmtDateTime, h
} from "./common.js";

const app = document.getElementById("app");
renderHeader();

const params = new URLSearchParams(location.search);
const uid = params.get("uid");

watchAuth((user) => updateAuthControl(user));

const box = h("div");
app.append(h("h2", { text: "Profile" }), box);

async function load() {
  if (!isConfigured) return;
  if (!uid) { box.append(h("p", { text: "No user specified." })); return; }
  const u = await getUser(uid);
  if (!u) { box.append(h("p", { text: "User not found." })); return; }
  box.replaceChildren();
  box.append(h("h3", {}, h("span", { class: "rainbow", text: u.displayName || "user" })));
  const stats = [
    ["Joined", fmtDateTime(u.createdAt)],
    ["Last active", fmtDateTime(u.lastActiveAt)],
    ["Threads started", u.threadCount || 0],
    ["Posts / replies", u.postCount || 0],
    ["Karma (votes received)", u.votesReceived || 0],
    ["Votes cast", u.votesCast || 0],
  ];
  const ul = h("ul");
  for (const [k, v] of stats) ul.append(h("li", { text: `${k}: ${v}` }));
  box.append(ul);
}

load().catch((e) => box.append(h("p", { text: "Error: " + e.message })));