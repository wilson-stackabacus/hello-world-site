// Home page: list boards + sign-in control + link to stats.
import {
  renderHeader, updateAuthControl, watchAuth, isConfigured,
  ensureBoards, getDocs, collection, db, h
} from "./common.js";

const app = document.getElementById("app");
renderHeader();
app.append(h("h2", { text: "Boards" }));
const list = h("ul");
app.append(list);

watchAuth((user) => updateAuthControl(user));

async function load() {
  if (!isConfigured) return;
  await ensureBoards();
  const snap = await getDocs(collection(db, "boards"));
  const boards = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  list.replaceChildren();
  if (boards.length === 0) { list.append(h("li", { text: "No boards yet." })); return; }
  for (const b of boards) {
    list.append(h("li", {},
      h("a", { href: "board.html?board=" + encodeURIComponent(b.id), text: b.name || b.id }),
      " — ", b.description || "",
      ` (${b.threadCount || 0} threads, ${b.postCount || 0} posts)`
    ));
  }
}

load().catch((e) => list.append(h("li", { text: "Error loading boards: " + e.message })));