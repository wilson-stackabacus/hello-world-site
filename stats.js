// Site-wide statistics page. Reads maintained counters (meta/stats, boards) plus
// a few small ordered queries for "top" lists.
import {
  renderHeader, updateAuthControl, watchAuth, isConfigured,
  db, doc, getDoc, collection, getDocs, query, orderBy, limit,
  fmtDate, fmtDateTime, h
} from "./common.js";

const app = document.getElementById("app");
renderHeader();
watchAuth((user) => updateAuthControl(user));

const box = h("div");
app.append(h("h2", { text: "Site Statistics" }), box);

async function load() {
  if (!isConfigured) return;
  box.replaceChildren("Loading…");
  const meta = (await getDoc(doc(db, "meta", "stats"))).data() || {};
  const boardsSnap = await getDocs(collection(db, "boards"));
  const boards = boardsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  box.replaceChildren();

  // Totals (prefer maintained counters; fall back to summing board counters).
  const totalThreads = meta.threadCount ?? boards.reduce((s, b) => s + (b.threadCount || 0), 0);
  const totalPosts = meta.postCount ?? boards.reduce((s, b) => s + (b.postCount || 0), 0);
  box.append(h("h3", { text: "Totals" }));
  const totals = h("ul");
  totals.append(
    h("li", { text: "Users: " + (meta.userCount || 0) }),
    h("li", { text: "Threads: " + totalThreads }),
    h("li", { text: "Posts: " + totalPosts }),
    h("li", { text: "Images: " + (meta.imageCount || 0) })
  );
  box.append(totals);

  // Posts per board + top boards by activity.
  box.append(h("h3", { text: "Boards (posts per board)" }));
  const byBoard = [...boards].sort((a, b) => (b.postCount || 0) - (a.postCount || 0));
  const bul = h("ul");
  for (const b of byBoard) {
    bul.append(h("li", {},
      h("a", { href: "board.html?board=" + encodeURIComponent(b.id), text: b.name || b.id }),
      ` — ${b.threadCount || 0} threads, ${b.postCount || 0} posts`
    ));
  }
  box.append(bul);

  // Most-replied threads.
  box.append(h("h3", { text: "Most active threads" }));
  await renderList(
    query(collection(db, "threads"), orderBy("replyCount", "desc"), limit(5)),
    (t) => h("li", {},
      h("a", { href: "thread.html?id=" + encodeURIComponent(t.id), text: t.title || "(untitled)" }),
      ` — ${t.replyCount || 0} replies`
    ),
    "No threads yet."
  );

  // Most upvoted posts.
  box.append(h("h3", { text: "Most upvoted posts" }));
  await renderList(
    query(collection(db, "posts"), orderBy("score", "desc"), limit(5)),
    (p) => h("li", {},
      h("a", { href: "thread.html?id=" + encodeURIComponent(p.threadId), text: (p.text || "(image post)").slice(0, 60) }),
      ` — score ${p.score || 0} by ${p.authorName || "Anonymous"}`
    ),
    "No posts yet."
  );

  // Newest users.
  box.append(h("h3", { text: "Newest users" }));
  await renderList(
    query(collection(db, "users"), orderBy("createdAt", "desc"), limit(5)),
    (u) => h("li", {},
      h("a", { href: "profile.html?uid=" + encodeURIComponent(u.id), text: u.displayName || "user" }),
      " — joined " + fmtDate(u.createdAt)
    ),
    "No users yet."
  );

  box.append(h("hr"), h("p", {}, h("small", { text: "Generated " + fmtDateTime(new Date()) })));
}

async function renderList(q, rowFn, emptyMsg) {
  const ul = h("ul");
  try {
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (rows.length === 0) ul.append(h("li", { text: emptyMsg }));
    else for (const r of rows) ul.append(rowFn(r));
  } catch (e) {
    ul.append(h("li", { text: "Could not load: " + e.message }));
  }
  box.append(ul);
}

load().catch((e) => box.append(h("p", { text: "Error: " + e.message })));